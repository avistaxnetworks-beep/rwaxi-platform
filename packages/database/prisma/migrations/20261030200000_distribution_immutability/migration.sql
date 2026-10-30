-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Declared yield distributions are immutable in PostgreSQL itself, for every role
-- ════════════════════════════════════════════════════════════════════════════
-- The app roles already could not UPDATE/DELETE allocations and payment instructions (privileges revoked). These
-- triggers hold for any role that keeps its privileges — the table owner included:
--   distributions                 never deleted; what was declared (amount, currency, rate, record date and instant,
--                                 units, holders, Merkle root, leaf version, supporting document and its SHA-256, the
--                                 period, offering and id) never changes. Only its anchoring may happen, once:
--                                 DECLARED → ANCHORED with the hash of the confirmed transaction. declared_by_id may
--                                 only become NULL (its user removed: ON DELETE SET NULL).
--   distribution_allocations,     strictly append-only (no UPDATE, no DELETE); a payment instruction's creator may only
--   distribution_payout_batches,  become NULL for the same reason.
--   distribution_payouts
-- TRUNCATE (resetting a database: the seed) fires no row trigger. Changing this rule takes a migration (DDL), never
-- a write.

CREATE OR REPLACE FUNCTION rwaxi_distribution_immutable() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RWAXI: una distribución declarada no se elimina (%).', OLD."id" USING ERRCODE = '42501';
  END IF;
  IF (NEW."id", NEW."organization_id", NEW."offering_id", NEW."onchain_id", NEW."period", NEW."currency",
      NEW."amount_declared", NEW."fx_rate", NEW."total_usd", NEW."total_units", NEW."holders", NEW."record_date",
      NEW."snapshot_at", NEW."snapshot_mode", NEW."leaf_version", NEW."merkle_root", NEW."support_sha256",
      NEW."support_file_name", NEW."support_mime_type", NEW."support_size_bytes", NEW."support_storage_key",
      NEW."created_at")
     IS DISTINCT FROM
     (OLD."id", OLD."organization_id", OLD."offering_id", OLD."onchain_id", OLD."period", OLD."currency",
      OLD."amount_declared", OLD."fx_rate", OLD."total_usd", OLD."total_units", OLD."holders", OLD."record_date",
      OLD."snapshot_at", OLD."snapshot_mode", OLD."leaf_version", OLD."merkle_root", OLD."support_sha256",
      OLD."support_file_name", OLD."support_mime_type", OLD."support_size_bytes", OLD."support_storage_key",
      OLD."created_at") THEN
    RAISE EXCEPTION 'RWAXI: los datos declarados de una distribución son inmutables (%).', OLD."id" USING ERRCODE = '42501';
  END IF;
  IF NEW."declared_by_id" IS DISTINCT FROM OLD."declared_by_id" AND NEW."declared_by_id" IS NOT NULL THEN
    RAISE EXCEPTION 'RWAXI: quien declaró una distribución no cambia (%).', OLD."id" USING ERRCODE = '42501';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (OLD."status" = 'DECLARED' AND NEW."status" = 'ANCHORED') THEN
    RAISE EXCEPTION 'RWAXI: una distribución sólo pasa de DECLARED a ANCHORED (%).', OLD."id" USING ERRCODE = '42501';
  END IF;
  IF OLD."anchor_tx_hash" IS NOT NULL AND NEW."anchor_tx_hash" IS DISTINCT FROM OLD."anchor_tx_hash" THEN
    RAISE EXCEPTION 'RWAXI: el anclaje de una distribución no cambia una vez registrado (%).', OLD."id" USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER distributions_immutable BEFORE UPDATE OR DELETE ON "distributions"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_distribution_immutable();

-- Append-only rows; the only UPDATE allowed is the foreign key SET NULL of a removed creator (TG_ARGV[0], if any).
CREATE OR REPLACE FUNCTION rwaxi_append_only() RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  nullable text := TG_ARGV[0];
BEGIN
  IF TG_OP = 'UPDATE' AND nullable IS NOT NULL
     AND (to_jsonb(NEW) - nullable) = (to_jsonb(OLD) - nullable)
     AND to_jsonb(NEW) -> nullable = 'null'::jsonb THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'RWAXI: % es de solo inserción: sus filas no se modifican ni se eliminan (%).', TG_TABLE_NAME, OLD."id"
    USING ERRCODE = '42501';
END $$;

CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON "distribution_allocations"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_append_only();
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON "distribution_payout_batches"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_append_only('created_by_id');
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON "distribution_payouts"
  FOR EACH ROW EXECUTE FUNCTION rwaxi_append_only();

-- The app roles never delete a distribution (its anchoring is an UPDATE the trigger allows).
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['rwaxi_app', 'rwaxi_platform'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE DELETE, TRUNCATE ON "distributions" FROM %I', r);
    END IF;
  END LOOP;
END $$;
