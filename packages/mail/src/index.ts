/**
 * @rwaxi/mail: delivery of the platform's outgoing email (mail_outbox) through Resend, Postmark or a signed
 * webhook — the development sink outside production — with the bodies that carry secrets (OTP codes, activation
 * links) cleared from the database as soon as they are no longer needed.
 */
export {
  DeliveryError,
  DevDriver,
  PostmarkDriver,
  ResendDriver,
  UnconfiguredDriver,
  WebhookDriver,
  mailDriverFromEnv,
} from "./drivers";
export type { DeliveryResult, DriverName, MailDriver, OutgoingMail } from "./drivers";
export { LEASE_MS, MAX_ATTEMPTS, MailDispatcher, bodySha256, redactMail, transition } from "./dispatcher";
export type { DeliveryOutcome, RunInDb, Transition } from "./dispatcher";
