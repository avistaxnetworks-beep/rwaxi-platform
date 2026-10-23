import "server-only";
import {
  encodeFunctionData,
  getAbiItem,
  toEventSelector,
  toFunctionSelector,
  type AbiEvent,
  type AbiFunction,
  type Address,
  type Hex,
} from "viem";
import { rwaxiComplianceRegistryAbi } from "@rwaxi/blockchain-sdk/abi";
import type { ChainTransaction, ChainTxKind } from "@rwaxi/database";
import type { ChainQueueItem, RwaxiContract } from "@/app/_lib/chain-queue-types";

const CONTRACT: Record<ChainTxKind, RwaxiContract> = {
  TENANT_REGISTRY_DEPLOYED: "RwaxiTenantFactory",
  OFFERING_TOKEN_DEPLOYED: "RwaxiTenantFactory",
  INVESTOR_WHITELISTED: "RwaxiComplianceRegistry",
  INVESTOR_REVOKED: "RwaxiComplianceRegistry",
  INVESTOR_FREEZE_UPDATED: "RwaxiComplianceRegistry",
  SUBSCRIPTION_MINTED: "RwaxiPropertyToken",
  DATA_ROOM_ROOT_ANCHORED: "RwaxiPropertyToken",
  FORCED_RECOVERY: "RwaxiPropertyToken",
  TOKEN_PAUSED: "RwaxiPropertyToken",
  TOKEN_UNPAUSED: "RwaxiPropertyToken",
};

/** Who signs, per the contracts' AccessControl (RWAXI never holds the issuer's roles). */
const SIGNER: Record<ChainTxKind, string> = {
  TENANT_REGISTRY_DEPLOYED: "RWAXI_OPERATOR_ROLE · operador RWAXI",
  OFFERING_TOKEN_DEPLOYED: "RWAXI_OPERATOR_ROLE · operador RWAXI",
  INVESTOR_WHITELISTED: "COMPLIANCE_OFFICER_ROLE · Oficial de Cumplimiento del tenant",
  INVESTOR_REVOKED: "COMPLIANCE_OFFICER_ROLE · Oficial de Cumplimiento del tenant",
  INVESTOR_FREEZE_UPDATED: "COMPLIANCE_OFFICER_ROLE · Oficial de Cumplimiento del tenant",
  SUBSCRIPTION_MINTED: "MINTER_ROLE · adaptador RWAXI",
  DATA_ROOM_ROOT_ANCHORED: "DATA_ROOM_ROLE · emisor",
  FORCED_RECOVERY: "LEGAL_ENFORCEMENT_ROLE · emisor",
  TOKEN_PAUSED: "ISSUER_ADMIN_ROLE o COMPLIANCE_OFFICER_ROLE · emisor",
  TOKEN_UNPAUSED: "ISSUER_ADMIN_ROLE o COMPLIANCE_OFFICER_ROLE · emisor",
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;

type Encoded = Pick<ChainQueueItem, "calldata" | "selector" | "expectedEvent">;
const NOT_ENCODED: Encoded = { calldata: null, selector: null, expectedEvent: null };

const eventOf = (name: "InvestorWhitelisted" | "InvestorRevoked" | "InvestorFreezeUpdated") => {
  const item = getAbiItem({ abi: rwaxiComplianceRegistryAbi, name }) as AbiEvent;
  const signature = `${item.name}(${item.inputs.map((i) => i.type).join(",")})`;
  return { signature, topic0: toEventSelector(item) };
};

/** Real calldata for RwaxiComplianceRegistry calls, from the compiled ABI. */
function encodeRegistryCall(kind: ChainTxKind, args: Record<string, unknown>): Encoded {
  const wallet = typeof args.wallet === "string" && ADDRESS.test(args.wallet) ? (args.wallet as Address) : null;
  if (!wallet) return NOT_ENCODED;
  if (kind === "INVESTOR_WHITELISTED") {
    const countryCode = args.countryCode;
    const hash = args.kycDossierHash;
    if (!Number.isInteger(countryCode) || typeof hash !== "string" || !BYTES32.test(hash)) return NOT_ENCODED;
    const calldata = encodeFunctionData({
      abi: rwaxiComplianceRegistryAbi,
      functionName: "approveInvestor",
      args: [wallet, countryCode as number, hash as Hex],
    });
    return { calldata, selector: calldata.slice(0, 10), expectedEvent: eventOf("InvestorWhitelisted") };
  }
  if (kind === "INVESTOR_REVOKED") {
    const calldata = encodeFunctionData({ abi: rwaxiComplianceRegistryAbi, functionName: "revokeInvestor", args: [wallet] });
    return { calldata, selector: calldata.slice(0, 10), expectedEvent: eventOf("InvestorRevoked") };
  }
  if (kind === "INVESTOR_FREEZE_UPDATED" && typeof args.frozen === "boolean") {
    const calldata = encodeFunctionData({
      abi: rwaxiComplianceRegistryAbi,
      functionName: "setFrozen",
      args: [wallet, args.frozen],
    });
    return { calldata, selector: calldata.slice(0, 10), expectedEvent: eventOf("InvestorFreezeUpdated") };
  }
  return NOT_ENCODED;
}

const REGISTRY_FN: Partial<Record<ChainTxKind, "approveInvestor" | "revokeInvestor" | "setFrozen">> = {
  INVESTOR_WHITELISTED: "approveInvestor",
  INVESTOR_REVOKED: "revokeInvestor",
  INVESTOR_FREEZE_UPDATED: "setFrozen",
};

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v ?? null));

