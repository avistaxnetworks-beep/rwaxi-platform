// Module F · B2B financial report of the Super-Admin console. buildFinanceReport() is pure (tested); readFinanceReport()
// loads its rows with the platform role. RWAXI invoices developers (setup, SaaS and the platform fee of each mint); the
// investors' capital goes to the issuer's fiduciary vehicle and never through RWAXI — here it is only the base the
// platform fee is computed on, kept apart from every revenue figure.
import type { platformPrisma } from "@rwaxi/database";

export type FeeStatusKey = "ACCRUED" | "INVOICED" | "PAID" | "VOIDED";
export type FeeKindKey = "ONBOARDING_SETUP" | "MONTHLY_SAAS" | "INFRASTRUCTURE_USAGE";
export type ByStatus = Record<FeeStatusKey, number>;

export interface FinanceEntryInput {
  id: string;
  organizationId: string;
  kind: FeeKindKey;
  status: FeeStatusKey;
  amountUsd: number;
  /** capital the usage fee was computed on (INFRASTRUCTURE_USAGE) */
  baseUsd: number | null;
  platformFeeBps: number | null;
  /** YYYY-MM-DD */
  accruedOn: string;
}
export interface FinanceInvoiceInput {
  id: string;
  organizationId: string;
  number: string;
  issuedOn: string;
  totalUsd: number;
  entries: number;
  paidOn: string | null;
  paymentReceipt: string | null;
}
/** The platform fee a mint declared on-chain (PlatformFeeAccrued, recorded in SUBSCRIPTION_MINTED). */
export interface MintFeeInput {
  organizationId: string;
  subscriptionId: string;
  at: string;
  declaredBps: number | null;
  ledgerBps: number | null;
  matchesLedger: boolean | null;
  observedOnChain: boolean;
}
export interface FinanceTenantInput {
  id: string;
  name: string;
  slug: string;
  portalStatus: string;
  agreedBps: number;
  agreement: { reference: string; signedOn: string; sha256: string } | null;
  tokens: { offeringCode: string; symbol: string; bps: number | null; status: string }[];
}

export interface FinanceTenantRow extends FinanceTenantInput {
  usage: { mints: number; baseUsd: number; feeUsd: number; effectiveBps: number | null; byStatus: ByStatus };
  setup: ByStatus;
  saas: ByStatus;
  totals: ByStatus;
  /** invoiced and not yet paid */
  outstandingUsd: number;
  reconciliation: {
    mints: number;
    matched: number;
    mismatched: number;
    unknown: number;
    observedOnChain: number;
    issues: { subscriptionId: string; at: string; declaredBps: number | null; ledgerBps: number | null }[];
  };
}
export interface FinanceCycleCell {
  /** ACCRUED entries of the tenant in the cycle: what «Facturar ciclo» invoices (oldest first) */
  accrued: { usd: number; entryIds: string[] };
  invoicedUsd: number;
  paidUsd: number;
  voidedUsd: number;
}
export interface FinanceInvoiceRow extends FinanceInvoiceInput {
  tenant: string;
  slug: string;
  /** days since issued (unpaid) or until paid */
  ageDays: number;
  bucket: "pagada" | "0-30" | "31-60" | "61-90" | "+90";
}
export interface PlatformFinanceReport {
  generatedAt: string;
  totals: ByStatus & { outstandingUsd: number; fiduciaryBaseUsd: number; mints: number; currentCycleAccruedUsd: number };
  tenants: FinanceTenantRow[];
  /** newest first: YYYY-MM */
  cycles: string[];
  /** cycle → tenant id → cell */
  matrix: Record<string, Record<string, FinanceCycleCell>>;
  invoices: FinanceInvoiceRow[];
}

const STATUSES: FeeStatusKey[] = ["ACCRUED", "INVOICED", "PAID", "VOIDED"];
const zero = (): ByStatus => ({ ACCRUED: 0, INVOICED: 0, PAID: 0, VOIDED: 0 });
/** USD amounts summed in cents: exact for two-decimal figures. */
const add = (a: number, b: number) => Math.round(a * 100 + b * 100) / 100;
const DAY = 86_400_000;

