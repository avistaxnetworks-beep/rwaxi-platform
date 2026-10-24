import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { MIME, S3Store, objectKey, presignV4, signV4 } from "./index";

// AWS documentation, "Signature Calculations for the Authorization Header", example GET Object.
const EXAMPLE = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
  now: new Date("2013-05-24T00:00:00Z"),
};
const EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

test("SigV4 matches AWS's published example (GET Object with Range)", () => {
  const signed = signV4({
    ...EXAMPLE,
    method: "GET",
    url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
    headers: { Range: "bytes=0-9", "x-amz-content-sha256": EMPTY, "x-amz-date": "20130524T000000Z" },
    payloadHash: EMPTY,
  });
  assert.equal(
    createHash("sha256").update(signed.canonicalRequest).digest("hex"),
    "7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972",
  );
  assert.equal(
    signed.authorization,
    "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
  );
});

test("the S3 store signs each call with the payload hash, keeps the SHA-256 as metadata and copies server-side", async () => {
  const calls: { method: string; url: string; headers: Record<string, string>; body?: Uint8Array }[] = [];
  const fake: typeof fetch = async (input, init) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    calls.push({
      method: init!.method!,
      url: String(input),
      headers,
      body: init?.body as Uint8Array | undefined,
    });
    if (init!.method === "HEAD")
      return new Response(null, {
        status: 200,
        headers: { "content-length": "4", "content-type": MIME.pdf, "x-amz-meta-sha256": "ab".repeat(32) },
      });
    if (init!.method === "GET") return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    return new Response(null, { status: 200 });
  };
  const store = new S3Store(
    {
      endpoint: "https://acc.r2.cloudflarestorage.com/",
      region: "auto",
      bucket: "rwaxi-vault",
      accessKeyId: "AK",
      secretAccessKey: "SK",
    },
    fake,
  );
  const key = objectKey({ organizationId: "org_avista" }, "ab".repeat(32));
  const bytes = new Uint8Array([37, 80, 68, 70]);
  await store.put(key, bytes, { sizeBytes: 4, mimeType: MIME.pdf, sha256: "ab".repeat(32) });
  assert.equal(calls[0]!.url, `https://acc.r2.cloudflarestorage.com/rwaxi-vault/${key}`);
  assert.equal(calls[0]!.headers["x-amz-content-sha256"], createHash("sha256").update(bytes).digest("hex"));
  assert.equal(calls[0]!.headers["x-amz-meta-sha256"], "ab".repeat(32));
  assert.match(
    calls[0]!.headers.authorization!,
    /^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-meta-sha256, Signature=[0-9a-f]{64}$/,
  );
  assert.deepEqual(await store.head(key), {
    sizeBytes: 4,
    mimeType: MIME.pdf,
    sha256: "ab".repeat(32),
    lastModified: null,
  });
  assert.deepEqual(await store.get(key), new Uint8Array([1, 2, 3, 4]));
  await store.copy(objectKey("staging", "ab".repeat(32)), key);
  assert.equal(calls.at(-1)!.headers["x-amz-copy-source"], `/rwaxi-vault/staging/sha256/${"ab".repeat(32)}`);
  await assert.rejects(store.get("../secrets"));
});

// AWS documentation, "Authenticating Requests: Using Query Parameters", example presigned GET of test.txt for 24 h.
test("presigned URLs match AWS's published example (GET Object, query authentication)", () => {
  const signed = presignV4({
    ...EXAMPLE,
    method: "GET",
    url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
    expiresIn: 86400,
  });
  assert.equal(
    createHash("sha256").update(signed.canonicalRequest).digest("hex"),
    "3bfa292879f6447bbcda7001decf97f4a54dc650c8942174ae0a9121cf58ad04",
  );
  assert.equal(
    signed.url,
    "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
  );
  assert.throws(() =>
    presignV4({
      ...EXAMPLE,
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/a"),
      expiresIn: 604_801,
    }),
  );
});

/**
 * The provider's side, written independently of the signer: rebuilds the canonical request from the URL as
 * received and the headers as sent, and checks the signature (payload = x-amz-content-sha256 when sent).
 */
