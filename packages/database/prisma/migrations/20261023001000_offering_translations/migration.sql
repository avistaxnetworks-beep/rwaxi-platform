-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Commercial texts of an offering in the vitrina and portal languages
-- ════════════════════════════════════════════════════════════════════════════
-- The developer's own copy, per language: { "<locale>": { "city", "region", "assetType",
-- "economicRight", "legalWrapperNote" } }. The columns hold the Spanish original; a missing
-- language or field falls back to it.

-- AlterTable
ALTER TABLE "offerings" ADD COLUMN "translations" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "offerings" ADD CONSTRAINT "offerings_translations_object" CHECK (jsonb_typeof("translations") = 'object');

-- ─────────────────────────────────────────────────────────────────────────────
-- rwaxi_public_offerings(): the vitrina shows the cards in the visitor's language.
-- The result type changes, so the function is dropped and recreated (and re-granted).
-- Marketing copy only: still no investor data.
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
    token_address text, capture_paused boolean, translations jsonb
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o."slug", o."display_name", o."legal_name", o."brand_color", o."portal_status"::text,
         f."code", f."asset_name", f."city", f."region", f."asset_type", f."stage"::text, f."render_kind",
         f."legal_entity_name", f."legal_wrapper_type"::text, f."legal_wrapper_note", f."economic_right",
         f."target_irr_pct", f."distribution_yield_pct", f."appreciation_pct", f."min_ticket_usd",
         f."unit_price_usd", f."raise_target_usd", f."asset_value_usd", f."total_units",
         f."units_subscribed", f."rent_start_months", f."network"::text, f."pipeline", f."data_room_root",
         t."status"::text, t."symbol", t."contract_address", f."capture_paused_at" IS NOT NULL,
         f."translations"
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
