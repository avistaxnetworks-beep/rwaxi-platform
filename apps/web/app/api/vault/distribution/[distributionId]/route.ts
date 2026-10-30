import type { NextRequest } from "next/server";
import { headers } from "next/headers";
import { forTenant, platformPrisma, retryTransient } from "@rwaxi/database";
import { requirePlatformAccess } from "@/app/_lib/server/staff-auth";
import { VaultError } from "@/app/_lib/server/vault";
import { serveVaultFile, vaultFailure } from "@/app/_lib/server/vault-access";
import { requireBackofficeSession } from "@/app/tenant/[slug]/backoffice/_lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ID = /^[a-z0-9]{20,40}$/i;
const SELECT = {
  id: true,
  organizationId: true,
  onchainId: true,
  period: true,
  currency: true,
  amountDeclared: true,
  supportSha256: true,
  supportFileName: true,
  supportMimeType: true,
  supportStorageKey: true,
  offering: { select: { code: true } },
} as const;

/**
 * GET /api/vault/distribution/{distributionId}[?download=1] — the supporting document of a yield distribution (the
 * fiduciary certificate or transfer receipt the issuer attached):
 *   tenant host  any staff member of the distribution's tenant (the analyst reads too), under RLS;
 *   admin host   the Super-Admin console (PLATFORM session): RWAXI supervises, it never declares or pays.
 * Re-hashed against its recorded SHA-256 — the evidenceHash anchorDistributionRoot() commits on-chain; a mismatch
 * blocks it (409, VAULT_INTEGRITY_FAILED) — and recorded as DISTRIBUTION_SUPPORT_DOWNLOADED in the tenant's trail.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ distributionId: string }> }) {
  try {
    const { distributionId } = await params;
    if (!ID.test(distributionId)) throw new VaultError("Documento no encontrado.").withStatus(404);
    const platform = (await headers()).get("x-rwaxi-env") === "admin";
    let actor: { id: string; email: string };
    let row;
    if (platform) {
      const access = await requirePlatformAccess();
      actor = { id: access.user.id, email: access.user.email };
      row = await retryTransient(() => platformPrisma().distribution.findUnique({ where: { id: distributionId }, select: SELECT }), {
        repeatable: true,
      });
    } else {
      const session = await requireBackofficeSession("TENANT_ADMIN", { view: true });
      actor = { id: session.reviewer.id, email: session.reviewer.email };
      row = await forTenant(session.tenant.id).distribution.findUnique({ where: { id: distributionId }, select: SELECT });
    }
    if (!row?.supportSha256 || !row.supportStorageKey) throw new VaultError("Documento no encontrado.").withStatus(404);
    return await serveVaultFile({
      tenantId: row.organizationId,
      actor,
      entityType: "Distribution",
      entityId: row.id,
      action: "DISTRIBUTION_SUPPORT_DOWNLOADED",
      file: {
        name: row.supportFileName ?? "soporte-distribucion",
        mimeType: row.supportMimeType ?? "application/octet-stream",
        sha256: row.supportSha256,
        storageKey: row.supportStorageKey,
      },
      payload: {
        offeringCode: row.offering.code,
        period: row.period,
        distributionId: row.onchainId,
        currency: row.currency,
        amountDeclared: row.amountDeclared.toFixed(2),
        by: platform ? "platform" : "backoffice",
      },
      download: req.nextUrl.searchParams.get("download") === "1",
    });
  } catch (e) {
    return vaultFailure(e);
  }
}
