-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Investor onboarding from the White Label portal
--   · Investor exists from the NDA (name + email); document and wallet arrive with KYC.
--   · One investor per email and per wallet inside a tenant (values stored lowercase).
--   · KycCase.evidence: canonical dossier hashed server-side into dossier_hash.
-- New columns inherit the tables' existing RLS policies and grants.
-- ════════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "investors" ALTER COLUMN "doc_type" DROP NOT NULL,
ALTER COLUMN "doc_number" DROP NOT NULL;

-- AlterTable
ALTER TABLE "kyc_cases" ADD COLUMN     "evidence" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "investors_organization_id_email_key" ON "investors"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "investors_organization_id_wallet_address_key" ON "investors"("organization_id", "wallet_address");

