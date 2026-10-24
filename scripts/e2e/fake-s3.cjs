// An S3-compatible endpoint for the E2E suites (path-style, one bucket, objects in memory) that verifies AWS
// Signature Version 4 on its own — header authentication (the app's server-side calls) and query authentication
// (presigned URLs the browser uses) — and, like S3, checks the body against a hex x-amz-content-sha256. Enough of
// the API for the DocumentVault: PUT (and copy), GET (with response-* overrides), HEAD, DELETE, ListObjectsV2 and
// CORS preflights. Test-only control routes under /__fake/ list and backdate objects.
const http = require("http");
const crypto = require("crypto");

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();
// RFC 3986 (unreserved characters stay; everything else is %XX, uppercase)
const uri = (s) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const UNSIGNED = "UNSIGNED-PAYLOAD";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, HEAD",
  "access-control-allow-headers": "content-type, x-amz-content-sha256, x-amz-meta-sha256",
  "access-control-expose-headers": "etag, content-length, content-type, content-disposition",
  "access-control-max-age": "600",
};
const xmlEscape = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const error = (status, code, message) => ({
  status,
  headers: { "content-type": "application/xml" },
  body: `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${xmlEscape(message)}</Message></Error>`,
});
const amzTime = (s) => {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s ?? "");
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
};

/**
 * Verifies a request the way S3 does: rebuilds the canonical request from what arrived (method, path, query,
 * the signed headers' values) and compares the signature. Returns null when valid, or an S3 error.
 */
