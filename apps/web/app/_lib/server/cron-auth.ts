import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Authorization of RWAXI's internal jobs over HTTP (/api/internal/*: Vercel Cron, an external scheduler):
 * `Authorization: Bearer <CRON_SECRET>` — the header Vercel Cron sends when the project defines CRON_SECRET.
 * Both values are hashed (SHA-256) before a constant-time comparison, so neither the secret's length nor a matching
 * prefix shows in the response time, and a missing header is compared like a wrong one. Without a usable secret
 * (unset or shorter than CRON_SECRET_MIN_LENGTH) nothing runs: the endpoint fails closed (503).
 * Pure (no server-only import): cron-auth.test.ts runs it under Node.
 */
export const CRON_SECRET_MIN_LENGTH = 32;

export type CronAuth = { ok: true } | { ok: false; status: 401 | 503; error: string };

const BEARER = /^Bearer[ \t]+(\S+)[ \t]*$/i;
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest();

export function checkCronAuthorization(header: string | null | undefined, configured: string | undefined = process.env.CRON_SECRET): CronAuth {
  const secret = configured?.trim() ?? "";
  if (secret.length < CRON_SECRET_MIN_LENGTH) {
    return { ok: false, status: 503, error: `CRON_SECRET is not configured (at least ${CRON_SECRET_MIN_LENGTH} characters)` };
  }
  const presented = BEARER.exec(header ?? "")?.[1] ?? null;
  const match = timingSafeEqual(sha256(presented ?? ""), sha256(secret));
  return match && presented !== null ? { ok: true } : { ok: false, status: 401, error: "unauthorized" };
}
