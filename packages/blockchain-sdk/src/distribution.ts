/**
 * Yield distributions: pro-rata allocations over the token balances of an offering at its record date,
 * committed in a SHA-256 Merkle tree (the same construction as the Data Room, see merkle.ts). The issuer
 * anchors the root with RwaxiPropertyToken.anchorDistributionRoot(distributionId, root, totalAmountCents,
 * snapshotSupply, recordTimestamp, currency, evidenceHash); each investor verifies their allocation with its
 * proof against that root.
 *
 *   leaf v2 = evidenceHash({ v: 2, kind: "rwaxi.distribution.allocation", distributionId, wallet, units, currency, amountCents })
 *   leaf v1 = evidenceHash({ v: 1, kind: "rwaxi.distribution.allocation", distributionId, wallet, units, amountCents })
 *
 * Amounts are integer hundredths of the payment currency ("cents": USD or COP cents, or 1/100 of a USD
 * stablecoin); v1 leaves (distributions declared before the payment currency existed) are USD cents. The
 * split uses the largest-remainder method, so the allocations add up exactly to the declared total; ties
 * go to the larger holding, then to the lower key.
 */
import { evidenceHash } from "./canonical";
import { buildMerkleTree, getMerkleProof, toBytes32, verifyMerkleProof, type Bytes32 } from "./merkle";

/**
 * What a distribution is paid in: fiat through the issuer's fiduciary vehicle (COP, USD) or a USD stablecoin
 * transferred from the issuer's own treasury (USDC, USDT: 6 decimals on-chain). RWAXI never holds the funds.
 */
export const PAYOUT_CURRENCIES = ["COP", "USD", "USDC", "USDT"] as const;
export type PayoutCurrency = (typeof PAYOUT_CURRENCIES)[number];
export const isPayoutCurrency = (v: unknown): v is PayoutCurrency => (PAYOUT_CURRENCIES as readonly unknown[]).includes(v);
/** USD stablecoins: paid on-chain by the issuer, 1 USD each. */
export const isStablecoin = (c: PayoutCurrency) => c === "USDC" || c === "USDT";
/** Base units (6 decimals) of a stablecoin amount given in cents: what an ERC-20 transfer(to, amount) carries. */
export const stablecoinBaseUnits = (amountCents: number | bigint): bigint => BigInt(amountCents) * 10_000n;

export interface DistributionHolding {
  /** stable id of the holder (e.g. Investor.id) */
  key: string;
  wallet: string;
  /** tokens held at the snapshot (1 token = 1 unit) */
  units: number;
}

export interface DistributionAllocation extends DistributionHolding {
  amountCents: number;
  leaf: Bytes32;
  /** sibling hashes, bottom-up (commutative pairs: no left/right flags) */
  proof: Bytes32[];
}

export interface AllocationClaim {
  distributionId: string;
  wallet: string;
  units: number;
  /** hundredths of the payment currency (v1: USD cents) */
  amountCents: number;
  /** payment currency, committed in the leaf (v2); absent for v1 leaves */
  currency?: PayoutCurrency;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const positiveInt = (n: number) => Number.isSafeInteger(n) && n > 0;

/** Splits `totalCents` in proportion to `units` (largest remainder): the shares add up exactly. */
export function prorataCents(totalCents: number, holdings: readonly { key: string; units: number }[]): Map<string, number> {
  if (!positiveInt(totalCents)) throw new Error("totalCents must be a positive safe integer");
  if (!holdings.length) throw new Error("a distribution needs at least one holding");
  if (new Set(holdings.map((h) => h.key)).size !== holdings.length) throw new Error("holding keys must be unique");
  if (!holdings.every((h) => positiveInt(h.units))) throw new Error("units must be positive safe integers");

  const total = BigInt(totalCents);
  const supply = holdings.reduce((s, h) => s + BigInt(h.units), 0n);
  const shares = holdings.map((h) => {
    const exact = total * BigInt(h.units);
    return { key: h.key, units: h.units, cents: exact / supply, remainder: exact % supply };
  });
  let left = total - shares.reduce((s, x) => s + x.cents, 0n);
  const order = [...shares].sort((a, b) =>
    a.remainder !== b.remainder ? (b.remainder > a.remainder ? 1 : -1) : b.units !== a.units ? b.units - a.units : a.key < b.key ? -1 : 1,
  );
  for (const share of order) {
    if (left === 0n) break;
    share.cents += 1n;
    left -= 1n;
  }
  return new Map(shares.map((s) => [s.key, Number(s.cents)]));
}

/** Merkle leaf of one allocation (canonical JSON → SHA-256), recomputable by the investor. */
export function allocationLeaf(claim: AllocationClaim): Bytes32 {
  if (!ADDRESS.test(claim.wallet)) throw new Error(`Not an EVM address: ${claim.wallet}`);
  if (!positiveInt(claim.units) || !Number.isSafeInteger(claim.amountCents) || claim.amountCents < 0) {
    throw new Error("units must be positive and amountCents a non-negative integer");
  }
  const common = {
    kind: "rwaxi.distribution.allocation",
    distributionId: toBytes32(claim.distributionId),
    wallet: claim.wallet.toLowerCase(),
    units: claim.units,
    amountCents: claim.amountCents,
  };
  if (claim.currency === undefined) return evidenceHash({ v: 1, ...common });
  if (!isPayoutCurrency(claim.currency)) throw new Error(`Unknown payout currency: ${String(claim.currency)}`);
  return evidenceHash({ v: 2, ...common, currency: claim.currency });
}

/**
 * Allocations, leaves, proofs and root of a distribution of `totalCents` over `holdings`; with a payment
 * currency the leaves are v2 (they commit it), without one v1 (USD cents).
 */
export function buildDistribution(
  distributionId: string,
  totalCents: number,
  holdings: readonly DistributionHolding[],
  currency?: PayoutCurrency,
): { root: Bytes32; totalUnits: number; allocations: DistributionAllocation[] } {
  if (new Set(holdings.map((h) => h.wallet.toLowerCase())).size !== holdings.length) {
    throw new Error("each wallet may appear only once");
  }
  const cents = prorataCents(totalCents, holdings);
  const drafts = holdings.map((h) => {
    const amountCents = cents.get(h.key)!;
    return { ...h, wallet: h.wallet.toLowerCase(), amountCents, leaf: allocationLeaf({ distributionId, wallet: h.wallet, units: h.units, amountCents, currency }) };
  });
  const tree = buildMerkleTree(drafts.map((d) => d.leaf));
  return {
    root: tree.root,
    totalUnits: holdings.reduce((s, h) => s + h.units, 0),
    allocations: drafts.map((d) => ({ ...d, proof: getMerkleProof(tree, d.leaf) })),
  };
}

/** true when the claimed allocation is included in the distribution whose root is `root`. */
export function verifyAllocation(claim: AllocationClaim, proof: readonly string[], root: string): boolean {
  try {
    return verifyMerkleProof(allocationLeaf(claim), proof, root);
  } catch {
    return false;
  }
}
