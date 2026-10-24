-- ════════════════════════════════════════════════════════════════════════════
-- RWAXI · Mail delivery with redaction, and rate limits.
--
--   mail_outbox      delivered by the MailDispatcher (@rwaxi/mail). The body carries a secret (an OTP code, an
--                    activation link) and is cleared once it is no longer needed — sent, undeliverable, used,
--                    superseded or expired —; its SHA-256 and the delivery metadata stay.
--   rate_limit_hits  hits of the platform's rate limits (DocumentVault uploads per session and per IP address),
--                    recorded and counted only by rwaxi_rate_limit_hit() (SECURITY DEFINER): the app roles
--                    cannot read or change them.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "MailStatus" AS ENUM ('PENDING', 'SENT', 'CAPTURED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MailRedaction" AS ENUM ('SENT', 'FAILED', 'CONSUMED', 'SUPERSEDED', 'EXPIRED');

-- AlterTable
ALTER TABLE "mail_outbox" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "body_sha256" TEXT,
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "last_attempt_at" TIMESTAMP(3),
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "provider_message_id" TEXT,
ADD COLUMN     "redacted_at" TIMESTAMP(3),
ADD COLUMN     "redaction_reason" "MailRedaction",
ADD COLUMN     "related_id" TEXT,
ADD COLUMN     "status" "MailStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "body" DROP NOT NULL;

-- Rows queued before this migration: their hash and how long what they carry lasts (an OTP 10 minutes, an
-- activation link 72 hours); the ones already past it are redacted now.
UPDATE "mail_outbox" SET "body_sha256" = encode(sha256(convert_to("body", 'UTF8')), 'hex');
UPDATE "mail_outbox"
   SET "expires_at" = "created_at" + CASE WHEN "purpose" = 'INVESTOR_OTP' THEN interval '10 minutes' ELSE interval '72 hours' END;
UPDATE "mail_outbox" SET "status" = 'SENT' WHERE "sent_at" IS NOT NULL;
UPDATE "mail_outbox"
   SET "body" = NULL,
       "redacted_at" = CURRENT_TIMESTAMP,
       "redaction_reason" = CASE WHEN "status" = 'SENT' THEN 'SENT'::"MailRedaction" ELSE 'EXPIRED'::"MailRedaction" END,
       "status" = CASE WHEN "status" = 'SENT' THEN 'SENT'::"MailStatus" ELSE 'CANCELLED'::"MailStatus" END
 WHERE "sent_at" IS NOT NULL OR "expires_at" <= CURRENT_TIMESTAMP;
ALTER TABLE "mail_outbox" ALTER COLUMN "body_sha256" SET NOT NULL;

-- CreateTable
CREATE TABLE "rate_limit_hits" (
    "id" BIGSERIAL NOT NULL,
    "bucket" TEXT NOT NULL,
    "hit_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_limit_hits_bucket_hit_at_idx" ON "rate_limit_hits"("bucket", "hit_at");

-- CreateIndex
CREATE INDEX "mail_outbox_status_last_attempt_at_idx" ON "mail_outbox"("status", "last_attempt_at");

-- CreateIndex
CREATE INDEX "mail_outbox_related_id_idx" ON "mail_outbox"("related_id");

-- CreateIndex
CREATE INDEX "mail_outbox_expires_at_idx" ON "mail_outbox"("expires_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- Integrity of a mail's life cycle:
--   · a body exists exactly while it is not redacted, and a redaction always says why;
--   · PENDING keeps its body; SENT, FAILED and CANCELLED never do (CAPTURED keeps it until what it carries is
--     used or expires);
--   · sent_at marks delivery (SENT to a provider, CAPTURED by the development sink).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "mail_outbox" ADD CONSTRAINT "mail_outbox_redaction"
  CHECK (("body" IS NULL) = ("redacted_at" IS NOT NULL) AND ("redacted_at" IS NULL) = ("redaction_reason" IS NULL));
ALTER TABLE "mail_outbox" ADD CONSTRAINT "mail_outbox_status_redaction"
  CHECK (CASE "status" WHEN 'PENDING' THEN "redacted_at" IS NULL WHEN 'CAPTURED' THEN true ELSE "redacted_at" IS NOT NULL END);
ALTER TABLE "mail_outbox" ADD CONSTRAINT "mail_outbox_delivery"
  CHECK (("status" IN ('SENT', 'CAPTURED')) = ("sent_at" IS NOT NULL));
ALTER TABLE "mail_outbox" ADD CONSTRAINT "mail_outbox_attempts_range" CHECK ("attempts" >= 0);
ALTER TABLE "mail_outbox" ADD CONSTRAINT "mail_outbox_body_sha256_format" CHECK ("body_sha256" ~ '^[0-9a-f]{64}$');

-- ─────────────────────────────────────────────────────────────────────────────
-- rwaxi_redact_expired_mail(): clears the body of every mail whose code or link expired, in every tenant (a
-- PENDING one is CANCELLED: it will not be delivered). It only destroys what is no longer valid, so any app
-- role may run it — the dispatcher does on each delivery, the mail:dispatch job on a schedule.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rwaxi_redact_expired_mail()
  RETURNS integer
  LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  WITH redacted AS (
    UPDATE "mail_outbox"
       SET "body" = NULL,
           "redacted_at" = CURRENT_TIMESTAMP,
           "redaction_reason" = 'EXPIRED',
           "status" = CASE WHEN "status" = 'PENDING' THEN 'CANCELLED'::"MailStatus" ELSE "status" END
     WHERE "redacted_at" IS NULL AND "expires_at" <= CURRENT_TIMESTAMP
    RETURNING 1
  )
  SELECT count(*)::integer FROM redacted
$$;
REVOKE ALL ON FUNCTION rwaxi_redact_expired_mail() FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- rwaxi_rate_limit_hit(bucket, window, max): one more hit of `bucket` if fewer than `max` happened in the
-- last `window` seconds. Returns 0 when the hit was allowed (and recorded); otherwise the seconds until the
-- oldest hit leaves the window (nothing recorded). Hits of one bucket are serialised with an advisory lock.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rwaxi_rate_limit_hit(p_bucket text, p_window_seconds integer, p_max integer)
  RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  n integer;
  oldest timestamptz;
BEGIN
  IF p_bucket IS NULL OR length(p_bucket) NOT BETWEEN 1 AND 200
     OR p_window_seconds NOT BETWEEN 1 AND 86400 OR p_max NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'rwaxi_rate_limit_hit: invalid arguments';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('rwaxi-rate-limit:' || p_bucket));
  DELETE FROM "rate_limit_hits"
   WHERE "bucket" = p_bucket AND "hit_at" < now() - make_interval(secs => p_window_seconds);
  -- Now and then, hits of buckets nobody uses anymore go too.
  IF random() < 0.01 THEN
    DELETE FROM "rate_limit_hits" WHERE "hit_at" < now() - interval '1 day';
  END IF;
  SELECT count(*), min("hit_at") INTO n, oldest FROM "rate_limit_hits" WHERE "bucket" = p_bucket;
  IF n >= p_max THEN
    RETURN greatest(1, ceil(extract(epoch FROM (oldest + make_interval(secs => p_window_seconds) - now())))::integer);
  END IF;
  INSERT INTO "rate_limit_hits" ("bucket") VALUES (p_bucket);
  RETURN 0;
END
$$;
REVOKE ALL ON FUNCTION rwaxi_rate_limit_hit(text, integer, integer) FROM PUBLIC;

-- Not tenant data and not the app's to read: deny-all RLS (no policy) plus no privileges; the SECURITY DEFINER
-- function above, owned by the migration role, is the only way in.
ALTER TABLE "rate_limit_hits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limit_hits" FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['rwaxi_app', 'rwaxi_platform'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION rwaxi_redact_expired_mail() TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION rwaxi_rate_limit_hit(text, integer, integer) TO %I', r);
      EXECUTE format('REVOKE ALL ON TABLE "rate_limit_hits" FROM %I', r);
      EXECUTE format('REVOKE ALL ON SEQUENCE "rate_limit_hits_id_seq" FROM %I', r);
    END IF;
  END LOOP;
END $$;