/**
 * Arguments in call order. jsonb reorders object keys, so registry calls take names and types
 * from the compiled ABI; other kinds show their descriptive args as stored.
 */
function argsView(kind: ChainTxKind, args: Record<string, unknown>): ChainQueueItem["args"] {
  const fnName = REGISTRY_FN[kind];
  if (fnName) {
    const item = getAbiItem({ abi: rwaxiComplianceRegistryAbi, name: fnName }) as AbiFunction;
    return item.inputs.map((input) => ({ name: input.name ?? "", type: input.type, value: show(args[input.name ?? ""]) }));
  }
  return Object.entries(args).map(([name, value]) => ({ name, type: typeof value, value: show(value) }));
}

export function toQueueItem(
  tx: ChainTransaction & { offering: { code: string } | null },
  investorByWallet: Map<string, string>,
): ChainQueueItem {
  const args = (tx.args && typeof tx.args === "object" && !Array.isArray(tx.args) ? tx.args : {}) as Record<string, unknown>;
  const fn = tx.method.split("(")[0] ?? tx.method;
  let encoded = CONTRACT[tx.kind] === "RwaxiComplianceRegistry" ? encodeRegistryCall(tx.kind, args) : NOT_ENCODED;
  // Never offer calldata for an outbox row whose stored signature disagrees with what would be signed.
  if (encoded.selector && encoded.selector !== toFunctionSelector(tx.method)) encoded = NOT_ENCODED;
  const wallet = typeof args.wallet === "string" ? args.wallet.toLowerCase() : null;
  return {
    id: tx.id,
    kind: tx.kind,
    status: tx.status,
    network: tx.network,
    contract: CONTRACT[tx.kind],
    contractAddress: tx.contractAddress,
    fn,
    signature: tx.method,
    args: argsView(tx.kind, args),
    ...encoded,
    signerRole: SIGNER[tx.kind],
    investorName: wallet ? (investorByWallet.get(wallet) ?? null) : null,
    offeringCode: tx.offering?.code ?? null,
    txHash: tx.txHash,
    blockNumber: tx.blockNumber?.toString() ?? null,
    createdAt: tx.createdAt.toISOString(),
  };
}
