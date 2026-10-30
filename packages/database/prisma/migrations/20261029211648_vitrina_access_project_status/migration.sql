-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Legal wall of the vitrina and the offering lifecycle in the public catalogue
-- ════════════════════════════════════════════════════════════════════════════
--   vitrina_access_acceptances  who accepted the vitrina's legal wall (private community of investors), with granular
--                               consent: RWAXI's terms + liability disclaimer, its personal-data policy and its
--                               cookie policy — all three mandatory, each with the SHA-256 of its text as shown.
--                               Platform evidence, not tenant data: deny-all RLS and no privileges for the app
--                               roles; rwaxi_record_vitrina_access() (SECURITY DEFINER) is the only way in, and
--                               only ever inserts.
--   rwaxi_public_offerings()    also returns Offering.status: only ACTIVE offerings raise capital.

-- CreateTable
CREATE TABLE "vitrina_access_acceptances" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "terms_version" TEXT NOT NULL,
    "terms_sha256" TEXT NOT NULL,
    "privacy_sha256" TEXT NOT NULL,
    "cookies_sha256" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "ip_hash" TEXT,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vitrina_access_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vitrina_access_acceptances_email_idx" ON "vitrina_access_acceptances"("email");

ALTER TABLE "vitrina_access_acceptances" ADD CONSTRAINT "vitrina_access_acceptances_values_check" CHECK (
  "email" = lower("email") AND length("email") BETWEEN 3 AND 254
  AND "terms_version" ~ '^[A-Za-z0-9._-]{1,32}$'
  AND "terms_sha256" ~ '^[0-9a-f]{64}$'
  AND "privacy_sha256" ~ '^[0-9a-f]{64}$'
  AND "cookies_sha256" ~ '^[0-9a-f]{64}$'
  AND "language" ~ '^[a-z]{2}$'
  AND ("ip_hash" IS NULL OR "ip_hash" ~ '^[0-9a-f]{64}$'));

-- Not tenant data and not the app's to read: deny-all RLS (no policy) plus no privileges.
ALTER TABLE "vitrina_access_acceptances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vitrina_access_acceptances" FORCE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- rwaxi_record_vitrina_access(email, version, terms, privacy, cookies, language, ip_hash): records one acceptance
-- (the three consents: the SHA-256 of each text) and returns its id. Arguments are validated here too (the CHECK
-- above is the last word): the app role reaches the table through this function only.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rwaxi_record_vitrina_access(
  p_email text, p_terms_version text, p_terms_sha256 text, p_privacy_sha256 text, p_cookies_sha256 text,
  p_language text, p_ip_hash text)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_id text := gen_random_uuid()::text;
BEGIN
  IF p_email IS NULL OR p_email <> lower(p_email) OR length(p_email) NOT BETWEEN 3 AND 254
     OR p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     OR p_terms_version IS NULL OR p_terms_version !~ '^[A-Za-z0-9._-]{1,32}$'
     OR p_terms_sha256 IS NULL OR p_terms_sha256 !~ '^[0-9a-f]{64}$'
     OR p_privacy_sha256 IS NULL OR p_privacy_sha256 !~ '^[0-9a-f]{64}$'
     OR p_cookies_sha256 IS NULL OR p_cookies_sha256 !~ '^[0-9a-f]{64}$'
     OR p_language IS NULL OR p_language !~ '^[a-z]{2}$'
     OR (p_ip_hash IS NOT NULL AND p_ip_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'rwaxi_record_vitrina_access: invalid arguments';
  END IF;
  INSERT INTO "vitrina_access_acceptances"
    ("id", "email", "terms_version", "terms_sha256", "privacy_sha256", "cookies_sha256", "language", "ip_hash")
  VALUES (new_id, p_email, p_terms_version, p_terms_sha256, p_privacy_sha256, p_cookies_sha256, p_language, p_ip_hash);
  RETURN new_id;
END
$$;
REVOKE ALL ON FUNCTION rwaxi_record_vitrina_access(text, text, text, text, text, text, text) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- rwaxi_public_offerings(): + offering_status. The result type changes, so the function is dropped and
-- recreated (and re-granted). Marketing copy only: still no investor data.
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
    token_address text, capture_paused boolean, translations jsonb, offering_status text
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
         f."translations", f."status"::text
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
      EXECUTE format('GRANT EXECUTE ON FUNCTION rwaxi_record_vitrina_access(text, text, text, text, text, text, text) TO %I', r);
      EXECUTE format('REVOKE ALL ON TABLE "vitrina_access_acceptances" FROM %I', r);
    END IF;
  END LOOP;
END $$;
