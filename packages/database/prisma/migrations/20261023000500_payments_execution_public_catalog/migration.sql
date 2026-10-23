-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Payment reconciliation, ordered on-chain execution, public catalogue
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "ChainExecutionMode" AS ENUM ('RPC', 'SIMULATION');

-- AlterEnum
BEGIN;
CREATE TYPE "SubscriptionStatus_new" AS ENUM ('RESERVED', 'PAYMENT_PENDING', 'MINT_PENDING', 'MINTED', 'CANCELLED');
ALTER TABLE "subscriptions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "subscriptions" ALTER COLUMN "status" TYPE "SubscriptionStatus_new" USING ("status"::text::"SubscriptionStatus_new");
ALTER TYPE "SubscriptionStatus" RENAME TO "SubscriptionStatus_old";
ALTER TYPE "SubscriptionStatus_new" RENAME TO "SubscriptionStatus";
DROP TYPE "SubscriptionStatus_old";
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'RESERVED';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'CHAIN_TX_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'SUBSCRIPTION_MINTED';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "agreement_hash" TEXT,
ADD COLUMN     "payment_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "payment_confirmed_by_id" TEXT,
ADD COLUMN     "payment_reference" TEXT;

-- AlterTable
ALTER TABLE "chain_transactions" ADD COLUMN     "executed_at" TIMESTAMP(3),
ADD COLUMN     "execution_mode" "ChainExecutionMode",
ADD COLUMN     "nonce" INTEGER,
ADD COLUMN     "signed_transaction" TEXT,
ADD COLUMN     "signer_address" TEXT;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_payment_confirmed_by_id_fkey" FOREIGN KEY ("payment_confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- The payment confirmer must belong to the subscription's organization too.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS same_tenant ON "subscriptions";
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "subscriptions"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant(
    'offerings', 'offering_id', 'investors', 'investor_id', 'users', 'payment_confirmed_by_id');

-- ─────────────────────────────────────────────────────────────────────────────
-- rwaxi_public_offerings(): read-only public catalogue for the vitrina (www).
-- The app role has no tenant context there, so this SECURITY DEFINER function
-- exposes only marketing fields of published offerings of published developers:
-- terms, progress (units committed / total) and token status. No investor data.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rwaxi_public_offerings()
  RETURNS TABLE (
    tenant_slug text, tenant_display_name text, tenant_legal_name text, tenant_brand_color text,
    tenant_portal_status text, offering_code text, asset_name text, city text, region text,
    asset_type text, stage text, render_kind text, legal_entity_name text, legal_wrapper_type text,
    legal_wrapper_note text, economic_right text, target_irr_pct numeric, distribution_yield_pct numeric,
    appreciation_pct numeric, min_ticket_usd numeric, unit_price_usd numeric, raise_target_usd numeric,
    asset_value_usd numeric, total_units integer, units_subscribed integer, rent_start_months integer,
    network text, pipeline jsonb, data_room_root text, token_status text, token_symbol text,
    token_address text
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o."slug", o."display_name", o."legal_name", o."brand_color", o."portal_status"::text,
         f."code", f."asset_name", f."city", f."region", f."asset_type", f."stage"::text, f."render_kind",
         f."legal_entity_name", f."legal_wrapper_type"::text, f."legal_wrapper_note", f."economic_right",
         f."target_irr_pct", f."distribution_yield_pct", f."appreciation_pct", f."min_ticket_usd",
         f."unit_price_usd", f."raise_target_usd", f."asset_value_usd", f."total_units",
         f."units_subscribed", f."rent_start_months", f."network"::text, f."pipeline", f."data_room_root",
         t."status"::text, t."symbol", t."contract_address"
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
