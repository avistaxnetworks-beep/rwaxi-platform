-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Eligibility self-attestation on every new subscription
-- ════════════════════════════════════════════════════════════════════════════
-- Before signing, the investor declares their tax residence, their status (Regulation S: non-U.S. person investing
-- from outside the U.S.; Regulation D: accredited investor) and the lawful origin of their funds. subscribe()
-- validates it and stores it with the subscription, dated by the server, and the signed agreement (v4) cites it.
-- Subscriptions signed before this requirement keep the four columns NULL.

-- CreateEnum
CREATE TYPE "InvestorEligibilityStatus" AS ENUM ('REG_S', 'REG_D');

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "attested_at" TIMESTAMP(3),
ADD COLUMN     "investor_status" "InvestorEligibilityStatus",
ADD COLUMN     "lawful_funds" BOOLEAN,
ADD COLUMN     "tax_residence" TEXT;

-- All four or none; a recorded attestation always confirms the lawful origin of funds.
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_eligibility_complete" CHECK (
  ("tax_residence" IS NULL AND "investor_status" IS NULL AND "lawful_funds" IS NULL AND "attested_at" IS NULL)
  OR ("tax_residence" IS NOT NULL AND "investor_status" IS NOT NULL AND "lawful_funds" IS TRUE AND "attested_at" IS NOT NULL)
);

-- Regulation S only covers non-U.S. persons: a U.S. tax resident can never be recorded as REG_S.
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_eligibility_reg_s" CHECK (
  NOT ("investor_status"::text = 'REG_S' AND "tax_residence" = 'Estados Unidos')
);
