import { createHash, createHmac } from "node:crypto";
import { assertKey, type StoredObject, type VaultStore } from "./store";

/**
 * S3-compatible object storage (AWS S3, Cloudflare R2, MinIO) with Signature Version 4, without an SDK.
 * The payload hash is signed (x-amz-content-sha256), so the provider itself refuses bytes that do not match.
 */
export interface S3Config {
  /** e.g. https://<account>.r2.cloudflarestorage.com; empty for AWS (https://{bucket}.s3.{region}.amazonaws.com) */
  endpoint?: string;
  /** "auto" for R2 */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();
/** RFC 3986 encoding of a path segment or a query component (what SigV4 signs). */
const encode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface SignInput {
  method: string;
  url: URL;
  /** headers to sign besides host (names in any case) */
  headers: Record<string, string>;
  /** hex SHA-256 of the body, as sent in x-amz-content-sha256 */
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
  /** signing time (x-amz-date) */
  now: Date;
}

/** The Authorization header of a request (AWS Signature Version 4, header-based). */
export function signV4(input: SignInput): {
  authorization: string;
  canonicalRequest: string;
  stringToSign: string;
} {
  const service = input.service ?? "s3";
  const amzDate = input.now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = { host: input.url.host };
  for (const [k, v] of Object.entries(input.headers))
    headers[k.toLowerCase()] = v.trim().replace(/\s+/g, " ");
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const path = input.url.pathname
    .split("/")
    .map((segment) => encode(decodeURIComponent(segment)))
    .join("/");
  const query = [...input.url.searchParams.entries()]
    .map(([k, v]) => [encode(k), encode(v)] as const)
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonicalRequest = [
    input.method,
    path || "/",
    query,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  const scope = `${day}/${input.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const key = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), service),
    "aws4_request",
  );
  const signature = createHmac("sha256", key).update(stringToSign).digest("hex");
  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    canonicalRequest,
    stringToSign,
  };
}

const EMPTY_HASH = sha256("");

export class S3Store implements VaultStore {
  readonly driver = "s3" as const;
  constructor(
    private readonly config: S3Config,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private url(key: string): URL {
    const k = assertKey(key);
    const { endpoint, bucket, region } = this.config;
    return endpoint
      ? new URL(`${endpoint.replace(/\/+$/, "")}/${bucket}/${k}`)
      : new URL(`https://${bucket}.s3.${region}.amazonaws.com/${k}`);
  }

  private async send(method: string, url: URL, body?: Uint8Array, extra: Record<string, string> = {}) {
    const payloadHash = body ? sha256(body) : EMPTY_HASH;
    const now = new Date();
    const headers: Record<string, string> = {
      ...extra,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": now
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, ""),
    };
    const { authorization } = signV4({ method, url, headers, payloadHash, now, ...this.config });
    return this.fetcher(url, {
      method,
      headers: { ...headers, authorization },
      body: body as BodyInit | undefined,
    });
  }

  async put(key: string, bytes: Uint8Array, meta: StoredObject): Promise<void> {
    const r = await this.send("PUT", this.url(key), bytes, {
      "content-type": meta.mimeType,
      "x-amz-meta-sha256": meta.sha256,
    });
    if (!r.ok) throw new Error(`S3 PUT ${key}: ${r.status} ${await r.text()}`);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const r = await this.send("GET", this.url(key));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`S3 GET ${key}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }

  async head(key: string): Promise<StoredObject | null> {
    const r = await this.send("HEAD", this.url(key));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`S3 HEAD ${key}: ${r.status}`);
    return {
      sizeBytes: Number(r.headers.get("content-length") ?? 0),
      mimeType: r.headers.get("content-type") ?? "application/octet-stream",
      sha256: r.headers.get("x-amz-meta-sha256") ?? "",
    };
  }

  async copy(from: string, to: string): Promise<void> {
    const r = await this.send("PUT", this.url(to), undefined, {
      "x-amz-copy-source": `/${this.config.bucket}/${assertKey(from)}`,
      "x-amz-metadata-directive": "COPY",
    });
    if (!r.ok) throw new Error(`S3 COPY ${from} → ${to}: ${r.status} ${await r.text()}`);
  }

  async remove(key: string): Promise<void> {
    const r = await this.send("DELETE", this.url(key));
    if (!r.ok && r.status !== 404) throw new Error(`S3 DELETE ${key}: ${r.status}`);
  }
}