function providerAccepts(
  method: string,
  raw: string,
  sent: Record<string, string>,
  secret: string,
  at: Date,
) {
  const url = new URL(raw);
  const q = url.searchParams;
  const rfc3986 = (s: string) =>
    encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const [, day, region, service] = q.get("X-Amz-Credential")!.split("/");
  const signedAt = Date.parse(
    q.get("X-Amz-Date")!.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z"),
  );
  if (at.getTime() > signedAt + Number(q.get("X-Amz-Expires")) * 1000) return false; // expired
  const lower: Record<string, string> = Object.fromEntries(
    Object.entries({ host: url.host, ...sent }).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const names = q.get("X-Amz-SignedHeaders")!.split(";");
  if (names.some((n) => lower[n] === undefined)) return false;
  const query = [...q.entries()]
    .filter(([k]) => k !== "X-Amz-Signature")
    .map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`)
    .sort()
    .join("&");
  const canonical = [
    method,
    url.pathname,
    query,
    names.map((n) => `${n}:${lower[n]}\n`).join(""),
    names.join(";"),
    lower["x-amz-content-sha256"] ?? "UNSIGNED-PAYLOAD",
  ].join("\n");
  const toSign = [
    "AWS4-HMAC-SHA256",
    q.get("X-Amz-Date"),
    `${day}/${region}/${service}/aws4_request`,
    createHash("sha256").update(canonical).digest("hex"),
  ].join("\n");
  let key: Buffer = createHmac("sha256", `AWS4${secret}`).update(day!).digest();
  for (const part of [region!, service!, "aws4_request"])
    key = createHmac("sha256", key).update(part).digest();
  return createHmac("sha256", key).update(toSign).digest("hex") === q.get("X-Amz-Signature");
}

const R2 = {
  endpoint: "https://acc.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "rwaxi-vault",
  accessKeyId: "AK",
  secretAccessKey: "SK",
};

test("a presigned PUT admits exactly one file: its size, type and SHA-256 are signed", () => {
  const store = new S3Store(R2);
  const meta = { sizeBytes: 4, mimeType: MIME.pdf, sha256: "ab".repeat(32) };
  const now = new Date("2026-10-24T12:00:00Z");
  const key = `incoming/${"c".repeat(32)}`;
  const put = store.presignPut(key, meta, { now });
  const url = new URL(put.url);
  assert.equal(`${url.origin}${url.pathname}`, `https://acc.r2.cloudflarestorage.com/rwaxi-vault/${key}`);
  assert.equal(
    url.searchParams.get("X-Amz-SignedHeaders"),
    "content-length;content-type;host;x-amz-content-sha256;x-amz-meta-sha256",
  );
  assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
  assert.equal(put.method, "PUT");
  // what the browser sends by hand (Content-Length it derives from the body)
  assert.deepEqual(put.headers, {
    "content-type": MIME.pdf,
    "x-amz-content-sha256": meta.sha256,
    "x-amz-meta-sha256": meta.sha256,
  });
  assert.equal(put.expiresAt.toISOString(), "2026-10-24T12:15:00.000Z");

  const sent = { "content-length": "4", ...put.headers };
  const at = new Date("2026-10-24T12:05:00Z");
  assert.equal(providerAccepts("PUT", put.url, sent, "SK", at), true);
  assert.equal(providerAccepts("PUT", put.url, { ...sent, "content-length": "5" }, "SK", at), false); // other size
  assert.equal(
    providerAccepts("PUT", put.url, { ...sent, "x-amz-content-sha256": "cd".repeat(32) }, "SK", at),
    false,
  ); // other bytes
  assert.equal(providerAccepts("PUT", put.url, { ...sent, "content-type": MIME.png }, "SK", at), false); // other type
  assert.equal(
    providerAccepts("PUT", put.url, { "content-length": "4", "content-type": MIME.pdf }, "SK", at),
    false,
  ); // no hash header
  assert.equal(
    providerAccepts("PUT", put.url.replace(key, `incoming/${"d".repeat(32)}`), sent, "SK", at),
    false,
  ); // other key
  assert.equal(providerAccepts("GET", put.url, sent, "SK", at), false); // other method
  assert.equal(providerAccepts("PUT", put.url, sent, "SK", new Date("2026-10-24T12:15:01Z")), false); // expired
  assert.equal(providerAccepts("PUT", put.url, sent, "other-secret", at), false);
});

test("a presigned GET signs the name and type the browser will see, for one minute", () => {
  const store = new S3Store(R2);
  const now = new Date("2026-10-24T12:00:00Z");
  const key = objectKey({ organizationId: "org_avista" }, "ab".repeat(32));
  const disposition = `attachment; filename="Estudio de titulos.pdf"; filename*=UTF-8''Estudio%20de%20t%C3%ADtulos.pdf`;
  const get = store.presignGet(key, { now, contentType: MIME.pdf, contentDisposition: disposition });
  const url = new URL(get.url);
  assert.equal(url.searchParams.get("response-content-disposition"), disposition);
  assert.equal(url.searchParams.get("response-content-type"), MIME.pdf);
  assert.equal(url.searchParams.get("response-cache-control"), "private, no-store");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "60");
  assert.equal(get.expiresAt.toISOString(), "2026-10-24T12:01:00.000Z");
  assert.equal(providerAccepts("GET", get.url, {}, "SK", new Date("2026-10-24T12:00:30Z")), true);
  // the overrides are signed: renaming the download breaks the signature
  assert.equal(providerAccepts("GET", get.url.replace("attachment", "inline"), {}, "SK", now), false);
});

test("listing follows continuation tokens and only yields vault keys; HEAD reports Last-Modified", async () => {
  const k1 = objectKey("staging", "11".repeat(32));
  const k2 = `incoming/${"2".repeat(32)}`;
  const calls: string[] = [];
  const fake: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(`${init!.method} ${url.pathname}?${url.searchParams.toString()}`);
    if (init!.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: { "content-length": "9", "last-modified": "Sat, 24 Oct 2026 10:00:00 GMT" },
      });
    }
    const page = url.searchParams.get("continuation-token")
      ? `<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>${k2}</Key><LastModified>2026-10-24T09:00:00.000Z</LastModified><Size>3</Size></Contents></ListBucketResult>`
      : `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>tok&amp;1</NextContinuationToken><Contents><Key>${k1}</Key><LastModified>2026-10-23T09:00:00.000Z</LastModified><Size>7</Size></Contents><Contents><Key>notes/readme.txt</Key><LastModified>2026-10-23T09:00:00.000Z</LastModified><Size>1</Size></Contents></ListBucketResult>`;
    return new Response(page, { status: 200 });
  };
  const store = new S3Store(R2, fake);
  const listed = [];
  for await (const o of store.list("")) listed.push(o);
  assert.deepEqual(listed, [
    { key: k1, sizeBytes: 7, lastModified: new Date("2026-10-23T09:00:00.000Z") },
    { key: k2, sizeBytes: 3, lastModified: new Date("2026-10-24T09:00:00.000Z") },
  ]);
  assert.equal(calls[0], "GET /rwaxi-vault?list-type=2&prefix=");
  assert.equal(calls[1], "GET /rwaxi-vault?list-type=2&prefix=&continuation-token=tok%261");
  const head = await store.head(k1);
  assert.deepEqual(head?.lastModified, new Date("2026-10-24T10:00:00Z"));
});
