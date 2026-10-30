import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceHash } from "./canonical";
import {
  PAYOUT_CURRENCIES,
  allocationLeaf,
  buildDistribution,
  isPayoutCurrency,
  isStablecoin,
  prorataCents,
  stablecoinBaseUnits,
  verifyAllocation,
} from "./distribution";
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

test("v2 leaves commit the payment currency; v1 leaves (USD cents) still verify", () => {
  const claim = { distributionId: DIST, wallet: wallet("b"), units: 25, amountCents: 1_234_500 };
  const v1 = allocationLeaf(claim);
  const cop = allocationLeaf({ ...claim, currency: "COP" });
  assert.notEqual(cop, v1);
  assert.notEqual(cop, allocationLeaf({ ...claim, currency: "USD" }));
  assert.equal(cop, evidenceHash({ v: 2, kind: "rwaxi.distribution.allocation", distributionId: DIST, wallet: wallet("b"), units: 25, currency: "COP", amountCents: 1_234_500 }));
  assert.throws(() => allocationLeaf({ ...claim, currency: "EUR" as never }));

  const holdings = [
    { key: "a", wallet: wallet("a"), units: 300 },
    { key: "c", wallet: wallet("c"), units: 150 },
  ];
  const d = buildDistribution(DIST, 4_100_000_000, holdings, "COP");
  for (const a of d.allocations) {
    const own = { distributionId: DIST, wallet: a.wallet, units: a.units, amountCents: a.amountCents };
    assert.ok(verifyAllocation({ ...own, currency: "COP" }, a.proof, d.root));
    assert.equal(verifyAllocation({ ...own, currency: "USD" }, a.proof, d.root), false); // the currency is part of the claim
    assert.equal(verifyAllocation(own, a.proof, d.root), false); // and a v1 reading of it does not verify
  }
  const legacy = buildDistribution(DIST, 1_000_000, holdings);
  assert.ok(legacy.allocations.every((a) => verifyAllocation({ distributionId: DIST, wallet: a.wallet, units: a.units, amountCents: a.amountCents }, a.proof, legacy.root)));
});

test("payout currencies: fiat through the fiduciary, USD stablecoins with 6 decimals", () => {
  assert.deepEqual([...PAYOUT_CURRENCIES], ["COP", "USD", "USDC", "USDT"]);
  assert.ok(isPayoutCurrency("USDT") && !isPayoutCurrency("usdt") && !isPayoutCurrency("EUR"));
  assert.ok(isStablecoin("USDC") && !isStablecoin("COP"));
  assert.equal(stablecoinBaseUnits(555_556), 5_555_560_000n); // 5,555.56 USDC
});
