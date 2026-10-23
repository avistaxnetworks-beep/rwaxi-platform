/**
 * Yield distributions: pro-rata allocations over the token balances of an offering, committed in a
 * SHA-256 Merkle tree (the same construction as the Data Room, see merkle.ts). The issuer anchors
 * the root with RwaxiPropertyToken.anchorDistributionRoot(distributionId, root, totalAmountCents,
 * snapshotSupply); each investor verifies their allocation with its proof against that root.
 *
 *   leaf = evidenceHash({ v: 1, kind: "rwaxi.distribution.allocation", distributionId, wallet, units, amountCents })
 *
 * Amounts are integer cents. The split uses the largest-remainder method, so the allocations add up
 * exactly to the declared total; ties go to the larger holding, then to the lower key.
 */
import { evidenceHash } from "./canonical";
import { buildMerkleTree, getMerkleProof, toBytes32, verifyMerkleProof, type Bytes32 } from "./merkle";

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
  amountCents: number;
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
  return evidenceHash({
    v: 1,
    kind: "rwaxi.distribution.allocation",
    distributionId: toBytes32(claim.distributionId),
    wallet: claim.wallet.toLowerCase(),
    units: claim.units,
    amountCents: claim.amountCents,
  });
}

/** Allocations, leaves, proofs and root of a distribution of `totalCents` over `holdings`. */
export function buildDistribution(
  distributionId: string,
  totalCents: number,
  holdings: readonly DistributionHolding[],
): { root: Bytes32; totalUnits: number; allocations: DistributionAllocation[] } {
  if (new Set(holdings.map((h) => h.wallet.toLowerCase())).size !== holdings.length) {
    throw new Error("each wallet may appear only once");
  }
  const cents = prorataCents(totalCents, holdings);
  const drafts = holdings.map((h) => {
    const amountCents = cents.get(h.key)!;
    return { ...h, wallet: h.wallet.toLowerCase(), amountCents, leaf: allocationLeaf({ distributionId, wallet: h.wallet, units: h.units, amountCents }) };
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
