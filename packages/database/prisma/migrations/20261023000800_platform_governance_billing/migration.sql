-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Platform governance (portal status, vitrina publication, capture pause)
--         and the B2B billing cycle of the fee ledger (invoices and payments)
-- ════════════════════════════════════════════════════════════════════════════

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PORTAL_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_PUBLICATION_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'OFFERING_CAPTURE_PAUSED';
ALTER TYPE "AuditAction" ADD VALUE 'OFFERING_CAPTURE_RESUMED';
ALTER TYPE "AuditAction" ADD VALUE 'FEE_TERMS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'FEE_INVOICED';
ALTER TYPE "AuditAction" ADD VALUE 'FEE_PAYMENT_RECORDED';

-- AlterTable
ALTER TABLE "fee_ledger_entries" ADD COLUMN     "invoice_id" TEXT;

-- AlterTable
ALTER TABLE "offerings" ADD COLUMN     "capture_paused_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "fee_invoices" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "total_usd" DECIMAL(18,2) NOT NULL,
    "paid_on" DATE,
    "payment_receipt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fee_invoices_number_key" ON "fee_invoices"("number");

-- CreateIndex
CREATE INDEX "fee_invoices_organization_id_idx" ON "fee_invoices"("organization_id");

-- CreateIndex
CREATE INDEX "fee_ledger_entries_invoice_id_idx" ON "fee_ledger_entries"("invoice_id");

-- AddForeignKey
ALTER TABLE "fee_ledger_entries" ADD CONSTRAINT "fee_ledger_entries_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "fee_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- fee_invoices is tenant data: a developer may read its own invoices (RLS, fail-closed);
-- RWAXI issues them from the Super-Admin console (platform role, BYPASSRLS).
-- An entry may only be billed by an invoice of its own organization.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "fee_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_invoices" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "fee_invoices"
  USING ("organization_id" = rwaxi_current_org())
  WITH CHECK ("organization_id" = rwaxi_current_org());

DROP TRIGGER IF EXISTS same_tenant ON "fee_ledger_entries";
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "fee_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant(
    'subscriptions', 'subscription_id', 'fee_invoices', 'invoice_id');

-- Entries already INVOICED or PAID before invoices existed get one legacy invoice each.
INSERT INTO "fee_invoices" ("id", "organization_id", "number", "issued_at", "total_usd", "paid_on", "payment_receipt", "updated_at")
SELECT 'legacy_' || e."id", e."organization_id", 'LEGACY-' || upper(substr(md5(e."id"), 1, 12)), e."accrued_on",
       e."amount_usd",
       CASE WHEN e."status" = 'PAID' THEN e."accrued_on" END,
       CASE WHEN e."status" = 'PAID' THEN 'LEGACY' END,
       CURRENT_TIMESTAMP
FROM "fee_ledger_entries" e
WHERE e."status" IN ('INVOICED', 'PAID') AND e."invoice_id" IS NULL;
UPDATE "fee_ledger_entries" SET "invoice_id" = 'legacy_' || "id"
WHERE "status" IN ('INVOICED', 'PAID') AND "invoice_id" IS NULL;

-- Billing lifecycle: ACCRUED ⇔ not invoiced; a recorded payment has both date and receipt.
ALTER TABLE "fee_ledger_entries" ADD CONSTRAINT "fee_ledger_entries_invoice_status_check"
  CHECK (("status" = 'ACCRUED') = ("invoice_id" IS NULL));
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_payment_check"
  CHECK (("paid_on" IS NULL) = ("payment_receipt" IS NULL) AND "total_usd" >= 0);

-- Agreed fee terms of a developer (Super-Admin, module C).
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_fee_terms_check"
  CHECK ("fee_setup_usd" >= 0 AND "fee_monthly_usd" >= 0 AND "fee_usage_pct" >= 0 AND "fee_usage_pct" <= 10);

-- ─────────────────────────────────────────────────────────────────────────────
-- rwaxi_public_offerings(): the vitrina also needs whether capital raising is paused.
-- The result type changes, so the function is dropped and recreated (and re-granted).
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS rwaxi_public_offerings();
CREATE FUNCTION rwaxi_public_offerings()
  RETURNS TABLE (
    tenant_slug text, tenant_display_name text, tenant_legal_name text, tenant_brand_color text,
    tenant_portal_status text, offering_code text, asset_name text, city text, region text,
    asset_type text, stage text, render_kind text, legal_entity_name text, legal_wrapper_type text,
    legal_wrapper_note text, economic_right text, target_irr_pct numeric, distribution_yield_pct numeric,
    appreciation_pct numeric, min_ticket_usd numeric, unit_price_usd numeric, raise_target_usd numeric,
    asset_value_usd numeric, total_units integer, units_subscribed integer, rent_start_months integer,
    network text, pipeline jsonb, data_room_root text, token_status text, token_symbol text,
    token_address text, capture_paused boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o."slug", o."display_name", o."legal_name", o."brand_color", o."portal_status"::text,
         f."code", f."asset_name", f."city", f."region", f."asset_type", f."stage"::text, f."render_kind",
         f."legal_entity_name", f."legal_wrapper_type"::text, f."legal_wrapper_note", f."economic_right",
         f."target_irr_pct", f."distribution_yield_pct", f."appreciation_pct", f."min_ticket_usd",
         f."unit_price_usd", f."raise_target_usd", f."asset_value_usd", f."total_units",
         f."units_subscribed", f."rent_start_months", f."network"::text, f."pipeline", f."data_room_root",
         t."status"::text, t."symbol", t."contract_address", f."capture_paused_at" IS NOT NULL
  FROM "offerings" f
  JOIN "organizations" o ON o."id" = f."organization_id"
  LEFT JOIN "token_deployments" t ON t."offering_id" = f."id"
  WHERE o."published" AND f."published"
  ORDER BY f."code"
$$;
REVOKE ALL ON FUNCTION rwaxi_public_offerings() FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['rwaxi_app', 'rwaxi_platform'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION rwaxi_public_offerings() TO %I', r);
    END IF;
  END LOOP;
END $$;
