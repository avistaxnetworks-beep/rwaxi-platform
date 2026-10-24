-- ════════════════════════════════════════════════════════════════════════════
-- Maintenance job over HTTP (/api/internal/maintenance, Vercel Cron): the app role runs the mail batch of
-- every tenant without BYPASSRLS. Next to rwaxi_mail_due() (what an attempt may take now) and
-- rwaxi_redact_expired_mail() (bodies whose code or link expired), the dispatcher's first step:
--   rwaxi_mail_fail_exhausted()   PENDING mails whose every attempt started and never reported back → FAILED
-- ════════════════════════════════════════════════════════════════════════════

-- rwaxi_mail_fail_exhausted(max_attempts, lease_seconds): mails of every tenant that used up their attempts —
-- the last one older than the lease, so none is still in flight — are undeliverable: FAILED, body cleared
-- (redaction FAILED), as MailDispatcher.deliverPending() does under one tenant. Returns how many. Arguments out
-- of range change nothing.
CREATE OR REPLACE FUNCTION rwaxi_mail_fail_exhausted(p_max_attempts integer, p_lease_seconds integer)
  RETURNS integer
  LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  WITH failed AS (
    UPDATE "mail_outbox"
       SET "status" = 'FAILED',
           "body" = NULL,
           "redacted_at" = CURRENT_TIMESTAMP,
           "redaction_reason" = 'FAILED'
     WHERE "status" = 'PENDING'
       AND p_max_attempts BETWEEN 1 AND 100
       AND p_lease_seconds BETWEEN 1 AND 86400
       AND "attempts" >= p_max_attempts
       AND "last_attempt_at" < CURRENT_TIMESTAMP - make_interval(secs => p_lease_seconds)
    RETURNING 1
  )
  SELECT count(*)::integer FROM failed
$$;
REVOKE ALL ON FUNCTION rwaxi_mail_fail_exhausted(integer, integer) FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['rwaxi_app', 'rwaxi_platform'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION rwaxi_mail_fail_exhausted(integer, integer) TO %I', r);
    END IF;
  END LOOP;
END $$;
