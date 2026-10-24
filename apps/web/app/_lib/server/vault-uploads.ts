import "server-only";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { computeDataRoomRoot } from "@rwaxi/blockchain-sdk/merkle";
import { forTenant, isUniqueViolation, withTenant, type Prisma } from "@rwaxi/database";
import type { VaultPurpose, VaultScope } from "@rwaxi/document-vault";
import { LocalizedError } from "@/app/_i18n/marks";
import { render } from "@/app/_i18n/server";
import type { Translate } from "@/app/_i18n/translate";
import { DATAROOM } from "@/app/_lib/data/projects";
import { requireBackofficeSession } from "@/app/tenant/[slug]/backoffice/_lib/session";
import { readInvestorSession } from "./investor-session";
import { hitRateLimit, ipBucket } from "./rate-limit";
import { requirePlatformAccess } from "./staff-auth";
import { TenantAccessError, requestMeta, requireHostTenant } from "./tenant-context";
import { VaultError, uploadReceipt, type StoredUpload } from "./vault";

/**
 * Who may put a file into the DocumentVault, and what happens once its bytes are verified — shared by the upload
 * through the app (POST /api/vault/upload) and the direct one to the bucket (…/presign → PUT → …/confirm):
 *   kyc         tenant host, the investor session (rwaxi_inv) with its NDA → a receipt for submitKyc()
 *   onboarding  admin host, the console session → staging, a receipt for onboardDeveloper()
 *   data-room   tenant host, TENANT_ADMIN (+ offeringId, folder, name, restricted) → a DataRoomDocument, the new
 *               Merkle root and its updateDataRoomMerkleRoot()
 * Rate limits (PostgreSQL, every instance): per IP address before anything else, per session once authorised.
 */
export type UploadPurpose = "kyc" | "onboarding" | "data-room";

export interface UploadContext {
  purpose: UploadPurpose;
  vaultPurpose: VaultPurpose;
  scope: VaultScope;
  /** scope of receipts and tickets: "tenant:{organizationId}" | "staging" */
  scopeKey: string;
  /** who uploads: "inv:{investorId}" | "usr:{userId}" */
  subject: string;
  dataRoom?: {
    tenantId: string;
    offeringId: string;
    folder: string;
    name: string;
    restricted: boolean;
    reviewer: { id: string; email: string };
  };
}

const FOLDERS: string[] = (DATAROOM as { n: string; name: string }[]).map((f) => `${f.n} ${f.name}`);
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const WINDOW_S = 600;
const limit = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
const PER_SESSION = () => limit("VAULT_UPLOADS_PER_SESSION", 20);
const PER_IP = () => limit("VAULT_UPLOADS_PER_IP", 120);

const tooMany = (seconds: number) =>
  new VaultError("Demasiadas cargas en poco tiempo: espera {seconds} s y vuelve a intentarlo.", { seconds })
    .withStatus(429)
    .withRetryAfter(seconds);

/** At most VAULT_UPLOADS_PER_IP uploads per 10 minutes from one address (hashed), counted before anything else. */
export async function limitUploadsFromIp(): Promise<void> {
  const { ipAddress } = await requestMeta();
  if (!ipAddress) return;
  const wait = await hitRateLimit(ipBucket("vault-upload", ipAddress), WINDOW_S, PER_IP());
  if (wait) throw tooMany(wait);
}

