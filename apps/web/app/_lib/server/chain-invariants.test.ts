import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChainTransaction } from "@rwaxi/database";
import { blockerFor, registryEntry, type ChainState } from "./chain-invariants";

const REGISTRY = `0x${"1".repeat(40)}`;
const TOKEN = `0x${"2".repeat(40)}`;
const FACTORY = `0x${"3".repeat(40)}`;
const WALLET = `0x${"a".repeat(40)}`;
const OTHER = `0x${"b".repeat(40)}`;
const SUB = `0x${"5".repeat(64)}`;
const EVIDENCE = `0x${"e".repeat(64)}`;
const DOSSIER = `0x${"d".repeat(64)}`;
const DISTRIBUTION = `0x${"7".repeat(64)}`;
const ZERO32 = `0x${"0".repeat(64)}`;

let seq = 0;
const at = (minute: number) => new Date(Date.UTC(2026, 9, 23, 12, minute));

function row(kind: ChainTransaction["kind"], args: Record<string, unknown>, extra: Partial<ChainTransaction> = {}): ChainTransaction {
  const method: Record<string, string> = {
    INVESTOR_WHITELISTED: "approveInvestor(address,uint16,bytes32)",
    INVESTOR_REVOKED: "revokeInvestor(address)",
    INVESTOR_FREEZE_UPDATED: "setFrozen(address,bool)",
    SUBSCRIPTION_MINTED: "mintSubscription(bytes32,address,uint256,bytes32)",
    DATA_ROOM_ROOT_ANCHORED: "updateDataRoomMerkleRoot(bytes32)",
    TENANT_REGISTRY_DEPLOYED: "deployTenantRegistry(bytes32,string,string,address,address)",
    DISTRIBUTION_ROOT_ANCHORED: "anchorDistributionRoot(bytes32,bytes32,uint256,uint256)",
  };
  seq += 1;
  return {
    id: `tx${String(seq).padStart(22, "0")}`,
    organizationId: "org",
    offeringId: "off",
    network: "POLYGON_AMOY",
    kind,
    contractAddress: kind === "SUBSCRIPTION_MINTED" || kind === "DATA_ROOM_ROOT_ANCHORED" ? TOKEN : REGISTRY,
    method: method[kind] ?? "unknown()",
    args: args as ChainTransaction["args"],
    txHash: null,
    blockNumber: null,
    status: "PENDING",
    error: null,
    executionMode: null,
    signerAddress: null,
    nonce: null,
    signedTransaction: null,
    executedAt: null,
    createdAt: at(seq),
    ...extra,
  };
}

const approve = (extra: Partial<ChainTransaction> = {}, wallet = WALLET) =>
  row("INVESTOR_WHITELISTED", { wallet, countryCode: 170, kycDossierHash: DOSSIER }, extra);
const mint = (extra: Partial<ChainTransaction> = {}, args: Record<string, unknown> = {}) =>
  row("SUBSCRIPTION_MINTED", { subscriptionId: SUB, investor: WALLET, amount: 250, paymentEvidenceRef: EVIDENCE, ...args }, extra);
const confirmed = { status: "CONFIRMED" as const };

function state(txs: ChainTransaction[], overrides: Partial<ChainState> = {}): ChainState {
  return {
    registry: REGISTRY,
    distributions: [],
    txs,
    subscriptions: [{ onchainId: SUB, status: "MINT_PENDING", wallet: WALLET }],
    tokens: [{ contractAddress: TOKEN, status: "DEPLOYED", maxSupply: 1000 }],
    ...overrides,
  };
}

test("a mint waits while the investor's approveInvestor() is still PENDING", () => {
  const wl = approve();
  const m = mint();
  assert.match(blockerFor(m, state([wl, m]))!, /^Prelación: el approveInvestor\(\)/);
  assert.equal(blockerFor(wl, state([wl, m])), null);
});

test("once the whitelisting is confirmed the mint can run", () => {
  const m = mint();
  assert.equal(blockerFor(m, state([approve(confirmed), m])), null);
});

