import "server-only";
import { withTenant, type ChainNetwork, type ChainTransaction } from "@rwaxi/database";
import { msg } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import type { Translate } from "@/app/_i18n/translate";
import { TenantAccessError } from "@/app/_lib/server/tenant-context";
import { ExecutionError, executionMode, operatorAddress, readIssuerRoles } from "@/app/_lib/server/chain-executor";
import { blockerReason, loadChainState } from "@/app/_lib/server/chain-invariants";
import { toQueueItem } from "@/app/_lib/server/chain-queue";
import { paymentCodeOf } from "@/app/_lib/server/subscriptions";
import { toAuditEntry } from "./audit";
import { formatDoc } from "./queries";
import { deskSession, requireBackofficeSession, type BackofficeSession } from "./session";
import type { IssuerMintPanel, IssuerMinterToken, SubscriptionRow, SubscriptionsDeskData, SubscriptionsDeskResult } from "./types";

const RECENT_CONFIRMED = 6;
const DESK_AUDIT = [
  "SUBSCRIPTION_CREATED",
  "PAYMENT_CONFIRMED",
  "CHAIN_TX_CONFIRMED",
  "SUBSCRIPTION_MINTED",
  "SUBSCRIPTION_CANCELLED",
  "MINTER_ROLE_REQUESTED",
] as const;
/** A token the desk could not read within this time is shown as unreadable (the desk never waits on a dead node). */
const ROLE_READ_TIMEOUT_MS = 5_000;

const TOKEN_BLOCKER: Record<string, string> = {
  NOT_DEPLOYED: msg("El token de la oferta no está desplegado: la suscripción sigue como reserva."),
  DEPLOYING: msg("El token de la oferta se está desplegando."),
  PAUSED: msg("El emisor pausó el token: reanúdalo antes de conciliar pagos."),
};

/** The tokens whose MINTER_ROLE the administrator's wallet could hold, read with the rest of the desk. */
interface MinterInputs {
  wallet: string | null;
  tokens: { offeringId: string; offeringCode: string; token: string; network: ChainNetwork }[];
  /** "token:wallet" (lowercase) → its PENDING grantRole(MINTER_ROLE) */
  pending: Map<string, string>;
}

