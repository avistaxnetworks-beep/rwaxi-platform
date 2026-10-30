-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Yield distributions with a record date, a payment currency (COP, USD, USDC, USDT) and a supporting
--         document in the DocumentVault, and their payment instructions
-- ════════════════════════════════════════════════════════════════════════════
-- distributions: the cut-off date (record_date) and its instant (snapshot_at), where the register of holders was
--   checked (snapshot_mode: the token's balance history in RPC, the confirmed outbox in SIMULATION), the leaf
--   version (2: the leaves commit the payment currency) and the supporting document by its SHA-256 — the one
--   anchorDistributionRoot(…, evidenceHash) commits on-chain. Distributions declared before stay version 1.
-- distribution_allocations.amount: the share in the payment currency, as committed in the leaf (version 1: USD).
-- distribution_payout_batches / distribution_payouts: each payment instruction and the allocations it carries
--   (an allocation is instructed at most once), issued after the root is anchored and only to wallets the
--   compliance whitelist clears at that moment. Append-only, like the allocations.

-- AlterTable
ALTER TABLE "distributions" ADD COLUMN     "leaf_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "record_date" DATE,
ADD COLUMN     "snapshot_mode" "ChainExecutionMode",
ADD COLUMN     "support_file_name" TEXT,
ADD COLUMN     "support_mime_type" TEXT,
ADD COLUMN     "support_sha256" TEXT,
ADD COLUMN     "support_size_bytes" INTEGER,
ADD COLUMN     "support_storage_key" TEXT;

-- AlterTable (version 1 allocations were USD)
ALTER TABLE "distribution_allocations" ADD COLUMN     "amount" DECIMAL(20,2);
UPDATE "distribution_allocations" SET "amount" = "amount_usd";
ALTER TABLE "distribution_allocations" ALTER COLUMN "amount" SET NOT NULL;

-- CreateTable
CREATE TABLE "distribution_payout_batches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "distribution_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "instruction_hash" TEXT NOT NULL,
    "instruction" JSONB NOT NULL,
    "currency" TEXT NOT NULL,
    "total_amount" DECIMAL(20,2) NOT NULL,
    "payees" INTEGER NOT NULL,
    "withheld" INTEGER NOT NULL,
    "registry_mode" "ChainExecutionMode" NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribution_payout_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_payouts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "allocation_id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribution_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "distribution_payout_batches_organization_id_created_at_idx" ON "distribution_payout_batches"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_payout_batches_distribution_id_sequence_key" ON "distribution_payout_batches"("distribution_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_payouts_allocation_id_key" ON "distribution_payouts"("allocation_id");

-- CreateIndex
CREATE INDEX "distribution_payouts_organization_id_idx" ON "distribution_payouts"("organization_id");

-- CreateIndex
CREATE INDEX "distribution_payouts_batch_id_idx" ON "distribution_payouts"("batch_id");

-- AddForeignKey
ALTER TABLE "distribution_payout_batches" ADD CONSTRAINT "distribution_payout_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_payout_batches" ADD CONSTRAINT "distribution_payout_batches_distribution_id_fkey" FOREIGN KEY ("distribution_id") REFERENCES "distributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_payout_batches" ADD CONSTRAINT "distribution_payout_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_payouts" ADD CONSTRAINT "distribution_payouts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_payouts" ADD CONSTRAINT "distribution_payouts_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "distribution_payout_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_payouts" ADD CONSTRAINT "distribution_payouts_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "distribution_allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ─────────────────────────────────────────────────────────────────────────────
-- Amounts and currencies; from version 2 a distribution has its record date, its snapshot mode and its supporting
-- document, kept in its own tenant's vault (the key is the one of its SHA-256 under that organization).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "distributions" DROP CONSTRAINT "distributions_amounts_check";
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_amounts_check" CHECK (
  "total_usd" > 0 AND "amount_declared" > 0 AND "total_units" > 0 AND "holders" > 0
  AND "currency" IN ('USD', 'COP', 'USDC', 'USDT') AND (("currency" = 'COP') = ("fx_rate" IS NOT NULL))
  AND ("status" = 'DECLARED' OR "anchor_tx_hash" IS NOT NULL));
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_record_support_check" CHECK (
  "leaf_version" IN (1, 2)
  AND ("leaf_version" = 1 OR (
    "record_date" IS NOT NULL AND "snapshot_mode" IS NOT NULL
    AND "support_sha256" ~ '^0x[0-9a-f]{64}$'
    AND "support_file_name" IS NOT NULL AND "support_mime_type" IS NOT NULL AND "support_size_bytes" > 0
    AND "support_storage_key" = 'tenants/' || "organization_id" || '/sha256/' || substr("support_sha256", 3))));

ALTER TABLE "distribution_allocations" DROP CONSTRAINT "distribution_allocations_amounts_check";
ALTER TABLE "distribution_allocations" ADD CONSTRAINT "distribution_allocations_amounts_check"
  CHECK ("units" > 0 AND "amount_usd" >= 0 AND "amount" >= 0);

ALTER TABLE "distribution_payout_batches" ADD CONSTRAINT "distribution_payout_batches_check" CHECK (
  "sequence" >= 1 AND "payees" >= 1 AND "withheld" >= 0 AND "total_amount" > 0
  AND "currency" IN ('USD', 'COP', 'USDC', 'USDT')
  AND "instruction_hash" ~ '^0x[0-9a-f]{64}$');
ALTER TABLE "distribution_payouts" ADD CONSTRAINT "distribution_payouts_amount_check" CHECK ("amount" > 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tenant data (RLS, fail-closed) that only references rows of its own organization; append-only for the app roles.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['distribution_payout_batches', 'distribution_payouts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("organization_id" = rwaxi_current_org()) '
      'WITH CHECK ("organization_id" = rwaxi_current_org())', t);
  END LOOP;
END $$;

CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "distribution_payout_batches"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant('distributions', 'distribution_id', 'users', 'created_by_id');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "distribution_payouts"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant(
    'distribution_payout_batches', 'batch_id', 'distribution_allocations', 'allocation_id');

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['rwaxi_app', 'rwaxi_platform'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON "distribution_payout_batches" FROM %I', r);
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON "distribution_payouts" FROM %I', r);
    END IF;
  END LOOP;
END $$;
