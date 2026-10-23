import "server-only";
import { cookies } from "next/headers";
import { forTenant, type KycStatus, type Prisma, type Subscription } from "@rwaxi/database";
import { REF_COOKIE, verifyReferral, type ReferralClaims } from "@/app/_lib/referral";
import { readInvestorSession } from "@/app/_lib/server/investor-session";
import { paymentCodeOf } from "@/app/_lib/server/subscriptions";
import { TenantAccessError, requireHostTenant } from "@/app/_lib/server/tenant-context";
import type {
  KycStatusView,
  PersistedDistribution,
  PersistedHolding,
  PersistedJourney,
  PersistedJourneyResult,
  PersistedLead,
  PortalOfferingState,
} from "./journey-types";

/** ISO 8601 without milliseconds, as the prototype displays timestamps. */
export const isoSeconds = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

export const KYC_STATUS_VIEW: Partial<Record<KycStatus, KycStatusView>> = {
  PENDING: "pendiente",
  APPROVED: "aprobado",
  REJECTED: "rechazado",
};

/** The offering a tenant portal presents: its first published offering. */
export const PORTAL_OFFERING = { where: { published: true }, orderBy: { code: "asc" as const } };

/** Offering fields needed for availability and minting. */
export const OFFERING_STATE_SELECT = {
  id: true,
  code: true,
  network: true,
  totalUnits: true,
  unitsSubscribed: true,
  unitPriceUsd: true,
  minTicketUsd: true,
  capturePausedAt: true,
  token: { select: { status: true, contractAddress: true, symbol: true } },
} satisfies Prisma.OfferingSelect;

type OfferingStateRow = Prisma.OfferingGetPayload<{ select: typeof OFFERING_STATE_SELECT }>;

export function offeringState(o: OfferingStateRow): PortalOfferingState {
  return {
    code: o.code,
    totalUnits: o.totalUnits,
    unitsSubscribed: o.unitsSubscribed,
    unitPriceUsd: Number(o.unitPriceUsd),
    minTicketUsd: Number(o.minTicketUsd),
    tokenDeployed: !!o.token?.contractAddress && (o.token.status === "DEPLOYED" || o.token.status === "PAUSED"),
    tokenPaused: o.token?.status === "PAUSED",
    capturePaused: !!o.capturePausedAt,
  };
}

const HOLDING_STATUS: Record<Subscription["status"], PersistedHolding["status"] | null> = {
  MINTED: "en_wallet",
  MINT_PENDING: "mint_pendiente",
  PAYMENT_PENDING: "pago_pendiente",
  RESERVED: "reservado",
  CANCELLED: null,
};

export function toHolding(s: Subscription): PersistedHolding | null {
  const status = HOLDING_STATUS[s.status];
  if (!status) return null;
  return {
    id: s.id,
    units: s.units,
    capital: Number(s.capitalUsd),
    accrued: 0,
    since: s.createdAt.toISOString().slice(0, 10),
    status,
    tx: s.mintTxHash,
    evidenceHash: s.agreementHash ?? s.paymentEvidenceRef,
    paymentCode: s.status === "PAYMENT_PENDING" ? paymentCodeOf(s.onchainId) : null,
  };
}

export const toHoldings = (subs: Subscription[]) => subs.flatMap((s) => toHolding(s) ?? []);

