import "server-only";
import { after } from "next/server";
import { DeliveryError } from "@rwaxi/mail";
import { ROOT_DOMAIN } from "@/app/_lib/hosts";
import { mailDriver } from "./mail-outbox";
import { leadNotificationMail, welcomeMail, type ComposedMail, type VitrinaLead, type WelcomeInput } from "./vitrina-mail";

/**
 * Emails that follow an acceptance of the vitrina's legal wall. They have no tenant, so they do not go through
 * mail_outbox (a tenant table under RLS): the configured driver of @rwaxi/mail (Resend, Postmark, a signed webhook;
 * the server log outside production) delivers them after the response is sent (`after()`), so the visitor never
 * waits for a mail provider and a failed delivery never undoes the acceptance — the lead itself is already in
 * vitrina_access_acceptances. Transient failures are retried a few times in that same background task, with the
 * mail id as the provider's idempotency key; whatever still fails goes to the server log with the acceptance id.
 */

/**
 * The investor's welcome email (welcomeMail). Off until the mail provider is configured and its copy approved:
 * set it to true to send it after each acceptance.
 */
export const VITRINA_WELCOME_MAIL = false;

const RETRY_DELAYS_MS = [2_000, 8_000];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Delivers one mail with bounded retries; never throws (it runs after the response). */
async function deliver(mail: ComposedMail, kind: string): Promise<void> {
  const driver = mailDriver();
  if (!driver) {
    console.error(`[mail] ${kind} ${mail.id}: no mail driver configured, not sent`);
    return;
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await driver.send(mail);
      if (result.kind === "sent") console.info(`[mail] ${kind} ${mail.id}: sent (${driver.name})`);
      return;
    } catch (e) {
      const permanent = e instanceof DeliveryError && e.permanent;
      const delay = RETRY_DELAYS_MS[attempt];
      if (permanent || delay === undefined) {
        console.error(`[mail] ${kind} ${mail.id}: delivery failed (${driver.name}): ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      await sleep(delay);
    }
  }
}

/** Notifies RWAXI's leads inbox of a new acceptance of the legal wall, after the response. */
export function notifyVitrinaLead(lead: VitrinaLead): void {
  const mail = leadNotificationMail(lead);
  after(() => deliver(mail, "vitrina lead"));
}

/** Absolute URL of the vitrina in this deployment (dev: http://localhost:3000). */
export const vitrinaUrl = (): string =>
  ROOT_DOMAIN.startsWith("localhost") ? `http://${ROOT_DOMAIN}` : `https://www.${ROOT_DOMAIN}`;

/** Sends the investor their welcome (access + the consents as accepted), after the response. */
export function sendVitrinaWelcome(input: Omit<WelcomeInput, "vitrinaUrl">): void {
  const mail = welcomeMail({ ...input, vitrinaUrl: vitrinaUrl() });
  after(() => deliver(mail, "vitrina welcome"));
}
