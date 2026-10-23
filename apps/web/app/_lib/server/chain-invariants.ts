import type { ChainTransaction, Prisma } from "@rwaxi/database";
import { calldataOf, walletOf } from "./chain-queue";

/**
 * Queue precedence and the contracts' revert conditions, replayed over the confirmed history of
 * a tenant's ChainTransaction outbox (pure: no I/O besides loadChainState's reads).
 *
 *   RwaxiComplianceRegistry  approveInvestor → InvalidWallet / EmptyDossierHash; the entry of a
 *                            wallet is the fold of its confirmed approve/revoke/setFrozen calls
 *                            (approve also clears the freeze).
 *   RwaxiPropertyToken       mintSubscription → SubscriptionAlreadyProcessed, SupplyCapExceeded,
 *                            EnforcedPause and, in _update, the receiver's isEligible().
 */
export const REGISTRY_KINDS = new Set(["INVESTOR_WHITELISTED", "INVESTOR_REVOKED", "INVESTOR_FREEZE_UPDATED"]);

const ZERO32 = `0x${"0".repeat(64)}`;
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

export interface ChainState {
  /** the tenant's RwaxiComplianceRegistry: only its calls make up the whitelist */
  registry: string | null;
  txs: ChainTransaction[];
  subscriptions: { onchainId: string | null; status: string; wallet: string | null }[];
  tokens: { contractAddress: string | null; status: string; maxSupply: number }[];
}

const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : null);
const argsOf = (raw: unknown) => (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
/** Order in which confirmed rows took effect (seeded history has no executedAt). */
const effectiveAt = (t: ChainTransaction) => (t.executedAt ?? t.createdAt).getTime();

/** Everything the invariants need, read in the caller's tenant-bound transaction. */
export async function loadChainState(db: Prisma.TransactionClient): Promise<ChainState> {
  const txs = await db.chainTransaction.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const subscriptions = await db.subscription.findMany({
    select: { onchainId: true, status: true, investor: { select: { walletAddress: true } } },
  });
  const tokens = await db.tokenDeployment.findMany({ select: { contractAddress: true, status: true, maxSupply: true } });
  const org = await db.organization.findFirst({ select: { complianceRegistry: true } }); // RLS: the tenant's own row
  return {
    registry: org?.complianceRegistry ?? null,
    txs,
    subscriptions: subscriptions.map((s) => ({ onchainId: s.onchainId, status: s.status, wallet: lower(s.investor.walletAddress) })),
    tokens,
  };
}

/** RwaxiComplianceRegistry._investors[wallet] after replaying the confirmed registry calls in order. */
export function registryEntry(state: ChainState, wallet: string): { approved: boolean; frozen: boolean } {
  const entry = { approved: false, frozen: false };
  const confirmed = state.txs
    .filter((t) => t.status === "CONFIRMED" && REGISTRY_KINDS.has(t.kind) && walletOf(t.args) === wallet)
    .filter((t) => !state.registry || lower(t.contractAddress) === lower(state.registry))
    .sort((a, b) => effectiveAt(a) - effectiveAt(b));
  for (const t of confirmed) {
    if (t.kind === "INVESTOR_WHITELISTED") Object.assign(entry, { approved: true, frozen: false });
    if (t.kind === "INVESTOR_REVOKED") entry.approved = false;
    if (t.kind === "INVESTOR_FREEZE_UPDATED") entry.frozen = argsOf(t.args).frozen === true;
  }
  return entry;
}

/** Why `tx` cannot run now — queue precedence or a contract revert — or null when it can. */
export function blockerFor(tx: ChainTransaction, state: ChainState): string | null {
  if (tx.status !== "PENDING") return "La transacción ya no está PENDING.";
  if (tx.executionMode) {
    return tx.txHash
      ? `Envío RPC en curso (${tx.txHash}): «Procesar cola en orden» lo concilia con su recibo.`
      : "Envío RPC reclamado sin tx hash: revisa el nodo antes de reintentar.";
  }
  if (!calldataOf(tx)) return "Argumentos incompletos: no se puede codificar el calldata.";
  const args = argsOf(tx.args);
  const wallet = walletOf(tx.args);
  const pendingForWallet = state.txs.filter(
    (t) => t.status === "PENDING" && t.id !== tx.id && REGISTRY_KINDS.has(t.kind) && walletOf(t.args) === wallet,
  );

  switch (tx.kind) {
    case "INVESTOR_WHITELISTED":
      if (lower(args.wallet) === ZERO_ADDRESS) return "Revertiría: InvalidWallet() — la wallet es address(0).";
      if (lower(args.kycDossierHash) === ZERO32) return "Revertiría: EmptyDossierHash() — el expediente no tiene hash.";
      if (pendingForWallet.some((t) => t.createdAt < tx.createdAt)) {
        return "Prelación: hay una operación anterior del registro pendiente para esta wallet.";
      }
      return null;

    case "SUBSCRIPTION_MINTED": {
      if (!wallet) return "El receptor del mint no es una dirección válida.";
      if (pendingForWallet.some((t) => t.kind === "INVESTOR_WHITELISTED")) {
        return "Prelación: el approveInvestor() de esta wallet sigue PENDING; ejecútalo primero.";
      }
      if (pendingForWallet.length) return "Prelación: hay una operación del registro pendiente para esta wallet.";
      const entry = registryEntry(state, wallet);
      if (!entry.approved) return "Revertiría: RWAXI Compliance: Receiver wallet is not approved in Tenant Whitelist.";
      if (entry.frozen) return "Revertiría: la wallet está congelada (isEligible = false).";

      const subscriptionId = lower(args.subscriptionId);
      const sub = state.subscriptions.find((s) => lower(s.onchainId) === subscriptionId);
      if (!sub) return "No existe la suscripción de ese subscriptionId.";
      if (sub.status !== "MINT_PENDING") return `La suscripción está ${sub.status}: sólo se emite tras confirmar el pago.`;
      if (sub.wallet !== wallet) return "El receptor no es la wallet del inversionista de la suscripción.";

      const token = state.tokens.find((k) => lower(k.contractAddress) === lower(tx.contractAddress));
      if (!token || token.status === "NOT_DEPLOYED" || token.status === "DEPLOYING") return "El token destino no está desplegado.";
      if (token.status === "PAUSED") return "Revertiría: EnforcedPause() — el emisor pausó el token.";
      const minted = state.txs.filter(
        (t) => t.kind === "SUBSCRIPTION_MINTED" && t.status === "CONFIRMED" && lower(t.contractAddress) === lower(tx.contractAddress),
      );
      if (minted.some((t) => lower(argsOf(t.args).subscriptionId) === subscriptionId)) {
        return "Revertiría: SubscriptionAlreadyProcessed(subscriptionId).";
      }
      const available = token.maxSupply - minted.reduce((s, t) => s + Number(argsOf(t.args).amount ?? 0), 0);
      if (Number(args.amount) > available) return `Revertiría: SupplyCapExceeded(${String(args.amount)}, ${available}).`;
      return null;
    }

    default:
      return "Esta operación no se ejecuta desde la cola del backoffice.";
  }
}
