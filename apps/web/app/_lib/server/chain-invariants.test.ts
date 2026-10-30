import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChainTransaction } from "@rwaxi/database";
import { interpolate } from "@/app/_i18n/translate";
import { toFunctionSelector } from "viem";
import { MINTER_ROLE_ID, blockerFor, registryEntry, walletFrozen, walletTxMismatch, type ChainState, type SentTransaction } from "./chain-invariants";
import { calldataOf } from "./chain-queue";

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
    OFFERING_TOKEN_DEPLOYED: "deployOfferingToken(bytes32,bytes32,(string,string,string,string,uint256,bytes32,uint16),address,address)",
    DISTRIBUTION_ROOT_ANCHORED: "anchorDistributionRoot(bytes32,bytes32,uint256,uint256,uint64,string,bytes32)",
    MINTER_ROLE_GRANTED: "grantRole(bytes32,address)",
  };
  seq += 1;
  return {
    id: `tx${String(seq).padStart(22, "0")}`,
    organizationId: "org",
    offeringId: "off",
    network: "POLYGON_AMOY",
    kind,
    contractAddress: kind === "SUBSCRIPTION_MINTED" || kind === "DATA_ROOM_ROOT_ANCHORED" || kind === "MINTER_ROLE_GRANTED" ? TOKEN : REGISTRY,
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
    attempts: 0,
    lastAttemptAt: null,
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

test("a wallet frozen in the registry — or with a freeze still queued — takes no new subscription", () => {
  const freeze = (frozen: boolean, extra: Partial<ChainTransaction> = {}) =>
    row("INVESTOR_FREEZE_UPDATED", { wallet: WALLET, frozen }, extra);
  const s = (txs: ChainTransaction[]) => ({ registry: REGISTRY, txs });
  assert.equal(walletFrozen(s([approve(confirmed)]), WALLET), false);
  assert.equal(walletFrozen(s([approve(confirmed), freeze(true, confirmed)]), WALLET), true);
  // a freeze that is only queued already counts; an unfreeze that is only queued does not
  assert.equal(walletFrozen(s([approve(confirmed), freeze(true)]), WALLET), true);
  assert.equal(walletFrozen(s([approve(confirmed), freeze(true, confirmed), freeze(false)]), WALLET), true);
  assert.equal(walletFrozen(s([approve(confirmed), freeze(true, confirmed), freeze(false, confirmed)]), WALLET), false);
  // another wallet's freeze, or one on another registry, is not this wallet's
  assert.equal(walletFrozen(s([approve(confirmed), row("INVESTOR_FREEZE_UPDATED", { wallet: OTHER, frozen: true }, confirmed)]), WALLET), false);
  assert.equal(walletFrozen({ registry: REGISTRY, txs: [approve(confirmed), freeze(true, { ...confirmed, contractAddress: TOKEN })] }, WALLET), false);
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
  const pause = row("TOKEN_PAUSED", {}, { contractAddress: TOKEN, method: "pause()" });
  assert.match(blockerFor(pause, state([pause]))!, /no se ejecuta desde la cola/);
});

test("revokeInvestor() needs an approved wallet; setFrozen() waits for earlier registry calls", () => {
  const revoke = row("INVESTOR_REVOKED", { wallet: WALLET });
  assert.match(blockerFor(revoke, state([revoke]))!, /InvestorNotApproved/);
  assert.equal(blockerFor(revoke, state([approve(confirmed), revoke])), null);
  // an approval of another wallet does not count; a confirmed revocation leaves nothing to revoke
  assert.match(blockerFor(revoke, state([approve(confirmed, OTHER), revoke]))!, /InvestorNotApproved/);
  assert.match(blockerFor(revoke, state([approve(confirmed), row("INVESTOR_REVOKED", { wallet: WALLET }, confirmed), revoke]))!, /InvestorNotApproved/);

  const pendingApprove = approve();
  const freeze = row("INVESTOR_FREEZE_UPDATED", { wallet: WALLET, frozen: true });
  assert.match(blockerFor(freeze, state([pendingApprove, freeze]))!, /^Prelación/);
  assert.equal(blockerFor(freeze, state([approve(confirmed), freeze])), null);
  assert.match(blockerFor(row("INVESTOR_FREEZE_UPDATED", { wallet: WALLET }), state([]))!, /calldata/);
});

test("updateDataRoomMerkleRoot() runs on a deployed token, oldest first", () => {
  const first = row("DATA_ROOM_ROOT_ANCHORED", { newRoot: EVIDENCE });
  const second = row("DATA_ROOM_ROOT_ANCHORED", { newRoot: DOSSIER });
  assert.equal(blockerFor(first, state([first, second])), null);
  assert.match(blockerFor(second, state([first, second]))!, /^Prelación: hay un updateDataRoomMerkleRoot/);
  assert.equal(blockerFor(second, state([{ ...first, status: "CONFIRMED" }, second])), null);
  // no whenNotPaused on the token: the issuer may anchor while transfers are paused
  assert.equal(blockerFor(first, state([first], { tokens: [{ contractAddress: TOKEN, status: "PAUSED", maxSupply: 1000 }] })), null);
  assert.match(blockerFor(first, state([first], { tokens: [] }))!, /no está desplegado/);
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

test("an offering token is deployed only by RWAXI's operator, on the tenant's registry, once, with an agreed fee", () => {
  const cfg = {
    name: "Unit",
    symbol: "UNT",
    legalWrapperType: "SPV",
    legalEntityName: "Vehicle",
    maxSupplyCap: 1000,
    dataRoomMerkleRoot: DOSSIER,
    platformFeeBps: 120,
  };
  const args = { organizationId: DISTRIBUTION, offeringId: SUB, cfg, tenantAdmin: WALLET, complianceOfficer: OTHER };
  const deploy = row("OFFERING_TOKEN_DEPLOYED", args, { contractAddress: FACTORY, method: "deployOfferingToken(bytes32,bytes32,(string,string,string,string,uint256,bytes32,uint16),address,address)" });
  assert.match(blockerFor(deploy, state([deploy]))!, /operador RWAXI/);
  assert.equal(blockerFor(deploy, state([deploy]), "platform"), null);
  assert.match(blockerFor(deploy, state([deploy], { registry: null }), "platform")!, /UnknownTenant/);
  const earlier = row("OFFERING_TOKEN_DEPLOYED", args, { contractAddress: FACTORY, status: "CONFIRMED" });
  assert.match(blockerFor(deploy, state([earlier, deploy]), "platform")!, /OfferingAlreadyDeployed/);
  const otherOffering = row("OFFERING_TOKEN_DEPLOYED", { ...args, offeringId: EVIDENCE }, { contractAddress: FACTORY, status: "CONFIRMED" });
  assert.equal(blockerFor(deploy, state([otherOffering, deploy]), "platform"), null);
  for (const bad of [24, 501, 0]) {
    const outOfRange = row("OFFERING_TOKEN_DEPLOYED", { ...args, cfg: { ...cfg, platformFeeBps: bad } }, { contractAddress: FACTORY });
    assert.match(blockerFor(outOfRange, state([outOfRange]), "platform")!, /InvalidPlatformFee/);
  }
  // the TokenConfig struct is encoded from the stored object: calldata exists and carries the selector of the method
  assert.ok(calldataOf(deploy)?.calldata.startsWith(toFunctionSelector(deploy.method)));
  assert.equal(calldataOf(row("OFFERING_TOKEN_DEPLOYED", { ...args, cfg: { ...cfg, symbol: undefined } }, { method: deploy.method })), null);
});

test("a distribution root is anchored once, with its evidence, for the supply the token recorded at the record date", () => {
  // the token's history: 200 tokens confirmed at 12:01 and 250 more at 12:03 (2026-10-23, UTC)
  const minted = [
    mint({ ...confirmed, executedAt: at(1) }, { amount: 200 }),
    mint({ ...confirmed, executedAt: at(3) }, { amount: 250, investor: OTHER, subscriptionId: `0x${"6".repeat(64)}` }),
  ];
  const seconds = (minute: number) => Math.floor(at(minute).getTime() / 1000);
  const anchor = (extra: Partial<ChainTransaction> = {}, args: Record<string, unknown> = {}) =>
    row(
      "DISTRIBUTION_ROOT_ANCHORED",
      {
        distributionId: DISTRIBUTION,
        merkleRoot: EVIDENCE,
        totalAmountCents: "1000000",
        snapshotSupply: 450,
        recordTimestamp: seconds(4),
        currency: "COP",
        evidenceHash: DOSSIER,
        ...args,
      },
      { contractAddress: TOKEN, ...extra },
    );
  const declared: Partial<ChainState> = { distributions: [{ onchainId: DISTRIBUTION, status: "DECLARED" }] };
  const a = anchor();
  assert.equal(blockerFor(a, state([...minted, a], declared)), null);
  const empty = anchor({}, { merkleRoot: ZERO32 });
  assert.match(blockerFor(empty, state([...minted, empty], declared))!, /EmptyDistributionRoot/);
  const nothing = anchor({}, { totalAmountCents: "0" });
  assert.match(blockerFor(nothing, state([...minted, nothing], declared))!, /EmptyDistribution\(\)/);
  const unsupported = anchor({}, { evidenceHash: ZERO32 });
  assert.match(blockerFor(unsupported, state([...minted, unsupported], declared))!, /DistributionEvidenceRequired/);
  assert.match(blockerFor(a, state([...minted, a]))!, /No existe la distribución/);
  assert.match(blockerFor(a, state([...minted, a], { distributions: [{ onchainId: DISTRIBUTION, status: "ANCHORED" }] }))!, /ya está anclada/);
  assert.match(blockerFor(a, state([...minted, anchor(confirmed), a], declared))!, /DistributionAlreadyAnchored/);
  assert.match(
    blockerFor(a, state([...minted, a], { ...declared, tokens: [{ contractAddress: TOKEN, status: "NOT_DEPLOYED", maxSupply: 1000 }] }))!,
    /no está desplegado/,
  );
  // anchorDistributionRoot() has no whenNotPaused: the issuer may publish a root while transfers are paused
  assert.equal(blockerFor(a, state([...minted, a], { ...declared, tokens: [{ contractAddress: TOKEN, status: "PAUSED", maxSupply: 1000 }] })), null);
  // between both mints the token recorded 200: a snapshot of 450 at 12:02 would revert
  const early = anchor({}, { recordTimestamp: seconds(2) });
  assert.match(blockerFor(early, state([...minted, early], declared))!, /SnapshotSupplyMismatch\(450, 200\)/);
  const future = anchor({}, { recordTimestamp: Math.floor(Date.now() / 1000) + 3600 });
  assert.match(blockerFor(future, state([...minted, future], declared))!, /FutureLookup/);
  const broken = anchor({}, { totalAmountCents: "mil" });
  assert.match(blockerFor(broken, state([...minted, broken], declared))!, /calldata/);
});

test("the issuer grants only MINTER_ROLE from the queue, once per wallet and token, on a deployed token", () => {
  const grant = (extra: Partial<ChainTransaction> = {}, args: Record<string, unknown> = {}) =>
    row("MINTER_ROLE_GRANTED", { role: MINTER_ROLE_ID, account: WALLET, ...args }, extra);
  const g = grant();
  assert.equal(MINTER_ROLE_ID, "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6"); // keccak256("MINTER_ROLE")
  assert.equal(blockerFor(g, state([g])), null);
  // any other role — DEFAULT_ADMIN_ROLE (bytes32 0) included — is never granted from the queue
  const admin = grant({}, { role: ZERO32 });
  assert.match(blockerFor(admin, state([admin]))!, /sólo se otorga MINTER_ROLE/);
  const other = grant({}, { role: `0x${"9".repeat(64)}` });
  assert.match(blockerFor(other, state([other]))!, /sólo se otorga MINTER_ROLE/);
  assert.match(blockerFor(g, state([g], { tokens: [{ contractAddress: TOKEN, status: "NOT_DEPLOYED", maxSupply: 1000 }] }))!, /no está desplegado/);
  // the same grant twice: the later one waits, and once one is confirmed the other would be a no-op
  const again = grant();
  assert.match(blockerFor(again, state([g, again]))!, /^Prelación: ya hay un grantRole\(MINTER_ROLE\) pendiente/);
  assert.match(blockerFor(again, state([{ ...g, status: "CONFIRMED" }, again]))!, /ya tiene MINTER_ROLE/);
  // another account, or the same account on another token, is a different grant (account compared without case)
  const otherAccount = grant({}, { account: OTHER });
  assert.equal(blockerFor(otherAccount, state([{ ...g, status: "CONFIRMED" }, otherAccount])), null);
  const otherToken = grant({ contractAddress: FACTORY });
  assert.equal(
    blockerFor(otherToken, state([{ ...g, status: "CONFIRMED" }, otherToken], { tokens: [{ contractAddress: FACTORY, status: "DEPLOYED", maxSupply: 1 }] })),
    null,
  );
  const upper = grant({}, { account: WALLET.toUpperCase().replace("0X", "0x") });
  assert.match(blockerFor(upper, state([{ ...g, status: "CONFIRMED" }, upper]))!, /ya tiene MINTER_ROLE/);
  // pausing the token does not stop AccessControl
  assert.equal(blockerFor(g, state([g], { tokens: [{ contractAddress: TOKEN, status: "PAUSED", maxSupply: 1000 }] })), null);
});

test("a browser-wallet transaction must be exactly the queued call: chain, signer, contract, calldata, no value", () => {
  const expected = { from: WALLET, to: REGISTRY, data: "0xa1b2c3d4", chainId: 31337, chainName: "Hardhat", fn: "approveInvestor" };
  const sent: SentTransaction = { from: WALLET.toUpperCase().replace("0X", "0x"), to: REGISTRY, input: "0xA1B2C3D4", value: 0n, chainId: 31337 };
  const why = (overrides: Partial<typeof sent>) => {
    const r = walletTxMismatch({ ...sent, ...overrides }, expected);
    return r ? interpolate(r.source, r.vars) : null;
  };
  assert.equal(why({}), null); // hex case does not matter
  assert.equal(why({ chainId: undefined }), null); // legacy transaction: the node it was read from is the chain
  assert.match(why({ chainId: 1 })!, /cadena 1, no para Hardhat \(31337\)/);
  assert.match(why({ from: OTHER })!, /no tu wallet autorizada/);
  assert.match(why({ to: TOKEN })!, /no al contrato del tenant/);
  assert.match(why({ to: null })!, /no al contrato del tenant/);
  assert.match(why({ input: "0xa1b2c3d5" })!, /calldata firmado no coincide .*\(approveInvestor\)/);
  assert.match(why({ value: 1n })!, /transfirió valor/);
});