export function buildFinanceReport(
  input: { tenants: FinanceTenantInput[]; entries: FinanceEntryInput[]; invoices: FinanceInvoiceInput[]; mintFees: MintFeeInput[] },
  now: Date = new Date(),
): PlatformFinanceReport {
  const currentCycle = now.toISOString().slice(0, 7);
  const tenants: FinanceTenantRow[] = input.tenants.map((t) => {
    const mine = input.entries.filter((e) => e.organizationId === t.id);
    const usageRows = mine.filter((e) => e.kind === "INFRASTRUCTURE_USAGE");
    const live = usageRows.filter((e) => e.status !== "VOIDED");
    const sum = (rows: FinanceEntryInput[]) => {
      const out = zero();
      for (const e of rows) out[e.status] = add(out[e.status], e.amountUsd);
      return out;
    };
    const baseUsd = live.reduce((s, e) => add(s, e.baseUsd ?? 0), 0);
    const feeUsd = live.reduce((s, e) => add(s, e.amountUsd), 0);
    const fees = input.mintFees.filter((m) => m.organizationId === t.id);
    const totals = sum(mine);
    return {
      ...t,
      usage: {
        mints: live.length,
        baseUsd,
        feeUsd,
        effectiveBps: baseUsd > 0 ? Math.round((feeUsd / baseUsd) * 10_000 * 100) / 100 : null,
        byStatus: sum(usageRows),
      },
      setup: sum(mine.filter((e) => e.kind === "ONBOARDING_SETUP")),
      saas: sum(mine.filter((e) => e.kind === "MONTHLY_SAAS")),
      totals,
      outstandingUsd: totals.INVOICED,
      reconciliation: {
        mints: fees.length,
        matched: fees.filter((m) => m.matchesLedger === true).length,
        mismatched: fees.filter((m) => m.matchesLedger === false).length,
        unknown: fees.filter((m) => m.matchesLedger === null).length,
        observedOnChain: fees.filter((m) => m.observedOnChain).length,
        issues: fees
          .filter((m) => m.matchesLedger === false)
          .map((m) => ({ subscriptionId: m.subscriptionId, at: m.at, declaredBps: m.declaredBps, ledgerBps: m.ledgerBps })),
      },
    };
  });

  const cycles = [...new Set(input.entries.map((e) => e.accruedOn.slice(0, 7)))].sort().reverse();
  const matrix: PlatformFinanceReport["matrix"] = {};
  for (const e of [...input.entries].sort((a, b) => (a.accruedOn < b.accruedOn ? -1 : a.accruedOn > b.accruedOn ? 1 : a.id < b.id ? -1 : 1))) {
    const cycle = e.accruedOn.slice(0, 7);
    const cell = ((matrix[cycle] ??= {})[e.organizationId] ??= { accrued: { usd: 0, entryIds: [] }, invoicedUsd: 0, paidUsd: 0, voidedUsd: 0 });
    if (e.status === "ACCRUED") {
      cell.accrued.usd = add(cell.accrued.usd, e.amountUsd);
      cell.accrued.entryIds.push(e.id);
    } else if (e.status === "INVOICED") cell.invoicedUsd = add(cell.invoicedUsd, e.amountUsd);
    else if (e.status === "PAID") cell.paidUsd = add(cell.paidUsd, e.amountUsd);
    else cell.voidedUsd = add(cell.voidedUsd, e.amountUsd);
  }

  const byId = new Map(input.tenants.map((t) => [t.id, t]));
  const invoices: FinanceInvoiceRow[] = input.invoices
    .map((i) => {
      const end = i.paidOn ? Date.parse(`${i.paidOn}T00:00:00Z`) : now.getTime();
      const ageDays = Math.max(0, Math.floor((end - Date.parse(`${i.issuedOn}T00:00:00Z`)) / DAY));
      const bucket: FinanceInvoiceRow["bucket"] = i.paidOn
        ? "pagada"
        : ageDays <= 30
          ? "0-30"
          : ageDays <= 60
            ? "31-60"
            : ageDays <= 90
              ? "61-90"
              : "+90";
      return { ...i, tenant: byId.get(i.organizationId)?.name ?? "—", slug: byId.get(i.organizationId)?.slug ?? "", ageDays, bucket };
    })
    .sort((a, b) => (a.paidOn ? 1 : 0) - (b.paidOn ? 1 : 0) || b.ageDays - a.ageDays);

  const totals = zero();
  for (const t of tenants) for (const s of STATUSES) totals[s] = add(totals[s], t.totals[s]);
  return {
    generatedAt: now.toISOString(),
    totals: {
      ...totals,
      outstandingUsd: totals.INVOICED,
      fiduciaryBaseUsd: tenants.reduce((s, t) => add(s, t.usage.baseUsd), 0),
      mints: tenants.reduce((s, t) => s + t.usage.mints, 0),
      currentCycleAccruedUsd: Object.values(matrix[currentCycle] ?? {}).reduce((s, c) => add(s, c.accrued.usd), 0),
    },
    tenants,
    cycles,
    matrix,
    invoices,
  };
}

