/**
 * DocumentVault: storage of the documents behind the platform's hashes (KYC files, Data Room files).
 * Content-addressed by SHA-256 and isolated per tenant; the server only writes bytes it verified itself
 * (type from the bytes, size, SHA-256 equal to the expected one) and re-hashes them whenever it serves them.
 */
export { MIME, POLICIES, inspectUpload, normalizeSha256, sha256Hex, sniffMime } from "./policy";
export type { UploadCheck, UploadPolicy, UploadRejection, VaultPurpose } from "./policy";
export { KEY_PATTERN, objectKey } from "./store";
export type { StoredObject, VaultScope, VaultStore } from "./store";
export { LocalDiskStore } from "./local";
export { S3Store, signV4 } from "./s3";
export type { S3Config } from "./s3";
export { defaultVaultDir, vaultFromEnv } from "./env";
