-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PortalStatus" AS ENUM ('ACTIVE', 'REVIEW', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('NOT_CONFIGURED', 'PENDING_DNS', 'VERIFIED');

-- CreateEnum
CREATE TYPE "ComplianceRegime" AS ENUM ('SAGRILAFT_PTEE', 'SARLAFT');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'RWAXI_OPERATOR', 'TENANT_ADMIN', 'COMPLIANCE_OFFICER', 'TENANT_ANALYST');

-- CreateEnum
CREATE TYPE "OfferingStage" AS ENUM ('PRESALE', 'STRUCTURING', 'OPERATING');

-- CreateEnum
CREATE TYPE "LegalWrapperType" AS ENUM ('SAS_SPV', 'FIDUCIARY_TRUST', 'PARTICIPATION_ACCOUNTS');

-- CreateEnum
CREATE TYPE "ChainNetwork" AS ENUM ('POLYGON', 'BASE', 'POLYGON_AMOY', 'BASE_SEPOLIA', 'HARDHAT');

-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('NOT_DEPLOYED', 'DEPLOYING', 'DEPLOYED', 'PAUSED');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('RWAXI', 'DIRECT');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RiskProfile" AS ENUM ('CONSERVATIVE', 'MODERATE', 'DYNAMIC');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('RESERVED', 'PAYMENT_VERIFIED', 'MINTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChainTxKind" AS ENUM ('TENANT_REGISTRY_DEPLOYED', 'OFFERING_TOKEN_DEPLOYED', 'INVESTOR_WHITELISTED', 'INVESTOR_REVOKED', 'INVESTOR_FREEZE_UPDATED', 'SUBSCRIPTION_MINTED', 'DATA_ROOM_ROOT_ANCHORED', 'FORCED_RECOVERY', 'TOKEN_PAUSED', 'TOKEN_UNPAUSED');

-- CreateEnum
CREATE TYPE "ChainTxStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REVERTED');

-- CreateEnum
CREATE TYPE "FeeKind" AS ENUM ('SETUP', 'SAAS', 'USAGE');

-- CreateEnum
CREATE TYPE "FeeStatus" AS ENUM ('ACCRUED', 'INVOICED', 'PAID');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "tax_id" TEXT NOT NULL,
    "brand_color" TEXT NOT NULL,
    "logo_url" TEXT,
    "custom_domain" TEXT,
    "domain_status" "DomainStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "compliance_regime" "ComplianceRegime" NOT NULL,
    "compliance_contact_email" TEXT NOT NULL,
    "portal_status" "PortalStatus" NOT NULL DEFAULT 'REVIEW',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "nda_template" TEXT NOT NULL,
    "compliance_template" JSONB NOT NULL,
    "onchain_id" TEXT,
    "compliance_registry_address" TEXT,
    "fee_setup_usd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "fee_monthly_usd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "fee_usage_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "onboarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "wallet_address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offerings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "asset_name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "asset_type" TEXT NOT NULL,
    "stage" "OfferingStage" NOT NULL,
    "render_kind" TEXT NOT NULL,
    "legal_entity_name" TEXT NOT NULL,
    "legal_wrapper_type" "LegalWrapperType" NOT NULL,
    "legal_wrapper_note" TEXT NOT NULL,
    "economic_right" TEXT NOT NULL,
    "target_irr_pct" DECIMAL(6,2) NOT NULL,
    "distribution_yield_pct" DECIMAL(6,2) NOT NULL,
    "appreciation_pct" DECIMAL(6,2) NOT NULL,
    "min_ticket_usd" DECIMAL(18,2) NOT NULL,
    "unit_price_usd" DECIMAL(18,2) NOT NULL,
    "raise_target_usd" DECIMAL(18,2) NOT NULL,
    "asset_value_usd" DECIMAL(18,2) NOT NULL,
    "total_units" INTEGER NOT NULL,
    "rent_start_months" INTEGER NOT NULL,
    "network" "ChainNetwork" NOT NULL,
    "pipeline" JSONB NOT NULL,
    "video_config" JSONB,
    "data_room_root" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_deployments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "offering_id" TEXT NOT NULL,
    "network" "ChainNetwork" NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "max_supply" INTEGER NOT NULL,
    "unit_price_usd" DECIMAL(18,2) NOT NULL,
    "onchain_id" TEXT,
    "contract_address" TEXT,
    "deploy_tx_hash" TEXT,
    "status" "TokenStatus" NOT NULL DEFAULT 'NOT_DEPLOYED',
    "deployed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investors" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "doc_type" TEXT NOT NULL,
    "doc_number" TEXT NOT NULL,
    "country_code" INTEGER NOT NULL DEFAULT 170,
    "wallet_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "offering_id" TEXT NOT NULL,
    "investor_id" TEXT,
    "referral_token" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL,
    "landed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nda_acceptances" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "offering_id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "signer_name" TEXT NOT NULL,
    "signer_email" TEXT NOT NULL,
    "document_hash" TEXT NOT NULL,
    "ip_address" TEXT,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nda_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_cases" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "offering_id" TEXT,
    "status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "activity" TEXT,
    "income_bracket" INTEGER,
    "risk_profile" "RiskProfile",
    "is_pep" BOOLEAN NOT NULL DEFAULT false,
    "lists_result" TEXT,
    "dossier_hash" TEXT,
    "rejection_reason" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "whitelist_tx_hash" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_room_documents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "offering_id" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "restricted" BOOLEAN NOT NULL DEFAULT true,
    "sha256" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_room_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_room_access_grants" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "offering_id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "nda_acceptance_id" TEXT NOT NULL,
    "kyc_case_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "data_room_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "offering_id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "onchain_id" TEXT,
    "units" INTEGER NOT NULL,
    "capital_usd" DECIMAL(18,2) NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'RESERVED',
    "payment_evidence_ref" TEXT,
    "mint_tx_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "offering_id" TEXT,
    "network" "ChainNetwork" NOT NULL,
    "kind" "ChainTxKind" NOT NULL,
    "contract_address" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "tx_hash" TEXT,
    "block_number" BIGINT,
    "status" "ChainTxStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chain_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_ledger_entries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "kind" "FeeKind" NOT NULL,
    "amount_usd" DECIMAL(18,2) NOT NULL,
    "base_usd" DECIMAL(18,2),
    "period" TEXT,
    "accrued_on" DATE NOT NULL,
    "evidence" TEXT NOT NULL,
    "status" "FeeStatus" NOT NULL DEFAULT 'ACCRUED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_tax_id_key" ON "organizations"("tax_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_custom_domain_key" ON "organizations"("custom_domain");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_onchain_id_key" ON "organizations"("onchain_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE INDEX "offerings_organization_id_idx" ON "offerings"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "offerings_organization_id_code_key" ON "offerings"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "token_deployments_offering_id_key" ON "token_deployments"("offering_id");

