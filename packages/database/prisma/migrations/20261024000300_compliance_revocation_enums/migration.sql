-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · New enum values for compliance after approval (revocation, freeze), the issuer's own minting and
-- voided fees. On their own migration: PostgreSQL does not let a transaction use enum values it just added,
-- and the next migration's constraints refer to them.
-- ════════════════════════════════════════════════════════════════════════════

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'KYC_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE 'SUBSCRIPTION_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'INVESTOR_FREEZE_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'MINTER_ROLE_REQUESTED';

-- AlterEnum
ALTER TYPE "ChainTxKind" ADD VALUE 'MINTER_ROLE_GRANTED';

-- AlterEnum
ALTER TYPE "ChainTxStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "FeeStatus" ADD VALUE 'VOIDED';

-- AlterEnum
ALTER TYPE "KycStatus" ADD VALUE 'REVOKED';
