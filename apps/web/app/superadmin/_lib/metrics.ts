import "server-only";
import { platformPrisma, type Prisma } from "@rwaxi/database";
import { TenantAccessError, requirePlatformAccess } from "@/app/_lib/server/tenant-context";
import type {
  FeeKindKey,
  FeeStatusKey,
  FeeTotals,
  KycKey,
  PlatformMetrics,
  PlatformMetricsResult,
  PlatformTenantRow,
  SubscribedVolume,
} from "./types";

const FEE_KINDS: FeeKindKey[] = ["ONBOARDING_SETUP", "MONTHLY_SAAS", "INFRASTRUCTURE_USAGE"];
const KYC_VIEW: Record<string, KycKey> = {
  NOT_STARTED: "no_iniciado",
  PENDING: "pendiente",
  APPROVED: "aprobado",
  REJECTED: "rechazado",
};

const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? 0 : Number(Number(d).toFixed(2)));
const emptyFees = (): FeeTotals => ({ ACCRUED: 0, INVOICED: 0, PAID: 0, total: 0 });
const emptyVolume = (): SubscribedVolume => ({ count: 0, units: 0, capitalUsd: 0, mintedUsd: 0, pendingUsd: 0, reservedUsd: 0 });
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cross-tenant figures for admin.rwaxi.com, read with the platform role (BYPASSRLS).
 * Never throws: failures become `ok: false`.
 */
