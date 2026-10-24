import { createHash } from "node:crypto";

/**
 * What the vault accepts for each use. The server reads the type from the bytes (magic numbers) and recomputes
 * the SHA-256: a declared type or hash that does not match the bytes is refused.
 */
export type VaultPurpose = "kyc" | "dataRoom";

export const MIME = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

export interface UploadPolicy {
  maxBytes: number;
  types: readonly string[];
}

const MB = 1024 * 1024;
export const POLICIES: Record<VaultPurpose, UploadPolicy> = {
  // Identity documents: a photo or a scan.
  kyc: { maxBytes: 10 * MB, types: [MIME.pdf, MIME.png, MIME.jpeg, MIME.webp] },
  // Legal, technical and financial files of an offering.
  dataRoom: { maxBytes: 20 * MB, types: [MIME.pdf, MIME.png, MIME.jpeg, MIME.webp, MIME.docx, MIME.xlsx] },
};

/** Type of a file from its first bytes, or null. A ZIP is only a docx/xlsx when that is what was declared. */
export function sniffMime(bytes: Uint8Array, declared?: string): string | null {
  const starts = (signature: number[], at = 0) => signature.every((b, i) => bytes[at + i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return MIME.pdf; // %PDF-
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return MIME.png;
  if (starts([0xff, 0xd8, 0xff])) return MIME.jpeg;
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return MIME.webp; // RIFF....WEBP
  if (starts([0x50, 0x4b, 0x03, 0x04]) && (declared === MIME.docx || declared === MIME.xlsx)) return declared;
  return null;
}

export const sha256Hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** "0x…" or bare, any case → 64 lowercase hex characters; null when it is not a SHA-256. */
export const normalizeSha256 = (raw: unknown): string | null =>
  typeof raw === "string" && /^(0x)?[0-9a-fA-F]{64}$/.test(raw) ? raw.replace(/^0x/, "").toLowerCase() : null;

export type UploadRejection = "empty" | "too_large" | "type" | "hash_format" | "mismatch";

export type UploadCheck =
  | { ok: true; sha256: string; mimeType: string; sizeBytes: number }
  | { ok: false; code: UploadRejection; sha256?: string };

/**
 * Size, type and SHA-256 of the bytes received against what the client declared (type and expected hash).
 * `sha256` is 64 lowercase hex characters.
 */
export function inspectUpload(
  bytes: Uint8Array,
  declared: { type?: string; sha256: unknown },
  policy: UploadPolicy,
): UploadCheck {
  if (bytes.byteLength === 0) return { ok: false, code: "empty" };
  if (bytes.byteLength > policy.maxBytes) return { ok: false, code: "too_large" };
  const expected = normalizeSha256(declared.sha256);
  if (!expected) return { ok: false, code: "hash_format" };
  const type = declared.type?.trim().toLowerCase() || undefined;
  const mimeType = sniffMime(bytes, type);
  if (!mimeType || !policy.types.includes(mimeType) || (type !== undefined && type !== mimeType))
    return { ok: false, code: "type" };
  const sha256 = sha256Hex(bytes);
  if (sha256 !== expected) return { ok: false, code: "mismatch", sha256 };
  return { ok: true, sha256, mimeType, sizeBytes: bytes.byteLength };
}

/**
 * What a browser declares before uploading directly to the bucket (presigned PUT): size, type and SHA-256, checked
 * against the policy before any URL is issued. The bytes themselves are checked with inspectUpload() afterwards.
 */
export function inspectDeclared(
  declared: { sizeBytes: unknown; type: unknown; sha256: unknown },
  policy: UploadPolicy,
): UploadCheck {
  const size = declared.sizeBytes;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) return { ok: false, code: "empty" };
  if (size > policy.maxBytes) return { ok: false, code: "too_large" };
  const sha256 = normalizeSha256(declared.sha256);
  if (!sha256) return { ok: false, code: "hash_format" };
  const mimeType = typeof declared.type === "string" ? declared.type.trim().toLowerCase() : "";
  if (!policy.types.includes(mimeType)) return { ok: false, code: "type" };
  return { ok: true, sha256, mimeType, sizeBytes: size };
}
