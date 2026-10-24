import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { MIME, S3Store, objectKey, signV4 } from "./index";

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
  assert.deepEqual(await store.head(key), { sizeBytes: 4, mimeType: MIME.pdf, sha256: "ab".repeat(32) });
  assert.deepEqual(await store.get(key), new Uint8Array([1, 2, 3, 4]));
  await store.copy(objectKey("staging", "ab".repeat(32)), key);
  assert.equal(calls.at(-1)!.headers["x-amz-copy-source"], `/rwaxi-vault/staging/sha256/${"ab".repeat(32)}`);
  await assert.rejects(store.get("../secrets"));
});
