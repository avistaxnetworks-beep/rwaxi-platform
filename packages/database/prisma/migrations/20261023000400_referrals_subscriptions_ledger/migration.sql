-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Signed referrals, persisted subscriptions and RWAXI fee ledger names
--
-- Enum values are renamed in place (RENAME VALUE keeps existing rows); Prisma's
-- default diff would recreate the types and fail to cast the old values.
-- ════════════════════════════════════════════════════════════════════════════

-- Lead attribution: RWAXI → REFERRAL (vitrina token, HMAC-verified, single use).
ALTER TYPE "LeadSource" RENAME VALUE 'RWAXI' TO 'REFERRAL';

-- B2B fee ledger kinds.
ALTER TYPE "FeeKind" RENAME VALUE 'SETUP' TO 'ONBOARDING_SETUP';
ALTER TYPE "FeeKind" RENAME VALUE 'SAAS' TO 'MONTHLY_SAAS';
ALTER TYPE "FeeKind" RENAME VALUE 'USAGE' TO 'INFRASTRUCTURE_USAGE';

-- Subscription confirmed on a deployed token: mintSubscription() queued as ChainTransaction PENDING.
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'MINT_PENDING' AFTER 'RESERVED';

-- Investor-side audit event.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_CREATED';

-- Committed units per offering; the CHECK makes over-subscription impossible even under races.
ALTER TABLE "offerings" ADD COLUMN "units_subscribed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_units_subscribed_range"
  CHECK ("units_subscribed" >= 0 AND "units_subscribed" <= "total_units");
