import "server-only";
import { cookies } from "next/headers";
import { forTenant, type KycStatus } from "@rwaxi/database";
import { REF_COOKIE, REF_TOKEN_RE, parseRef } from "@/app/_lib/referral";
import { readInvestorSession } from "@/app/_lib/server/investor-session";
import { TenantAccessError, requireHostTenant } from "@/app/_lib/server/tenant-context";
import type { KycStatusView, PersistedJourney, PersistedJourneyResult, PersistedLead } from "./journey-types";

/** ISO 8601 without milliseconds, as the prototype displays timestamps. */
export const isoSeconds = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

export const KYC_STATUS_VIEW: Partial<Record<KycStatus, KycStatusView>> = {
  PENDING: "pendiente",
  APPROVED: "aprobado",
  REJECTED: "rechazado",
};

/** The offering a tenant portal presents: its first published offering. */
export const PORTAL_OFFERING = { where: { published: true }, orderBy: { code: "asc" as const } };

/**
 * Investor journey of the current visitor on this tenant host, read from PostgreSQL.
 * `refParam` covers the landing request itself, before the referral cookie exists.
 */
export async function loadInvestorJourney(refParam?: string): Promise<PersistedJourneyResult> {
  try {
    const tenant = await requireHostTenant();
    const db = forTenant(tenant.id);
    const refCookie = parseRef((await cookies()).get(REF_COOKIE)?.value);
    const referral: PersistedLead | null = refCookie
      ? { token: refCookie.token, at: isoSeconds(refCookie.landedAt), source: "RWAXI" }
      : refParam && REF_TOKEN_RE.test(refParam)
        ? { token: refParam, at: isoSeconds(new Date()), source: "RWAXI" }
        : null;
    const anonymous: PersistedJourney = { investor: null, lead: referral, nda: null, kyc: null, grant: null };

    const session = await readInvestorSession(tenant.id);
    if (!session) return { ok: true, data: anonymous };
    const offering = await db.offering.findFirst({ ...PORTAL_OFFERING, select: { id: true } });
    if (!offering) return { ok: true, data: anonymous };

    const investor = await db.investor.findUnique({
      where: { id: session.investorId },
      include: {
        leads: { where: { offeringId: offering.id }, orderBy: { landedAt: "asc" }, take: 1 },
        ndas: { where: { offeringId: offering.id }, take: 1 },
        kycCases: { where: { offeringId: offering.id }, orderBy: { createdAt: "desc" }, take: 1 },
        accessGrants: {
          where: { offeringId: offering.id, revokedAt: null },
          orderBy: { grantedAt: "desc" },
          take: 1,
        },
      },
    });
    // Stale cookie (e.g. the database was re-seeded): behave as a new visitor.
    if (!investor) return { ok: true, data: anonymous };

    const lead = investor.leads[0];
    const nda = investor.ndas[0];
    const kyc = investor.kycCases[0];
    const grant = investor.accessGrants[0];
    const status = kyc ? KYC_STATUS_VIEW[kyc.status] : undefined;

    let whitelistTx = kyc?.whitelistTxHash ?? null;
    let whitelistQueued = false;
    if (kyc?.status === "APPROVED" && investor.walletAddress && !whitelistTx) {
      const wl = await db.chainTransaction.findFirst({
        where: { kind: "INVESTOR_WHITELISTED", args: { path: ["wallet"], equals: investor.walletAddress } },
        orderBy: { createdAt: "desc" },
        select: { status: true, txHash: true },
      });
      whitelistTx = wl?.txHash ?? null;
      whitelistQueued = wl?.status === "PENDING";
    }

    return {
      ok: true,
      data: {
        investor: { name: investor.fullName, email: investor.email },
        lead: lead ? { token: lead.referralToken, at: isoSeconds(lead.landedAt), source: lead.source } : referral,
        nda: nda
          ? { id: nda.id, signer: nda.signerName, email: nda.signerEmail, at: isoSeconds(nda.acceptedAt), hash: nda.documentHash }
          : null,
        kyc:
          kyc && status
            ? {
                kycCaseId: kyc.id,
                status,
                reason: kyc.rejectionReason,
                dossierHash: kyc.dossierHash,
                wallet: investor.walletAddress,
                whitelistTx,
                whitelistQueued,
              }
            : null,
        grant: grant
          ? {
              id: grant.id,
              at: isoSeconds(grant.grantedAt),
              ttlH: Math.round((grant.expiresAt.getTime() - grant.grantedAt.getTime()) / 3_600_000),
            }
          : null,
      },
    };
  } catch (e) {
    if (e instanceof TenantAccessError) return { ok: false, error: e.message };
    console.error("[portal] investor journey failed", e);
    return { ok: false, error: "No se pudo cargar tu progreso desde la base de datos." };
  }
}
