-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Platform fee per developer, in basis points, and the signed agreements behind it
-- ════════════════════════════════════════════════════════════════════════════
-- organizations.platform_fee_bps replaces fee_usage_pct (0–10 %): the same fee on every reconciled payment
-- (FeeLedgerEntry INFRASTRUCTURE_USAGE), now in basis points within the agreed 0.25 %–5 % (25–500 bps) and written
-- into every token deployed from now on (RwaxiPropertyToken.platformFeeBps, immutable on-chain). Existing values
-- carry over (1.2 % → 120 bps), rounded to the basis point and brought into that range.
-- commercial_agreements keeps each signed agreement (reference, date, fee, the PDF's SHA-256 and its key in the
-- developer's DocumentVault); the console changes a fee only by registering one (COMMERCIAL_TERMS_UPDATED).

-- ─────────────────────────────────────────────────────────────────────────────
-- organizations: fee_usage_pct → platform_fee_bps
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "organizations" ADD COLUMN "platform_fee_bps" INTEGER;
UPDATE "organizations" SET "platform_fee_bps" = LEAST(500, GREATEST(25, ROUND("fee_usage_pct" * 100)::INTEGER));
ALTER TABLE "organizations" ALTER COLUMN "platform_fee_bps" SET NOT NULL;
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_fee_terms_check";
ALTER TABLE "organizations" DROP COLUMN "fee_usage_pct";
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_fee_terms_check"
  CHECK ("fee_setup_usd" >= 0 AND "fee_monthly_usd" >= 0);
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_platform_fee_bps_range"
  CHECK ("platform_fee_bps" BETWEEN 25 AND 500);

-- ─────────────────────────────────────────────────────────────────────────────
-- The fee fixed in each deployed token, and the one each usage fee applied
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "token_deployments" ADD COLUMN "platform_fee_bps" INTEGER;
ALTER TABLE "token_deployments" ADD CONSTRAINT "token_deployments_platform_fee_bps_range"
  CHECK ("platform_fee_bps" IS NULL OR "platform_fee_bps" BETWEEN 25 AND 500);

ALTER TABLE "fee_ledger_entries" ADD COLUMN "platform_fee_bps" INTEGER;
ALTER TABLE "fee_ledger_entries" ADD CONSTRAINT "fee_ledger_entries_platform_fee_bps_check"
  CHECK ("platform_fee_bps" IS NULL OR ("kind"::text = 'INFRASTRUCTURE_USAGE' AND "platform_fee_bps" BETWEEN 25 AND 500));

-- ─────────────────────────────────────────────────────────────────────────────
-- commercial_agreements
-- ─────────────────────────────────────────────────────────────────────────────
-- CreateTable
CREATE TABLE "commercial_agreements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "signed_on" DATE NOT NULL,
    "platform_fee_bps" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "recorded_by_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_agreements_organization_id_created_at_idx" ON "commercial_agreements"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_reference_format"
  CHECK (char_length("reference") BETWEEN 3 AND 64 AND "reference" ~ '^[A-Za-z0-9][A-Za-z0-9 ._/#-]*$');
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_platform_fee_bps_range"
  CHECK ("platform_fee_bps" BETWEEN 25 AND 500);
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_sha256_format"
  CHECK ("sha256" ~ '^0x[0-9a-f]{64}$');
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_size_positive" CHECK ("size_bytes" > 0);
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_file_name_length"
  CHECK (char_length("file_name") BETWEEN 1 AND 160);
-- The signed PDF lives in the developer's own vault: a row can never point at another tenant's file.
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_storage_key"
  CHECK ("storage_key" = 'tenants/' || "organization_id" || '/sha256/' || substr("sha256", 3));

-- Tenant isolation (fail-closed, as every tenant table)
ALTER TABLE "commercial_agreements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial_agreements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "commercial_agreements"
  USING ("organization_id" = rwaxi_current_org())
  WITH CHECK ("organization_id" = rwaxi_current_org());

-- An agreement is evidence: the app roles may add one, never change or remove it.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['rwaxi_app', 'rwaxi_platform'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON "commercial_agreements" FROM %I', r);
    END IF;
  END LOOP;
END $$;
