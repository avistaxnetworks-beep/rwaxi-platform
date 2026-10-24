// Pure ABI encoding of outbox rows (no I/O, no secrets): shared by the API, the executor and its tests.
import {
  encodeFunctionData,
  getAbiItem,
  toEventSelector,
  toFunctionSelector,
  type Abi,
  type AbiEvent,
  type AbiFunction,
  type AbiParameter,
} from "viem";
import { rwaxiComplianceRegistryAbi, rwaxiPropertyTokenAbi, rwaxiTenantFactoryAbi } from "@rwaxi/blockchain-sdk/abi";
import type { ChainTransaction, ChainTxKind } from "@rwaxi/database";
import type { ChainQueueItem, RwaxiContract } from "@/app/_lib/chain-queue-types";
import { msg } from "@/app/_i18n/marks";
import { spanish, type Translate } from "@/app/_i18n/translate";

const CONTRACT: Record<ChainTxKind, RwaxiContract> = {
  TENANT_REGISTRY_DEPLOYED: "RwaxiTenantFactory",
  OFFERING_TOKEN_DEPLOYED: "RwaxiTenantFactory",
  INVESTOR_WHITELISTED: "RwaxiComplianceRegistry",
  INVESTOR_REVOKED: "RwaxiComplianceRegistry",
  INVESTOR_FREEZE_UPDATED: "RwaxiComplianceRegistry",
  SUBSCRIPTION_MINTED: "RwaxiPropertyToken",
  DATA_ROOM_ROOT_ANCHORED: "RwaxiPropertyToken",
  DISTRIBUTION_ROOT_ANCHORED: "RwaxiPropertyToken",
  FORCED_RECOVERY: "RwaxiPropertyToken",
  TOKEN_PAUSED: "RwaxiPropertyToken",
  TOKEN_UNPAUSED: "RwaxiPropertyToken",
  MINTER_ROLE_GRANTED: "RwaxiPropertyToken",
};

/** Who signs, per the contracts' AccessControl (RWAXI never holds the issuer's roles). */
const SIGNER: Record<ChainTxKind, string> = {
  TENANT_REGISTRY_DEPLOYED: msg("RWAXI_OPERATOR_ROLE · operador RWAXI"),
  OFFERING_TOKEN_DEPLOYED: msg("RWAXI_OPERATOR_ROLE · operador RWAXI"),
  INVESTOR_WHITELISTED: msg("COMPLIANCE_OFFICER_ROLE · Oficial de Cumplimiento del tenant"),
  INVESTOR_REVOKED: msg("COMPLIANCE_OFFICER_ROLE · Oficial de Cumplimiento del tenant"),
  INVESTOR_FREEZE_UPDATED: msg("COMPLIANCE_OFFICER_ROLE · Oficial de Cumplimiento del tenant"),
  SUBSCRIPTION_MINTED: msg("MINTER_ROLE · adaptador RWAXI, tras verificar el pago"),
  DATA_ROOM_ROOT_ANCHORED: msg("DATA_ROOM_ROLE · emisor"),
  DISTRIBUTION_ROOT_ANCHORED: msg("DISTRIBUTION_ROLE · emisor (desarrollador)"),
  FORCED_RECOVERY: msg("LEGAL_ENFORCEMENT_ROLE · emisor"),
  TOKEN_PAUSED: msg("ISSUER_ADMIN_ROLE o COMPLIANCE_OFFICER_ROLE · emisor"),
  TOKEN_UNPAUSED: msg("ISSUER_ADMIN_ROLE o COMPLIANCE_OFFICER_ROLE · emisor"),
  MINTER_ROLE_GRANTED: msg("DEFAULT_ADMIN_ROLE · emisor, a su propia wallet"),
};

interface CallSpec {
  abi: Abi;
  fn: string;
  event: string | null;
  note?: string;
}

