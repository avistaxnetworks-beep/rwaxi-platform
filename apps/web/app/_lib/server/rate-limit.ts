import "server-only";
import crypto from "node:crypto";
import { prisma, retryTransient } from "@rwaxi/database";

/**
 * Platform rate limits counted in PostgreSQL (rwaxi_rate_limit_hit, SECURITY DEFINER): shared by every server
 * instance — a serverless deployment has no common memory — and out of the app role's reach otherwise. A refused
 * hit is not recorded. Resolves with the seconds to wait: 0 when the hit was allowed.
 */
export async function hitRateLimit(bucket: string, windowSeconds: number, max: number): Promise<number> {
  const [row] = await retryTransient(
    () =>
      prisma.$queryRaw<{ wait: number }[]>`
        SELECT rwaxi_rate_limit_hit(${bucket}, ${windowSeconds}::integer, ${max}::integer) AS wait`,
    { repeatable: false }, // it records the hit: repeated only if it never reached the database
  );
  return Number(row?.wait ?? 0);
}

/** A bucket for an IP address: never the address itself, only a hash of it. */
export const ipBucket = (scope: string, ip: string): string =>
  `${scope}:ip:${crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
