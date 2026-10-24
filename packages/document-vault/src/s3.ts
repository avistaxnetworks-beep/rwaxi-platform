import { createHash, createHmac } from "node:crypto";
import {
  KEY_PATTERN,
  assertKey,
  type ListedObject,
  type PresignedRequest,
  type PresigningStore,
  type StoredObject,
} from "./store";

/**
 * S3-compatible object storage (AWS S3, Cloudflare R2, MinIO) with Signature Version 4, without an SDK.
 * The payload hash is signed (x-amz-content-sha256), so the provider itself refuses bytes that do not match.
 * Presigned URLs (query authentication) let the browser upload and download directly — needed where the app's
 * functions cap request and response bodies (Vercel: 4.5 MB) — and a presigned PUT signs the size, the type
 * and the SHA-256 of the one file it admits.
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
const amzDate = (now: Date) =>
  now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** The payload line of a presigned request whose body is not bound to a hash. */
export const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
/** SigV4's longest validity for a presigned URL (7 days). */
const MAX_EXPIRES = 604_800;

interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
}

/** Canonical form of a request (path, query without X-Amz-Signature, signed headers) — SigV4 step 1. */
function canonicalize(method: string, url: URL, headers: Record<string, string>, payloadHash: string) {
  const all: Record<string, string> = { host: url.host };
  for (const [k, v] of Object.entries(headers)) all[k.toLowerCase()] = v.trim().replace(/\s+/g, " ");
  const names = Object.keys(all).sort();
  const path =
    url.pathname
      .split("/")
      .map((segment) => encode(decodeURIComponent(segment)))
      .join("/") || "/";
  const query = [...url.searchParams.entries()]
    .filter(([k]) => k !== "X-Amz-Signature")
    .map(([k, v]) => [encode(k), encode(v)] as const)
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    method,
    path,
    query,
    names.map((n) => `${n}:${all[n]}\n`).join(""),
    signedHeaders,
    payloadHash,
  ].join("\n");
  return { canonicalRequest, signedHeaders, path, query };
}

/** SigV4 steps 2–4: string to sign, derived key and signature of a canonical request. */
function signature(canonicalRequest: string, now: Date, c: Credentials) {
  const service = c.service ?? "s3";
  const date = amzDate(now);
  const day = date.slice(0, 8);
  const scope = `${day}/${c.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", date, scope, sha256(canonicalRequest)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${c.secretAccessKey}`, day), c.region), service), "aws4_request");
  return { scope, stringToSign, signature: createHmac("sha256", key).update(stringToSign).digest("hex") };
}

export interface SignInput extends Credentials {
  method: string;
  url: URL;
  /** headers to sign besides host (names in any case) */
  headers: Record<string, string>;
  /** hex SHA-256 of the body, as sent in x-amz-content-sha256 */
  payloadHash: string;
  /** signing time (x-amz-date) */
  now: Date;
}

/** The Authorization header of a request (AWS Signature Version 4, header-based). */
export function signV4(input: SignInput): {
  authorization: string;
  canonicalRequest: string;
  stringToSign: string;
} {
  const { canonicalRequest, signedHeaders } = canonicalize(
    input.method,
    input.url,
    input.headers,
    input.payloadHash,
  );
  const { scope, stringToSign, signature: sig } = signature(canonicalRequest, input.now, input);
  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
    canonicalRequest,
    stringToSign,
  };
}

export interface PresignInput extends Credentials {
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  /** the object's URL; query parameters it already has (e.g. response-content-disposition) are signed too */
  url: URL;
  now: Date;
  /** seconds the URL stays valid: 1 … 604800 */
  expiresIn: number;
  /** headers the request must carry with exactly these values (signed): e.g. content-length, x-amz-content-sha256 */
  headers?: Record<string, string>;
  /** hex SHA-256 the body must have — a PUT bound to its content — or UNSIGNED-PAYLOAD (default) */
  payloadHash?: string;
}

/** A presigned URL (AWS Signature Version 4, query-based): who holds it may make exactly that request until it expires. */
export function presignV4(input: PresignInput): {
  url: string;
  signedHeaders: string;
  canonicalRequest: string;
  stringToSign: string;
} {
  if (!Number.isInteger(input.expiresIn) || input.expiresIn < 1 || input.expiresIn > MAX_EXPIRES) {
    throw new Error(`Presigned URL expiry must be 1…${MAX_EXPIRES} s`);
  }
  const headers = input.headers ?? {};
  const url = new URL(input.url);
  const names = [...new Set(["host", ...Object.keys(headers).map((h) => h.toLowerCase())])].sort();
  const scope = `${amzDate(input.now).slice(0, 8)}/${input.region}/${input.service ?? "s3"}/aws4_request`;
  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", `${input.accessKeyId}/${scope}`);
  url.searchParams.set("X-Amz-Date", amzDate(input.now));
  url.searchParams.set("X-Amz-Expires", String(input.expiresIn));
  url.searchParams.set("X-Amz-SignedHeaders", names.join(";"));
  const { canonicalRequest, signedHeaders, path, query } = canonicalize(
    input.method,
    url,
    headers,
    input.payloadHash ?? UNSIGNED_PAYLOAD,
  );
  const { stringToSign, signature: sig } = signature(canonicalRequest, input.now, input);
  // Written exactly as signed (RFC 3986): no re-encoding by a URL serializer in between.
  return {
    url: `${url.origin}${path}?${query}&X-Amz-Signature=${sig}`,
    signedHeaders,
    canonicalRequest,
    stringToSign,
  };
}

