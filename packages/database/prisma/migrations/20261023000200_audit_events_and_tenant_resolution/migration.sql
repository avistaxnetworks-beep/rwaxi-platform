-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Audit trail (entity 14) + tenant resolution for the routing layer
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('KYC_APPROVED', 'KYC_REJECTED');

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actor_user_id" TEXT,
    "actor_email" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "subject_hash" TEXT,
    "payload" JSONB NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_organization_id_created_at_idx" ON "audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- audit_events is append-only for every app role:
--   · RLS: tenants may read and append rows of their own organization only;
--     there are no UPDATE/DELETE policies, so those statements match no rows.
--   · Privileges: UPDATE/DELETE/TRUNCATE revoked from rwaxi_app and rwaxi_platform.
-- Referential actions (ON DELETE SET NULL of actor_user_id) still run as owner.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON "audit_events" FOR SELECT
  USING ("organization_id" = rwaxi_current_org());
CREATE POLICY tenant_append ON "audit_events" FOR INSERT
  WITH CHECK ("organization_id" = rwaxi_current_org());

-- ─────────────────────────────────────────────────────────────────────────────
-- rwaxi_resolve_tenant(slug_or_domain): the app role cannot read `organizations`
-- without a tenant context (RLS is fail-closed), so it cannot map a slug to its
-- organization id. This SECURITY DEFINER function returns only routing fields for
-- the requested slug or verified custom domain — never other tenants' data.
-- Requires the migration owner to bypass RLS (superuser or BYPASSRLS, e.g. Neon's
-- neondb_owner or Docker's postgres).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rwaxi_resolve_tenant(p_slug_or_domain text)
  RETURNS TABLE (id text, slug text, display_name text, portal_status text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o."id", o."slug", o."display_name", o."portal_status"::text
  FROM "organizations" o
  WHERE o."slug" = lower(p_slug_or_domain)
     OR (o."custom_domain" = lower(p_slug_or_domain) AND o."domain_status" = 'VERIFIED')
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION rwaxi_resolve_tenant(text) FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['rwaxi_app', 'rwaxi_platform'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT ON "audit_events" TO %I', r);
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON "audit_events" FROM %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION rwaxi_resolve_tenant(text) TO %I', r);
    END IF;
  END LOOP;
END $$;
