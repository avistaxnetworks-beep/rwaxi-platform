import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { computeDataRoomRoot } from "@rwaxi/blockchain-sdk/merkle";
import { forTenant, isUniqueViolation, withTenant, type Prisma } from "@rwaxi/database";
import { LocalizedError } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import { DATAROOM } from "@/app/_lib/data/projects";
import { readInvestorSession } from "@/app/_lib/server/investor-session";
import { requirePlatformAccess } from "@/app/_lib/server/staff-auth";
import { TenantAccessError, requestMeta, requireHostTenant } from "@/app/_lib/server/tenant-context";
import { VaultError, storeUpload, uploadReceipt } from "@/app/_lib/server/vault";
import { requireBackofficeSession } from "@/app/tenant/[slug]/backoffice/_lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/vault/upload (multipart: file, sha256 = what the browser computed, purpose) — the only way bytes
 * enter the DocumentVault. The server checks type (from the bytes), size and SHA-256 before writing anything.
 *   purpose=kyc        tenant host, investor session (rwaxi_inv) with NDA: KYC document → receipt for submitKyc()
 *   purpose=onboarding admin host, console session: base Data Room of a developer not created yet → staging,
 *                      receipt for onboardDeveloper()
 *   purpose=data-room  tenant host, TENANT_ADMIN: new Data Room document of an offering (+ offeringId, folder,
 *                      name, restricted) → DataRoomDocument, new Merkle root and its updateDataRoomMerkleRoot()
 */
const MAX_BODY = 21 * 1024 * 1024;
const FOLDERS: string[] = (DATAROOM as { n: string; name: string }[]).map((f) => `${f.n} ${f.name}`);
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const json = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const tr = await requestTranslate("tenant");
  try {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) {
      throw new VaultError("La solicitud supera el tamaño máximo permitido.").withStatus(413);
    }
    const form = await req.formData().catch(() => {
      throw new VaultError("La carga llegó incompleta o no es un formulario válido; vuelve a intentarlo.");
    });
    const file = form.get("file");
    if (!(file instanceof Blob)) throw new VaultError("Adjunta el archivo.");
    const sha256 = form.get("sha256");
    const purpose = form.get("purpose");
    if (purpose === "kyc") return json(200, await kycUpload(file, sha256));
    if (purpose === "onboarding") return json(200, await onboardingUpload(file, sha256));
    if (purpose === "data-room") return json(200, await dataRoomUpload(file, sha256, form));
    throw new VaultError("Destino de carga inválido.");
  } catch (e) {
    if (e instanceof VaultError) return json(e.status, { ok: false, error: render(tr, e.reason) });
    if (e instanceof LocalizedError)
      return json(e instanceof TenantAccessError ? 403 : 400, { ok: false, error: render(tr, e.reason) });
    if (isUniqueViolation(e))
      return json(409, { ok: false, error: tr("Ese archivo ya está en el Data Room de esta oferta.") });
    console.error("[vault] upload failed", e);
    return json(500, { ok: false, error: tr("No se pudo guardar el archivo. Inténtalo de nuevo.") });
  }
}

async function kycUpload(file: Blob, sha256: FormDataEntryValue | null) {
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
  const stored = await storeUpload({ organizationId: tenant.id }, file, sha256, "kyc");
  const { storageKey: _key, ...verified } = stored;
  return {
    ok: true,
    ...verified,
    receipt: uploadReceipt({
      scope: `tenant:${tenant.id}`,
      subject: `inv:${session.investorId}`,
      ...verified,
    }),
  };
}

async function onboardingUpload(file: Blob, sha256: FormDataEntryValue | null) {
  if ((await headers()).get("x-rwaxi-env") !== "admin")
    throw new VaultError("Destino de carga inválido.").withStatus(404);
  const actor = await requirePlatformAccess();
  const stored = await storeUpload("staging", file, sha256, "dataRoom");
  const { storageKey: _key, ...verified } = stored;
  return {
    ok: true,
    ...verified,
    receipt: uploadReceipt({ scope: "staging", subject: `usr:${actor.user.id}`, ...verified }),
  };
}

async function dataRoomUpload(file: Blob, sha256: FormDataEntryValue | null, form: FormData) {
  const session = await requireBackofficeSession("TENANT_ADMIN");
  const tenantId = session.tenant.id;
  const offeringId = form.get("offeringId");
  const folder = form.get("folder");
  const restricted = form.get("restricted") === "1";
  const rawName = String(form.get("name") ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const fileName = file instanceof File ? file.name : "";
  const name = (rawName || fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "")).slice(0, 160);
  if (typeof offeringId !== "string" || !ID.test(offeringId)) throw new VaultError("Oferta inválida.");
  if (typeof folder !== "string" || !FOLDERS.includes(folder))
    throw new VaultError("Carpeta del Data Room inválida.");
  if (name.length < 2) throw new VaultError("Escribe el nombre del documento.");
  const offering = await forTenant(tenantId).offering.findUnique({
    where: { id: offeringId },
    select: { id: true },
  });
  if (!offering) throw new VaultError("Oferta no encontrada en este tenant.").withStatus(404);

  const stored = await storeUpload({ organizationId: tenantId }, file, sha256, "dataRoom");
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
          actorUserId: session.reviewer.id,
          actorEmail: session.reviewer.email,
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
  const { storageKey: _key, ...verified } = stored;
  return {
    ok: true,
    ...verified,
    documentId: result.documentId,
    dataRoomRoot: result.dataRoomRoot,
    anchorQueued: !!result.anchorId,
  };
}
