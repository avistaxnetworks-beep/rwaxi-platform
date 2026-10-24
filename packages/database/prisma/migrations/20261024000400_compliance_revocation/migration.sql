-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Revocation of approved investors, voided fees and the maintenance job's bounded reads.
--
--   kyc_cases            REVOKED: who, when, why (closed list) and the officer's justification
--   subscriptions        CANCELLED: when and why (a cancellation released its committed units)
--   fee_ledger_entries   VOIDED: an INFRASTRUCTURE_USAGE fee whose emission never happened is never billed
--   rwaxi_mail_due()               ids of the mails due for a delivery attempt, in every tenant (no bodies)
--   rwaxi_vault_referenced_keys()  storage keys the database references, for the DocumentVault GC
-- ════════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "fee_ledger_entries" ADD COLUMN     "voided_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "kyc_cases" ADD COLUMN     "revocation_note" TEXT,
ADD COLUMN     "revocation_reason" TEXT,
ADD COLUMN     "revoked_at" TIMESTAMP(3),
ADD COLUMN     "revoked_by_id" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Subscriptions cancelled before this migration get a cancellation date.
UPDATE "subscriptions" SET "cancelled_at" = "updated_at" WHERE "status"::text = 'CANCELLED' AND "cancelled_at" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Integrity (enum values compared as text: they were added by the previous migration).
-- ─────────────────────────────────────────────────────────────────────────────
-- A revoked case always says when, why and on what grounds; no other case carries a revocation.
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_revocation_check"
  CHECK (("status"::text = 'REVOKED') = ("revoked_at" IS NOT NULL)
    AND ("revoked_at" IS NULL) = ("revocation_reason" IS NULL)
    AND ("revoked_at" IS NULL) = ("revocation_note" IS NULL));
-- A cancelled subscription has its cancellation date, and only it.
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_cancellation_check"
  CHECK (("status"::text = 'CANCELLED') = ("cancelled_at" IS NOT NULL));
-- Billing lifecycle: not invoiced ⇔ ACCRUED or VOIDED; a voided entry has its date.
ALTER TABLE "fee_ledger_entries" DROP CONSTRAINT "fee_ledger_entries_invoice_status_check";
ALTER TABLE "fee_ledger_entries" ADD CONSTRAINT "fee_ledger_entries_invoice_status_check"
  CHECK (("status"::text IN ('ACCRUED', 'VOIDED')) = ("invoice_id" IS NULL));
ALTER TABLE "fee_ledger_entries" ADD CONSTRAINT "fee_ledger_entries_voided_check"
  CHECK (("status"::text = 'VOIDED') = ("voided_at" IS NOT NULL));

-- The reviewer and the revoker of a case are staff of its own organization (FKs ignore RLS).
DROP TRIGGER same_tenant ON "kyc_cases";
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "kyc_cases"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_assert_same_tenant(
    'offerings', 'offering_id', 'investors', 'investor_id', 'users', 'reviewed_by_id', 'users', 'revoked_by_id');

-- ─────────────────────────────────────────────────────────────────────────────
-- rwaxi_mail_due(limit, max_attempts, lease_seconds): the mails of every tenant a delivery attempt may take now
-- (PENDING, under the attempt limit, lease free, what they carry still valid). Ids and organizations only: the
-- dispatcher reads and updates each one under its own tenant's RLS.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rwaxi_mail_due(p_limit integer, p_max_attempts integer, p_lease_seconds integer)
  RETURNS TABLE (id text, organization_id text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m."id", m."organization_id"
  FROM "mail_outbox" m
  WHERE m."status" = 'PENDING'
    AND m."organization_id" IS NOT NULL
    AND m."attempts" < p_max_attempts
    AND (m."last_attempt_at" IS NULL OR m."last_attempt_at" < CURRENT_TIMESTAMP - make_interval(secs => p_lease_seconds))
    AND (m."expires_at" IS NULL OR m."expires_at" > CURRENT_TIMESTAMP)
  ORDER BY m."created_at"
  LIMIT least(greatest(p_limit, 1), 500)
$$;
REVOKE ALL ON FUNCTION rwaxi_mail_due(integer, integer, integer) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- rwaxi_vault_referenced_keys(): the storage keys a DocumentVault object must keep (vault_objects and
-- data_room_documents of every tenant) — keys only, for the garbage collector.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rwaxi_vault_referenced_keys()
  RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT "storage_key" FROM "vault_objects"
  UNION
  SELECT "storage_key" FROM "data_room_documents" WHERE "storage_key" IS NOT NULL
$$;
REVOKE ALL ON FUNCTION rwaxi_vault_referenced_keys() FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['rwaxi_app', 'rwaxi_platform'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION rwaxi_mail_due(integer, integer, integer) TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION rwaxi_vault_referenced_keys() TO %I', r);
    END IF;
  END LOOP;
END $$;
