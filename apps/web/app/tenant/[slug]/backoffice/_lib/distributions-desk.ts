import "server-only";
import { withTenant } from "@rwaxi/database";
import { render, requestTranslate } from "@/app/_i18n/server";
import type { Translate } from "@/app/_i18n/translate";
import { TRM } from "@/app/_lib/data/projects";
import { TenantAccessError } from "@/app/_lib/server/tenant-context";
import { executionMode, operatorAddress } from "@/app/_lib/server/chain-executor";
import { blockerReason, loadChainState } from "@/app/_lib/server/chain-invariants";
import { toAuditEntry } from "./audit";
import { mintedHoldings } from "./holdings";
import { requireBackofficeSession, type BackofficeSession } from "./session";
import type { DistributionOfferingRow, DistributionsDeskData, DistributionsDeskResult } from "./types";

/** One snapshot (one RLS-bound transaction): holders, distributions and their anchoring agree. */
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
              allocations: { orderBy: { units: "desc" }, include: { investor: { select: { fullName: true } } } },
            },
          },
        },
      });
      const audit = await db.auditEvent.findMany({
        where: {
          OR: [
            { action: "DISTRIBUTION_DECLARED" },
            { action: "CHAIN_TX_CONFIRMED", payload: { path: ["kind"], equals: "DISTRIBUTION_ROOT_ANCHORED" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      const anchorTxs = state.txs.filter((t) => t.kind === "DISTRIBUTION_ROOT_ANCHORED");
      const rows: DistributionOfferingRow[] = [];
      for (const o of offerings) {
        const holders = await mintedHoldings(db, o.id);
        rows.push({
          id: o.id,
          code: o.code,
          assetName: o.assetName,
          network: o.token!.network,
          token: { symbol: o.token!.symbol, address: o.token!.contractAddress!, status: o.token!.status },
          holders: holders.map((h) => ({ investorId: h.investorId, name: h.fullName, wallet: h.wallet, units: h.units })),
          mintedUnits: holders.reduce((s, h) => s + h.units, 0),
          distributions: o.distributions.map((d) => {
            const anchor = anchorTxs.filter((t) => (t.args as { distributionId?: string }).distributionId === d.onchainId).at(-1);
            const blocker = anchor?.status === "PENDING" ? blockerReason(anchor, state) : null;
            return {
              id: d.id,
              onchainId: d.onchainId,
              period: d.period,
              currency: d.currency === "COP" ? "COP" : "USD",
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
              anchor: anchor
                ? {
                    chainTxId: anchor.id,
                    status: anchor.status,
                    mode: anchor.executionMode,
                    blockedReason: blocker ? render(tr, blocker) : null,
                  }
                : null,
              allocations: d.allocations.map((a) => ({
                investorName: a.investor.fullName,
                wallet: a.wallet,
                units: a.units,
                amountUsd: Number(a.amountUsd),
                leafHash: a.leafHash,
                proofLength: Array.isArray(a.merkleProof) ? a.merkleProof.length : 0,
              })),
            };
          }),
        });
      }

      return {
        organization: org,
        admin: { name: session.reviewer.fullName, email: session.reviewer.email },
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
    const session = await requireBackofficeSession("TENANT_ADMIN");
    return { ok: true, data: await readDesk(session, tr) };
  } catch (e) {
    if (e instanceof TenantAccessError) return { ok: false, error: render(tr, e.reason) };
    console.error("[backoffice] distributions desk failed", e);
    return { ok: false, error: tr("No se pudo leer la mesa de distribuciones desde la base de datos.") };
  }
}
