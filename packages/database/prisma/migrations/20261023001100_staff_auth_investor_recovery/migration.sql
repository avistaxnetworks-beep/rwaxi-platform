-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Staff authentication (developer backoffice + RWAXI console), investor session
-- recovery by one-time code, and the mail outbox.
--
--   users            scrypt password hash, TOTP secret sealed with AES-256-GCM, MFA enrolment,
--                    lockout counters. Still under tenant RLS (console staff have no organization).
--   user_sessions    SHA-256 of the session token, scope TENANT (one organization, RLS) or
--                    PLATFORM (organization-less, only the BYPASSRLS console role sees them).
--   investor_otps    HMAC of 6-digit codes that recover an investor's portal session (10 minutes).
--   mail_outbox      outgoing email (OTP codes) until an SMTP provider delivers it.
--   audit_events     console logins are the only events without an organization (CHECK).
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "SessionScope" AS ENUM ('TENANT', 'PLATFORM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'LOGIN_SUCCEEDED';
ALTER TYPE "AuditAction" ADD VALUE 'LOGIN_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'MFA_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'MFA_ENROLLED';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNT_LOCKED';
ALTER TYPE "AuditAction" ADD VALUE 'LOGOUT';
ALTER TYPE "AuditAction" ADD VALUE 'INVESTOR_SESSION_RECOVERED';
ALTER TYPE "AuditAction" ADD VALUE 'INVESTOR_OTP_FAILED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_login_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "locked_until" TIMESTAMP(3),
ADD COLUMN     "mfa_enrolled_at" TIMESTAMP(3),
ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "totp_last_step" INTEGER,
ADD COLUMN     "totp_secret_enc" TEXT;

-- AlterTable
ALTER TABLE "audit_events" ALTER COLUMN "organization_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "user_id" TEXT NOT NULL,
    "scope" "SessionScope" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "mfa_verified_at" TIMESTAMP(3),
    "mfa_attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_otps" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_outbox" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "purpose" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "mail_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_organization_id_idx" ON "user_sessions"("organization_id");

-- CreateIndex
CREATE INDEX "investor_otps_investor_id_created_at_idx" ON "investor_otps"("investor_id", "created_at");

-- CreateIndex
CREATE INDEX "investor_otps_organization_id_created_at_idx" ON "investor_otps"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "mail_outbox_to_email_created_at_idx" ON "mail_outbox"("to_email", "created_at");

-- CreateIndex
CREATE INDEX "mail_outbox_organization_id_created_at_idx" ON "mail_outbox"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_otps" ADD CONSTRAINT "investor_otps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_otps" ADD CONSTRAINT "investor_otps_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_outbox" ADD CONSTRAINT "mail_outbox_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Integrity
-- ─────────────────────────────────────────────────────────────────────────────
-- Console logins have no organization: only authentication events may omit it. (Compared as text:
-- the enum values above are added in this same transaction.)
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_platform_auth" CHECK (
  "organization_id" IS NOT NULL
  OR "action"::text IN ('LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'MFA_FAILED', 'MFA_ENROLLED', 'ACCOUNT_LOCKED', 'LOGOUT')
);

ALTER TABLE "users" ADD CONSTRAINT "users_failed_login_count_range" CHECK ("failed_login_count" >= 0);
-- An enrolled MFA always has its sealed secret.
ALTER TABLE "users" ADD CONSTRAINT "users_mfa_needs_secret" CHECK ("mfa_enrolled_at" IS NULL OR "totp_secret_enc" IS NOT NULL);

-- A PLATFORM session has no organization; a TENANT session always has one.
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_scope_org" CHECK (("scope" = 'PLATFORM') = ("organization_id" IS NULL));
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_mfa_attempts_range" CHECK ("mfa_attempts" >= 0);
ALTER TABLE "investor_otps" ADD CONSTRAINT "investor_otps_attempts_range" CHECK ("attempts" >= 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tenant isolation (fail-closed, as every tenant table): a PLATFORM session or a console email
-- (organization_id NULL) never matches the app role's tenant, so only the console role reads them.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_sessions', 'investor_otps', 'mail_outbox'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("organization_id" = rwaxi_current_org()) '
      'WITH CHECK ("organization_id" = rwaxi_current_org())', t);
  END LOOP;
END $$;

-- A session belongs to a user of its own organization (both NULL for the console); an OTP to an
-- investor of its own organization.
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "user_sessions"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant('users', 'user_id');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "investor_otps"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant('investors', 'investor_id');
