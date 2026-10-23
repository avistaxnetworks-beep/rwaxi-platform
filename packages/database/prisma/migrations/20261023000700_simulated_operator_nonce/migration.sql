-- CreateIndex
CREATE UNIQUE INDEX "chain_transactions_signer_nonce_key" ON "chain_transactions"("network", "execution_mode", "signer_address", "nonce");

-- ─────────────────────────────────────────────────────────────────────────────
-- rwaxi_next_simulated_nonce(network, signer): RWAXI's operator account is one for
-- every tenant, so its nonce sequence is global, while the app role only sees its
-- tenant's rows (RLS). This SECURITY DEFINER function returns just the next nonce
-- of that signer on that network among SIMULATION rows — a counter, no tenant data.
-- Callers serialise per signer and network with pg_advisory_xact_lock; the unique
-- index above rejects any reuse that slipped through.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rwaxi_next_simulated_nonce(p_network "ChainNetwork", p_signer text)
  RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(MAX(t."nonce") + 1, 0)::integer
  FROM "chain_transactions" t
  WHERE t."network" = p_network
    AND t."execution_mode" = 'SIMULATION'
    AND t."signer_address" = p_signer
$$;
REVOKE ALL ON FUNCTION rwaxi_next_simulated_nonce("ChainNetwork", text) FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['rwaxi_app', 'rwaxi_platform'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION rwaxi_next_simulated_nonce("ChainNetwork", text) TO %I', r);
    END IF;
  END LOOP;
END $$;
