import { normalizeSha256 } from "./policy";

/**
 * Where a document lives: content-addressed by its SHA-256 and isolated per tenant.
 *   tenants/{organizationId}/sha256/{hex}   a tenant's document (KYC file, Data Room file)
 *   staging/sha256/{hex}                    uploaded before its tenant exists (B2B onboarding)
 * The same bytes of two tenants are two objects: nothing is shared across tenants.
 */
export type VaultScope = { organizationId: string } | "staging";

const ORGANIZATION_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const KEY_PATTERN = /^(?:tenants\/[A-Za-z0-9_-]{1,64}|staging)\/sha256\/[0-9a-f]{64}$/;

export function objectKey(scope: VaultScope, sha256: string): string {
  const hex = normalizeSha256(sha256);
  if (!hex) throw new Error("Invalid SHA-256 for a vault key");
  if (scope === "staging") return `staging/sha256/${hex}`;
  if (!ORGANIZATION_ID.test(scope.organizationId)) throw new Error("Invalid organization id for a vault key");
  return `tenants/${scope.organizationId}/sha256/${hex}`;
}

/** Metadata stored with each object (verified by the server before it was written). */
export interface StoredObject {
  sizeBytes: number;
  mimeType: string;
  /** 64 lowercase hex characters */
  sha256: string;
}

/** A storage driver. Only bytes the server verified are ever written, under the key of their hash. */
export interface VaultStore {
  readonly driver: "local" | "s3";
  /** Idempotent: the key names its content. */
  put(key: string, bytes: Uint8Array, meta: StoredObject): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  head(key: string): Promise<StoredObject | null>;
  copy(from: string, to: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export function assertKey(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error(`Invalid vault key: ${key}`);
  return key;
}
