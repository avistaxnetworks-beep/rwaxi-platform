import { createHash } from "node:crypto";
import type { MailRedaction, Prisma } from "@rwaxi/database";
import { DeliveryError, type DeliveryResult, type MailDriver } from "./drivers";

/**
 * MailDispatcher: delivers mail_outbox rows through a MailDriver and keeps their secrets out of the database.
 *
 *   PENDING ──send──▶ SENT       accepted by the provider: the body is cleared at once (redaction SENT)
 *           ──dev───▶ CAPTURED   the development sink: the body stays until what it carries is used or expires
 *           ──refused permanently, or MAX_ATTEMPTS times──▶ FAILED (body cleared)
 *   any open body ──code/link used, replaced or expired──▶ cleared (CONSUMED · SUPERSEDED · EXPIRED);
 *                   a PENDING one is CANCELLED: it will not be delivered.
 *
 * One attempt at a time per mail (a lease on last_attempt_at), never after what it carries expired; the
 * provider's idempotency key is the row id, so a retried attempt is not sent twice. The body's SHA-256, the
 * provider's message id and the timestamps remain as the delivery's audit trail.
 */
export const MAX_ATTEMPTS = 5;
/** An attempt that did not finish within this window (the process died mid-send) may be retried. */
export const LEASE_MS = 2 * 60_000;

/** SHA-256 (hex) of a body as queued, kept in body_sha256: the delivery stays provable after redaction. */
export const bodySha256 = (body: string): string => createHash("sha256").update(body, "utf8").digest("hex");

/** Runs `fn` against the database: a tenant-bound transaction in the app (RLS), the owner client in jobs. */
export type RunInDb = <T>(fn: (db: Prisma.TransactionClient) => Promise<T>) => Promise<T>;

export type Transition =
  | { status: "SENT"; providerMessageId: string | null }
  | { status: "CAPTURED" }
  | { status: "FAILED"; error: string }
  | { status: "PENDING"; error: string };

/** What one delivery attempt (its `attempts`-th) makes of a PENDING mail. Pure. */
export function transition(
  outcome: DeliveryResult | unknown,
  attempts: number,
  maxAttempts = MAX_ATTEMPTS,
): Transition {
  if (outcome && typeof outcome === "object" && !(outcome instanceof Error) && "kind" in outcome) {
    const result = outcome as DeliveryResult;
    return result.kind === "sent"
      ? { status: "SENT", providerMessageId: result.providerMessageId }
      : { status: "CAPTURED" };
  }
  const error = (outcome instanceof Error ? outcome.message : String(outcome)).slice(0, 500);
  const permanent = outcome instanceof DeliveryError && outcome.permanent;
  return permanent || attempts >= maxAttempts ? { status: "FAILED", error } : { status: "PENDING", error };
}

export type DeliveryOutcome = "sent" | "captured" | "retry" | "failed" | "skipped";

/** Writes a transition; a mail redacted while its delivery was in flight still records that it went out. */
async function apply(db: Prisma.TransactionClient, id: string, t: Transition, at: Date): Promise<void> {
  switch (t.status) {
    case "SENT": {
      const done = await db.mailOutbox.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "SENT",
          sentAt: at,
          providerMessageId: t.providerMessageId,
          lastError: null,
          body: null,
          redactedAt: at,
          redactionReason: "SENT",
        },
      });
      if (!done.count) {
        await db.mailOutbox.updateMany({
          where: { id, status: "CANCELLED" },
          data: { status: "SENT", sentAt: at, providerMessageId: t.providerMessageId },
        });
      }
      return;
    }
    case "CAPTURED": {
      const done = await db.mailOutbox.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "CAPTURED", sentAt: at, lastError: null },
      });
      if (!done.count)
        await db.mailOutbox.updateMany({
          where: { id, status: "CANCELLED" },
          data: { status: "CAPTURED", sentAt: at },
        });
      return;
    }
    case "FAILED":
      await db.mailOutbox.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "FAILED", lastError: t.error, body: null, redactedAt: at, redactionReason: "FAILED" },
      });
      return;
    case "PENDING":
      await db.mailOutbox.updateMany({ where: { id, status: "PENDING" }, data: { lastError: t.error } });
  }
}

export class MailDispatcher {
  constructor(
    readonly driver: MailDriver,
    private readonly options: { maxAttempts?: number; leaseMs?: number; now?: () => Date } = {},
  ) {}

