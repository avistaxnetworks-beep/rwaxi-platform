import "server-only";
import { NextResponse } from "next/server";
import { withTenant, type AuditAction, type Prisma } from "@rwaxi/database";
import { LocalizedError } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import { requestMeta } from "./tenant-context";
import { VaultError, VaultIntegrityError, fileResponse, readVerified } from "./vault";

/** Shared by the vault download routes: the audited, integrity-checked answer to an authorized request. */
export interface VaultAccess {
  tenantId: string;
  actor: { id: string | null; email: string };
  entityType: string;
  entityId: string;
  action: Extract<AuditAction, "KYC_DOCUMENT_VIEWED" | "DATA_ROOM_DOCUMENT_DOWNLOADED">;
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

/** Reads the file re-hashing it, records the access (or the integrity incident) and answers with the bytes. */
export async function serveVaultFile(access: VaultAccess): Promise<Response> {
  let bytes: Uint8Array | null;
  try {
    bytes = await readVerified(access.file.storageKey, access.file.sha256);
  } catch (e) {
    if (!(e instanceof VaultIntegrityError)) throw e;
    await audit(access.tenantId, {
      action: "VAULT_INTEGRITY_FAILED",
      actor: access.actor,
      entityType: access.entityType,
      entityId: access.entityId,
      subjectHash: e.expected,
      payload: {
        ...access.payload,
        storageKey: e.storageKey,
        expectedSha256: e.expected,
        actualSha256: e.actual,
        attempted: access.action,
      },
    });
    throw new VaultError(
      "El archivo de la bóveda no coincide con su SHA-256 registrado: la descarga se bloqueó y el incidente quedó auditado.",
    ).withStatus(409);
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
