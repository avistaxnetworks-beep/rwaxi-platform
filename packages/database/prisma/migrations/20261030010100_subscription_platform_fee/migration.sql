-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Each subscription linked to the platform fee, and the tenant NDA recorded on the investor
-- ════════════════════════════════════════════════════════════════════════════
-- subscriptions.platform_fee_bps / platform_fee_usd: the fee RWAXI will invoice the developer for the subscription
-- (B2B; the investor never pays it): estimated at signature, fixed by the token when it is deployed, accrued when
-- the fiat payment is reconciled. Both or neither (rows signed before the link stay NULL).
-- investors.tenant_nda_accepted / tenant_nda_date (second half of the double legal wall, in the schema since the
-- legal-wall migration and written from now on): carried over from the NDAs already signed.

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "platform_fee_bps" INTEGER,
ADD COLUMN "platform_fee_usd" DECIMAL(18,2);

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_platform_fee_check" CHECK (
  ("platform_fee_bps" IS NULL) = ("platform_fee_usd" IS NULL)
  AND ("platform_fee_bps" IS NULL OR "platform_fee_bps" BETWEEN 25 AND 500)
  AND ("platform_fee_usd" IS NULL OR "platform_fee_usd" >= 0)
);

-- The NDAs signed before the investor carried the flag.
UPDATE "investors" i
   SET "tenant_nda_accepted" = true,
       "tenant_nda_date" = n.first_accepted
  FROM (SELECT "investor_id", min("accepted_at") AS first_accepted FROM "nda_acceptances" GROUP BY "investor_id") n
 WHERE n."investor_id" = i."id" AND NOT i."tenant_nda_accepted";
