import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFinanceReport, type FinanceEntryInput } from "./finance";

const tenant = (id: string, agreedBps: number) => ({
  id,
  name: id.toUpperCase(),
  slug: id,
  portalStatus: "ACTIVE",
  agreedBps,
  agreement: null,
  tokens: [{ offeringCode: "P-01", symbol: "TKN", bps: 100, status: "DEPLOYED" }],
});
const entry = (id: string, organizationId: string, over: Partial<FinanceEntryInput>): FinanceEntryInput => ({
  id,
  organizationId,
  kind: "INFRASTRUCTURE_USAGE",
  status: "ACCRUED",
  amountUsd: 0,
  baseUsd: null,
  platformFeeBps: null,
  accruedOn: "2026-10-05",
  ...over,
});

test("fees per developer: by status and kind, effective basis points over the fiduciary base, never mixing capital into revenue", () => {
  const report = buildFinanceReport(
    {
      tenants: [tenant("avista", 150), tenant("andes", 120)],
      entries: [
        entry("u1", "avista", { amountUsd: 250, baseUsd: 25_000, platformFeeBps: 100 }),
        entry("u2", "avista", { amountUsd: 150.1, baseUsd: 10_000, platformFeeBps: 150, status: "INVOICED" }),
        entry("u3", "avista", { amountUsd: 300, baseUsd: 20_000, platformFeeBps: 150, status: "VOIDED" }), // cancelled before its mint
        entry("s1", "avista", { kind: "ONBOARDING_SETUP", amountUsd: 15_000, status: "PAID", accruedOn: "2026-09-01" }),
        entry("m1", "andes", { kind: "MONTHLY_SAAS", amountUsd: 1_200, accruedOn: "2026-09-30" }),
      ],
      invoices: [],
      mintFees: [
        { organizationId: "avista", subscriptionId: "sub1", at: "2026-10-05T10:00:00Z", declaredBps: 100, ledgerBps: 100, matchesLedger: true, observedOnChain: false },
        { organizationId: "avista", subscriptionId: "sub2", at: "2026-10-06T10:00:00Z", declaredBps: 100, ledgerBps: 150, matchesLedger: false, observedOnChain: true },
      ],
    },
    new Date("2026-10-30T12:00:00Z"),
  );
  const avista = report.tenants.find((t) => t.id === "avista")!;
  assert.equal(avista.usage.mints, 2); // the voided entry is not an emission
  assert.equal(avista.usage.baseUsd, 35_000);
  assert.equal(avista.usage.feeUsd, 400.1);
  assert.equal(avista.usage.effectiveBps, 114.31); // 400.10 / 35,000 × 10,000
  assert.deepEqual(avista.usage.byStatus, { ACCRUED: 250, INVOICED: 150.1, PAID: 0, VOIDED: 300 });
  assert.deepEqual(avista.setup, { ACCRUED: 0, INVOICED: 0, PAID: 15_000, VOIDED: 0 });
  assert.equal(avista.outstandingUsd, 150.1);
  assert.deepEqual([avista.reconciliation.matched, avista.reconciliation.mismatched, avista.reconciliation.observedOnChain], [1, 1, 1]);
  assert.equal(avista.reconciliation.issues[0]!.subscriptionId, "sub2");
  // revenue totals never include the fiduciary base
  assert.deepEqual(
    { accrued: report.totals.ACCRUED, invoiced: report.totals.INVOICED, paid: report.totals.PAID, base: report.totals.fiduciaryBaseUsd },
    { accrued: 1_450, invoiced: 150.1, paid: 15_000, base: 35_000 },
  );
  assert.equal(report.totals.currentCycleAccruedUsd, 250);
});

test("billing cycles: the accrued entries of each developer per month, oldest first, ready to invoice", () => {
  const report = buildFinanceReport({
    tenants: [tenant("avista", 150)],
    entries: [
      entry("b", "avista", { amountUsd: 10, accruedOn: "2026-10-20" }),
      entry("a", "avista", { amountUsd: 5.55, accruedOn: "2026-10-02" }),
      entry("c", "avista", { amountUsd: 7, accruedOn: "2026-09-15", status: "PAID" }),
    ],
    invoices: [],
    mintFees: [],
  });
  assert.deepEqual(report.cycles, ["2026-10", "2026-09"]);
  assert.deepEqual(report.matrix["2026-10"]!.avista!.accrued, { usd: 15.55, entryIds: ["a", "b"] });
  assert.equal(report.matrix["2026-09"]!.avista!.paidUsd, 7);
});

test("invoice tracking: unpaid invoices by age bucket, oldest first; paid ones last", () => {
  const report = buildFinanceReport(
    {
      tenants: [tenant("avista", 150)],
      entries: [],
      invoices: [
        { id: "i1", organizationId: "avista", number: "RWX-1", issuedOn: "2026-10-20", totalUsd: 100, entries: 1, paidOn: null, paymentReceipt: null },
        { id: "i2", organizationId: "avista", number: "RWX-2", issuedOn: "2026-07-01", totalUsd: 200, entries: 2, paidOn: null, paymentReceipt: null },
        { id: "i3", organizationId: "avista", number: "RWX-3", issuedOn: "2026-08-01", totalUsd: 300, entries: 1, paidOn: "2026-08-20", paymentReceipt: "TRF-9" },
      ],
      mintFees: [],
    },
    new Date("2026-10-30T12:00:00Z"),
  );
  assert.deepEqual(
    report.invoices.map((i) => [i.number, i.bucket, i.ageDays]),
    [
      ["RWX-2", "+90", 121],
      ["RWX-1", "0-30", 10],
      ["RWX-3", "pagada", 19],
    ],
  );
});
