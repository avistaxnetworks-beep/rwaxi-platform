import "server-only";
import type { PayoutCurrency } from "@rwaxi/blockchain-sdk/distribution";
import { withTenant } from "@rwaxi/database";
import { render, requestTranslate } from "@/app/_i18n/server";
import type { Translate } from "@/app/_i18n/translate";
import { TRM } from "@/app/_lib/data/projects";
import { balancesAt, confirmedMints } from "@/app/_lib/distribution-snapshot";
import { TenantAccessError } from "@/app/_lib/server/tenant-context";
import { executionMode, operatorAddress } from "@/app/_lib/server/chain-executor";
import { blockerReason, loadChainState } from "@/app/_lib/server/chain-invariants";
import { WITHHOLD_REASON, pendingRegistryCalls, replayedEntries, withholdReason } from "@/app/_lib/server/distribution-payout";
import { toAuditEntry } from "./audit";
import { deskSession, requireBackofficeSession, type BackofficeSession } from "./session";
import type { DistributionOfferingRow, DistributionsDeskData, DistributionsDeskResult, WithholdView } from "./types";

/**
 * One snapshot (one RLS-bound transaction): the token's confirmed mints (holders today and the movements the preview
 * replays at any record date), the whitelist today as the confirmed outbox leaves it, the distributions with their
 * allocations, anchoring and payment instructions.
 */
