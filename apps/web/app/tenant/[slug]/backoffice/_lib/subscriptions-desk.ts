import "server-only";
import { withTenant, type ChainTransaction } from "@rwaxi/database";
import { msg } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import type { Translate } from "@/app/_i18n/translate";
import { TenantAccessError } from "@/app/_lib/server/tenant-context";
import { executionMode, operatorAddress } from "@/app/_lib/server/chain-executor";
import { blockerReason, loadChainState } from "@/app/_lib/server/chain-invariants";
import { toQueueItem } from "@/app/_lib/server/chain-queue";
import { paymentCodeOf } from "@/app/_lib/server/subscriptions";
import { toAuditEntry } from "./audit";
import { formatDoc } from "./queries";
import { deskSession, requireBackofficeSession, type BackofficeSession } from "./session";
import type { SubscriptionRow, SubscriptionsDeskData, SubscriptionsDeskResult } from "./types";

const RECENT_CONFIRMED = 6;
const DESK_AUDIT = ["SUBSCRIPTION_CREATED", "PAYMENT_CONFIRMED", "CHAIN_TX_CONFIRMED", "SUBSCRIPTION_MINTED"] as const;

const TOKEN_BLOCKER: Record<string, string> = {
  NOT_DEPLOYED: msg("El token de la oferta no está desplegado: la suscripción sigue como reserva."),
  DEPLOYING: msg("El token de la oferta se está desplegando."),
  PAUSED: msg("El emisor pausó el token: reanúdalo antes de conciliar pagos."),
};

/** One snapshot (one RLS-bound transaction): subscriptions, queue order and blockers agree. */
async function readDesk(session: BackofficeSession, tr: Translate): Promise<SubscriptionsDeskData> {
  return withTenant(
    session.tenant.id,
    async (db) => {
      const state = await loadChainState(db);
      const org = await db.organization.findUniqueOrThrow({
        where: { id: session.tenant.id },
        select: { slug: true, legalName: true, brandColor: true, feeUsagePct: true },
      });
      const subs = await db.subscription.findMany({
        where: { status: { not: "CANCELLED" } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: {
          investor: { select: { fullName: true, docType: true, docNumber: true, walletAddress: true } },
          offering: { select: { code: true, assetName: true, token: { select: { status: true } } } },
          paymentConfirmedBy: { select: { email: true } },
        },
      });
      const offerings = await db.offering.findMany({ select: { id: true, code: true } });
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
        };
      });

      return {
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
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

/** "Suscripciones y Pagos" desk of the tenant resolved from the host. Never throws: failures become `ok: false`. */
export async function loadSubscriptionsDesk(): Promise<SubscriptionsDeskResult> {
  const tr = await requestTranslate("tenant");
  try {
    const session = await requireBackofficeSession("TENANT_ADMIN", { view: true });
    return { ok: true, data: await readDesk(session, tr) };
  } catch (e) {
    if (e instanceof TenantAccessError) return { ok: false, error: render(tr, e.reason) };
    console.error("[backoffice] subscriptions desk failed", e);
    return { ok: false, error: tr("No se pudo leer la mesa de suscripciones desde la base de datos.") };
  }
}
