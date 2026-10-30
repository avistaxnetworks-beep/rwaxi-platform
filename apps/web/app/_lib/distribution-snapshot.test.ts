import { test } from "node:test";
import assert from "node:assert/strict";
import { balancesAt, bogotaToday, confirmedMints, recordInstant, supplyAt, type OutboxRow } from "./distribution-snapshot";

test("the record date ends at 23:59:59 in Bogotá (UTC-5); today is the second before the declaration", () => {
  const now = new Date("2026-10-30T15:20:30.700Z"); // 10:20:30 in Bogotá
  assert.equal(bogotaToday(now), "2026-10-30");
  assert.deepEqual(recordInstant("2026-09-30", now), { seconds: Date.UTC(2026, 9, 1, 4, 59, 59) / 1000, today: false });
  assert.deepEqual(recordInstant("2026-10-30", now), { seconds: Math.floor(now.getTime() / 1000) - 1, today: true });
  assert.equal(recordInstant("2026-10-31", now), null); // future
  assert.equal(recordInstant("2026-02-30", now), null); // not a date
  assert.equal(recordInstant("30/09/2026", now), null);
  // 21:00 in Bogotá is already the next day in UTC: "today" is still the Bogotá date
  const evening = new Date("2026-10-31T02:00:00Z");
  assert.equal(bogotaToday(evening), "2026-10-30");
  assert.equal(recordInstant("2026-10-30", evening)?.today, true);
});

test("balances at an instant replay the confirmed mints of the offering's own token", () => {
  const token = "0x" + "a".repeat(40);
  const at = (iso: string) => new Date(iso);
  const mint = (wallet: string, amount: number, when: string, extra: Partial<OutboxRow> = {}): OutboxRow => ({
    kind: "SUBSCRIPTION_MINTED",
    status: "CONFIRMED",
    contractAddress: token.toUpperCase().replace("0X", "0x"),
    args: { investor: wallet, amount, subscriptionId: "0x" + "1".repeat(64) },
    executedAt: at(when),
    createdAt: at("2026-01-01T00:00:00Z"),
    ...extra,
  });
  const w1 = "0x" + "1".repeat(40);
  const w2 = "0x" + "2".repeat(40);
  const rows: OutboxRow[] = [
    mint(w1, 200, "2026-09-10T12:00:00Z"),
    mint(w2.toUpperCase().replace("0X", "0x"), 250, "2026-10-05T12:00:00Z"),
    mint(w1, 50, "2026-10-20T12:00:00Z"),
    mint(w2, 999, "2026-09-01T00:00:00Z", { status: "PENDING" }), // never confirmed
    mint(w2, 999, "2026-09-01T00:00:00Z", { contractAddress: "0x" + "b".repeat(40) }), // another (illustrative) token
    { ...mint(w1, 7, "2026-09-01T00:00:00Z"), kind: "DATA_ROOM_ROOT_ANCHORED" },
    // seeded history has no executedAt: it took effect when it was recorded
    mint(w2, 10, "2026-09-01T00:00:00Z", { executedAt: null, createdAt: at("2026-08-15T00:00:00Z") }),
  ];
  const moves = confirmedMints(rows, token);
  assert.equal(moves.length, 4);
  const endSeptember = recordInstant("2026-09-30", new Date("2026-10-30T15:00:00Z"))!.seconds;
  assert.deepEqual(Object.fromEntries(balancesAt(moves, endSeptember)), { [w1]: 200, [w2]: 10 });
  assert.equal(supplyAt(moves, endSeptember), 210);
  const later = Date.parse("2026-10-25T00:00:00Z") / 1000;
  assert.deepEqual(Object.fromEntries(balancesAt(moves, later)), { [w1]: 250, [w2]: 260 });
  assert.equal(supplyAt(moves, Date.parse("2026-08-01T00:00:00Z") / 1000), 0);
  // a mint at exactly the instant of record counts (the token's upperLookup is inclusive)
  assert.equal(supplyAt(moves, Date.parse("2026-09-10T12:00:00Z") / 1000), 210);
});