/** Distributions allocated to an investor in an offering, with their proofs and how the root was anchored. */
async function investorDistributions(
  db: ReturnType<typeof forTenant>,
  investorId: string,
  offeringId: string,
): Promise<PersistedDistribution[]> {
  const allocations = await db.distributionAllocation.findMany({
    where: { investorId, distribution: { offeringId } },
    orderBy: { createdAt: "desc" },
    include: {
      distribution: { include: { offering: { select: { code: true, network: true, token: { select: { contractAddress: true } } } } } },
    },
  });
  if (!allocations.length) return [];
  const anchors = await db.chainTransaction.findMany({
    where: { kind: "DISTRIBUTION_ROOT_ANCHORED", status: "CONFIRMED" },
    select: { args: true, executionMode: true },
  });
  const modeOf = new Map(anchors.map((t) => [String((t.args as { distributionId?: string }).distributionId).toLowerCase(), t.executionMode]));
  return allocations.map((a) => {
    const d = a.distribution;
    return {
      id: a.id,
      distributionId: d.onchainId,
      period: d.period,
      offeringCode: d.offering.code,
      wallet: a.wallet,
      units: a.units,
      amount: Number(a.amountUsd),
      amountCents: a.amountUsd.mul(100).toNumber(),
      totalUsd: Number(d.totalUsd),
      totalUnits: d.totalUnits,
      holders: d.holders,
      currency: d.currency === "COP" ? "COP" : "USD",
      amountDeclared: Number(d.amountDeclared),
      fxRate: d.fxRate === null ? null : Number(d.fxRate),
      merkleRoot: d.merkleRoot,
      leafHash: a.leafHash,
      proof: Array.isArray(a.merkleProof) ? (a.merkleProof as string[]) : [],
      status: d.status,
      anchorTxHash: d.anchorTxHash,
      anchorMode: d.status === "ANCHORED" ? (modeOf.get(d.onchainId.toLowerCase()) ?? null) : null,
      token: { address: d.offering.token?.contractAddress ?? null, network: d.offering.network },
      declaredAt: d.createdAt.toISOString(),
    };
  });
}

/** A referral is shown (and later persisted) only if its HMAC verifies for this tenant. */
async function verifiedReferral(slug: string, ...candidates: (string | undefined)[]): Promise<ReferralClaims | null> {
  for (const token of candidates) {
    if (!token) continue;
    const check = await verifyReferral(token, { slug, secret: process.env.REFERRAL_SECRET });
    if (check.ok) return check.claims;
  }
  return null;
}

/**
 * Investor journey of the current visitor on this tenant host, read from PostgreSQL.
 * `refParam` covers the landing request itself, before the referral cookie exists.
 */
export async function loadInvestorJourney(refParam?: string): Promise<PersistedJourneyResult> {
  try {
    const tenant = await requireHostTenant();
    const db = forTenant(tenant.id);
    const claims = await verifiedReferral(tenant.slug, (await cookies()).get(REF_COOKIE)?.value, refParam);
    const referral: PersistedLead | null = claims
      ? { token: claims.referralId, at: isoSeconds(claims.issuedAt), source: "RWAXI" }
      : null;

    const offering = await db.offering.findFirst({ ...PORTAL_OFFERING, select: OFFERING_STATE_SELECT });
    const anonymous: PersistedJourney = {
      portalStatus: tenant.portalStatus,
      investor: null,
      lead: referral,
      nda: null,
      kyc: null,
      grant: null,
      holdings: [],
      distributions: [],
      offering: offering ? offeringState(offering) : null,
    };

    const session = await readInvestorSession(tenant.id);
    if (!session || !offering) return { ok: true, data: anonymous };

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
        subscriptions: { where: { offeringId: offering.id }, orderBy: { createdAt: "asc" } },
      },
    });
    // Stale cookie (e.g. the database was re-seeded): behave as a new visitor.
    if (!investor) return { ok: true, data: anonymous };

    const lead = investor.leads[0];
    const nda = investor.ndas[0];
    const kyc = investor.kycCases[0];
    const grant = investor.accessGrants[0];
    const status = kyc ? KYC_STATUS_VIEW[kyc.status] : undefined;

    const distributions = await investorDistributions(db, investor.id, offering.id);

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
        portalStatus: tenant.portalStatus,
        investor: { name: investor.fullName, email: investor.email },
        lead: lead
          ? { token: lead.referralToken, at: isoSeconds(lead.landedAt), source: lead.source === "REFERRAL" ? "RWAXI" : "DIRECT" }
          : referral,
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
        holdings: toHoldings(investor.subscriptions),
        distributions,
        offering: offeringState(offering),
      },
    };
  } catch (e) {
    if (e instanceof TenantAccessError) return { ok: false, error: e.message };
    console.error("[portal] investor journey failed", e);
    return { ok: false, error: "No se pudo cargar tu progreso desde la base de datos." };
  }
}
