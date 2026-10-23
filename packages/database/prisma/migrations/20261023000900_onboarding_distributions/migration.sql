-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Developer onboarding (registry deployment through the factory) and yield
--         distributions committed in a Merkle tree
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('DECLARED', 'ANCHORED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_ONBOARDED';
ALTER TYPE "AuditAction" ADD VALUE 'DISTRIBUTION_DECLARED';

-- AlterEnum
ALTER TYPE "ChainTxKind" ADD VALUE 'DISTRIBUTION_ROOT_ANCHORED';

-- CreateTable
CREATE TABLE "distributions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "offering_id" TEXT NOT NULL,
    "onchain_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount_declared" DECIMAL(20,2) NOT NULL,
    "fx_rate" DECIMAL(12,4),
    "total_usd" DECIMAL(18,2) NOT NULL,
    "total_units" INTEGER NOT NULL,
    "holders" INTEGER NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL,
    "merkle_root" TEXT NOT NULL,
    "status" "DistributionStatus" NOT NULL DEFAULT 'DECLARED',
    "anchor_tx_hash" TEXT,
    "declared_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_allocations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "distribution_id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "amount_usd" DECIMAL(18,2) NOT NULL,
    "leaf_hash" TEXT NOT NULL,
    "merkle_proof" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribution_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "distributions_onchain_id_key" ON "distributions"("onchain_id");

-- CreateIndex
CREATE INDEX "distributions_organization_id_created_at_idx" ON "distributions"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "distributions_offering_id_period_key" ON "distributions"("offering_id", "period");

-- CreateIndex
CREATE INDEX "distribution_allocations_organization_id_idx" ON "distribution_allocations"("organization_id");

-- CreateIndex
CREATE INDEX "distribution_allocations_investor_id_idx" ON "distribution_allocations"("investor_id");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_allocations_distribution_id_investor_id_key" ON "distribution_allocations"("distribution_id", "investor_id");

-- AddForeignKey
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_declared_by_id_fkey" FOREIGN KEY ("declared_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_allocations" ADD CONSTRAINT "distribution_allocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_allocations" ADD CONSTRAINT "distribution_allocations_distribution_id_fkey" FOREIGN KEY ("distribution_id") REFERENCES "distributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_allocations" ADD CONSTRAINT "distribution_allocations_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ─────────────────────────────────────────────────────────────────────────────
-- Distributions are tenant data (RLS, fail-closed) and may only reference rows of
-- their own organization. Allocations are cryptographic commitments (Merkle leaves
-- and proofs): append-only for the app roles.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['distributions', 'distribution_allocations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("organization_id" = rwaxi_current_org()) '
      'WITH CHECK ("organization_id" = rwaxi_current_org())', t);
  END LOOP;
END $$;

CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "distributions"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant('offerings', 'offering_id', 'users', 'declared_by_id');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "distribution_allocations"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant('distributions', 'distribution_id', 'investors', 'investor_id');

ALTER TABLE "distributions" ADD CONSTRAINT "distributions_amounts_check" CHECK (
  "total_usd" > 0 AND "amount_declared" > 0 AND "total_units" > 0 AND "holders" > 0
  AND "currency" IN ('USD', 'COP') AND (("currency" = 'COP') = ("fx_rate" IS NOT NULL))
  AND ("status" = 'DECLARED' OR "anchor_tx_hash" IS NOT NULL));
ALTER TABLE "distribution_allocations" ADD CONSTRAINT "distribution_allocations_amounts_check"
  CHECK ("units" > 0 AND "amount_usd" >= 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- rwaxi_factory_creations(network, factory): contracts the RWAXI factory created in
-- SIMULATION on that network (registries + tokens, every tenant). Its CREATE nonce is
-- 1 + this count, which gives the deterministic address of a simulated deployment.
-- A counter only: no tenant data crosses.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rwaxi_factory_creations(p_network "ChainNetwork", p_factory text)
  RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM "chain_transactions" t
  WHERE t."network" = p_network
    AND t."execution_mode" = 'SIMULATION'
    AND t."status" = 'CONFIRMED'
    AND t."kind" IN ('TENANT_REGISTRY_DEPLOYED', 'OFFERING_TOKEN_DEPLOYED')
    AND lower(t."contract_address") = lower(p_factory)
$$;
REVOKE ALL ON FUNCTION rwaxi_factory_creations("ChainNetwork", text) FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['rwaxi_app', 'rwaxi_platform'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION rwaxi_factory_creations("ChainNetwork", text) TO %I', r);
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON "distribution_allocations" FROM %I', r);
    END IF;
  END LOOP;
END $$;