/** At most VAULT_UPLOADS_PER_SESSION uploads per 10 minutes for one investor or staff member. */
export async function limitUploadsOf(ctx: UploadContext): Promise<void> {
  const wait = await hitRateLimit(`vault-upload:${ctx.subject}`, WINDOW_S, PER_SESSION());
  if (wait) throw tooMany(wait);
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** The upload's purpose, scope and subject — or an error naming why this caller may not upload it. */
export async function authorizeUpload(
  purpose: unknown,
  field: (name: string) => unknown,
): Promise<UploadContext> {
  if (purpose === "kyc") {
    const tenant = await requireHostTenant();
    const session = await readInvestorSession(tenant.id);
    if (!session)
      throw new VaultError("Firma primero el NDA (Paso 1) para iniciar tu verificación.").withStatus(401);
    if (tenant.portalStatus === "SUSPENDED") {
      throw new VaultError(
        "Portal temporalmente suspendido para nuevas operaciones: no se reciben nuevas verificaciones.",
      ).withStatus(403);
    }
    const nda = await forTenant(tenant.id).ndaAcceptance.findFirst({
      where: { investorId: session.investorId },
      select: { id: true },
    });
    if (!nda)
      throw new VaultError("Firma primero el NDA (Paso 1) para iniciar tu verificación.").withStatus(401);
    return {
      purpose,
      vaultPurpose: "kyc",
      scope: { organizationId: tenant.id },
      scopeKey: `tenant:${tenant.id}`,
      subject: `inv:${session.investorId}`,
    };
  }
  if (purpose === "onboarding") {
    if ((await headers()).get("x-rwaxi-env") !== "admin")
      throw new VaultError("Destino de carga inválido.").withStatus(404);
    const actor = await requirePlatformAccess();
    return {
      purpose,
      vaultPurpose: "dataRoom",
      scope: "staging",
      scopeKey: "staging",
      subject: `usr:${actor.user.id}`,
    };
  }
  if (purpose === "data-room") {
    const session = await requireBackofficeSession("TENANT_ADMIN");
    const tenantId = session.tenant.id;
    const offeringId = field("offeringId");
    const folder = field("folder");
    const fileName = text(field("fileName"));
    const name = (
      text(field("name")).trim().replace(/\s+/g, " ") || fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "")
    ).slice(0, 160);
    if (typeof offeringId !== "string" || !ID.test(offeringId)) throw new VaultError("Oferta inválida.");
    if (typeof folder !== "string" || !FOLDERS.includes(folder))
      throw new VaultError("Carpeta del Data Room inválida.");
    if (name.length < 2) throw new VaultError("Escribe el nombre del documento.");
    const offering = await forTenant(tenantId).offering.findUnique({
      where: { id: offeringId },
      select: { id: true },
    });
    if (!offering) throw new VaultError("Oferta no encontrada en este tenant.").withStatus(404);
    return {
      purpose,
      vaultPurpose: "dataRoom",
      scope: { organizationId: tenantId },
      scopeKey: `tenant:${tenantId}`,
      subject: `usr:${session.reviewer.id}`,
      dataRoom: {
        tenantId,
        offeringId,
        folder,
        name,
        restricted: field("restricted") === "1",
        reviewer: { id: session.reviewer.id, email: session.reviewer.email },
      },
    };
  }
  throw new VaultError("Destino de carga inválido.");
}

