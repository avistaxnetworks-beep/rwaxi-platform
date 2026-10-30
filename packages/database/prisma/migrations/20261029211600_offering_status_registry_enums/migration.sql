-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Audit actions of the offering lifecycle and of the deferred tenant registry
-- ════════════════════════════════════════════════════════════════════════════
-- In their own migration: a value added with ALTER TYPE … ADD VALUE cannot be used in the transaction that
-- adds it.
--   OFFERING_STATUS_CHANGED    the developer opens, closes or completes capital raising (Offering.status)
--   REGISTRY_WALLETS_DECLARED  the console declares the staff wallets an onboarding deferred, and queues the
--                              tenant's deployTenantRegistry()

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'OFFERING_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'REGISTRY_WALLETS_DECLARED';
