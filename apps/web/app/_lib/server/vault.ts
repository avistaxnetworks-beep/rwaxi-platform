import "server-only";
import crypto from "node:crypto";
import {
  MIME,
  POLICIES,
  inspectUpload,
  normalizeSha256,
  objectKey,
  sha256Hex,
  vaultFromEnv,
  type UploadRejection,
  type VaultPurpose,
  type VaultScope,
  type VaultStore,
} from "@rwaxi/document-vault";
import { LocalizedError, msg } from "@/app/_i18n/marks";
import { vaultReceiptKey } from "./investor-session";

/**
 * The DocumentVault as the app uses it (store from DOCUMENT_VAULT_DRIVER, see @rwaxi/document-vault):
 *   · storeUpload(): the bytes the server received are checked (type from the bytes, size, SHA-256 equal to the
 *     one the browser computed) and only then written, content-addressed under the tenant (or staging);
 *   · readVerified(): every read is re-hashed — bytes that no longer match their SHA-256 are never served;
 *   · receipts: proof that this server verified those bytes from that session, for the operation that later
 *     references them by hash (submitKyc, onboardDeveloper).
 */
let store: VaultStore | null = null;
export const vault = (): VaultStore => (store ??= vaultFromEnv());

/** A refused upload or download, shown in the person's language, with its HTTP status. */
export class VaultError extends LocalizedError {
  status = 400;
  withStatus(status: number) {
    this.status = status;
    return this;
  }
}

const REJECTION: Record<UploadRejection, [number, string]> = {
  empty: [400, msg("El archivo está vacío.")],
  too_large: [413, msg("El archivo supera el tamaño máximo de {max} MB.")],
  type: [415, msg("Tipo de archivo no admitido: usa {types}.")],
  hash_format: [400, msg("Falta el SHA-256 del archivo calculado en tu navegador.")],
  mismatch: [
    422,
    msg("El SHA-256 recalculado en el servidor no coincide con el de tu navegador: el archivo no se guardó."),
  ],
};
const TYPE_NAME: Record<string, string> = {
  [MIME.pdf]: "PDF",
  [MIME.png]: "PNG",
  [MIME.jpeg]: "JPG",
  [MIME.webp]: "WebP",
  [MIME.docx]: "DOCX",
  [MIME.xlsx]: "XLSX",
};

function rejection(code: UploadRejection, purpose: VaultPurpose): VaultError {
  const [status, source] = REJECTION[code];
  const policy = POLICIES[purpose];
  return new VaultError(source, {
    max: policy.maxBytes / (1024 * 1024),
    types: policy.types.map((t) => TYPE_NAME[t] ?? t).join(", "),
  }).withStatus(status);
}

export interface StoredUpload {
  /** 0x + SHA-256 of the bytes */
  sha256: string;
  /** read from the bytes */
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
}

/** Verifies an uploaded file against the SHA-256 its sender declared and writes it into the vault. */
export async function storeUpload(
  scope: VaultScope,
  file: Blob,
  declaredSha256: unknown,
  purpose: VaultPurpose,
): Promise<StoredUpload> {
  if (file.size > POLICIES[purpose].maxBytes) throw rejection("too_large", purpose); // before reading the bytes
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = inspectUpload(bytes, { type: file.type, sha256: declaredSha256 }, POLICIES[purpose]);
  if (!check.ok) throw rejection(check.code, purpose);
  const storageKey = objectKey(scope, check.sha256);
  // Content-addressed: writing the same verified bytes again also repairs a damaged copy.
  await vault().put(storageKey, bytes, {
    sizeBytes: check.sizeBytes,
    mimeType: check.mimeType,
    sha256: check.sha256,
  });
  return { sha256: `0x${check.sha256}`, mimeType: check.mimeType, sizeBytes: check.sizeBytes, storageKey };
}

/** The stored bytes no longer hash to the SHA-256 on record. */
export class VaultIntegrityError extends Error {
  constructor(
    readonly storageKey: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`Vault object ${storageKey} does not match its SHA-256`);
  }
}

/** The bytes of a vault object, re-hashed against `sha256`; null when the object is missing. */
export async function readVerified(storageKey: string, sha256: string): Promise<Uint8Array | null> {
  const bytes = await vault().get(storageKey);
  if (!bytes) return null;
  const actual = sha256Hex(bytes);
  if (actual !== normalizeSha256(sha256))
    throw new VaultIntegrityError(storageKey, `0x${normalizeSha256(sha256)}`, `0x${actual}`);
  return bytes;
}

const EXTENSION: Record<string, string> = {
  [MIME.pdf]: ".pdf",
  [MIME.png]: ".png",
  [MIME.jpeg]: ".jpg",
  [MIME.webp]: ".webp",
  [MIME.docx]: ".docx",
  [MIME.xlsx]: ".xlsx",
};

/** A document's title as a file name with the extension of its verified type ("Estudio de títulos.pdf"). */
export const downloadName = (name: string, mimeType: string): string => {
  const ext = EXTENSION[mimeType] ?? "";
  return ext && !name.toLowerCase().endsWith(ext) ? `${name}${ext}` : name;
};

/** How a verified file goes back to the browser: exact type, never cached, never sniffed. */
export function fileResponse(
  bytes: Uint8Array,
  file: { name: string; mimeType: string; sha256: string },
  download: boolean,
): Response {
  // Office documents always download; PDFs and images may open in the browser.
  const inline = !download && (file.mimeType === MIME.pdf || file.mimeType.startsWith("image/"));
  const name = downloadName(file.name, file.mimeType);
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "X-Rwaxi-Sha256": file.sha256,
    },
  });
}

// ── upload receipts ────────────────────────────────────────────────────────────
export interface ReceiptClaims {
  /** "tenant:{organizationId}" | "staging" */
  scope: string;
  /** "inv:{investorId}" | "usr:{userId}" */
  subject: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  issuedAt: number;
}
const RECEIPT_TTL_MS = 6 * 3600 * 1000;
const mac = (payload: string) =>
  crypto.createHmac("sha256", vaultReceiptKey()).update(payload).digest("base64url");

export function uploadReceipt(claims: Omit<ReceiptClaims, "issuedAt">): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, ...claims, issuedAt: Date.now() })).toString(
    "base64url",
  );
  return `${payload}.${mac(payload)}`;
}

/** The claims of a receipt this server issued for `scope` and `subject` (fresh), or null. */
export function verifyReceipt(
  token: unknown,
  expected: { scope: string; subject: string },
): ReceiptClaims | null {
  if (typeof token !== "string" || token.length > 2000) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const a = Buffer.from(mac(payload));
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ReceiptClaims & {
      v: number;
    };
    if (claims.v !== 1 || claims.scope !== expected.scope || claims.subject !== expected.subject) return null;
    if (!Number.isFinite(claims.issuedAt) || Date.now() - claims.issuedAt > RECEIPT_TTL_MS) return null;
    return claims;
  } catch {
    return null;
  }
}
