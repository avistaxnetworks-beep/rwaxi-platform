import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChainTransaction } from "@rwaxi/database";
import { buildHealthReport, type HealthInput } from "./health";

const NOW = new Date("2026-10-30T12:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const TOKEN = `0x${"2".repeat(40)}`;
const REGISTRY = `0x${"1".repeat(40)}`;
const FACTORY = `0x${"3".repeat(40)}`;
const WALLET = `0x${"a".repeat(40)}`;
let seq = 0;
function tx(kind: ChainTransaction["kind"], over: Partial<ChainTransaction> = {}): ChainTransaction {
  seq += 1;
  return {
    id: `tx${String(seq).padStart(22, "0")}`,
    organizationId: "org_avista",
    offeringId: "off_avista",
    network: "POLYGON_AMOY",
    kind,
    contractAddress: TOKEN,
    method: "mintSubscription(bytes32,address,uint256,bytes32)",
    args: {},
    txHash: null,
    blockNumber: null,
    status: "PENDING",
    error: null,
    executionMode: null,
    signerAddress: null,
    nonce: null,
    signedTransaction: null,
    executedAt: null,
    attempts: 0,
    lastAttemptAt: null,
    createdAt: ago(5),
    ...over,
  };
}

function input(over: Partial<HealthInput> = {}): HealthInput {
  return {
    orgs: [
      { id: "org_avista", name: "Avista", slug: "avista", complianceRegistry: REGISTRY },
      { id: "org_nuevo", name: "Nuevo", slug: "nuevo", complianceRegistry: null },
    ],
    offerings: [
      {
        id: "off_avista",
        organizationId: "org_avista",
        code: "P-03",
        token: { network: "POLYGON_AMOY", symbol: "AVB", contractAddress: TOKEN, status: "DEPLOYED", platformFeeBps: 120, maxSupply: 1000, deployTxHash: null, deployedAt: null },
      },
    ],
    subscriptions: [{ organizationId: "org_avista", offeringId: "off_avista", status: "MINTED", units: 200, onchainId: `0x${"5".repeat(64)}`, wallet: WALLET }],
    txs: [
      tx("TENANT_REGISTRY_DEPLOYED", { contractAddress: FACTORY, status: "CONFIRMED", executionMode: "SIMULATION", txHash: `0x${"9".repeat(64)}` }),
      tx("SUBSCRIPTION_MINTED", { status: "CONFIRMED", args: { investor: WALLET, amount: 200 } }),
    ],
    distributions: [],
    mail: [],
    configuredFactory: null,
    mode: "SIMULATION",
    ...over,
  };
}

test("contracts and census: registries (deployed or deferred) and tokens; the register matches the confirmed mints", () => {
  const report = buildHealthReport(input(), NOW);
  const registry = report.contracts.find((c) => c.kind === "registry" && c.slug === "avista")!;
  assert.deepEqual([registry.status, registry.mode, registry.address], ["DEPLOYED", "SIMULATION", REGISTRY]);
  assert.equal(report.contracts.find((c) => c.kind === "registry" && c.slug === "nuevo")!.status, "DEFERRED");
  assert.equal(report.contracts.find((c) => c.kind === "token")!.platformFeeBps, 120);
  assert.deepEqual(report.factories, [{ network: "POLYGON_AMOY", address: FACTORY, configured: false }]);
  assert.deepEqual([report.census[0]!.dbMinted, report.census[0]!.outboxMinted, report.census[0]!.consistent], [200, 200, true]);
  assert.equal(report.alerts.length, 0);

  // 50 more tokens confirmed on the token than the platform's register holds: critical
  const off = buildHealthReport(input({ txs: [...input().txs, tx("SUBSCRIPTION_MINTED", { status: "CONFIRMED", args: { investor: WALLET, amount: 50 } })] }), NOW);
  assert.equal(off.census[0]!.consistent, false);
  assert.deepEqual([off.alerts[0]!.severity, off.alerts[0]!.area], ["critical", "census"]);
});

test("chain queue alerts: failed attempts, receipts awaited, rows stuck for a day (with why) and reverts", () => {
  const report = buildHealthReport(
    input({
      txs: [
        ...input().txs,
        tx("SUBSCRIPTION_MINTED", { attempts: 3, lastAttemptAt: ago(2), error: "2026-10-30T11:58:00Z · Modo RPC: el nodo rechazó la transacción" }),
        tx("SUBSCRIPTION_MINTED", { attempts: 1, lastAttemptAt: ago(1), error: "timeout" }),
        tx("SUBSCRIPTION_MINTED", { executionMode: "RPC", txHash: `0x${"7".repeat(64)}`, createdAt: ago(20) }),
        tx("INVESTOR_REVOKED", { contractAddress: REGISTRY, args: { wallet: `0x${"b".repeat(40)}` }, method: "revokeInvestor(address)", createdAt: ago(26 * 60) }),
        tx("SUBSCRIPTION_MINTED", { status: "REVERTED", txHash: `0x${"8".repeat(64)}`, error: "reverted on-chain", attempts: 1, lastAttemptAt: ago(30), executedAt: ago(30) }),
      ],
    }),
    NOW,
  );
  const titles = report.alerts.map((a) => `${a.severity}:${a.title}`);
  assert.ok(titles.includes("critical:3 intento(s) fallido(s) · SUBSCRIPTION_MINTED"), titles.join(" | "));
  assert.ok(titles.includes("warning:1 intento(s) fallido(s) · SUBSCRIPTION_MINTED"));
  assert.ok(titles.includes("warning:Enviada a la red sin recibo · SUBSCRIPTION_MINTED"));
  assert.ok(titles.includes("warning:En cola hace 26 h · INVESTOR_REVOKED"));
  assert.ok(titles.includes("critical:Revertida en la red · SUBSCRIPTION_MINTED"));
  assert.equal(report.alerts[0]!.severity, "critical"); // most severe first
  const stuck = report.pending.find((p) => p.kind === "INVESTOR_REVOKED")!;
  assert.match(stuck.blockedReason ?? "", /InvestorNotApproved/); // the wallet was never approved in the registry
  const queue = report.queue.find((q) => q.slug === "avista")!;
  assert.deepEqual(
    [queue.pending, queue.awaitingReceipt, queue.withFailedAttempts, queue.reverted],
    [4, 1, 2, 1],
  );
});

test("mail queue: undelivered and retrying messages per developer", () => {
  const report = buildHealthReport(
    input({
      mail: [
        { organizationId: "org_avista", status: "FAILED", attempts: 5, lastError: "422 invalid recipient", createdAt: ago(90) },
        { organizationId: "org_avista", status: "PENDING", attempts: 2, lastError: "503", createdAt: ago(10) },
        { organizationId: "org_avista", status: "PENDING", attempts: 0, lastError: null, createdAt: ago(1) },
      ],
    }),
    NOW,
  );
  assert.deepEqual(report.mail, { pending: 2, retrying: 1, failed: 1, oldestPendingAt: ago(10).toISOString() });
  // same severity: the most recent first
  assert.deepEqual(
    report.alerts.map((a) => a.title),
    ["1 correo(s) pendiente(s) reintentándose", "1 correo(s) sin entregar (FAILED)"],
  );
});
