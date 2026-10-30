-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Audit actions of yield distributions: the payment instruction (whitelist re-checked) and the audited
--         reads of a distribution's supporting document. Own migration: a value added to an enum cannot be used
--         in the transaction that adds it.
-- ════════════════════════════════════════════════════════════════════════════

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DISTRIBUTION_PAYOUT_INSTRUCTED';
ALTER TYPE "AuditAction" ADD VALUE 'DISTRIBUTION_SUPPORT_DOWNLOADED';
