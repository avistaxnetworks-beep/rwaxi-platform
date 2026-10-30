-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Audit actions of the commercial terms agreed with each developer
-- ════════════════════════════════════════════════════════════════════════════
-- In their own migration: a value added with ALTER TYPE … ADD VALUE cannot be used in the transaction that
-- adds it.
--   COMMERCIAL_TERMS_UPDATED         the console registers a signed agreement and the platform fee it sets
--   COMMERCIAL_AGREEMENT_DOWNLOADED  the console opens a signed agreement (re-hashed from the vault)

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'COMMERCIAL_TERMS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'COMMERCIAL_AGREEMENT_DOWNLOADED';
