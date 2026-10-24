import { randomBytes } from "node:crypto";
import { normalizeSha256 } from "./policy";

/**
 * Where a document lives: content-addressed by its SHA-256 and isolated per tenant.
 *   tenants/{organizationId}/sha256/{hex}   a tenant's document (KYC file, Data Room file)
 *   staging/sha256/{hex}                    uploaded before its tenant exists (B2B onboarding)
 *   incoming/{nonce}                        a browser's direct upload (presigned PUT) not verified yet: the server
 *                                           moves it to its content key once it checked the bytes, or drops it
 * The same bytes of two tenants are two objects: nothing is shared across tenants.
 */
export type VaultScope = { organizationId: string } | "staging";

const ORGANIZATION_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const KEY_PATTERN =
  /^(?:(?:tenants\/[A-Za-z0-9_-]{1,64}|staging)\/sha256\/[0-9a-f]{64}|incoming\/[0-9a-f]{32})$/;

export function objectKey(scope: VaultScope, sha256: string): string {
  const hex = normalizeSha256(sha256);
  if (!hex) throw new Error("Invalid SHA-256 for a vault key");
  if (scope === "staging") return `staging/sha256/${hex}`;
  if (!ORGANIZATION_ID.test(scope.organizationId)) throw new Error("Invalid organization id for a vault key");
  return `tenants/${scope.organizationId}/sha256/${hex}`;
}

/** A fresh, unguessable key for one direct upload awaiting verification. */
export const incomingKey = (): string => `incoming/${randomBytes(16).toString("hex")}`;

/** Metadata stored with each object (verified by the server before it was written). */
export interface StoredObject {
  sizeBytes: number;
  mimeType: string;
  /** 64 lowercase hex characters */
  sha256: string;
}

/** An object as a listing or a HEAD sees it. */
export interface ListedObject {
  key: string;
  sizeBytes: number;
  lastModified: Date;
}

/** A storage driver. Only bytes the server verified are ever written, under the key of their hash. */
export interface VaultStore {
  readonly driver: "local" | "s3";
  /** Idempotent: the key names its content. */
  put(key: string, bytes: Uint8Array, meta: StoredObject): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  head(key: string): Promise<(StoredObject & { lastModified: Date | null }) | null>;
  copy(from: string, to: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Every object whose key starts with `prefix` (vault keys only), in no particular order. */
  list(prefix: string): AsyncIterable<ListedObject>;
}

/** A request the browser sends straight to the storage provider (presigned: no credentials of its own). */
export interface PresignedRequest {
  method: "PUT" | "GET";
  url: string;
  /** headers it must send with exactly these values (they are part of the signature) */
  headers: Record<string, string>;
  expiresAt: Date;
}

/** A store whose provider accepts presigned requests (S3, R2): uploads and downloads that skip the app server. */
export interface PresigningStore extends VaultStore {
  /** A PUT of exactly these bytes — size, type and SHA-256 signed into the URL — under `key`. */
  presignPut(key: string, meta: StoredObject, options?: { expiresIn?: number; now?: Date }): PresignedRequest;
  /** A short-lived GET of `key`, with the type and Content-Disposition the browser should see. */
  presignGet(
    key: string,
    options?: { expiresIn?: number; now?: Date; contentType?: string; contentDisposition?: string },
  ): PresignedRequest;
}

export const canPresign = (store: VaultStore): store is PresigningStore =>
  typeof (store as Partial<PresigningStore>).presignPut === "function";

export function assertKey(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error(`Invalid vault key: ${key}`);
  return key;
}
