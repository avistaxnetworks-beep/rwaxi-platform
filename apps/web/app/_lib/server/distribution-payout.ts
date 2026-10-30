// Pure: who a yield distribution may pay now, and the payment instruction it issues (no I/O).
import { evidenceHash } from "@rwaxi/blockchain-sdk/canonical";
import { isStablecoin, stablecoinBaseUnits, type PayoutCurrency } from "@rwaxi/blockchain-sdk/distribution";
import type { Bytes32 } from "@rwaxi/blockchain-sdk/merkle";
import { msg } from "@/app/_i18n/marks";
import { registryEntry, type RegistryTx } from "./chain-invariants";
import { walletOf } from "./chain-queue";

/**
 * Every holder of record keeps their allocation — the entitlement follows the token balance at the record date —
 * but money only goes to a wallet that the tenant's compliance whitelist clears when the instruction is issued.
 * The rest is withheld, never redistributed among the other holders, until a later instruction clears it.
 */
export type WithholdReason = "KYC_REVOKED" | "REVOCATION_PENDING" | "NOT_WHITELISTED" | "FROZEN" | "FREEZE_PENDING";

/** For the staff only: the portal never tells an investor why a payment is withheld (no tipping-off). */
export const WITHHOLD_REASON: Record<WithholdReason, string> = {
  KYC_REVOKED: msg("KYC revocado por el Oficial de Cumplimiento"),
  REVOCATION_PENDING: msg("Revocación en cola en el registro (revokeInvestor)"),
  NOT_WHITELISTED: msg("Wallet fuera de la whitelist del registro"),
  FROZEN: msg("Wallet congelada en el registro"),
  FREEZE_PENDING: msg("Congelamiento en cola en el registro (setFrozen)"),
};

export interface RegistryStatus {
  approved: boolean;
  frozen: boolean;
}

/** What the whitelist check reads: the registry entries, the queued registry calls and the KYC decisions. */
export interface ComplianceView {
  /** RwaxiComplianceRegistry's entry of the wallet: read from the contract (RPC) or replayed from the outbox */
  entry: (wallet: string) => RegistryStatus;
  /** queued registry calls that take the wallet off the payable list once they run */
  pending: (wallet: string) => { revoke: boolean; freeze: boolean };
  kycRevoked: (investorId: string) => boolean;
}

/** Why a holder cannot be paid now, or null when the compliance whitelist clears their wallet. */
export function withholdReason(view: ComplianceView, holder: { investorId: string; wallet: string }): WithholdReason | null {
  const wallet = holder.wallet.toLowerCase();
  if (view.kycRevoked(holder.investorId)) return "KYC_REVOKED";
  const pending = view.pending(wallet);
  if (pending.revoke) return "REVOCATION_PENDING";
  const entry = view.entry(wallet);
  if (!entry.approved) return "NOT_WHITELISTED";
  if (entry.frozen) return "FROZEN";
  if (pending.freeze) return "FREEZE_PENDING";
  return null;
}

/** Queued (PENDING) revokeInvestor(wallet) and setFrozen(wallet, true) calls of the tenant's registry. */
export function pendingRegistryCalls(txs: readonly RegistryTx[], wallet: string): { revoke: boolean; freeze: boolean } {
  const own = txs.filter((t) => t.status === "PENDING" && walletOf(t.args) === wallet.toLowerCase());
  return {
    revoke: own.some((t) => t.kind === "INVESTOR_REVOKED"),
    freeze: own.some((t) => t.kind === "INVESTOR_FREEZE_UPDATED" && (t.args as { frozen?: unknown } | null)?.frozen === true),
  };
}

/** The whitelist as the confirmed outbox leaves it (SIMULATION): registryEntry() of each wallet. */
export function replayedEntries(state: { registry: string | null; txs: RegistryTx[] }): (wallet: string) => RegistryStatus {
  return (wallet) => registryEntry(state, wallet.toLowerCase());
}

const AMOUNT = /^\d{1,18}\.\d{2}$/;
/** "1234.50" → 123450n: amounts travel as strings with two decimals (exact through jsonb and canonical JSON). */
export function centsOf(amount: string): bigint {
  if (!AMOUNT.test(amount)) throw new Error(`Not an amount with two decimals: ${amount}`);
  return BigInt(amount.replace(".", ""));
}
export const amountOf = (cents: bigint) => {
  const s = cents.toString().padStart(3, "0");
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
};

export interface PayoutAllocation {
  id: string;
  investorId: string;
  name: string;
  wallet: string;
  units: number;
  /** in the payment currency, two decimals ("1234.50") */
  amount: string;
  leafHash: string;
}

export interface PayoutInstructionInput {
  distribution: {
    id: string;
    onchainId: string;
    offeringCode: string;
    period: string;
    recordDate: string;
    snapshotAt: string;
    currency: PayoutCurrency;
    amountDeclared: string;
    merkleRoot: string;
    anchorTxHash: string;
    supportSha256: string;
  };
  token: { address: string; network: string };
  registry: { mode: "RPC" | "SIMULATION"; address: string | null };
  sequence: number;
  issuedAt: string;
  payees: PayoutAllocation[];
  withheld: (PayoutAllocation & { reason: WithholdReason })[];
}

/**
 * The payment instruction of a distribution: the cleared payees (with the leaf that proves each amount against the
 * anchored root and, for a stablecoin, the 6-decimal base units of its transfer) and the withheld allocations with
 * their reason. Its hash is evidenceHash(document): SHA-256 of the canonical JSON, the same after a round-trip
 * through jsonb, so the document the backoffice downloads hashes to the recorded instructionHash.
 */
export function payoutInstruction(input: PayoutInstructionInput): { document: Record<string, unknown>; hash: Bytes32; total: string } {
  if (!input.payees.length) throw new Error("a payment instruction needs at least one payee");
  const stablecoin = isStablecoin(input.distribution.currency);
  const total = input.payees.reduce((s, p) => s + centsOf(p.amount), 0n);
  const line = (p: PayoutAllocation) => ({
    allocationId: p.id,
    investorId: p.investorId,
    name: p.name,
    wallet: p.wallet.toLowerCase(),
    units: p.units,
    amount: p.amount,
    leaf: p.leafHash,
  });
  const document = {
    v: 1,
    kind: "rwaxi.distribution.payout-instruction",
    distribution: input.distribution,
    token: { address: input.token.address.toLowerCase(), network: input.token.network },
    sequence: input.sequence,
    issuedAt: input.issuedAt,
    currency: input.distribution.currency,
    // fiat goes through the issuer's fiduciary vehicle; a stablecoin from the issuer's own treasury wallet
    executor: stablecoin ? "issuer-treasury" : "fiduciary",
    registry: input.registry,
    payees: input.payees.map((p) =>
      stablecoin ? { ...line(p), baseUnits: stablecoinBaseUnits(centsOf(p.amount)).toString() } : line(p),
    ),
    withheld: input.withheld.map((w) => ({ ...line(w), reason: w.reason })),
    total: amountOf(total),
  };
  return { document, hash: evidenceHash(document), total: amountOf(total) };
}
