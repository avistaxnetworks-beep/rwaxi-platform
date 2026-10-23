import { NextResponse, type NextRequest } from "next/server";
import { withTenant } from "@rwaxi/database";
import type { ChainQueueResponse } from "@/app/_lib/chain-queue-types";
import { executionMode, operatorAddress } from "@/app/_lib/server/chain-executor";
import { blockerFor, loadChainState } from "@/app/_lib/server/chain-invariants";
import { toQueueItem, walletOf } from "@/app/_lib/server/chain-queue";
import { TenantAccessError, demoAccessEnabled, requireHostTenant } from "@/app/_lib/server/tenant-context";

export const dynamic = "force-dynamic";

const json = (body: ChainQueueResponse, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * GET /api/chain/transactions?scope=pending|all — ChainTransaction rows of the host tenant
 * (RLS), with the ABI-encoded payload each one will submit and, for PENDING rows, why the
 * executor would refuse it now. Pending rows come in execution order (oldest first); `all`
 * lists the most recent first. Used by the On-Chain Inspector.
 */
export async function GET(req: NextRequest) {
  try {
    const tenant = await requireHostTenant();
    if (!demoAccessEnabled()) {
      return json({ ok: false, error: "Inspector deshabilitado en producción hasta configurar autenticación." }, 403);
    }
    const scope = req.nextUrl.searchParams.get("scope") === "all" ? "all" : "pending";

    // One snapshot, so the blockers agree with the rows shown.
    const { txs, pending, total, byWallet, state } = await withTenant(tenant.id, async (db) => {
      const state = await loadChainState(db);
      const txs = await db.chainTransaction.findMany({
        where: scope === "pending" ? { status: "PENDING" } : {},
        orderBy: scope === "pending" ? [{ createdAt: "asc" }, { id: "asc" }] : { createdAt: "desc" },
        take: 50,
        include: { offering: { select: { code: true } } },
      });
      const wallets = [...new Set(txs.flatMap((t) => walletOf(t.args) ?? []))];
      const investors = wallets.length
        ? await db.investor.findMany({ where: { walletAddress: { in: wallets } }, select: { walletAddress: true, fullName: true } })
        : [];
      return {
        state,
        txs,
        pending: state.txs.filter((t) => t.status === "PENDING").length,
        total: state.txs.length,
        byWallet: new Map(investors.map((i) => [i.walletAddress!.toLowerCase(), i.fullName])),
      };
    });

    return json({
      ok: true,
      tenant: { slug: tenant.slug, displayName: tenant.displayName },
      execution: { mode: executionMode(), operator: operatorAddress() },
      scope,
      counts: { pending, total },
      items: txs.map((t) => toQueueItem(t, byWallet, t.status === "PENDING" ? blockerFor(t, state) : null)),
    });
  } catch (e) {
    if (e instanceof TenantAccessError) return json({ ok: false, error: e.message }, 404);
    console.error("[inspector] chain transactions failed", e);
    return json({ ok: false, error: "No se pudo leer ChainTransaction desde la base de datos." }, 500);
  }
}