const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Loads the report's rows across every developer (platform role) and builds it. */
export async function readFinanceReport(db: ReturnType<typeof platformPrisma>): Promise<PlatformFinanceReport> {
  const [orgs, entries, invoices, minted] = await Promise.all([
    db.organization.findMany({
      orderBy: { onboardedAt: "asc" },
      select: {
        id: true,
        displayName: true,
        slug: true,
        portalStatus: true,
        platformFeeBps: true,
        agreements: { orderBy: { createdAt: "desc" }, take: 1, select: { reference: true, signedOn: true, sha256: true } },
        offerings: { orderBy: { code: "asc" }, select: { code: true, token: { select: { symbol: true, platformFeeBps: true, status: true } } } },
      },
    }),
    db.feeLedgerEntry.findMany({
      select: { id: true, organizationId: true, kind: true, status: true, amountUsd: true, baseUsd: true, platformFeeBps: true, accruedOn: true },
    }),
    db.feeInvoice.findMany({
      orderBy: { issuedAt: "desc" },
      select: {
        id: true,
        organizationId: true,
        number: true,
        issuedAt: true,
        totalUsd: true,
        paidOn: true,
        paymentReceipt: true,
        _count: { select: { entries: true } },
      },
    }),
    db.auditEvent.findMany({
      where: { action: "SUBSCRIPTION_MINTED" },
      select: { organizationId: true, entityId: true, createdAt: true, payload: true },
    }),
  ]);
  return buildFinanceReport({
    tenants: orgs.map((o) => ({
      id: o.id,
      name: o.displayName,
      slug: o.slug,
      portalStatus: o.portalStatus,
      agreedBps: o.platformFeeBps,
      agreement: o.agreements[0]
        ? { reference: o.agreements[0].reference, signedOn: day(o.agreements[0].signedOn), sha256: o.agreements[0].sha256 }
        : null,
      tokens: o.offerings.flatMap((f) =>
        f.token ? [{ offeringCode: f.code, symbol: f.token.symbol, bps: f.token.platformFeeBps, status: f.token.status }] : [],
      ),
    })),
    entries: entries.map((e) => ({
      id: e.id,
      organizationId: e.organizationId,
      kind: e.kind,
      status: e.status,
      amountUsd: num(e.amountUsd),
      baseUsd: e.baseUsd === null ? null : num(e.baseUsd),
      platformFeeBps: e.platformFeeBps,
      accruedOn: day(e.accruedOn),
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      organizationId: i.organizationId,
      number: i.number,
      issuedOn: day(i.issuedAt),
      totalUsd: num(i.totalUsd),
      entries: i._count.entries,
      paidOn: i.paidOn ? day(i.paidOn) : null,
      paymentReceipt: i.paymentReceipt,
    })),
    mintFees: minted.flatMap((m) => {
      const fee = ((m.payload ?? {}) as { platformFee?: Record<string, unknown> }).platformFee;
      if (!m.organizationId || !fee || typeof fee !== "object") return [];
      const n = (v: unknown) => (typeof v === "number" ? v : null);
      return [
        {
          organizationId: m.organizationId,
          subscriptionId: m.entityId,
          at: m.createdAt.toISOString(),
          declaredBps: n(fee.platformFeeBps),
          ledgerBps: n(fee.ledgerBps),
          matchesLedger: typeof fee.matchesLedger === "boolean" ? fee.matchesLedger : null,
          observedOnChain: fee.observedOnChain === true,
        },
      ];
    }),
  });
}
