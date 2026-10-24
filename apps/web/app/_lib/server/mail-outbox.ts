import "server-only";
import type { Prisma } from "@rwaxi/database";

/**
 * Queues an email in mail_outbox (same transaction as the change that sends it). Until an SMTP provider delivers
 * them, local development reads them here — and in the dev server log — and the E2E suites from the database.
 */
export async function queueMail(
  db: Prisma.TransactionClient,
  mail: {
    organizationId: string | null;
    purpose: "INVESTOR_OTP" | "STAFF_INVITATION";
    to: string;
    subject: string;
    body: string;
  },
): Promise<void> {
  await db.mailOutbox.create({
    data: {
      organizationId: mail.organizationId,
      purpose: mail.purpose,
      toEmail: mail.to,
      subject: mail.subject,
      body: mail.body,
    },
  });
  if (process.env.NODE_ENV !== "production") {
    console.info(`[mail-outbox] ${mail.purpose} → ${mail.to} · ${mail.subject}\n${mail.body}`);
  }
}
