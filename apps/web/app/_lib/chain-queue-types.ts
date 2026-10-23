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
      scope: "pending" | "all";
      counts: { pending: number; total: number };
      items: ChainQueueItem[];
    }
  | { ok: false; error: string };
