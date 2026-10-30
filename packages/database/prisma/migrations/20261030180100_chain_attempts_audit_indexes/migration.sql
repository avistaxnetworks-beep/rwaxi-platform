-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Global reports of the Super-Admin console
-- ════════════════════════════════════════════════════════════════════════════
-- chain_transactions.attempts / last_attempt_at: executions of a queued call that failed (the node refused it, it
--   reverted, a later step failed) — never the ones a precondition blocked. The console's operational health raises
--   its retry alerts from them.
-- audit_events: indexes for the console's cross-tenant trail (newest first, optionally by action), and console report
--   exports (PLATFORM_REPORT_EXPORTED) join the console logins as the only organization-less events.

-- AlterTable
ALTER TABLE "chain_transactions" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_attempt_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- CreateIndex
CREATE INDEX "audit_events_action_created_at_idx" ON "audit_events"("action", "created_at");



ALTER TABLE "chain_transactions" ADD CONSTRAINT "chain_transactions_attempts_check"
  CHECK ("attempts" >= 0 AND ("attempts" = 0) = ("last_attempt_at" IS NULL));

ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_platform_auth";
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_platform_auth" CHECK (
  "organization_id" IS NOT NULL
  OR "action"::text IN ('LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'MFA_FAILED', 'MFA_ENROLLED', 'ACCOUNT_LOCKED', 'LOGOUT',
                        'PLATFORM_REPORT_EXPORTED')
);