/** What a verified upload becomes: a receipt (kyc, onboarding) or a Data Room document with its new root. */
export async function completeUpload(
  ctx: UploadContext,
  stored: StoredUpload,
): Promise<Record<string, unknown>> {
  const { storageKey: _key, ...verified } = stored;
  if (!ctx.dataRoom)
    return {
      ok: true,
      ...verified,
      receipt: uploadReceipt({ scope: ctx.scopeKey, subject: ctx.subject, ...verified }),
    };
  const { tenantId, offeringId, folder, name, restricted, reviewer } = ctx.dataRoom;
  const meta = await requestMeta();
  const result = await withTenant(
    tenantId,
    async (tx) => {
      // Serialises uploads to the same offering: each one recomputes the root over every document.
      await tx.$queryRaw`SELECT id FROM offerings WHERE id = ${offeringId} FOR UPDATE`;
      const o = await tx.offering.findUniqueOrThrow({
        where: { id: offeringId },
        select: {
          id: true,
          code: true,
          network: true,
          dataRoomRoot: true,
          token: { select: { status: true, contractAddress: true } },
        },
      });
      await tx.vaultObject.createMany({
        data: [
          {
            organizationId: tenantId,
            sha256: stored.sha256,
            sizeBytes: stored.sizeBytes,
            mimeType: stored.mimeType,
            storageKey: stored.storageKey,
          },
        ],
        skipDuplicates: true,
      });
      const document = await tx.dataRoomDocument.create({
        data: {
          organizationId: tenantId,
          offeringId: o.id,
          folder,
          name,
          restricted,
          sha256: stored.sha256,
          sizeBytes: stored.sizeBytes,
          storageKey: stored.storageKey,
        },
      });
      const all = await tx.dataRoomDocument.findMany({
        where: { offeringId: o.id },
        select: { sha256: true },
      });
      const dataRoomRoot = computeDataRoomRoot(all);
      await tx.offering.update({ where: { id: o.id }, data: { dataRoomRoot } });
      // A deployed token anchors the new root: one pending updateDataRoomMerkleRoot() per offering, kept current.
      let anchorId: string | null = null;
      if ((o.token?.status === "DEPLOYED" || o.token?.status === "PAUSED") && o.token.contractAddress) {
        const pending = await tx.chainTransaction.findFirst({
          where: {
            offeringId: o.id,
            kind: "DATA_ROOM_ROOT_ANCHORED",
            status: "PENDING",
            executionMode: null,
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (pending) {
          await tx.chainTransaction.updateMany({
            where: { id: pending.id, status: "PENDING", executionMode: null },
            data: { args: { newRoot: dataRoomRoot } },
          });
          anchorId = pending.id;
        } else {
          anchorId = (
            await tx.chainTransaction.create({
              data: {
                organizationId: tenantId,
                offeringId: o.id,
                network: o.network,
                kind: "DATA_ROOM_ROOT_ANCHORED",
                contractAddress: o.token.contractAddress,
                method: "updateDataRoomMerkleRoot(bytes32)",
                args: { newRoot: dataRoomRoot },
                status: "PENDING",
              },
            })
          ).id;
        }
      }
      const payload = {
        documentId: document.id,
        offeringCode: o.code,
        folder,
        name,
        restricted,
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes,
        mimeType: stored.mimeType,
        previousRoot: o.dataRoomRoot,
        dataRoomRoot,
        anchorChainTransactionId: anchorId,
      };
      await tx.auditEvent.create({
        data: {
          organizationId: tenantId,
          action: "DATA_ROOM_DOCUMENT_ADDED",
          actorUserId: reviewer.id,
          actorEmail: reviewer.email,
          entityType: "DataRoomDocument",
          entityId: document.id,
          subjectHash: stored.sha256,
          payload: payload as Prisma.InputJsonValue,
          ...meta,
        },
      });
      return { documentId: document.id, dataRoomRoot, anchorId };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  revalidatePath("/tenant/[slug]/backoffice", "page");
  revalidatePath("/tenant/[slug]", "page");
  return {
    ok: true,
    ...verified,
    documentId: result.documentId,
    dataRoomRoot: result.dataRoomRoot,
    anchorQueued: !!result.anchorId,
  };
}

export const uploadJson = (
  status: number,
  body: Record<string, unknown>,
  extra: Record<string, string> = {},
) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });

/** The JSON answer of a refused upload, in the visitor's language. */
export function uploadFailure(e: unknown, tr: Translate): NextResponse {
  if (e instanceof VaultError) {
    return uploadJson(
      e.status,
      { ok: false, error: render(tr, e.reason) },
      e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {},
    );
  }
  if (e instanceof LocalizedError)
    return uploadJson(e instanceof TenantAccessError ? 403 : 400, { ok: false, error: render(tr, e.reason) });
  if (isUniqueViolation(e))
    return uploadJson(409, { ok: false, error: tr("Ese archivo ya está en el Data Room de esta oferta.") });
  console.error("[vault] upload failed", e);
  return uploadJson(500, { ok: false, error: tr("No se pudo guardar el archivo. Inténtalo de nuevo.") });
}