const EMPTY_HASH = sha256("");
const xmlText = (s: string) =>
  s.replace(
    /&(lt|gt|quot|apos|amp);/g,
    (_, e: string) => ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" })[e]!,
  );

export class S3Store implements PresigningStore {
  readonly driver = "s3" as const;
  constructor(
    private readonly config: S3Config,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /** The bucket's URL: path-style on a custom endpoint (R2, MinIO), virtual-hosted on AWS. */
  private bucketUrl(): URL {
    const { endpoint, bucket, region } = this.config;
    return endpoint
      ? new URL(`${endpoint.replace(/\/+$/, "")}/${bucket}`)
      : new URL(`https://${bucket}.s3.${region}.amazonaws.com/`);
  }

  private url(key: string): URL {
    const k = assertKey(key);
    const base = this.bucketUrl();
    return new URL(`${base.origin}${base.pathname.replace(/\/+$/, "")}/${k}`);
  }

  private async send(method: string, url: URL, body?: Uint8Array, extra: Record<string, string> = {}) {
    const payloadHash = body ? sha256(body) : EMPTY_HASH;
    const now = new Date();
    const headers: Record<string, string> = {
      ...extra,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate(now),
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

  async head(key: string): Promise<(StoredObject & { lastModified: Date | null }) | null> {
    const r = await this.send("HEAD", this.url(key));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`S3 HEAD ${key}: ${r.status}`);
    const modified = r.headers.get("last-modified");
    return {
      sizeBytes: Number(r.headers.get("content-length") ?? 0),
      mimeType: r.headers.get("content-type") ?? "application/octet-stream",
      sha256: r.headers.get("x-amz-meta-sha256") ?? "",
      lastModified: modified ? new Date(modified) : null,
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

  /** ListObjectsV2, following continuation tokens; keys outside the vault's layout are skipped. */
  async *list(prefix: string): AsyncIterable<ListedObject> {
    let token: string | null = null;
    do {
      const url = this.bucketUrl();
      url.searchParams.set("list-type", "2");
      url.searchParams.set("prefix", prefix);
      if (token) url.searchParams.set("continuation-token", token);
      const r = await this.send("GET", url);
      if (!r.ok) throw new Error(`S3 LIST ${prefix}: ${r.status} ${await r.text()}`);
      const xml = await r.text();
      for (const [, entry] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const field = (name: string) =>
          xmlText(new RegExp(`<${name}>([^<]*)</${name}>`).exec(entry!)?.[1] ?? "");
        const key = field("Key");
        if (KEY_PATTERN.test(key))
          yield { key, sizeBytes: Number(field("Size")), lastModified: new Date(field("LastModified")) };
      }
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
        ? xmlText(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1] ?? "") || null
        : null;
    } while (token);
  }

  /**
   * The browser's upload of one verified-to-be file: the URL signs Content-Length, Content-Type and the SHA-256
   * (as x-amz-content-sha256 — the provider checks the body against it — and as metadata), so other bytes, another
   * size or another type are refused by the provider itself. 15 minutes by default.
   */
  presignPut(key: string, meta: StoredObject, { expiresIn = 900, now = new Date() } = {}): PresignedRequest {
    const signed = {
      "content-length": String(meta.sizeBytes),
      "content-type": meta.mimeType,
      "x-amz-content-sha256": meta.sha256,
      "x-amz-meta-sha256": meta.sha256,
    };
    const { url } = presignV4({
      method: "PUT",
      url: this.url(key),
      headers: signed,
      payloadHash: meta.sha256,
      expiresIn,
      now,
      ...this.config,
    });
    // The browser sets Content-Length from the body itself (it may not be set by hand): it must equal the signed one.
    const { "content-length": _length, ...headers } = signed;
    return { method: "PUT", url, headers, expiresAt: new Date(now.getTime() + expiresIn * 1000) };
  }

  /** A download straight from the provider, named and typed (response-* overrides are signed). 60 s by default. */
  presignGet(
    key: string,
    {
      expiresIn = 60,
      now = new Date(),
      contentType,
      contentDisposition,
    }: { expiresIn?: number; now?: Date; contentType?: string; contentDisposition?: string } = {},
  ): PresignedRequest {
    const target = this.url(key);
    target.searchParams.set("response-cache-control", "private, no-store");
    if (contentType) target.searchParams.set("response-content-type", contentType);
    if (contentDisposition) target.searchParams.set("response-content-disposition", contentDisposition);
    const { url } = presignV4({ method: "GET", url: target, expiresIn, now, ...this.config });
    return { method: "GET", url, headers: {}, expiresAt: new Date(now.getTime() + expiresIn * 1000) };
  }
}