/** One snapshot (one RLS-bound transaction): subscriptions, queue order and blockers agree. */
async function readDesk(
  session: BackofficeSession,
  tr: Translate,
): Promise<{ data: Omit<SubscriptionsDeskData, "issuerMint">; minter: MinterInputs }> {
  return withTenant(
    session.tenant.id,
    async (db) => {
      const state = await loadChainState(db);
      const org = await db.organization.findUniqueOrThrow({
        where: { id: session.tenant.id },
        select: { slug: true, legalName: true, brandColor: true, feeUsagePct: true },
      });
      // Cancelled subscriptions stay listed: a reconciled payment of one is a refund the treasury still owes.
      const subs = await db.subscription.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: {
          investor: { select: { fullName: true, docType: true, docNumber: true, walletAddress: true } },
          offering: { select: { code: true, assetName: true, token: { select: { status: true } } } },
          paymentConfirmedBy: { select: { email: true } },
        },
      });
      const offerings = await db.offering.findMany({
        orderBy: { code: "asc" },
        select: { id: true, code: true, token: { select: { contractAddress: true, network: true, status: true } } },
      });
      const me = await db.user.findUnique({ where: { id: session.reviewer.id }, select: { walletAddress: true } });
      const investors = await db.investor.findMany({
        where: { walletAddress: { not: null } },
        select: { walletAddress: true, fullName: true },
      });
      const fees = await db.feeLedgerEntry.aggregate({
        where: { kind: "INFRASTRUCTURE_USAGE", status: "ACCRUED" },
        _sum: { amountUsd: true },
        _count: { _all: true },
      });
      const audit = await db.auditEvent.findMany({
        where: { action: { in: [...DESK_AUDIT] } },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      const codeById = new Map(offerings.map((o) => [o.id, o.code]));
      const byWallet = new Map(investors.map((i) => [i.walletAddress!.toLowerCase(), i.fullName]));
      const blocked = (t: ChainTransaction) => {
        const r = t.status === "PENDING" ? blockerReason(t, state) : null;
        return r ? render(tr, r) : null;
      };
      const item = (t: ChainTransaction) =>
        toQueueItem(
          { ...t, offering: t.offeringId && codeById.has(t.offeringId) ? { code: codeById.get(t.offeringId)! } : null },
          byWallet,
          blocked(t),
          tr,
        );

      const queue = state.txs.filter((t) => t.status === "PENDING").map(item);
      const recent = state.txs
        .filter((t) => t.status === "CONFIRMED")
        .sort((a, b) => (b.executedAt ?? b.createdAt).getTime() - (a.executedAt ?? a.createdAt).getTime())
        .slice(0, RECENT_CONFIRMED)
        .map(item);
      const blockerById = new Map(queue.map((q) => [q.id, q.blockedReason]));

      const rows: SubscriptionRow[] = subs.map((s) => {
        const mintTx = state.txs
          .filter((t) => t.kind === "SUBSCRIPTION_MINTED" && s.onchainId && (t.args as { subscriptionId?: string }).subscriptionId === s.onchainId)
          .at(-1);
        const tokenStatus = s.offering.token?.status ?? "NOT_DEPLOYED";
        return {
          id: s.id,
          investorName: s.investor.fullName,
          doc: formatDoc(s.investor.docType, s.investor.docNumber, tr),
          wallet: s.investor.walletAddress,
          offeringCode: s.offering.code,
          assetName: s.offering.assetName,
          units: s.units,
          capitalUsd: Number(s.capitalUsd),
          status: s.status,
          createdAt: s.createdAt.toISOString(),
          paymentCode: s.status === "PAYMENT_PENDING" || s.paymentReference ? paymentCodeOf(s.onchainId) : null,
          agreementHash: s.agreementHash,
          paymentReference: s.paymentReference,
          paymentConfirmedAt: s.paymentConfirmedAt?.toISOString() ?? null,
          paymentConfirmedBy: s.paymentConfirmedBy?.email ?? null,
          paymentEvidenceRef: s.paymentEvidenceRef,
          mintTxHash: s.mintTxHash,
          mint: mintTx
            ? { chainTxId: mintTx.id, status: mintTx.status, blockedReason: blockerById.get(mintTx.id) ?? null }
            : null,
          paymentBlocker:
            s.status === "PAYMENT_PENDING" && tokenStatus !== "DEPLOYED" && TOKEN_BLOCKER[tokenStatus] ? tr(TOKEN_BLOCKER[tokenStatus]) : null,
          cancellation:
            s.status === "CANCELLED"
              ? { at: (s.cancelledAt ?? s.updatedAt).toISOString(), reason: s.cancellationReason, refundDue: !!s.paymentConfirmedAt }
              : null,
        };
      });
      const wallet = me?.walletAddress?.toLowerCase() ?? null;
      const minter: MinterInputs = {
        wallet,
        tokens: offerings.flatMap((o) =>
          o.token?.contractAddress && o.token.status !== "NOT_DEPLOYED" && o.token.status !== "DEPLOYING"
            ? [{ offeringId: o.id, offeringCode: o.code, token: o.token.contractAddress, network: o.token.network }]
            : [],
        ),
        pending: new Map(
          state.txs
            .filter((t) => t.kind === "MINTER_ROLE_GRANTED" && t.status === "PENDING")
            .map((t) => [`${t.contractAddress.toLowerCase()}:${String((t.args as { account?: unknown }).account ?? "").toLowerCase()}`, t.id]),
        ),
      };

      const data = {
        organization: { slug: org.slug, legalName: org.legalName, brandColor: org.brandColor, feeUsagePct: Number(org.feeUsagePct) },
        admin: { name: session.reviewer.fullName, email: session.reviewer.email },
        session: deskSession(session, "TENANT_ADMIN"),
        execution: { mode: executionMode(), operator: operatorAddress() },
        subscriptions: rows,
        queue,
        recent,
        fees: { accruedUsd: Number(fees._sum.amountUsd ?? 0), entries: fees._count._all },
        audit: audit.map((e) => toAuditEntry(e, tr)),
      };
      return { data, minter };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ExecutionError("La red no respondió a tiempo.")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * RPC mode: what each deployed token says about the administrator's registered wallet — read from the network after
 * the desk's transaction, never inside it. In simulation there is nothing to grant (RWAXI's demo key signs the queue).
 */
async function issuerMintPanel(minter: MinterInputs, tr: Translate): Promise<IssuerMintPanel | null> {
  if (executionMode() !== "RPC") return null;
  const { wallet } = minter;
  const tokens = await Promise.all(
    minter.tokens.map(async (t): Promise<IssuerMinterToken> => {
      const base = { ...t, chainTxId: null, detail: null };
      if (!wallet) return { ...base, state: "not-admin" };
      const pending = minter.pending.get(`${t.token.toLowerCase()}:${wallet}`) ?? null;
      try {
        const roles = await timeout(readIssuerRoles(t.network, t.token, wallet), ROLE_READ_TIMEOUT_MS);
        if (roles.minter) return { ...base, state: "minter" };
        if (pending) return { ...base, state: "pending", chainTxId: pending };
        return { ...base, state: roles.admin ? "grantable" : "not-admin" };
      } catch (e) {
        const detail =
          e instanceof ExecutionError ? render(tr, e.reason) : e instanceof Error ? e.message.split("\n")[0]!.slice(0, 160) : String(e);
        return { ...base, state: "unreadable", chainTxId: pending, detail };
      }
    }),
  );
  return { wallet, tokens };
}

/** "Suscripciones y Pagos" desk of the tenant resolved from the host. Never throws: failures become `ok: false`. */
export async function loadSubscriptionsDesk(): Promise<SubscriptionsDeskResult> {
  const tr = await requestTranslate("tenant");
  try {
    const session = await requireBackofficeSession("TENANT_ADMIN", { view: true });
    const { data, minter } = await readDesk(session, tr);
    return { ok: true, data: { ...data, issuerMint: await issuerMintPanel(minter, tr) } };
  } catch (e) {
    if (e instanceof TenantAccessError) return { ok: false, error: render(tr, e.reason) };
    console.error("[backoffice] subscriptions desk failed", e);
    return { ok: false, error: tr("No se pudo leer la mesa de suscripciones desde la base de datos.") };
  }
}
