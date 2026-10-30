import "server-only";
import { after } from "next/server";
import { withTenant, type Prisma } from "@rwaxi/database";
import { MailDispatcher, bodySha256, mailDriverFromEnv, redactMail, type MailDriver, type RunInDb } from "@rwaxi/mail";

/**
 * Outgoing email (mail_outbox), delivered by the MailDispatcher of @rwaxi/mail: Resend, Postmark or a signed
 * webhook when configured (MAIL_DRIVER, RESEND_API_KEY…, MAIL_FROM); outside production, the development sink —
 * the server log, with the row readable until its code or link is used or expires (what local development and the
 * E2E suites read). A body is cleared as soon as it is no longer needed: delivered by a provider, used, replaced
 * (redactMail, in the transaction that uses or replaces it) or expired (rwaxi_redact_expired_mail).
 */
let dispatcher: MailDispatcher | null | undefined;
function mailer(): MailDispatcher | null {
  if (dispatcher === undefined) {
    try {
      dispatcher = new MailDispatcher(mailDriverFromEnv());
    } catch (e) {
      // A misconfigured provider must not break the action that queued the mail: it stays PENDING (and is
      // cleared when it expires); `pnpm mail:dispatch` retries once the configuration is fixed.
      console.error(`[mail] ${e instanceof Error ? e.message : String(e)}`);
      dispatcher = null;
    }
  }
  return dispatcher;
}

/** The configured mail driver (null if misconfigured), for platform mails that have no tenant outbox. */
export const mailDriver = (): MailDriver | null => mailer()?.driver ?? null;

/** Delivers one queued mail of a tenant and clears expired ones; never throws (it runs after the response). */
async function deliver(organizationId: string, id: string): Promise<void> {
  const m = mailer();
  if (!m) return;
  const run: RunInDb = (fn) => withTenant(organizationId, fn);
  try {
    const outcome = await m.deliver(run, id);
    if (outcome === "retry" || outcome === "failed")
      console.error(`[mail] ${id}: delivery ${outcome} (${m.driver.name})`);
    await m.sweepExpired(run);
  } catch (e) {
    console.error(`[mail] ${id}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Queues an email in the caller's transaction. It is delivered after the response is sent — once that transaction
 * committed —, so how long an answer takes never tells whether an email went out (e.g. a recovery code requested
 * for an address that is not an investor's).
 */
export async function queueMail(
  db: Prisma.TransactionClient,
  mail: {
    organizationId: string;
    purpose: "INVESTOR_OTP" | "STAFF_INVITATION";
    to: string;
    subject: string;
    body: string;
    /** the investor_otps / user_invitations row whose code or link the body carries */
    relatedId: string;
    /** when that code or link stops working: the body is cleared then at the latest */
    expiresAt: Date;
  },
): Promise<void> {
  const row = await db.mailOutbox.create({
    data: {
      organizationId: mail.organizationId,
      purpose: mail.purpose,
      toEmail: mail.to,
      subject: mail.subject,
      body: mail.body,
      bodySha256: bodySha256(mail.body),
      relatedId: mail.relatedId,
      expiresAt: mail.expiresAt,
    },
    select: { id: true },
  });
  after(() => deliver(mail.organizationId, row.id));
}

/**
 * Clears, in the caller's transaction, the mails that carried these codes or links — used (CONSUMED), replaced by a
 * newer one (SUPERSEDED) or dead (EXPIRED) — keeping their delivery metadata.
 */
export const redactMailFor = (
  db: Prisma.TransactionClient,
  relatedIds: string[],
  reason: "CONSUMED" | "SUPERSEDED" | "EXPIRED",
): Promise<number> => redactMail(db, relatedIds, reason);
