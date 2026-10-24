import "server-only";
import crypto from "node:crypto";
import {
  MIME,
  POLICIES,
  canPresign,
  incomingKey,
  inspectDeclared,
  inspectUpload,
  normalizeSha256,
  objectKey,
  sha256Hex,
  vaultFromEnv,
  type PresignedRequest,
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
 *     references them by hash (submitKyc, onboardDeveloper);
 *   · direct uploads (S3/R2): presignUpload() lets the browser PUT one declared file — size, type and SHA-256
 *     signed into the URL — under a quarantine key, with a ticket; storeIncoming() then checks those bytes exactly
 *     like an upload received here and moves them to their content key. Large downloads go out the same way
 *     (presigned GET), so no file crosses a serverless function's body limit.
 */
let store: VaultStore | null = null;
export const vault = (): VaultStore => (store ??= vaultFromEnv());

/** A refused upload or download, shown in the person's language, with its HTTP status. */
export class VaultError extends LocalizedError {
  status = 400;
  /** seconds a rate-limited caller must wait (Retry-After) */
  retryAfter: number | null = null;
  withStatus(status: number) {
    this.status = status;
    return this;
  }
  withRetryAfter(seconds: number) {
    this.retryAfter = seconds;
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

/** Content-Disposition of a vault file: Office documents always download; PDFs and images may open in place. */
export function contentDisposition(file: { name: string; mimeType: string }, download: boolean): string {
  const inline = !download && (file.mimeType === MIME.pdf || file.mimeType.startsWith("image/"));
  const name = downloadName(file.name, file.mimeType);
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** How a verified file goes back to the browser: exact type, never cached, never sniffed. */
export function fileResponse(
  bytes: Uint8Array,
  file: { name: string; mimeType: string; sha256: string },
  download: boolean,
): Response {
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": contentDisposition(file, download),
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

// ── direct uploads (presigned PUT) ─────────────────────────────────────────────
/** What the browser declared and was allowed to PUT under `key` (a quarantine key), for whom and where. */
export interface UploadTicket {
  key: string;
  /** "tenant:{organizationId}" | "staging" */
  scope: string;
  /** "inv:{investorId}" | "usr:{userId}" */
  subject: string;
  purpose: VaultPurpose;
  /** 64 lowercase hex characters */
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  issuedAt: number;
}
/** The presigned URL lives 15 minutes; its ticket a little longer, to confirm a slow upload. */
const TICKET_TTL_MS = 30 * 60 * 1000;
// Another key than receipts': a ticket (bytes not checked yet) can never pass for a receipt (bytes checked).
const ticketKey = () => crypto.createHmac("sha256", vaultReceiptKey()).update("rwaxi.vault-upload-ticket.v1").digest();
const ticketMac = (payload: string) => crypto.createHmac("sha256", ticketKey()).update(payload).digest("base64url");

/** Whether the browser uploads straight to the bucket (S3/R2) rather than through the app (local disk). */
export const directUploads = (): boolean => canPresign(vault());

/**
 * A browser's direct upload to the bucket (S3/R2): the declared file is checked against the policy, then a PUT URL
 * valid for that exact file under a fresh quarantine key, and its ticket. Null with the local disk.
 */
export function presignUpload(
  scope: string,
  subject: string,
  declared: { sizeBytes: unknown; type: unknown; sha256: unknown },
  purpose: VaultPurpose,
): { upload: PresignedRequest; ticket: string } | null {
  const store = vault();
  if (!canPresign(store)) return null;
  const check = inspectDeclared(declared, POLICIES[purpose]);
  if (!check.ok) throw rejection(check.code, purpose);
  const key = incomingKey();
  const upload = store.presignPut(key, { sizeBytes: check.sizeBytes, mimeType: check.mimeType, sha256: check.sha256 });
  const claims: UploadTicket = {
    key,
    scope,
    subject,
    purpose,
    sha256: check.sha256,
    sizeBytes: check.sizeBytes,
    mimeType: check.mimeType,
    issuedAt: Date.now(),
  };
  const payload = Buffer.from(JSON.stringify({ v: 1, ...claims })).toString("base64url");
  return { upload, ticket: `${payload}.${ticketMac(payload)}` };
}

/** The claims of a ticket this server issued, for this scope, subject and purpose, still fresh — or null. */
export function verifyTicket(
  token: unknown,
  expected: { scope: string; subject: string; purpose: VaultPurpose },
): UploadTicket | null {
  if (typeof token !== "string" || token.length > 2000) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const a = Buffer.from(ticketMac(payload));
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const t = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as UploadTicket & { v: number };
    if (t.v !== 1 || t.scope !== expected.scope || t.subject !== expected.subject || t.purpose !== expected.purpose)
      return null;
    if (!Number.isFinite(t.issuedAt) || Date.now() - t.issuedAt > TICKET_TTL_MS) return null;
    return t;
  } catch {
    return null;
  }
}

/**
 * The bytes the browser PUT under a ticket: checked like an upload received here (type from the bytes, size,
 * SHA-256), then copied to their content key; the quarantine copy is dropped either way (or by the GC).
 */
export async function storeIncoming(scope: VaultScope, ticket: UploadTicket): Promise<StoredUpload> {
  const store = vault();
  const bytes = await store.get(ticket.key);
  if (!bytes) throw new VaultError("No se encontró el archivo subido: vuelve a cargarlo.").withStatus(409);
  const check = inspectUpload(bytes, { type: ticket.mimeType, sha256: ticket.sha256 }, POLICIES[ticket.purpose]);
  if (!check.ok || check.sizeBytes !== ticket.sizeBytes) {
    await store.remove(ticket.key).catch(() => undefined);
    throw rejection(check.ok ? "mismatch" : check.code, ticket.purpose);
  }
  const storageKey = objectKey(scope, check.sha256);
  await store.copy(ticket.key, storageKey);
  await store.remove(ticket.key).catch(() => undefined);
  return { sha256: `0x${check.sha256}`, mimeType: check.mimeType, sizeBytes: check.sizeBytes, storageKey };
}

/** Above this size a file is downloaded straight from the bucket (presigned GET), not through the app (4 MB). */
export const inlineMaxBytes = (): number => Number(process.env.DOCUMENT_VAULT_INLINE_MAX_BYTES) || 4 * 1024 * 1024;
