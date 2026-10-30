// Pure (browser and server): the instant of record of a yield distribution and the token balances at that instant,
// replayed from the confirmed mints of the offering's token. The token keeps the same history on-chain
// (RwaxiPropertyToken.balanceOfAt / totalSupplyAt, keyed by block timestamp) and its anchorDistributionRoot() refuses
// a snapshot supply that differs from it (SnapshotSupplyMismatch).

/** Colombia (America/Bogota) keeps UTC-5 all year: no daylight saving time. */
const BOGOTA_UTC_OFFSET_H = 5;
export const RECORD_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in Bogotá (YYYY-MM-DD): after 19:00 there the UTC date is already tomorrow. */
export function bogotaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(now);
}

export interface RecordInstant {
  /** unix seconds: the token's checkpoints are keyed by block timestamp */
  seconds: number;
  /** the record date is today: the instant is the declaration itself */
  today: boolean;
}

/**
 * The instant of record of `recordDate` (YYYY-MM-DD, Bogotá): the last second of that day or, when it is today, the
 * second before `now` (the token only answers for instants already past). Null for an invalid or future date.
 */
export function recordInstant(recordDate: string, now: Date = new Date()): RecordInstant | null {
  if (!RECORD_DATE.test(recordDate)) return null;
  const [y, m, d] = recordDate.split("-").map(Number) as [number, number, number];
  const midnight = Date.UTC(y, m - 1, d);
  if (Number.isNaN(midnight) || new Date(midnight).toISOString().slice(0, 10) !== recordDate) return null;
  const today = bogotaToday(now);
  if (recordDate > today) return null;
  if (recordDate === today) return { seconds: Math.floor(now.getTime() / 1000) - 1, today: true };
  return { seconds: Math.floor(Date.UTC(y, m - 1, d + 1, BOGOTA_UTC_OFFSET_H) / 1000) - 1, today: false };
}

/** Tokens a wallet received (mint) at an instant: the only movement the platform makes on a token. */
export interface TokenMovement {
  /** lowercase */
  wallet: string;
  units: number;
  /** unix seconds the movement took effect */
  at: number;
}

/** Units per wallet at `seconds` (the movements at or before it); wallets without units are left out. */
export function balancesAt(movements: readonly TokenMovement[], seconds: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of movements) if (m.at <= seconds) out.set(m.wallet, (out.get(m.wallet) ?? 0) + m.units);
  for (const [wallet, units] of out) if (units <= 0) out.delete(wallet);
  return out;
}

/** What the replay reads of an outbox row (ChainTransaction). */
export interface OutboxRow {
  kind: string;
  status: string;
  contractAddress: string;
  args: unknown;
  executedAt: Date | null;
  createdAt: Date;
}

const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : null);

/**
 * The confirmed mintSubscription() calls on `token`, as movements: each one took effect when it was confirmed
 * (seeded history, without executedAt, when it was recorded). Mints on another address — e.g. an earlier,
 * illustrative token of the offering — are not balances of this one.
 */
export function confirmedMints(rows: readonly OutboxRow[], token: string): TokenMovement[] {
  const address = token.toLowerCase();
  return rows.flatMap((t) => {
    if (t.kind !== "SUBSCRIPTION_MINTED" || t.status !== "CONFIRMED" || lower(t.contractAddress) !== address) return [];
    const args = (t.args ?? {}) as { investor?: unknown; amount?: unknown };
    const wallet = lower(args.investor);
    const units = Number(args.amount);
    if (!wallet || !Number.isSafeInteger(units) || units <= 0) return [];
    return [{ wallet, units, at: Math.floor((t.executedAt ?? t.createdAt).getTime() / 1000) }];
  });
}

/** Total units at `seconds`: what RwaxiPropertyToken.totalSupplyAt(seconds) answers for the same history. */
export const supplyAt = (movements: readonly TokenMovement[], seconds: number) =>
  [...balancesAt(movements, seconds).values()].reduce((s, u) => s + u, 0);
