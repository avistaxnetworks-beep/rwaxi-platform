-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · The Super-Admin console exported a report (the cross-tenant audit trail, the B2B fee report): who, which
--         filters, how many rows and the SHA-256 of the file. Own migration: a value added to an enum cannot be
--         used in the transaction that adds it (the next migration names it in a CHECK).
-- ════════════════════════════════════════════════════════════════════════════

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'PLATFORM_REPORT_EXPORTED';