/** Contract call behind each outbox kind (compiled ABIs from contracts/). */
const CALLS: Partial<Record<ChainTxKind, CallSpec>> = {
  TENANT_REGISTRY_DEPLOYED: {
    abi: rwaxiTenantFactoryAbi,
    fn: "deployTenantRegistry",
    event: "TenantRegistryDeployed",
    note: msg("La ejecuta el operador RWAXI (RWAXI_OPERATOR_ROLE) desde la consola de plataforma; sin registro el tenant no puede aprobar inversionistas."),
  },
  INVESTOR_WHITELISTED: { abi: rwaxiComplianceRegistryAbi, fn: "approveInvestor", event: "InvestorWhitelisted" },
  INVESTOR_REVOKED: { abi: rwaxiComplianceRegistryAbi, fn: "revokeInvestor", event: "InvestorRevoked" },
  INVESTOR_FREEZE_UPDATED: { abi: rwaxiComplianceRegistryAbi, fn: "setFrozen", event: "InvestorFreezeUpdated" },
  SUBSCRIPTION_MINTED: {
    abi: rwaxiPropertyTokenAbi,
    fn: "mintSubscription",
    event: "SubscriptionTokensMinted",
    note: msg("El hook _update del token exige que el receptor esté en la whitelist: su approveInvestor() debe confirmarse antes."),
  },
  DATA_ROOM_ROOT_ANCHORED: { abi: rwaxiPropertyTokenAbi, fn: "updateDataRoomMerkleRoot", event: "DataRoomMerkleRootAnchored" },
  DISTRIBUTION_ROOT_ANCHORED: {
    abi: rwaxiPropertyTokenAbi,
    fn: "anchorDistributionRoot",
    event: "DistributionRootAnchored",
    note: msg("Ancla la raíz de Merkle de las asignaciones; la firma el emisor (DISTRIBUTION_ROLE), RWAXI no custodia ese rol."),
  },
  TOKEN_PAUSED: { abi: rwaxiPropertyTokenAbi, fn: "pause", event: "Paused" },
  TOKEN_UNPAUSED: { abi: rwaxiPropertyTokenAbi, fn: "unpause", event: "Unpaused" },
  MINTER_ROLE_GRANTED: {
    abi: rwaxiPropertyTokenAbi,
    fn: "grantRole",
    event: "RoleGranted",
    note: msg("El emisor se otorga MINTER_ROLE para firmar sus propios mint con su wallet; RWAXI no recibe ningún rol nuevo."),
  },
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;

/** Stored JSON value → the value viem expects for an ABI parameter, or undefined if invalid. */
function coerce(param: AbiParameter, value: unknown): unknown {
  const t = param.type;
  // Lowercase: the same 20 bytes, and viem rejects a mixed- or upper-case address whose checksum does not match.
  if (t === "address") return typeof value === "string" && ADDRESS.test(value) ? value.toLowerCase() : undefined;
  if (t === "bytes32") return typeof value === "string" && BYTES32.test(value) ? value : undefined;
  if (t === "bool") return typeof value === "boolean" ? value : undefined;
  if (t === "string") return typeof value === "string" ? value : undefined;
  const m = /^(u?)int(\d*)$/.exec(t);
  if (m) {
    const n =
      (typeof value === "number" && Number.isSafeInteger(value)) || (typeof value === "string" && /^-?\d+$/.test(value))
        ? BigInt(value)
        : null;
    if (n === null || (m[1] === "u" && n < 0n)) return undefined;
    return Number(m[2] || 256) <= 48 ? Number(n) : n; // viem: small ints as number, larger as bigint
  }
  return undefined;
}

type Encoded = Pick<ChainQueueItem, "calldata" | "selector" | "expectedEvent">;
const NOT_ENCODED: Encoded = { calldata: null, selector: null, expectedEvent: null };

function encode(spec: CallSpec, args: Record<string, unknown>, method: string): Encoded {
  const fn = getAbiItem({ abi: spec.abi, name: spec.fn }) as AbiFunction | undefined;
  if (!fn) return NOT_ENCODED;
  const values = fn.inputs.map((input) => coerce(input, args[input.name ?? ""]));
  if (values.some((v) => v === undefined)) return NOT_ENCODED;
  const calldata = encodeFunctionData({ abi: spec.abi, functionName: spec.fn, args: values });
  // Never offer calldata for an outbox row whose stored signature disagrees with what would be signed.
  if (calldata.slice(0, 10) !== toFunctionSelector(method)) return NOT_ENCODED;
  const ev = spec.event ? (getAbiItem({ abi: spec.abi, name: spec.event }) as AbiEvent | undefined) : undefined;
  return {
    calldata,
    selector: calldata.slice(0, 10),
    expectedEvent: ev ? { signature: `${ev.name}(${ev.inputs.map((i) => i.type).join(",")})`, topic0: toEventSelector(ev) } : null,
  };
}

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v ?? null));

