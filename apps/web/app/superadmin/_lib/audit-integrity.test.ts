import { test } from "node:test";
import assert from "node:assert/strict";
import { toOnchainId } from "@rwaxi/blockchain-sdk";
import { canonicalJson, evidenceHash } from "@rwaxi/blockchain-sdk/canonical";
import { buildMerkleTree } from "@rwaxi/blockchain-sdk/merkle";
import { keccak256 } from "viem";
import { ACTION_CATEGORY, ACTION_LABEL, AUDIT_ACTIONS, CATEGORY, categoryOf, isCritical, membersOf } from "./audit-catalog";
import { integrityOf, type SealedEvent } from "./audit-integrity";

/** What jsonb gives back: the same values, keys in another order. */
const roundTrip = (v: unknown) => JSON.parse(canonicalJson(v));

test("every audit action has a label and a category; confirmations take the category of the call they confirm", () => {
  for (const action of AUDIT_ACTIONS) {
    assert.ok(ACTION_LABEL[action].length > 3, action);
    assert.ok(ACTION_CATEGORY[action] in CATEGORY, action);
  }
  assert.equal(categoryOf("CHAIN_TX_CONFIRMED", "OFFERING_TOKEN_DEPLOYED"), "deployments");
  assert.equal(categoryOf("CHAIN_TX_CONFIRMED", "INVESTOR_FREEZE_UPDATED"), "wallets");
  assert.equal(categoryOf("CHAIN_TX_CONFIRMED", "TOKEN_PAUSED"), "onchain");
  assert.equal(categoryOf("COMMERCIAL_TERMS_UPDATED"), "fees");
  // critical: fee changes, deployments, vault documents, compliance wallets — and integrity failures anywhere
  assert.ok(isCritical("COMMERCIAL_TERMS_UPDATED") && isCritical("DATA_ROOM_DOCUMENT_ADDED") && isCritical("REGISTRY_WALLETS_DECLARED"));
  assert.ok(isCritical("CHAIN_TX_CONFIRMED", "TENANT_REGISTRY_DEPLOYED") && isCritical("VAULT_INTEGRITY_FAILED"));
  assert.ok(!isCritical("LOGIN_SUCCEEDED") && !isCritical("CHAIN_TX_CONFIRMED", "SUBSCRIPTION_MINTED"));
  const deployments = membersOf("deployments");
  assert.deepEqual(deployments.actions, ["OFFERING_TOKEN_DEPLOYMENT_QUEUED"]);
  assert.deepEqual(deployments.chainKinds.sort(), ["OFFERING_TOKEN_DEPLOYED", "TENANT_REGISTRY_DEPLOYED"]);
  assert.equal(membersOf("onchain").allConfirmations, true);
});

const base = { organizationId: "org_avista", entityId: "cmh0000000000000000000001" };

test("console decisions: the seal is recomputed from the event; an altered payload does not match", () => {
  const payload = { tenant: "Avista", from: { platformFeeBps: 120 }, to: { platformFeeBps: 150 }, agreement: { reference: "RWX-1", sha256: "0xab" } };
  const sealed: SealedEvent = {
    ...base,
    action: "COMMERCIAL_TERMS_UPDATED",
    payload: roundTrip(payload),
    subjectHash: evidenceHash({ action: "COMMERCIAL_TERMS_UPDATED", ...base, ...payload }),
  };
  assert.equal(integrityOf(sealed).status, "verified");
  assert.equal(integrityOf({ ...sealed, payload: { ...payload, to: { platformFeeBps: 500 } } }).status, "mismatch");
  assert.equal(integrityOf({ ...sealed, organizationId: "org_other" }).status, "mismatch");
});

test("tenant events that carry what they seal: agreement, payment evidence, Merkle root, payment instruction", () => {
  const agreement = { version: 3, capitalUsd: "25000.00", units: 250, nda: { documentHash: "0x01" } };
  assert.equal(integrityOf({ ...base, action: "SUBSCRIPTION_CREATED", payload: { agreement }, subjectHash: evidenceHash(agreement) }).status, "verified");
  assert.equal(integrityOf({ ...base, action: "SUBSCRIPTION_CREATED", payload: { agreement: { ...agreement, units: 251 } }, subjectHash: evidenceHash(agreement) }).status, "mismatch");

  const paymentRef = evidenceHash({ version: 1, kind: "rwaxi.subscription.payment", subscriptionId: toOnchainId(base.entityId), agreementHash: "0xa1", paymentReference: "FID-1" });
  assert.equal(
    integrityOf({ ...base, action: "PAYMENT_CONFIRMED", payload: { agreementHash: "0xa1", paymentReference: "FID-1" }, subjectHash: paymentRef }).status,
    "verified",
  );

  const leaves = [`0x${"1".repeat(64)}`, `0x${"2".repeat(64)}`, `0x${"3".repeat(64)}`];
  const root = buildMerkleTree(leaves).root;
  const allocations = leaves.map((leaf, i) => ({ wallet: `0x${String(i).repeat(40)}`, leaf }));
  assert.equal(integrityOf({ ...base, action: "DISTRIBUTION_DECLARED", payload: { allocations }, subjectHash: root }).status, "verified");
  assert.equal(integrityOf({ ...base, action: "DISTRIBUTION_DECLARED", payload: { allocations: allocations.slice(1) }, subjectHash: root }).status, "mismatch");

  const instruction = { v: 1, kind: "rwaxi.distribution.payout-instruction", payees: [{ wallet: "0xab", amount: "10.00" }], total: "10.00" };
  assert.equal(
    integrityOf({ ...base, action: "DISTRIBUTION_PAYOUT_INSTRUCTED", payload: { instruction: roundTrip(instruction) }, subjectHash: evidenceHash(instruction) }).status,
    "verified",
  );
});

test("on-chain confirmations: a simulated one re-hashes its signed transaction; others seal external evidence", () => {
  const signed = "0x02f86c0180843b9aca00843b9aca00830493e094" as const;
  const event: SealedEvent = { ...base, action: "CHAIN_TX_CONFIRMED", payload: { kind: "SUBSCRIPTION_MINTED" }, subjectHash: keccak256(signed) };
  assert.equal(integrityOf(event, { signedTransaction: signed, executionMode: "SIMULATION" }).status, "verified");
  assert.equal(integrityOf({ ...event, subjectHash: keccak256("0x00") }, { signedTransaction: signed, executionMode: "SIMULATION" }).status, "mismatch");
  assert.equal(integrityOf(event, { signedTransaction: null, executionMode: "RPC" }).status, "external");
  assert.equal(integrityOf({ ...base, action: "DATA_ROOM_DOCUMENT_ADDED", payload: {}, subjectHash: "0xab" }).status, "external");
  assert.equal(integrityOf({ ...base, action: "LOGIN_SUCCEEDED", payload: {}, subjectHash: null }).status, "none");
});
