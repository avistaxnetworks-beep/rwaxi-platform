import "server-only";
import { platformPrisma, retryTransient, type Prisma } from "@rwaxi/database";
import { PLATFORM_AUDIT_ACTIONS, platformAuditSummary } from "@/app/_lib/server/platform-audit";
import { TenantAccessError, requirePlatformAccess } from "@/app/_lib/server/tenant-context";
import { onboardingNetworks } from "./onboarding";
import { requirePlatformSession } from "./session";
import type {
  FeeKindKey,
  FeeStatusKey,
  FeeTotals,
  KycKey,
  PlatformMetrics,
  PlatformAuditRow,
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
const emptyVolume = (): SubscribedVolume => ({
  count: 0,
  units: 0,
  capitalUsd: 0,
  mintedUsd: 0,
  pendingUsd: 0,
  paymentPendingUsd: 0,
  reservedUsd: 0,
});
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cross-tenant figures for admin.rwaxi.com, read with the platform role (BYPASSRLS).
 * Never throws: failures become `ok: false`.
 */
export async function loadPlatformMetrics(): Promise<PlatformMetricsResult> {
  try {
    await requirePlatformAccess();
    const session = await requirePlatformSession().catch(() => null); // actions need it; reading does not
    const db = platformPrisma();
    const [orgs, leadGroups, ndaGroups, kycGroups, investorGroups, subGroups, feeGroups, referralLeads, ledger, invoices, audit, registryTxs, codes] =
      await retryTransient(() => Promise.all([
        db.organization.findMany({
          orderBy: { onboardedAt: "asc" },
          select: {
            id: true,
            slug: true,
            displayName: true,
            legalName: true,
            taxId: true,
            complianceRegime: true,
            complianceRegistry: true,
            customDomain: true,
            domainStatus: true,
            portalStatus: true,
            published: true,
            onboardedAt: true,
            feeSetupUsd: true,
            feeMonthlyUsd: true,
            feeUsagePct: true,
            offerings: {
              orderBy: { code: "asc" },
              select: {
                id: true,
                code: true,
                assetName: true,
                totalUnits: true,
                unitsSubscribed: true,
                published: true,
                capturePausedAt: true,
                token: { select: { status: true, symbol: true } },
              },
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
          include: {
            organization: { select: { slug: true, displayName: true, legalName: true } },
            invoice: { select: { id: true, number: true, paidOn: true } },
          },
        }),
        db.feeInvoice.findMany({
          orderBy: [{ issuedAt: "desc" }, { number: "desc" }],
          take: 100,
          include: {
            organization: { select: { slug: true, displayName: true, legalName: true } },
            _count: { select: { entries: true } },
          },
        }),
        db.auditEvent.findMany({
          where: { action: { in: [...PLATFORM_AUDIT_ACTIONS] } },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { organization: { select: { displayName: true } } },
        }),
        db.chainTransaction.findMany({
          where: { kind: "TENANT_REGISTRY_DEPLOYED" },
          orderBy: { createdAt: "desc" },
          select: { organizationId: true, status: true, network: true },
        }),
        db.offering.findMany({ select: { code: true } }),
      ]), { repeatable: true });

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
        else if (g.status === "PAYMENT_PENDING") v.paymentPendingUsd = round2(v.paymentPendingUsd + capital);
        else v.pendingUsd = round2(v.pendingUsd + capital);
      }
      return v;
    };

    const tenants: PlatformTenantRow[] = orgs.map((o) => {
      const offering = o.offerings.find((f) => f.published);
      const registryTx = registryTxs.find((t) => t.organizationId === o.id);
      return {
        id: o.id,
        slug: o.slug,
        displayName: o.displayName,
        legalName: o.legalName,
        taxId: o.taxId,
        regime: o.complianceRegime,
        customDomain: o.domainStatus === "VERIFIED" ? o.customDomain : null,
        portalStatus: o.portalStatus,
        published: o.published,
        onboardedAt: o.onboardedAt.toISOString().slice(0, 10),
        registry: {
          address: o.complianceRegistry,
          status: o.complianceRegistry ? "DEPLOYED" : registryTx?.status === "PENDING" ? "PENDING" : "NONE",
          network: registryTx?.network ?? null,
        },
        offerings: o.offerings.map((f) => ({
          id: f.id,
          code: f.code,
          assetName: f.assetName,
          published: f.published,
          capturePausedAt: f.capturePausedAt?.toISOString() ?? null,
          tokenStatus: f.token?.status ?? null,
          tokenSymbol: f.token?.symbol ?? null,
        })),
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
        mrrUsd: round2(orgs.filter((o) => o.portalStatus !== "SUSPENDED").reduce((s, o) => s + num(o.feeMonthlyUsd), 0)),
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
        organizationId: e.organizationId,
        tenant: e.organization,
        kind: e.kind as FeeKindKey,
        status: e.status as FeeStatusKey,
        amountUsd: num(e.amountUsd),
        baseUsd: e.baseUsd === null ? null : num(e.baseUsd),
        period: e.period,
        accruedOn: e.accruedOn.toISOString().slice(0, 10),
        evidence: e.evidence,
        invoice: e.invoice ? { id: e.invoice.id, number: e.invoice.number, paid: !!e.invoice.paidOn } : null,
      })),
      invoices: invoices.map((i) => ({
        id: i.id,
        number: i.number,
        organizationId: i.organizationId,
        tenant: i.organization,
        issuedOn: i.issuedAt.toISOString().slice(0, 10),
        totalUsd: num(i.totalUsd),
        entries: i._count.entries,
        paidOn: i.paidOn?.toISOString().slice(0, 10) ?? null,
        paymentReceipt: i.paymentReceipt,
      })),
      audit: audit.map((e) => ({
        id: e.id,
        at: e.createdAt.toISOString(),
        action: e.action as PlatformAuditRow["action"],
        tenant: e.organization.displayName,
        actorEmail: e.actorEmail,
        summary: platformAuditSummary(e.action as PlatformAuditRow["action"], e.payload),
        subjectHash: e.subjectHash,
      })),
      admin: session ? { name: session.admin.fullName, email: session.admin.email } : null,
      onboarding: {
        networks: onboardingNetworks(),
        nextOfferingCode: `P-${String(Math.max(0, ...codes.map((c) => Number(/^P-(\d+)$/.exec(c.code)?.[1] ?? 0))) + 1).padStart(2, "0")}`,
      },
    };
    return { ok: true, data };
  } catch (e) {
    if (e instanceof TenantAccessError) return { ok: false, error: e.message };
    console.error("[superadmin] platform metrics failed", e);
    return { ok: false, error: "No se pudieron leer las métricas consolidadas desde PostgreSQL." };
  }
}
