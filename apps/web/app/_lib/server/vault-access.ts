import "server-only";
import { NextResponse } from "next/server";
import { withTenant, type AuditAction, type Prisma } from "@rwaxi/database";
import { canPresign, normalizeSha256 } from "@rwaxi/document-vault";
import { LocalizedError } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import { requestMeta } from "./tenant-context";
import {
  VaultError,
  VaultIntegrityError,
  contentDisposition,
  fileResponse,
  inlineMaxBytes,
  readVerified,
  vault,
} from "./vault";

/** Shared by the vault download routes: the audited, integrity-checked answer to an authorized request. */
export interface VaultAccess {
  tenantId: string;
  actor: { id: string | null; email: string };
  entityType: string;
  entityId: string;
  action: Extract<
    AuditAction,
    "KYC_DOCUMENT_VIEWED" | "DATA_ROOM_DOCUMENT_DOWNLOADED" | "COMMERCIAL_AGREEMENT_DOWNLOADED" | "DISTRIBUTION_SUPPORT_DOWNLOADED"
  >;
  file: { name: string; mimeType: string; sha256: string; storageKey: string };
  payload: Record<string, unknown>;
  download: boolean;
}

async function audit(
  tenantId: string,
  e: {
    action: AuditAction;
    actor: VaultAccess["actor"];
    entityType: string;
    entityId: string;
    subjectHash: string;
    payload: Record<string, unknown>;
  },
) {
  const meta = await requestMeta();
  await withTenant(tenantId, (tx) =>
    tx.auditEvent.create({
      data: {
        organizationId: tenantId,
        action: e.action,
        actorUserId: e.actor.id,
        actorEmail: e.actor.email,
        entityType: e.entityType,
        entityId: e.entityId,
        subjectHash: e.subjectHash,
        payload: e.payload as Prisma.InputJsonValue,
        ...meta,
      },
    }),
  );
}

async function integrityIncident(access: VaultAccess, expected: string, actual: string): Promise<never> {
  await audit(access.tenantId, {
    action: "VAULT_INTEGRITY_FAILED",
    actor: access.actor,
    entityType: access.entityType,
    entityId: access.entityId,
    subjectHash: expected,
    payload: {
      ...access.payload,
      storageKey: access.file.storageKey,
      expectedSha256: expected,
      actualSha256: actual,
      attempted: access.action,
    },
  });
  throw new VaultError(
    "El archivo de la bóveda no coincide con su SHA-256 registrado: la descarga se bloqueó y el incidente quedó auditado.",
  ).withStatus(409);
}

/**
 * Records the access and answers with the file:
 *   · through the app, re-hashed against its SHA-256 (an integrity incident is audited and blocks it);
 *   · on S3/R2, a file larger than the inline limit (DOCUMENT_VAULT_INLINE_MAX_BYTES, 4 MB: a serverless response
 *     cannot carry it) is a 302 to a presigned GET valid for 60 s, named and typed, once the stored object's
 *     SHA-256 metadata matches the record; the bucket checked those bytes against that SHA-256 when they were
 *     written, and the portal re-hashes the copy it receives.
 */
export async function serveVaultFile(access: VaultAccess): Promise<Response> {
  const store = vault();
  if (canPresign(store)) {
    const head = await store.head(access.file.storageKey);
    if (!head) throw new VaultError("Este documento no tiene archivo en la bóveda.").withStatus(404);
    if (head.sizeBytes > inlineMaxBytes()) {
      const expected = normalizeSha256(access.file.sha256);
      if (!expected || head.sha256 !== expected) {
        await integrityIncident(access, `0x${expected ?? ""}`, head.sha256 ? `0x${head.sha256}` : "(sin metadato)");
      }
      await audit(access.tenantId, {
        action: access.action,
        actor: access.actor,
        entityType: access.entityType,
        entityId: access.entityId,
        subjectHash: access.file.sha256,
        payload: {
          ...access.payload,
          sha256: access.file.sha256,
          mimeType: access.file.mimeType,
          download: access.download,
          delivery: "presigned",
        },
      });
      const { url } = store.presignGet(access.file.storageKey, {
        contentType: access.file.mimeType,
        contentDisposition: contentDisposition(access.file, access.download),
      });
      return new Response(null, {
        status: 302,
        headers: { Location: url, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
      });
    }
  }
  let bytes: Uint8Array | null;
  try {
    bytes = await readVerified(access.file.storageKey, access.file.sha256);
  } catch (e) {
    if (!(e instanceof VaultIntegrityError)) throw e;
    return integrityIncident(access, e.expected, e.actual);
  }
  if (!bytes) throw new VaultError("Este documento no tiene archivo en la bóveda.").withStatus(404);
  await audit(access.tenantId, {
    action: access.action,
    actor: access.actor,
    entityType: access.entityType,
    entityId: access.entityId,
    subjectHash: access.file.sha256,
    payload: {
      ...access.payload,
      sha256: access.file.sha256,
      mimeType: access.file.mimeType,
      download: access.download,
      delivery: "inline",
    },
  });
  return fileResponse(bytes, access.file, access.download);
}

/** JSON error of a vault route, in the visitor's language. */
export async function vaultFailure(e: unknown): Promise<Response> {
  const tr = await requestTranslate("tenant");
  const status = e instanceof VaultError ? e.status : e instanceof LocalizedError ? 403 : 500;
  if (status === 500) console.error("[vault] download failed", e);
  const error =
    e instanceof LocalizedError
      ? render(tr, e.reason)
      : tr("No se pudo abrir el documento. Inténtalo de nuevo.");
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}
