import type { NextRequest } from "next/server";
import { headers } from "next/headers";
import { platformPrisma, retryTransient } from "@rwaxi/database";
import { requirePlatformAccess } from "@/app/_lib/server/staff-auth";
import { VaultError } from "@/app/_lib/server/vault";
import { serveVaultFile, vaultFailure } from "@/app/_lib/server/vault-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ID = /^[a-z0-9]{20,40}$/i;

/**
 * GET /api/vault/agreement/{agreementId}[?download=1] — the signed PDF of a commercial agreement between RWAXI and a
 * developer, for the Super-Admin console only (admin host, PLATFORM session). Re-hashed against its recorded SHA-256
 * (a mismatch blocks it: 409 and VAULT_INTEGRITY_FAILED) and recorded as COMMERCIAL_AGREEMENT_DOWNLOADED in the
 * developer's audit trail.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ agreementId: string }> }) {
  try {
    if ((await headers()).get("x-rwaxi-env") !== "admin") throw new VaultError("Documento no encontrado.").withStatus(404);
    const actor = await requirePlatformAccess();
    const { agreementId } = await params;
    if (!ID.test(agreementId)) throw new VaultError("Documento no encontrado.").withStatus(404);
    const agreement = await retryTransient(
      () =>
        platformPrisma().commercialAgreement.findUnique({
          where: { id: agreementId },
          include: { organization: { select: { displayName: true } } },
        }),
      { repeatable: true },
    );
    if (!agreement) throw new VaultError("Documento no encontrado.").withStatus(404);
    return await serveVaultFile({
      tenantId: agreement.organizationId,
      actor: { id: actor.user.id, email: actor.user.email },
      entityType: "CommercialAgreement",
      entityId: agreement.id,
      action: "COMMERCIAL_AGREEMENT_DOWNLOADED",
      file: { name: agreement.fileName, mimeType: "application/pdf", sha256: agreement.sha256, storageKey: agreement.storageKey },
      payload: {
        tenant: agreement.organization.displayName,
        reference: agreement.reference,
        signedOn: agreement.signedOn.toISOString().slice(0, 10),
        platformFeeBps: agreement.platformFeeBps,
        by: "platform",
      },
      download: req.nextUrl.searchParams.get("download") === "1",
    });
  } catch (e) {
    return vaultFailure(e);
  }
}
