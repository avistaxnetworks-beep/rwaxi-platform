/**
 * Platform fee agreed between RWAXI and each developer, in basis points (1 bps = 0.01 %): from 25 (0.25 %) to
 * 500 (5 %). RwaxiPropertyToken enforces the same range (MIN/MAX_PLATFORM_FEE_BPS, InvalidPlatformFee), fixes the
 * value when the token is deployed and declares it on every issuance (PlatformFeeAccrued); RWAXI invoices it to the
 * developer off-chain. Pure: shared by the app (forms, server actions, accrual) and the EVM adapter.
 */
export const PLATFORM_FEE_BPS_MIN = 25;
export const PLATFORM_FEE_BPS_MAX = 500;

/** Whether `value` is a whole number of basis points within the agreed range. */
export const isPlatformFeeBps = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= PLATFORM_FEE_BPS_MIN && value <= PLATFORM_FEE_BPS_MAX;

/**
 * Basis points typed by a person ("120", " 120 "), or null when it is not a whole number within 25–500. Decimal
 * points, signs, exponents and anything else are refused: "1.2" is not 120 bps.
 */
export function parsePlatformFeeBps(raw: unknown): number | null {
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!/^\d{1,4}$/.test(text)) return null;
  const value = Number(text);
  return isPlatformFeeBps(value) ? value : null;
}

/** The fee on `capitalCents` (USD cents) at `bps`, rounded half up to the cent. */
export function platformFeeCents(capitalCents: bigint, bps: number): bigint {
  if (!isPlatformFeeBps(bps)) throw new RangeError(`platform fee out of range: ${bps} bps`);
  if (capitalCents < 0n) throw new RangeError("capital must not be negative");
  return (capitalCents * BigInt(bps) + 5_000n) / 10_000n;
}

/** "1,20 %" — the fee as a percentage, for people (es-CO by default). */
export const platformFeePercent = (bps: number, locale = "es-CO"): string =>
  `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bps / 100)} %`;