function verify(req, url, { accessKeyId, secretAccessKey, region }, now) {
  const query = url.searchParams;
  const presigned = query.has("X-Amz-Signature");
  let credential, signedHeaders, signature, date, payloadHash;
  if (presigned) {
    if (query.get("X-Amz-Algorithm") !== "AWS4-HMAC-SHA256")
      return error(400, "AuthorizationQueryParametersError", "Unsupported algorithm");
    credential = query.get("X-Amz-Credential");
    signedHeaders = query.get("X-Amz-SignedHeaders");
    signature = query.get("X-Amz-Signature");
    date = query.get("X-Amz-Date");
    const expires = Number(query.get("X-Amz-Expires"));
    if (!Number.isInteger(expires) || expires < 1 || expires > 604800)
      return error(400, "AuthorizationQueryParametersError", "X-Amz-Expires must be 1..604800");
    const signedAt = amzTime(date);
    if (Number.isNaN(signedAt)) return error(400, "AuthorizationQueryParametersError", "Invalid X-Amz-Date");
    if (now > signedAt + expires * 1000) return error(403, "AccessDenied", "Request has expired");
    // A presigned request signs UNSIGNED-PAYLOAD unless it carries (and signs) x-amz-content-sha256.
    payloadHash = req.headers["x-amz-content-sha256"] ?? UNSIGNED;
  } else {
    const auth =
      /^AWS4-HMAC-SHA256 Credential=([^,]+), ?SignedHeaders=([^,]+), ?Signature=([0-9a-f]{64})$/.exec(
        req.headers.authorization ?? "",
      );
    if (!auth) return error(403, "AccessDenied", "Missing or malformed Authorization");
    [, credential, signedHeaders, signature] = auth;
    date = req.headers["x-amz-date"];
    const signedAt = amzTime(date);
    if (Number.isNaN(signedAt) || Math.abs(now - signedAt) > 15 * 60_000)
      return error(403, "RequestTimeTooSkewed", "x-amz-date too far from now");
    payloadHash = req.headers["x-amz-content-sha256"];
    if (!payloadHash) return error(400, "InvalidRequest", "Missing x-amz-content-sha256");
  }
  const [keyId, day, credRegion, service, terminator] = (credential ?? "").split("/");
  if (keyId !== accessKeyId) return error(403, "InvalidAccessKeyId", "Unknown access key");
  if (
    credRegion !== region ||
    service !== "s3" ||
    terminator !== "aws4_request" ||
    day !== (date ?? "").slice(0, 8)
  ) {
    return error(403, "SignatureDoesNotMatch", "Bad credential scope");
  }
  const names = (signedHeaders ?? "").split(";");
  if (!names.includes("host")) return error(403, "SignatureDoesNotMatch", "host must be signed");
  if (!presigned && !names.includes("x-amz-content-sha256"))
    return error(403, "SignatureDoesNotMatch", "x-amz-content-sha256 must be signed");
  const headerValue = (name) => {
    const v = req.headers[name];
    return v === undefined ? null : (Array.isArray(v) ? v.join(",") : String(v)).trim().replace(/\s+/g, " ");
  };
  for (const n of names)
    if (headerValue(n) === null) return error(403, "SignatureDoesNotMatch", `Signed header ${n} missing`);
  const canonicalQuery = [...query.entries()]
    .filter(([k]) => k !== "X-Amz-Signature")
    .map(([k, v]) => [uri(k), uri(v)])
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonicalPath = url.pathname
    .split("/")
    .map((s) => uri(decodeURIComponent(s)))
    .join("/");
  const canonical = [
    req.method,
    canonicalPath,
    canonicalQuery,
    names.map((n) => `${n}:${headerValue(n)}\n`).join(""),
    names.join(";"),
    payloadHash,
  ].join("\n");
  const scope = `${day}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", date, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), "s3"), "aws4_request");
  const expected = crypto.createHmac("sha256", key).update(stringToSign).digest("hex");
  if (
    expected.length !== signature.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  ) {
    return error(
      403,
      "SignatureDoesNotMatch",
      "The request signature we calculated does not match the signature you provided",
    );
  }
  return null;
}

/**
 * @param {{ port?: number, bucket: string, accessKeyId: string, secretAccessKey: string, region?: string }} options
 * @returns {Promise<{ url: string, server: http.Server, objects: Map<string, object>, requests: object[], close: () => Promise<void> }>}
 */
function startFakeS3({ port = 9000, bucket, accessKeyId, secretAccessKey, region = "auto" }) {
  const objects = new Map(); // key → { bytes, contentType, meta, lastModified }
  const requests = []; // { method, key, status, presigned }
  const respond = (res, { status, headers = {}, body = "" }) => {
    res.writeHead(status, { ...CORS, ...headers });
    res.end(body);
  };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, `http://${req.headers.host}`);
      const now = Date.now();
      // Control routes (tests only): what is stored, and making an object older.
      if (url.pathname === "/__fake/objects") {
        const list = [...objects.entries()].map(([key, o]) => ({
          key,
          sizeBytes: o.bytes.length,
          sha256: sha256(o.bytes),
          metaSha256: o.meta.sha256 ?? null,
          contentType: o.contentType,
          lastModified: new Date(o.lastModified).toISOString(),
        }));
        return respond(res, {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ objects: list, requests }),
        });
      }
      if (url.pathname === "/__fake/age" && req.method === "POST") {
        const o = objects.get(url.searchParams.get("key"));
        if (!o) return respond(res, { status: 404 });
        o.lastModified -= Number(url.searchParams.get("hours") ?? 0) * 3600_000;
        return respond(res, { status: 200, body: "ok" });
      }
      if (req.method === "OPTIONS") return respond(res, { status: 204 });

      const [, b, ...rest] = url.pathname.split("/");
      const key = rest.map(decodeURIComponent).join("/");
      const log = (status) =>
        requests.push({
          method: req.method,
          key,
          status,
          presigned: url.searchParams.has("X-Amz-Signature"),
        });
      const send = (r) => {
        log(r.status);
        respond(res, r);
      };
      if (b !== bucket) return send(error(404, "NoSuchBucket", "The specified bucket does not exist"));
      const denied = verify(req, url, { accessKeyId, secretAccessKey, region }, now);
      if (denied) return send(denied);

      if (req.method === "GET" && !key && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") ?? "";
        const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
        const start = Number(url.searchParams.get("continuation-token") ?? 0);
        const page = keys.slice(start, start + 2); // small pages: the client must follow continuation tokens
        const truncated = start + page.length < keys.length;
        const contents = page
          .map((k) => {
            const o = objects.get(k);
            return `<Contents><Key>${xmlEscape(k)}</Key><LastModified>${new Date(o.lastModified).toISOString()}</LastModified><Size>${o.bytes.length}</Size></Contents>`;
          })
          .join("");
        return send({
          status: 200,
          headers: { "content-type": "application/xml" },
          body: `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket}</Name><Prefix>${xmlEscape(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><IsTruncated>${truncated}</IsTruncated>${truncated ? `<NextContinuationToken>${start + page.length}</NextContinuationToken>` : ""}${contents}</ListBucketResult>`,
        });
      }
      if (!key) return send(error(400, "InvalidRequest", "Missing key"));

      if (req.method === "PUT") {
        const source = req.headers["x-amz-copy-source"];
        if (source) {
          const from = decodeURIComponent(String(source)).replace(new RegExp(`^/?${bucket}/`), "");
          const o = objects.get(from);
          if (!o) return send(error(404, "NoSuchKey", "The specified key does not exist"));
          objects.set(key, { ...o, bytes: Buffer.from(o.bytes), lastModified: now });
          return send({
            status: 200,
            headers: { "content-type": "application/xml" },
            body: "<CopyObjectResult/>",
          });
        }
        const claimed = req.headers["x-amz-content-sha256"];
        if (claimed && claimed !== UNSIGNED && claimed !== sha256(body)) {
          return send(
            error(
              400,
              "XAmzContentSHA256Mismatch",
              "The provided 'x-amz-content-sha256' header does not match what was computed.",
            ),
          );
        }
        objects.set(key, {
          bytes: body,
          contentType: req.headers["content-type"] ?? "application/octet-stream",
          meta: { sha256: req.headers["x-amz-meta-sha256"] },
          lastModified: now,
        });
        return send({
          status: 200,
          headers: { etag: `"${crypto.createHash("md5").update(body).digest("hex")}"` },
        });
      }
      const o = objects.get(key);
      if (req.method === "DELETE") {
        objects.delete(key);
        return send({ status: 204 });
      }
      if (!o) return send(error(404, "NoSuchKey", "The specified key does not exist"));
      const headers = {
        "content-type": url.searchParams.get("response-content-type") ?? o.contentType,
        "content-length": String(o.bytes.length),
        "last-modified": new Date(o.lastModified).toUTCString(),
        etag: `"${crypto.createHash("md5").update(o.bytes).digest("hex")}"`,
        ...(o.meta.sha256 ? { "x-amz-meta-sha256": o.meta.sha256 } : {}),
        ...(url.searchParams.get("response-content-disposition")
          ? { "content-disposition": url.searchParams.get("response-content-disposition") }
          : {}),
        ...(url.searchParams.get("response-cache-control")
          ? { "cache-control": url.searchParams.get("response-cache-control") }
          : {}),
      };
      if (req.method === "HEAD") return send({ status: 200, headers });
      if (req.method === "GET") return send({ status: 200, headers, body: o.bytes });
      return send(error(405, "MethodNotAllowed", "Method not allowed"));
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${port}`,
        server,
        objects,
        requests,
        close: () => new Promise((r) => server.close(() => r())),
      }),
    );
  });
}

module.exports = { startFakeS3, verify };

// As a process of its own (run-s3.cjs starts it so the runner's synchronous reseeds never block it):
//   E2E_S3_PORT, E2E_S3_BUCKET, E2E_S3_ACCESS_KEY_ID, E2E_S3_SECRET_ACCESS_KEY, E2E_S3_REGION
if (require.main === module) {
  const env = process.env;
  startFakeS3({
    port: Number(env.E2E_S3_PORT || 9000),
    bucket: env.E2E_S3_BUCKET,
    accessKeyId: env.E2E_S3_ACCESS_KEY_ID,
    secretAccessKey: env.E2E_S3_SECRET_ACCESS_KEY,
    region: env.E2E_S3_REGION || "auto",
  }).then(
    (s3) => console.log(`fake S3 en ${s3.url}`),
    (e) => {
      console.error(e.message);
      process.exit(1);
    },
  );
}