test("without any whitelisting the mint would revert in _update", () => {
  const m = mint();
  assert.match(blockerFor(m, state([m]))!, /Receiver wallet is not approved/);
  // a whitelisting of another wallet does not count
  assert.match(blockerFor(m, state([approve(confirmed, OTHER), m]))!, /Receiver wallet is not approved/);
});

test("only the tenant's current registry counts (a redeployed registry starts empty)", () => {
  const m = mint();
  const oldRegistry = approve({ status: "CONFIRMED", contractAddress: `0x${"9".repeat(40)}` });
  assert.match(blockerFor(m, state([oldRegistry, m]))!, /not approved/);
  assert.equal(blockerFor(m, state([oldRegistry, m], { registry: `0x${"9".repeat(40)}` })), null);
});

test("registry history is replayed in order: revoke, freeze, re-approval", () => {
  const m = mint();
  const revoked = [approve(confirmed), row("INVESTOR_REVOKED", { wallet: WALLET }, confirmed), m];
  assert.match(blockerFor(m, state(revoked))!, /not approved/);

  const frozen = [approve(confirmed), row("INVESTOR_FREEZE_UPDATED", { wallet: WALLET, frozen: true }, confirmed), m];
  assert.match(blockerFor(m, state(frozen))!, /congelada/);

  // approveInvestor() resets isFrozen = false in the contract
  const reapproved = [...frozen.slice(0, 2), approve(confirmed), m];
  assert.deepEqual(registryEntry(state(reapproved), WALLET), { approved: true, frozen: false });
  assert.equal(blockerFor(m, state(reapproved)), null);
});

test("the mint mirrors the token's reverts: already processed, supply cap, pause", () => {
  const m = mint();
  const done = mint(confirmed);
  assert.match(blockerFor(m, state([approve(confirmed), done, m]))!, /SubscriptionAlreadyProcessed/);

  const other = mint(confirmed, { subscriptionId: `0x${"6".repeat(64)}`, amount: 800 });
  assert.equal(blockerFor(m, state([approve(confirmed), other, m], { tokens: [{ contractAddress: TOKEN, status: "DEPLOYED", maxSupply: 1050 }] })), null);
  assert.match(
    blockerFor(m, state([approve(confirmed), other, m], { tokens: [{ contractAddress: TOKEN, status: "DEPLOYED", maxSupply: 1000 }] }))!,
    /SupplyCapExceeded\(250, 200\)/,
  );
  assert.match(
    blockerFor(m, state([approve(confirmed), m], { tokens: [{ contractAddress: TOKEN, status: "PAUSED", maxSupply: 1000 }] }))!,
    /EnforcedPause/,
  );
  assert.match(blockerFor(m, state([approve(confirmed), m], { tokens: [] }))!, /no está desplegado/);
});

test("the subscription must have its payment reconciled and belong to the receiver", () => {
  const m = mint();
  const awaiting = state([approve(confirmed), m], { subscriptions: [{ onchainId: SUB, status: "PAYMENT_PENDING", wallet: WALLET }] });
  assert.match(blockerFor(m, awaiting)!, /PAYMENT_PENDING/);
  const minted = state([approve(confirmed), m], { subscriptions: [{ onchainId: SUB, status: "MINTED", wallet: WALLET }] });
  assert.match(blockerFor(m, minted)!, /MINTED/);
  const stranger = state([approve(confirmed), m], { subscriptions: [{ onchainId: SUB, status: "MINT_PENDING", wallet: OTHER }] });
  assert.match(blockerFor(m, stranger)!, /no es la wallet/);
  assert.match(blockerFor(m, state([approve(confirmed), m], { subscriptions: [] }))!, /No existe la suscripción/);
});

test("approveInvestor() reverts and precedence among registry calls of one wallet", () => {
  const zero = approve({}, `0x${"0".repeat(40)}`);
  assert.match(blockerFor(zero, state([zero]))!, /InvalidWallet/);
  const empty = row("INVESTOR_WHITELISTED", { wallet: WALLET, countryCode: 170, kycDossierHash: `0x${"0".repeat(64)}` });
  assert.match(blockerFor(empty, state([empty]))!, /EmptyDossierHash/);

  const first = row("INVESTOR_REVOKED", { wallet: WALLET });
  const second = approve();
  assert.match(blockerFor(second, state([first, second]))!, /^Prelación/);
});

