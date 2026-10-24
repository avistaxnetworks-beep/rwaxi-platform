/**
 * DocumentVault: storage of the documents behind the platform's hashes (KYC files, Data Room files).
 * Content-addressed by SHA-256 and isolated per tenant; the server only writes bytes it verified itself
 * (type from the bytes, size, SHA-256 equal to the expected one) and re-hashes them whenever it serves them.
 * On S3/R2 the browser may upload and download through presigned URLs bound to those same checks.
 */
export { MIME, POLICIES, inspectDeclared, inspectUpload, normalizeSha256, sha256Hex, sniffMime } from "./policy";
export type { UploadCheck, UploadPolicy, UploadRejection, VaultPurpose } from "./policy";
export { KEY_PATTERN, canPresign, incomingKey, objectKey } from "./store";
export type { ListedObject, PresignedRequest, PresigningStore, StoredObject, VaultScope, VaultStore } from "./store";
export { LocalDiskStore } from "./local";
export { S3Store, UNSIGNED_PAYLOAD, presignV4, signV4 } from "./s3";
export type { PresignInput, S3Config } from "./s3";
export { DEFAULT_GRACE_MS, GC_PREFIXES, purgeUnreferencedBlobs } from "./gc";
export type { PurgeOptions, PurgeReport } from "./gc";
export { defaultVaultDir, vaultFromEnv } from "./env";
