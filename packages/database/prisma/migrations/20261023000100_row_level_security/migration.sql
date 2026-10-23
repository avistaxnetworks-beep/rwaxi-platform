-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Row-Level Security (tenant isolation by organization_id)
--
-- Roles (created by docker/init-roles.sql; provision the same in each environment):
--   rwaxi_app       NOSUPERUSER NOBYPASSRLS  → portals + backoffice. Sees only the
--                   organization set in `app.current_organization_id` (transaction-local).
--   rwaxi_platform  BYPASSRLS                → admin.rwaxi.com (Super-Admin console).
--   owner/postgres                           → Prisma Migrate and seed only.
--
-- Fail-closed: without `app.current_organization_id` every policy evaluates to NULL
-- and the app role sees no rows and cannot write any.
-- Prisma does not diff policies, functions or triggers, so this migration is stable
-- under `prisma migrate dev`.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rwaxi_current_org() RETURNS text
  LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('app.current_organization_id', true), '') $$;

-- organizations: a tenant sees only its own row.
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organizations"
  USING ("id" = rwaxi_current_org())
  WITH CHECK ("id" = rwaxi_current_org());

-- every tenant-owned table.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'offerings', 'token_deployments', 'investors', 'leads', 'nda_acceptances',
    'kyc_cases', 'data_room_documents', 'data_room_access_grants', 'subscriptions',
    'chain_transactions', 'fee_ledger_entries'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("organization_id" = rwaxi_current_org()) '
      'WITH CHECK ("organization_id" = rwaxi_current_org())', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Cross-tenant reference guard.
-- Foreign-key checks bypass RLS, so a row could reference another tenant's offering
-- or investor by id. This trigger requires every referenced parent to belong to the
-- same organization as the child row. Args: (parent_table, fk_column)[, …]
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rwaxi_assert_same_tenant() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  i int := 0;
  fk_value text;
  parent_org text;
BEGIN
  WHILE i < TG_NARGS LOOP
    EXECUTE format('SELECT ($1).%I::text', TG_ARGV[i + 1]) INTO fk_value USING NEW;
    IF fk_value IS NOT NULL THEN
      EXECUTE format('SELECT "organization_id" FROM %I WHERE "id" = $1', TG_ARGV[i]) INTO parent_org USING fk_value;
      IF parent_org IS DISTINCT FROM NEW."organization_id" THEN
        RAISE EXCEPTION 'RWAXI tenant isolation: %.% references a row of another organization',
          TG_TABLE_NAME, TG_ARGV[i + 1]
          USING ERRCODE = '42501';
      END IF;
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "token_deployments"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant('offerings', 'offering_id');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "leads"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant('offerings', 'offering_id', 'investors', 'investor_id');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "nda_acceptances"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant('offerings', 'offering_id', 'investors', 'investor_id');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "kyc_cases"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant('offerings', 'offering_id', 'investors', 'investor_id');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "data_room_documents"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant('offerings', 'offering_id');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "data_room_access_grants"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant(
    'offerings', 'offering_id', 'investors', 'investor_id',
    'nda_acceptances', 'nda_acceptance_id', 'kyc_cases', 'kyc_case_id');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "subscriptions"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant('offerings', 'offering_id', 'investors', 'investor_id');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "chain_transactions"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant('offerings', 'offering_id');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "fee_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant('subscriptions', 'subscription_id');

-- ─────────────────────────────────────────────────────────────────────────────
-- Privileges (only if the roles exist in this environment).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['rwaxi_app', 'rwaxi_platform'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION rwaxi_current_org() TO %I', r);
    END IF;
  END LOOP;
END $$;