test("rows that cannot be signed from the queue are refused", () => {
  const confirmedRow = approve(confirmed);
  assert.match(blockerFor(confirmedRow, state([confirmedRow]))!, /ya no está PENDING/);
  const claimed = mint({ executionMode: "RPC", txHash: `0x${"f".repeat(64)}` });
  assert.match(blockerFor(claimed, state([approve(confirmed), claimed]))!, /Envío RPC en curso .*lo concilia/);
  const lost = mint({ executionMode: "RPC" });
  assert.match(blockerFor(lost, state([approve(confirmed), lost]))!, /sin tx hash/);
  const broken = mint({}, { amount: "muchos" });
  assert.match(blockerFor(broken, state([approve(confirmed), broken]))!, /calldata/);
  const anchor = row("DATA_ROOM_ROOT_ANCHORED", { newRoot: EVIDENCE });
  assert.match(blockerFor(anchor, state([anchor]))!, /no se ejecuta desde la cola/);
});

test("the tenant registry is deployed only by RWAXI's operator (platform console), once", () => {
  const args = { organizationId: DISTRIBUTION, organizationTaxId: "901.234.567-8", complianceRegime: "SARLAFT", tenantAdmin: WALLET, complianceOfficer: OTHER };
  const deploy = row("TENANT_REGISTRY_DEPLOYED", args, { contractAddress: FACTORY });
  const fresh = { registry: null };
  assert.match(blockerFor(deploy, state([deploy], fresh))!, /operador RWAXI/);
  assert.equal(blockerFor(deploy, state([deploy], fresh), "platform"), null);
  assert.match(blockerFor(deploy, state([deploy]), "platform")!, /ya tiene RwaxiComplianceRegistry/);
  const earlier = row("TENANT_REGISTRY_DEPLOYED", args, { contractAddress: FACTORY, status: "CONFIRMED" });
  assert.match(blockerFor(deploy, state([earlier, deploy], fresh), "platform")!, /TenantAlreadyRegistered/);
});

test("a distribution root is anchored once, for a declared distribution, on a deployed token", () => {
  const anchor = (extra: Partial<ChainTransaction> = {}, args: Record<string, unknown> = {}) =>
    row(
      "DISTRIBUTION_ROOT_ANCHORED",
      { distributionId: DISTRIBUTION, merkleRoot: EVIDENCE, totalAmountCents: "1000000", snapshotSupply: 450, ...args },
      { contractAddress: TOKEN, ...extra },
    );
  const declared: Partial<ChainState> = { distributions: [{ onchainId: DISTRIBUTION, status: "DECLARED" }] };
  const a = anchor();
  assert.equal(blockerFor(a, state([a], declared)), null);
  const empty = anchor({}, { merkleRoot: ZERO32 });
  assert.match(blockerFor(empty, state([empty], declared))!, /EmptyDistributionRoot/);
  assert.match(blockerFor(a, state([a]))!, /No existe la distribución/);
  assert.match(blockerFor(a, state([a], { distributions: [{ onchainId: DISTRIBUTION, status: "ANCHORED" }] }))!, /ya está anclada/);
  assert.match(blockerFor(a, state([anchor(confirmed), a], declared))!, /DistributionAlreadyAnchored/);
  assert.match(blockerFor(a, state([a], { ...declared, tokens: [{ contractAddress: TOKEN, status: "NOT_DEPLOYED", maxSupply: 1000 }] }))!, /no está desplegado/);
  // anchorDistributionRoot() has no whenNotPaused: the issuer may publish a root while transfers are paused
  assert.equal(blockerFor(a, state([a], { ...declared, tokens: [{ contractAddress: TOKEN, status: "PAUSED", maxSupply: 1000 }] })), null);
  const broken = anchor({}, { totalAmountCents: "mil" });
  assert.match(blockerFor(broken, state([broken], declared))!, /calldata/);
});
