-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Audit actions of an offering's token deployment and of the reservations it opens to payment
-- ════════════════════════════════════════════════════════════════════════════
-- In their own migration: a value added with ALTER TYPE … ADD VALUE cannot be used in the transaction that
-- adds it.
--   OFFERING_TOKEN_DEPLOYMENT_QUEUED  the console queues deployOfferingToken() (factory, the developer's agreed
--                                     platform fee, official wallets and compliance officer)
--   SUBSCRIPTION_PAYMENT_OPENED       a pre-sale reservation becomes payable once its offering's token exists

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'OFFERING_TOKEN_DEPLOYMENT_QUEUED';
ALTER TYPE "AuditAction" ADD VALUE 'SUBSCRIPTION_PAYMENT_OPENED';