-- CreateIndex
CREATE UNIQUE INDEX "token_deployments_onchain_id_key" ON "token_deployments"("onchain_id");

-- CreateIndex
CREATE INDEX "token_deployments_organization_id_idx" ON "token_deployments"("organization_id");

-- CreateIndex
CREATE INDEX "investors_organization_id_idx" ON "investors"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "investors_organization_id_doc_type_doc_number_key" ON "investors"("organization_id", "doc_type", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "leads_referral_token_key" ON "leads"("referral_token");

-- CreateIndex
CREATE INDEX "leads_organization_id_idx" ON "leads"("organization_id");

-- CreateIndex
CREATE INDEX "leads_offering_id_idx" ON "leads"("offering_id");

-- CreateIndex
CREATE INDEX "nda_acceptances_organization_id_idx" ON "nda_acceptances"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "nda_acceptances_offering_id_investor_id_key" ON "nda_acceptances"("offering_id", "investor_id");

-- CreateIndex
CREATE INDEX "kyc_cases_organization_id_status_idx" ON "kyc_cases"("organization_id", "status");

-- CreateIndex
CREATE INDEX "data_room_documents_organization_id_idx" ON "data_room_documents"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_room_documents_offering_id_sha256_key" ON "data_room_documents"("offering_id", "sha256");

-- CreateIndex
CREATE INDEX "data_room_access_grants_organization_id_idx" ON "data_room_access_grants"("organization_id");

-- CreateIndex
CREATE INDEX "data_room_access_grants_investor_id_offering_id_idx" ON "data_room_access_grants"("investor_id", "offering_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_onchain_id_key" ON "subscriptions"("onchain_id");

-- CreateIndex
CREATE INDEX "subscriptions_organization_id_status_idx" ON "subscriptions"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "chain_transactions_tx_hash_key" ON "chain_transactions"("tx_hash");

-- CreateIndex
CREATE INDEX "chain_transactions_organization_id_created_at_idx" ON "chain_transactions"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "fee_ledger_entries_organization_id_status_idx" ON "fee_ledger_entries"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_deployments" ADD CONSTRAINT "token_deployments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_deployments" ADD CONSTRAINT "token_deployments_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investors" ADD CONSTRAINT "investors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nda_acceptances" ADD CONSTRAINT "nda_acceptances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nda_acceptances" ADD CONSTRAINT "nda_acceptances_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nda_acceptances" ADD CONSTRAINT "nda_acceptances_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_room_documents" ADD CONSTRAINT "data_room_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_room_documents" ADD CONSTRAINT "data_room_documents_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_room_access_grants" ADD CONSTRAINT "data_room_access_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_room_access_grants" ADD CONSTRAINT "data_room_access_grants_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_room_access_grants" ADD CONSTRAINT "data_room_access_grants_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_room_access_grants" ADD CONSTRAINT "data_room_access_grants_nda_acceptance_id_fkey" FOREIGN KEY ("nda_acceptance_id") REFERENCES "nda_acceptances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_room_access_grants" ADD CONSTRAINT "data_room_access_grants_kyc_case_id_fkey" FOREIGN KEY ("kyc_case_id") REFERENCES "kyc_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_transactions" ADD CONSTRAINT "chain_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_transactions" ADD CONSTRAINT "chain_transactions_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_ledger_entries" ADD CONSTRAINT "fee_ledger_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_ledger_entries" ADD CONSTRAINT "fee_ledger_entries_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