/**
 * Arguments in call order. jsonb reorders object keys, so known calls take names and types from
 * the compiled ABI; other kinds show their descriptive args as stored.
 */
function argsView(spec: CallSpec | undefined, args: Record<string, unknown>): ChainQueueItem["args"] {
  const fn = spec ? (getAbiItem({ abi: spec.abi, name: spec.fn }) as AbiFunction | undefined) : undefined;
  if (fn) return fn.inputs.map((input) => ({ name: input.name ?? "", type: input.type, value: show(args[input.name ?? ""]) }));
  return Object.entries(args).map(([name, value]) => ({ name, type: typeof value, value: show(value) }));
}

const argsOf = (raw: unknown) =>
  (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;

/** ABI calldata for an outbox row, or null when its stored args cannot be encoded. */
export function calldataOf(tx: Pick<ChainTransaction, "kind" | "args" | "method">): { calldata: `0x${string}`; fn: string } | null {
  const spec = CALLS[tx.kind];
  if (!spec) return null;
  const { calldata } = encode(spec, argsOf(tx.args), tx.method);
  return calldata ? { calldata: calldata as `0x${string}`, fn: spec.fn } : null;
}

/** Event the contract emits when the call behind an outbox kind succeeds (e.g. InvestorWhitelisted). */
export const eventOf = (kind: ChainTxKind): string | null => CALLS[kind]?.event ?? null;

/** Wallet an outbox row refers to (whitelisting: `wallet`; minting: `investor`). */
export function walletOf(args: unknown): string | null {
  const a = (args ?? {}) as { wallet?: unknown; investor?: unknown };
  const w = typeof a.wallet === "string" ? a.wallet : typeof a.investor === "string" ? a.investor : null;
  return w && ADDRESS.test(w) ? w.toLowerCase() : null;
}

export function toQueueItem(
  tx: ChainTransaction & { offering: { code: string } | null },
  investorByWallet: Map<string, string>,
  blockedReason: string | null = null,
  tr: Translate = spanish,
): ChainQueueItem {
  const args = argsOf(tx.args);
  const spec = CALLS[tx.kind];
  const wallet = walletOf(args);
  return {
    id: tx.id,
    kind: tx.kind,
    status: tx.status,
    network: tx.network,
    contract: CONTRACT[tx.kind],
    contractAddress: tx.contractAddress,
    fn: tx.method.split("(")[0] ?? tx.method,
    signature: tx.method,
    args: argsView(spec, args),
    ...(spec ? encode(spec, args, tx.method) : NOT_ENCODED),
    signerRole: tr(SIGNER[tx.kind]),
    note: tx.status === "PENDING" && spec?.note ? tr(spec.note) : null,
    blockedReason: tx.status === "PENDING" ? blockedReason : null,
    execution: tx.executionMode
      ? {
          mode: tx.executionMode,
          signer: tx.signerAddress,
          nonce: tx.nonce,
          executedAt: tx.executedAt?.toISOString() ?? null,
        }
      : null,
    investorName: wallet ? (investorByWallet.get(wallet) ?? null) : null,
    offeringCode: tx.offering?.code ?? null,
    txHash: tx.txHash,
    blockNumber: tx.blockNumber?.toString() ?? null,
    createdAt: tx.createdAt.toISOString(),
  };
}
