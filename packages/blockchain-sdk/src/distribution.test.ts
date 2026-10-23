import { test } from "node:test";
import assert from "node:assert/strict";
import { allocationLeaf, buildDistribution, prorataCents, verifyAllocation } from "./distribution";
import { verifyMerkleProof } from "./merkle";

const DIST = `0x${"d".repeat(64)}`;
const wallet = (c: string) => `0x${c.repeat(40)}`;

test("pro-rata shares add up exactly to the total (largest remainder)", () => {
  const cents = prorataCents(1_000_000, [
    { key: "laura", units: 200 },
    { key: "maria", units: 250 },
  ]);
  // 444,444.44… and 555,555.55…: the remaining cent goes to the larger remainder
  assert.equal(cents.get("laura"), 444_444);
  assert.equal(cents.get("maria"), 555_556);

  const three = prorataCents(100, [
    { key: "a", units: 1 },
    { key: "b", units: 1 },
    { key: "c", units: 1 },
  ]);
  assert.deepEqual([...three.values()].sort(), [33, 33, 34]);
  assert.equal(three.get("a"), 34); // equal remainders and holdings: lowest key
});

test("exact arithmetic beyond 2^53 intermediate products", () => {
  const cents = prorataCents(10_000_000_000, [
    { key: "x", units: 999_999 },
    { key: "y", units: 1 },
  ]);
  assert.equal(cents.get("x")! + cents.get("y")!, 10_000_000_000);
  assert.equal(cents.get("y"), 10_000);
});

test("rejects empty, duplicated or non-integer inputs", () => {
  assert.throws(() => prorataCents(0, [{ key: "a", units: 1 }]));
  assert.throws(() => prorataCents(10, []));
  assert.throws(() => prorataCents(10, [{ key: "a", units: 1.5 }]));
  assert.throws(() => prorataCents(10, [{ key: "a", units: 1 }, { key: "a", units: 2 }]));
  assert.throws(() => buildDistribution(DIST, 10, [{ key: "a", wallet: wallet("a"), units: 1 }, { key: "b", wallet: wallet("A"), units: 1 }]));
});

test("every allocation proves its inclusion; a tampered claim does not", () => {
  const holdings = ["1", "2", "3", "4", "5"].map((c, i) => ({ key: `inv${c}`, wallet: wallet(c), units: (i + 1) * 10 }));
  const d = buildDistribution(DIST, 123_457, holdings);
  assert.equal(d.totalUnits, 150);
  assert.equal(d.allocations.reduce((s, a) => s + a.amountCents, 0), 123_457);
  for (const a of d.allocations) {
    assert.ok(verifyMerkleProof(a.leaf, a.proof, d.root));
    assert.ok(verifyAllocation({ distributionId: DIST, wallet: a.wallet, units: a.units, amountCents: a.amountCents }, a.proof, d.root));
    assert.equal(verifyAllocation({ distributionId: DIST, wallet: a.wallet, units: a.units, amountCents: a.amountCents + 1 }, a.proof, d.root), false);
  }
  const first = d.allocations[0]!;
  assert.equal(verifyAllocation({ distributionId: `0x${"e".repeat(64)}`, wallet: first.wallet, units: first.units, amountCents: first.amountCents }, first.proof, d.root), false);
});

test("leaves are deterministic and bound to the distribution, wallet, units and amount", () => {
  const claim = { distributionId: DIST, wallet: wallet("A"), units: 10, amountCents: 500 };
  assert.equal(allocationLeaf(claim), allocationLeaf({ ...claim, wallet: wallet("a") }));
  assert.notEqual(allocationLeaf(claim), allocationLeaf({ ...claim, units: 11 }));
  const single = buildDistribution(DIST, 500, [{ key: "only", wallet: wallet("a"), units: 10 }]);
  assert.equal(single.root, single.allocations[0]!.leaf);
  assert.deepEqual(single.allocations[0]!.proof, []);
});
