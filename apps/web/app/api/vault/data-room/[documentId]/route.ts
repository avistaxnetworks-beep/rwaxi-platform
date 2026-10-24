import type { NextRequest } from "next/server";
import { forTenant } from "@rwaxi/database";
import { readInvestorSession } from "@/app/_lib/server/investor-session";
import { requireHostTenant } from "@/app/_lib/server/tenant-context";
import { VaultError } from "@/app/_lib/server/vault";
import { serveVaultFile, vaultFailure } from "@/app/_lib/server/vault-access";
import { requireBackofficeSession } from "@/app/tenant/[slug]/backoffice/_lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * GET /api/vault/data-room/{documentId}[?download=1] — a Data Room file of the host's tenant (read under RLS:
 * another tenant's document "does not exist").
 *   investor (default): the session of this portal and its NDA for the document's offering; a restricted
 *     document also needs a current AccessGrant (NDA + KYC approved).
 *   ?as=backoffice: any staff member of the tenant (or the demo session).
 * Re-hashed against the anchored SHA-256 and recorded as DATA_ROOM_DOCUMENT_DOWNLOADED.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await params;
    if (!ID.test(documentId)) throw new VaultError("Documento no encontrado.").withStatus(404);
    const staff =
      req.nextUrl.searchParams.get("as") === "backoffice"
        ? await requireBackofficeSession("TENANT_ADMIN", { view: true })
        : null;
    const tenant = staff ? staff.tenant : await requireHostTenant();
    const db = forTenant(tenant.id);
    const doc = await db.dataRoomDocument.findUnique({
      where: { id: documentId },
      include: { offering: { select: { code: true } } },
    });
    if (!doc) throw new VaultError("Documento no encontrado en este tenant.").withStatus(404);
    if (!doc.storageKey)
      throw new VaultError("Este documento no tiene archivo en la bóveda.").withStatus(404);
    const object = await db.vaultObject.findUnique({
      where: { organizationId_sha256: { organizationId: tenant.id, sha256: doc.sha256 } },
    });
    const file = {
      name: doc.name,
      mimeType: object?.mimeType ?? "application/octet-stream",
      sha256: doc.sha256,
      storageKey: doc.storageKey,
    };
    const base = {
      documentId: doc.id,
      name: doc.name,
      folder: doc.folder,
      offeringCode: doc.offering.code,
      restricted: doc.restricted,
    };
    const download = req.nextUrl.searchParams.get("download") === "1";

    if (staff) {
      return await serveVaultFile({
        tenantId: tenant.id,
        actor: { id: staff.reviewer.id, email: staff.reviewer.email },
        entityType: "DataRoomDocument",
        entityId: doc.id,
        action: "DATA_ROOM_DOCUMENT_DOWNLOADED",
        file,
        payload: { ...base, by: "staff", role: staff.role, demo: staff.demo },
        download,
      });
    }

    const session = await readInvestorSession(tenant.id);
    const investor = session
      ? await db.investor.findUnique({
          where: { id: session.investorId },
          select: { id: true, email: true, fullName: true },
        })
      : null;
    if (!investor)
      throw new VaultError(
        "Firma el NDA del proyecto para acceder a los documentos del Data Room.",
      ).withStatus(401);
    const nda = await db.ndaAcceptance.findUnique({
      where: { offeringId_investorId: { offeringId: doc.offeringId, investorId: investor.id } },
      select: { id: true },
    });
    if (!nda)
      throw new VaultError(
        "Firma el NDA del proyecto para acceder a los documentos del Data Room.",
      ).withStatus(403);
    let grantId: string | null = null;
    if (doc.restricted) {
      const grant = await db.dataRoomAccessGrant.findFirst({
        where: {
          investorId: investor.id,
          offeringId: doc.offeringId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!grant)
        throw new VaultError("Este documento exige un AccessGrant vigente (NDA + KYC aprobado).").withStatus(
          403,
        );
      grantId = grant.id;
    }
    return await serveVaultFile({
      tenantId: tenant.id,
      actor: { id: null, email: investor.email ?? investor.fullName },
      entityType: "DataRoomDocument",
      entityId: doc.id,
      action: "DATA_ROOM_DOCUMENT_DOWNLOADED",
      file,
      payload: {
        ...base,
        by: "investor",
        investorId: investor.id,
        ndaAcceptanceId: nda.id,
        accessGrantId: grantId,
      },
      download,
    });
  } catch (e) {
    return vaultFailure(e);
  }
}
