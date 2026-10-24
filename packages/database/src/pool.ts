/**
 * Connection resilience for Neon (pooled endpoint through PgBouncer, and direct endpoints).
 *
 *   poolUrl(url)          Prisma pool settings the URL does not set itself (POOL_DEFAULTS)
 *   transientKind(e)      "not-sent" (pool exhausted, server unreachable) | "dropped" (connection lost) | null
 *   retryTransient(fn)    repeats `fn` after a transient failure when doing so cannot duplicate a write
 *   transaction(client)   interactive transaction retried only if it never started
 */
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * pool_timeout: seconds a query waits for a free connection during a burst (Prisma's default is 10).
 * max_idle_connection_lifetime: idle connections are closed after 30 s (default 300), before a dropped TCP
 * session or a suspended Neon compute leaves a dead connection in the pool. A URL value always wins.
 */
export const POOL_DEFAULTS: Readonly<Record<string, string>> = {
  pool_timeout: "15",
  max_idle_connection_lifetime: "30",
};

export function poolUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  for (const [key, value] of Object.entries(POOL_DEFAULTS))
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  return url.toString();
}

/** Prisma operations that only read: safe to repeat after a dropped connection. */
export const READ_OPERATIONS: ReadonlySet<string> = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

/** P2024 pool timeout, P1001 server unreachable, P1002 connection timed out: the query never reached the server. */
const NOT_SENT = new Set(["P2024", "P1001", "P1002"]);
const NOT_SENT_MESSAGE =
  /Timed out fetching a new connection|Unable to start a transaction in the given time/i;
/** P1017 and socket errors: the connection died with the query possibly executed. */
const DROPPED = new Set(["P1017"]);
const DROPPED_MESSAGE =
  /ConnectionReset|connection reset|ECONNRESET|EPIPE|server has closed the connection|connection terminated|forcibly closed/i;

export type TransientKind = "not-sent" | "dropped" | null;

export function transientKind(e: unknown): TransientKind {
  const err = (e ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof err.code === "string" ? err.code : "";
  const message = typeof err.message === "string" ? err.message : "";
  if (NOT_SENT.has(code) || NOT_SENT_MESSAGE.test(message)) return "not-sent";
  if (DROPPED.has(code) || DROPPED_MESSAGE.test(message)) return "dropped";
  return null;
}

export interface RetryOptions {
  /** the operation only reads: repeat it after a dropped connection too */
  repeatable?: boolean;
  /** extra condition checked before each retry (e.g. the transaction never started) */
  canRetry?: () => boolean;
  /** total attempts (default 2: one retry) */
  attempts?: number;
  /** base backoff in ms, doubled per retry (default 250) */
  backoffMs?: number;
}

/**
 * Runs `fn` and repeats it after a transient connection failure: always when the query never reached the
 * database, and after a dropped connection only when `repeatable`. Any other error propagates unchanged.
 */
export async function retryTransient<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { repeatable = false, canRetry = () => true, attempts = 2, backoffMs = 250 } = options;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const kind = transientKind(e);
      const retry =
        attempt < attempts && canRetry() && (kind === "not-sent" || (kind === "dropped" && repeatable));
      if (!retry) throw e;
      await new Promise((resolve) =>
        setTimeout(resolve, backoffMs * 2 ** (attempt - 1) + Math.random() * 100),
      );
    }
  }
}

type TxOptions = { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel };

/**
 * Interactive transaction on `client`, retried only when it could not start (no free connection, server
 * unreachable): once `fn` runs, a failure is never repeated, so a write is never applied twice.
 */
export async function transaction<T>(
  client: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: TxOptions,
): Promise<T> {
  let started = false;
  return retryTransient(
    () =>
      client.$transaction((tx) => {
        started = true;
        return fn(tx);
      }, options),
    { canRetry: () => !started },
  );
}
