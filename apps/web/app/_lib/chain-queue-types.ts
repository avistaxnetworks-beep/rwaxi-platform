// ChainTransaction rows as shown by the On-Chain Inspector (shared server/client, no runtime imports).

export type RwaxiContract = "RwaxiTenantFactory" | "RwaxiComplianceRegistry" | "RwaxiPropertyToken";

export interface ChainQueueItem {
  id: string;
  kind: string;
  status: "PENDING" | "CONFIRMED" | "REVERTED";
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