export async function loadPlatformMetrics(): Promise<PlatformMetricsResult> {
  try {
    await requirePlatformAccess();
    const db = platformPrisma();
    const [orgs, leadGroups, ndaGroups, kycGroups, investorGroups, subGroups, feeGroups, referralLeads, ledger] =
      await Promise.all([
        db.organization.findMany({
          orderBy: { onboardedAt: "asc" },
          select: {
            id: true,
            slug: true,
            displayName: true,
            legalName: true,
            portalStatus: true,
            published: true,
            onboardedAt: true,
            feeSetupUsd: true,
            feeMonthlyUsd: true,
            feeUsagePct: true,
            offerings: {
              where: { published: true },
              orderBy: { code: "asc" },
              take: 1,
              select: { code: true, assetName: true, totalUnits: true, unitsSubscribed: true },
            },
          },
        }),
        db.lead.groupBy({ by: ["organizationId", "source"], _count: { _all: true } }),
        db.ndaAcceptance.groupBy({ by: ["organizationId"], _count: { _all: true } }),
        db.kycCase.groupBy({ by: ["organizationId", "status"], _count: { _all: true } }),
        db.investor.groupBy({ by: ["organizationId"], _count: { _all: true } }),
        db.subscription.groupBy({
          by: ["organizationId", "status"],
          where: { status: { not: "CANCELLED" } },
          _count: { _all: true },
          _sum: { units: true, capitalUsd: true },
        }),
        db.feeLedgerEntry.groupBy({ by: ["organizationId", "kind", "status"], _sum: { amountUsd: true } }),
        db.lead.findMany({
          where: { source: "REFERRAL" },
          orderBy: { landedAt: "desc" },
          take: 60,
          include: {
            organization: { select: { slug: true, displayName: true } },
            investor: {
              select: {
                fullName: true,
                ndas: { select: { id: true }, take: 1 },
                kycCases: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
                subscriptions: { where: { status: { not: "CANCELLED" } }, select: { capitalUsd: true } },
              },
            },
          },
        }),
        db.feeLedgerEntry.findMany({
          orderBy: [{ accruedOn: "desc" }, { createdAt: "desc" }],
          take: 200,
          include: { organization: { select: { slug: true, displayName: true, legalName: true } } },
        }),
      ]);

    const count = <T extends { organizationId: string; _count: { _all: number } }>(rows: T[], orgId: string, pick?: (r: T) => boolean) =>
      rows.filter((r) => r.organizationId === orgId && (!pick || pick(r))).reduce((s, r) => s + r._count._all, 0);

    const totalsFees = Object.fromEntries(FEE_KINDS.map((k) => [k, emptyFees()])) as Record<FeeKindKey, FeeTotals>;
    const feesAll = emptyFees();
    for (const g of feeGroups) {
      const amount = num(g._sum.amountUsd);
      const kind = totalsFees[g.kind as FeeKindKey];
      kind[g.status as FeeStatusKey] = round2(kind[g.status as FeeStatusKey] + amount);
      kind.total = round2(kind.total + amount);
      feesAll[g.status as FeeStatusKey] = round2(feesAll[g.status as FeeStatusKey] + amount);
      feesAll.total = round2(feesAll.total + amount);
    }

    const volumeOf = (orgId?: string) => {
      const v = emptyVolume();
      for (const g of subGroups) {
        if (orgId && g.organizationId !== orgId) continue;
        const capital = num(g._sum.capitalUsd);
        v.count += g._count._all;
        v.units += g._sum.units ?? 0;
        v.capitalUsd = round2(v.capitalUsd + capital);
        if (g.status === "MINTED") v.mintedUsd = round2(v.mintedUsd + capital);
        else if (g.status === "RESERVED") v.reservedUsd = round2(v.reservedUsd + capital);
        else v.pendingUsd = round2(v.pendingUsd + capital);
      }
      return v;
    };

    const tenants: PlatformTenantRow[] = orgs.map((o) => {
      const offering = o.offerings[0];
      return {
        slug: o.slug,
        displayName: o.displayName,
        legalName: o.legalName,
        portalStatus: o.portalStatus,
        published: o.published,
        onboardedAt: o.onboardedAt.toISOString().slice(0, 10),
        leads: {
          referral: count(leadGroups, o.id, (r) => r.source === "REFERRAL"),
          direct: count(leadGroups, o.id, (r) => r.source === "DIRECT"),
        },
        investors: count(investorGroups, o.id),
        ndas: count(ndaGroups, o.id),
        kycApproved: count(kycGroups, o.id, (r) => r.status === "APPROVED"),
        kycPending: count(kycGroups, o.id, (r) => r.status === "PENDING"),
        subscribed: volumeOf(o.id),
        offering: offering
          ? { code: offering.code, assetName: offering.assetName, totalUnits: offering.totalUnits, unitsSubscribed: offering.unitsSubscribed }
          : null,
        feeRules: { setupUsd: num(o.feeSetupUsd), monthlyUsd: num(o.feeMonthlyUsd), usagePct: Number(o.feeUsagePct) },
        feesUsd: round2(feeGroups.filter((g) => g.organizationId === o.id).reduce((s, g) => s + num(g._sum.amountUsd), 0)),
      };
    });

    const data: PlatformMetrics = {
      generatedAt: new Date().toISOString(),
      totals: {
        organizations: orgs.length,
        activeOrganizations: orgs.filter((o) => o.portalStatus === "ACTIVE").length,
        published: orgs.filter((o) => o.published).length,
        leads: {
          referral: tenants.reduce((s, t) => s + t.leads.referral, 0),
          direct: tenants.reduce((s, t) => s + t.leads.direct, 0),
        },
        investors: tenants.reduce((s, t) => s + t.investors, 0),
        kycApproved: tenants.reduce((s, t) => s + t.kycApproved, 0),
        subscribed: volumeOf(),
        fees: totalsFees,
        feesAll,
      },
      tenants,
      referrals: referralLeads.map((l) => ({
        id: l.id,
        tenant: l.organization,
        token: l.referralToken,
        landedAt: l.landedAt.toISOString(),
        investorName: l.investor?.fullName ?? null,
        nda: (l.investor?.ndas.length ?? 0) > 0,
        kyc: l.investor?.kycCases[0] ? (KYC_VIEW[l.investor.kycCases[0].status] ?? "no_iniciado") : "no_iniciado",
        subscribedUsd: round2(l.investor?.subscriptions.reduce((s, x) => s + num(x.capitalUsd), 0) ?? 0),
      })),
      ledger: ledger.map((e) => ({
        id: e.id,
        tenant: e.organization,
        kind: e.kind as FeeKindKey,
        status: e.status as FeeStatusKey,
        amountUsd: num(e.amountUsd),
        baseUsd: e.baseUsd === null ? null : num(e.baseUsd),
        period: e.period,
        accruedOn: e.accruedOn.toISOString().slice(0, 10),
        evidence: e.evidence,
      })),
    };
    return { ok: true, data };
  } catch (e) {
    if (e instanceof TenantAccessError) return { ok: false, error: e.message };
    console.error("[superadmin] platform metrics failed", e);
    return { ok: false, error: "No se pudieron leer las métricas consolidadas desde PostgreSQL." };
  }
}
