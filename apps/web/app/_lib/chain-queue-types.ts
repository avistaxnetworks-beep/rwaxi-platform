// ChainTransaction rows as shown by the On-Chain Inspector (shared server/client, no runtime imports).

export type RwaxiContract = "RwaxiTenantFactory" | "RwaxiComplianceRegistry" | "RwaxiPropertyToken";

/**
 * Calls the tenant's own staff may sign in their browser wallet (EIP-1193, RPC mode), with the contract role that
 * wallet must hold: the compliance officer the registry, the issuer's administrator the token. RWAXI never holds them
 * (MINTER_ROLE is RWAXI's adapter unless the issuer grants it to its own wallet).
 */
export const WALLET_SIGNER_ROLE: Readonly<Record<string, string>> = {
  INVESTOR_WHITELISTED: "COMPLIANCE_OFFICER_ROLE",
  INVESTOR_REVOKED: "COMPLIANCE_OFFICER_ROLE",
  INVESTOR_FREEZE_UPDATED: "COMPLIANCE_OFFICER_ROLE",
  SUBSCRIPTION_MINTED: "MINTER_ROLE",
  DATA_ROOM_ROOT_ANCHORED: "DATA_ROOM_ROLE",
  DISTRIBUTION_ROOT_ANCHORED: "DISTRIBUTION_ROLE",
  // the issuer's administrator grants MINTER_ROLE to its own wallet (DEFAULT_ADMIN_ROLE of its token)
  MINTER_ROLE_GRANTED: "DEFAULT_ADMIN_ROLE",
};

/** What the server prepared for one queued call: the browser wallet must sign exactly this. */
export interface WalletCall {
  chainTxId: string;
  kind: string;
  /** e.g. approveInvestor */
  fn: string;
  network: string;
  chainId: number;
  chainName: string;
  /** the tenant's contract (checksummed) */
  to: string;
  /** ABI calldata of the queued arguments (@rwaxi/blockchain-sdk ABIs) */
  data: string;
  /** the signer's registered wallet, which holds `role` on `to` (checked on-chain by the server) */
  from: string;
  role: string;
  /** hasRole(role, from) on `to`: the browser runs it through the wallet's own node before asking to sign */
  roleCall: { to: string; data: string };
}

export interface ChainQueueItem {
  id: string;
  kind: string;
  status: "PENDING" | "CONFIRMED" | "REVERTED" | "CANCELLED";
  network: string;
  contract: RwaxiContract;
  contractAddress: string;
  /** function name, e.g. approveInvestor */
  fn: string;
  /** canonical signature, e.g. approveInvestor(address,uint16,bytes32) */
  signature: string;
  args: { name: string; type: string; value: string }[];
  /** ABI-encoded call data ready to sign; null when the stored args are incomplete */
  calldata: string | null;
  selector: string | null;
  expectedEvent: { signature: string; topic0: string } | null;
  /** on-chain role that must sign it */
  signerRole: string;
  /** ordering / precondition the signer must respect (PENDING rows only) */
  note: string | null;
  /** why this PENDING row cannot be executed yet (contract invariant or queue precedence) */
  blockedReason: string | null;
  /** how a confirmed row was executed — SIMULATION rows were signed but never broadcast */
  execution: { mode: "RPC" | "SIMULATION"; signer: string | null; nonce: number | null; executedAt: string | null } | null;
  investorName: string | null;
  offeringCode: string | null;
  txHash: string | null;
  blockNumber: string | null;
  createdAt: string;
}

export type ChainQueueResponse =
  | {
      ok: true;
      tenant: { slug: string; displayName: string };
      /** how "Firmar y ejecutar" confirms rows on this deployment */
      execution: { mode: "RPC" | "SIMULATION"; operator: string | null };
      scope: "pending" | "all";
      counts: { pending: number; total: number };
      items: ChainQueueItem[];
    }
  | { ok: false; error: string };
