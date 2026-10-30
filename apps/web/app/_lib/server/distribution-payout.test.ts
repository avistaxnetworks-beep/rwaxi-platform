import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, evidenceHash } from "@rwaxi/blockchain-sdk/canonical";
import type { RegistryTx } from "./chain-invariants";
import {
  amountOf,
  centsOf,
  payoutInstruction,
  pendingRegistryCalls,
  replayedEntries,
  withholdReason,
  type ComplianceView,
  type PayoutInstructionInput,
} from "./distribution-payout";

const REGISTRY = "0x" + "e".repeat(40);
const A = "0x" + "a".repeat(40);
const B = "0x" + "b".repeat(40);
const row = (kind: string, status: string, args: Record<string, unknown>, at = "2026-10-01T00:00:00Z"): RegistryTx =>
  ({ kind, status, args, contractAddress: REGISTRY, executedAt: status === "CONFIRMED" ? new Date(at) : null, createdAt: new Date(at) }) as RegistryTx;

test("the whitelist decides who is paid now: KYC, queued revocations and freezes, registry entry", () => {
  const view = (over: Partial<ComplianceView> = {}): ComplianceView => ({
    entry: () => ({ approved: true, frozen: false }),
    pending: () => ({ revoke: false, freeze: false }),
    kycRevoked: () => false,
    ...over,
  });
  const holder = { investorId: "inv_1", wallet: A.toUpperCase().replace("0X", "0x") };
  assert.equal(withholdReason(view(), holder), null);
  assert.equal(withholdReason(view({ kycRevoked: () => true }), holder), "KYC_REVOKED");
  assert.equal(withholdReason(view({ pending: () => ({ revoke: true, freeze: true }) }), holder), "REVOCATION_PENDING");
  assert.equal(withholdReason(view({ entry: () => ({ approved: false, frozen: false }) }), holder), "NOT_WHITELISTED");
  assert.equal(withholdReason(view({ entry: () => ({ approved: true, frozen: true }) }), holder), "FROZEN");
  assert.equal(withholdReason(view({ pending: () => ({ revoke: false, freeze: true }) }), holder), "FREEZE_PENDING");
});

test("queued registry calls and the replayed registry entry of each wallet", () => {
  const txs = [
    row("INVESTOR_WHITELISTED", "CONFIRMED", { wallet: A, countryCode: 170, kycDossierHash: "0x" + "1".repeat(64) }),
    row("INVESTOR_WHITELISTED", "CONFIRMED", { wallet: B, countryCode: 170, kycDossierHash: "0x" + "2".repeat(64) }),
    row("INVESTOR_FREEZE_UPDATED", "CONFIRMED", { wallet: B, frozen: true }, "2026-10-02T00:00:00Z"),
    row("INVESTOR_FREEZE_UPDATED", "PENDING", { wallet: B, frozen: false }, "2026-10-03T00:00:00Z"),
    row("INVESTOR_REVOKED", "PENDING", { wallet: A }, "2026-10-04T00:00:00Z"),
  ];
  assert.deepEqual(pendingRegistryCalls(txs, A), { revoke: true, freeze: false });
  assert.deepEqual(pendingRegistryCalls(txs, B), { revoke: false, freeze: false }); // a queued unfreeze clears nothing yet
  const entry = replayedEntries({ registry: REGISTRY, txs });
  assert.deepEqual(entry(A), { approved: true, frozen: false });
  assert.deepEqual(entry(B), { approved: true, frozen: true });
  assert.deepEqual(entry("0x" + "c".repeat(40)), { approved: false, frozen: false });
});

test("amounts travel as two-decimal strings", () => {
  assert.equal(centsOf("1234.50"), 123_450n);
  assert.equal(amountOf(123_450n), "1234.50");
  assert.equal(amountOf(7n), "0.07");
  assert.throws(() => centsOf("12.5"));
  assert.throws(() => centsOf("-1.00"));
});

const input = (currency: PayoutInstructionInput["distribution"]["currency"]): PayoutInstructionInput => ({
  distribution: {
    id: "dist_1",
    onchainId: "0x" + "d".repeat(64),
    offeringCode: "P-03",
    period: "2026-Q3",
    recordDate: "2026-09-30",
    snapshotAt: "2026-10-01T04:59:59.000Z",
    currency,
    amountDeclared: "10000.00",
    merkleRoot: "0x" + "f".repeat(64),
    anchorTxHash: "0x" + "9".repeat(64),
    supportSha256: "0x" + "5".repeat(64),
  },
  token: { address: "0x" + "C".repeat(40), network: "POLYGON_AMOY" },
  registry: { mode: "SIMULATION", address: REGISTRY },
  sequence: 1,
  issuedAt: "2026-10-30T15:00:00.000Z",
  payees: [{ id: "al_1", investorId: "inv_1", name: "Laura", wallet: A, units: 200, amount: "4444.44", leafHash: "0x" + "3".repeat(64) }],
  withheld: [{ id: "al_2", investorId: "inv_2", name: "María", wallet: B, units: 250, amount: "5555.56", leafHash: "0x" + "4".repeat(64), reason: "FROZEN" }],
});

test("the payment instruction: payees, withheld with their reason, total and the hash of its canonical JSON", () => {
  const { document, hash, total } = payoutInstruction(input("COP"));
  assert.equal(total, "4444.44");
  assert.equal(document.executor, "fiduciary");
  assert.equal(hash, evidenceHash(document));
  // what jsonb gives back (keys reordered) hashes the same: the download matches the recorded hash
  assert.equal(evidenceHash(JSON.parse(canonicalJson(document))), hash);
  const payees = document.payees as Record<string, unknown>[];
  assert.equal(payees.length, 1);
  assert.equal(payees[0]!.baseUnits, undefined);
  assert.deepEqual((document.withheld as { reason: string }[]).map((w) => w.reason), ["FROZEN"]);
  assert.equal((document.token as { address: string }).address, "0x" + "c".repeat(40));

  const usdc = payoutInstruction(input("USDC"));
  assert.equal(usdc.document.executor, "issuer-treasury");
  assert.equal((usdc.document.payees as { baseUnits: string }[])[0]!.baseUnits, "4444440000"); // 6 decimals
  assert.notEqual(usdc.hash, hash);
  assert.throws(() => payoutInstruction({ ...input("USD"), payees: [] }));
});