  private now = () => this.options.now?.() ?? new Date();
  private get max() {
    return this.options.maxAttempts ?? MAX_ATTEMPTS;
  }

  /** PENDING rows an attempt may take now: under the attempt limit, lease free, content not expired. */
  private due(now: Date): Prisma.MailOutboxWhereInput {
    return {
      status: "PENDING",
      attempts: { lt: this.max },
      OR: [
        { lastAttemptAt: null },
        { lastAttemptAt: { lt: new Date(now.getTime() - (this.options.leaseMs ?? LEASE_MS)) } },
      ],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    };
  }

  /** One delivery attempt of mail `id`, if this caller can claim it. */
  async deliver(run: RunInDb, id: string): Promise<DeliveryOutcome> {
    const started = this.now();
    const mail = await run(async (db) => {
      const claimed = await db.mailOutbox.updateMany({
        where: { id, ...this.due(started) },
        data: { attempts: { increment: 1 }, lastAttemptAt: started, provider: this.driver.name },
      });
      return claimed.count === 1 ? db.mailOutbox.findUnique({ where: { id } }) : null;
    });
    if (!mail?.body) return "skipped";
    let outcome: unknown;
    try {
      outcome = await this.driver.send({
        id: mail.id,
        to: mail.toEmail,
        subject: mail.subject,
        text: mail.body,
      });
    } catch (e) {
      outcome = e;
    }
    const t = transition(outcome, mail.attempts, this.max);
    await run((db) => apply(db, mail.id, t, this.now()));
    return t.status === "SENT"
      ? "sent"
      : t.status === "CAPTURED"
        ? "captured"
        : t.status === "FAILED"
          ? "failed"
          : "retry";
  }

  /** Every mail due for an attempt (never tried, or whose last attempt failed and its lease ran out), oldest first. */
  async deliverPending(run: RunInDb, limit = 50): Promise<Record<DeliveryOutcome, number>> {
    const now = this.now();
    const counts: Record<DeliveryOutcome, number> = { sent: 0, captured: 0, retry: 0, failed: 0, skipped: 0 };
    // Attempts used up by attempts that never reported back: undeliverable.
    counts.failed += await run(async (db) => {
      const { count } = await db.mailOutbox.updateMany({
        where: {
          status: "PENDING",
          attempts: { gte: this.max },
          lastAttemptAt: { lt: new Date(now.getTime() - (this.options.leaseMs ?? LEASE_MS)) },
        },
        data: { status: "FAILED", body: null, redactedAt: now, redactionReason: "FAILED" },
      });
      return count;
    });
    const due = await run((db) =>
      db.mailOutbox.findMany({
        where: this.due(now),
        orderBy: { createdAt: "asc" },
        take: limit,
        select: { id: true },
      }),
    );
    for (const { id } of due) counts[await this.deliver(run, id)]++;
    return counts;
  }

  /** Clears every mail whose code or link expired, in every tenant (rwaxi_redact_expired_mail). */
  async sweepExpired(run: RunInDb): Promise<number> {
    const [row] = await run((db) => db.$queryRaw<{ n: number }[]>`SELECT rwaxi_redact_expired_mail() AS n`);
    return Number(row?.n ?? 0);
  }
}

/**
 * Clears, in the caller's transaction, the bodies of the mails that carried these codes or links (investor_otps
 * or user_invitations ids) because they were used, replaced or expired. Delivery metadata stays; a mail still
 * PENDING is CANCELLED (it will not be delivered).
 */
export async function redactMail(
  db: Prisma.TransactionClient,
  relatedIds: string[],
  reason: Extract<MailRedaction, "CONSUMED" | "SUPERSEDED" | "EXPIRED">,
  now = new Date(),
): Promise<number> {
  if (!relatedIds.length) return 0;
  const cancelled = await db.mailOutbox.updateMany({
    where: { relatedId: { in: relatedIds }, status: "PENDING" },
    data: { status: "CANCELLED", body: null, redactedAt: now, redactionReason: reason },
  });
  const captured = await db.mailOutbox.updateMany({
    where: { relatedId: { in: relatedIds }, status: "CAPTURED", redactedAt: null },
    data: { body: null, redactedAt: now, redactionReason: reason },
  });
  return cancelled.count + captured.count;
}
