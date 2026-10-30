import { test } from "node:test";
import assert from "node:assert/strict";
import { PLATFORM_FEE_BPS_MAX, PLATFORM_FEE_BPS_MIN, isPlatformFeeBps, parsePlatformFeeBps, platformFeeCents, platformFeePercent } from "./platform-fee";

test("the agreed range is 25–500 basis points (0.25 %–5 %), whole numbers only", () => {
  assert.equal(PLATFORM_FEE_BPS_MIN, 25);
  assert.equal(PLATFORM_FEE_BPS_MAX, 500);
  for (const ok of [25, 120, 500]) assert.ok(isPlatformFeeBps(ok), String(ok));
  for (const bad of [0, 24, 501, 120.5, Number.NaN, "120", null]) assert.ok(!isPlatformFeeBps(bad), String(bad));
});

test("typed values: whole basis points within range, nothing else", () => {
  assert.equal(parsePlatformFeeBps("120"), 120);
  assert.equal(parsePlatformFeeBps(" 25 "), 25);
  assert.equal(parsePlatformFeeBps(500), 500);
  for (const bad of ["24", "501", "1.2", "1,2", "-30", "1e2", "", "abc", "0120x"]) {
    assert.equal(parsePlatformFeeBps(bad), null, bad);
  }
});

test("the fee on a capital is exact in cents (half up)", () => {
  assert.equal(platformFeeCents(2_500_000n, 120), 30_000n); // 25.000 USD × 1,20 % = 300 USD
  assert.equal(platformFeeCents(10_000n, 25), 25n); // 100 USD × 0,25 % = 0,25 USD
  assert.equal(platformFeeCents(333n, 150), 5n); // 3,33 USD × 1,5 % = 0,04995 → 0,05
  assert.throws(() => platformFeeCents(1n, 501), RangeError);
});

test("as a percentage for people", () => {
  assert.equal(platformFeePercent(120), "1,20 %");
  assert.equal(platformFeePercent(25, "en-US"), "0.25 %");
});