async function readDesk(session: BackofficeSession, tr: Translate): Promise<DistributionsDeskData> {
  return withTenant(
    session.tenant.id,
    async (db) => {
      const state = await loadChainState(db);
      const org = await db.organization.findUniqueOrThrow({
        where: { id: session.tenant.id },
        select: { slug: true, legalName: true, brandColor: true },
      });
      // Offerings whose token was issued: the only ones with holders to distribute to.
      const offerings = await db.offering.findMany({
        where: { token: { status: { in: ["DEPLOYED", "PAUSED"] }, contractAddress: { not: null } } },
        orderBy: { code: "asc" },
        include: {
          token: { select: { symbol: true, contractAddress: true, status: true, network: true } },
          distributions: {
            orderBy: { createdAt: "desc" },
            include: {
              declaredBy: { select: { email: true } },
              allocations: {
                orderBy: [{ units: "desc" }, { wallet: "asc" }],
                include: { investor: { select: { fullName: true } }, payout: { include: { batch: { select: { sequence: true } } } } },
              },
              payoutBatches: { orderBy: { sequence: "asc" }, include: { createdBy: { select: { email: true } } } },
            },
          },
        },
      });
      const audit = await db.auditEvent.findMany({
        where: {
          OR: [
            { action: { in: ["DISTRIBUTION_DECLARED", "DISTRIBUTION_PAYOUT_INSTRUCTED", "DISTRIBUTION_SUPPORT_DOWNLOADED"] } },
            { action: "CHAIN_TX_CONFIRMED", payload: { path: ["kind"], equals: "DISTRIBUTION_ROOT_ANCHORED" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      });
      const investors = await db.investor.findMany({
        where: { walletAddress: { not: null } },
        select: { id: true, fullName: true, walletAddress: true },
      });
      const byWallet = new Map(investors.map((i) => [i.walletAddress!.toLowerCase(), i]));
      // Latest KYC decision per investor for an offering (cases without an offering count for all of them).
      const cases = await db.kycCase.findMany({ orderBy: { createdAt: "desc" }, select: { investorId: true, offeringId: true, status: true } });
      const revoked = (offeringId: string, investorId: string) =>
        cases.find((c) => c.investorId === investorId && (c.offeringId === offeringId || c.offeringId === null))?.status === "REVOKED";
      const entry = replayedEntries(state);
      const withholdOf = (offeringId: string, investorId: string, wallet: string): WithholdView | null => {
        const code = withholdReason(
          { entry, pending: (w) => pendingRegistryCalls(state.txs, w), kycRevoked: (id) => revoked(offeringId, id) },
          { investorId, wallet },
        );
        return code ? { code, label: tr(WITHHOLD_REASON[code]) } : null;
      };

      const anchorTxs = state.txs.filter((t) => t.kind === "DISTRIBUTION_ROOT_ANCHORED");
      const now = Math.floor(Date.now() / 1000);
      const rows: DistributionOfferingRow[] = offerings.map((o) => {
        const token = o.token!;
        const moves = confirmedMints(state.txs, token.contractAddress!);
        const movements = moves.flatMap((m) => {
          const investor = byWallet.get(m.wallet);
          return investor ? [{ investorId: investor.id, name: investor.fullName, wallet: m.wallet, units: m.units, at: m.at }] : [];
        });
        const holders = [...balancesAt(moves, now)].flatMap(([wallet, units]) => {
          const investor = byWallet.get(wallet);
          return investor
            ? [{ investorId: investor.id, name: investor.fullName, wallet, units, withhold: withholdOf(o.id, investor.id, wallet) }]
            : [];
        });
        return {
          id: o.id,
          code: o.code,
          assetName: o.assetName,
          network: token.network,
          token: { symbol: token.symbol, address: token.contractAddress!, status: token.status },
          holders,
          mintedUnits: holders.reduce((s, h) => s + h.units, 0),
          movements,
          distributions: o.distributions.map((d) => {
            const anchor = anchorTxs.filter((t) => (t.args as { distributionId?: string }).distributionId === d.onchainId).at(-1);
            const blocker = anchor?.status === "PENDING" ? blockerReason(anchor, state) : null;
            const v2 = d.leafVersion >= 2;
            const allocations = d.allocations.map((a) => ({
              id: a.id,
              investorName: a.investor.fullName,
              wallet: a.wallet,
              units: a.units,
              amount: Number(a.amount),
              amountUsd: Number(a.amountUsd),
              leafHash: a.leafHash,
              proofLength: Array.isArray(a.merkleProof) ? a.merkleProof.length : 0,
              payout: a.payout ? { sequence: a.payout.batch.sequence, at: a.payout.createdAt.toISOString() } : null,
              withhold: v2 && !a.payout ? withholdOf(o.id, a.investorId, a.wallet) : null,
            }));
            const pending = v2 ? d.allocations.filter((a) => !a.payout && a.amount.gt(0)) : [];
            return {
              id: d.id,
              onchainId: d.onchainId,
              period: d.period,
              currency: d.currency as PayoutCurrency,
              leafVersion: d.leafVersion,
              amountDeclared: Number(d.amountDeclared),
              fxRate: d.fxRate === null ? null : Number(d.fxRate),
              totalUsd: Number(d.totalUsd),
              holders: d.holders,
              totalUnits: d.totalUnits,
              merkleRoot: d.merkleRoot,
              status: d.status,
              anchorTxHash: d.anchorTxHash,
              declaredAt: d.createdAt.toISOString(),
              declaredBy: d.declaredBy?.email ?? null,
              recordDate: d.recordDate?.toISOString().slice(0, 10) ?? null,
              snapshotAt: d.snapshotAt.toISOString(),
              snapshotMode: d.snapshotMode,
              support:
                d.supportSha256 && d.supportFileName && d.supportMimeType && d.supportSizeBytes
                  ? { sha256: d.supportSha256, fileName: d.supportFileName, mimeType: d.supportMimeType, sizeBytes: d.supportSizeBytes }
                  : null,
              anchor: anchor
                ? {
                    chainTxId: anchor.id,
                    status: anchor.status,
                    mode: anchor.executionMode,
                    blockedReason: blocker ? render(tr, blocker) : null,
                    txHash: anchor.status === "PENDING" ? anchor.txHash : null,
                    signer: anchor.status === "PENDING" ? anchor.signerAddress : null,
                  }
                : null,
              allocations,
              payoutBatches: d.payoutBatches.map((b) => ({
                id: b.id,
                sequence: b.sequence,
                instructionHash: b.instructionHash,
                instruction: b.instruction,
                total: Number(b.totalAmount),
                payees: b.payees,
                withheld: b.withheld,
                registryMode: b.registryMode,
                createdAt: b.createdAt.toISOString(),
                createdBy: b.createdBy?.email ?? null,
              })),
              pendingPayouts: {
                allocations: pending.length,
                payable: pending.filter((a) => !withholdOf(o.id, a.investorId, a.wallet)).length,
              },
            };
          }),
        };
      });

      return {
        organization: org,
        admin: { name: session.reviewer.fullName, email: session.reviewer.email },
        session: deskSession(session, "TENANT_ADMIN"),
        execution: { mode: executionMode(), operator: operatorAddress() },
        fxRate: TRM,
        offerings: rows,
        audit: audit.map((e) => toAuditEntry(e, tr)),
      };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

/** "Distribuciones y Rendimientos" desk of the tenant resolved from the host. Never throws: failures become `ok: false`. */
export async function loadDistributionsDesk(): Promise<DistributionsDeskResult> {
  const tr = await requestTranslate("tenant");
  try {
    const session = await requireBackofficeSession("TENANT_ADMIN", { view: true });
    return { ok: true, data: await readDesk(session, tr) };
  } catch (e) {
    if (e instanceof TenantAccessError) return { ok: false, error: render(tr, e.reason) };
    console.error("[backoffice] distributions desk failed", e);
    return { ok: false, error: tr("No se pudo leer la mesa de distribuciones desde la base de datos.") };
  }
}
