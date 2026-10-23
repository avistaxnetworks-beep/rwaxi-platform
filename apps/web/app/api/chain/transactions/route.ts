import { NextResponse, type NextRequest } from "next/server";
import { forTenant } from "@rwaxi/database";
import type { ChainQueueResponse } from "@/app/_lib/chain-queue-types";
import { toQueueItem, walletOf } from "@/app/_lib/server/chain-queue";
import { TenantAccessError, demoAccessEnabled, requireHostTenant } from "@/app/_lib/server/tenant-context";

export const dynamic = "force-dynamic";

const json = (body: ChainQueueResponse, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * GET /api/chain/transactions?scope=pending|all — ChainTransaction rows of the host tenant
 * (RLS), with the ABI-encoded payload each one will submit. Used by the On-Chain Inspector.
 */
export async function GET(req: NextRequest) {
  try {
    const tenant = await requireHostTenant();
    if (!demoAccessEnabled()) {
      return json({ ok: false, error: "Inspector deshabilitado en producción hasta configurar autenticación." }, 403);
    }
    const scope = req.nextUrl.searchParams.get("scope") === "all" ? "all" : "pending";
    const db = forTenant(tenant.id);
    const [txs, pending, total] = await Promise.all([
      db.chainTransaction.findMany({
        where: scope === "pending" ? { status: "PENDING" } : {},
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { offering: { select: { code: true } } },
      }),
      db.chainTransaction.count({ where: { status: "PENDING" } }),
      db.chainTransaction.count(),
    ]);

    const wallets = [...new Set(txs.flatMap((t) => walletOf(t.args) ?? []))];
    const investors = wallets.length
      ? await db.investor.findMany({ where: { walletAddress: { in: wallets } }, select: { walletAddress: true, fullName: true } })
      : [];
    const byWallet = new Map(investors.map((i) => [i.walletAddress!.toLowerCase(), i.fullName]));

    return json({
      ok: true,
      tenant: { slug: tenant.slug, displayName: tenant.displayName },
      scope,
      counts: { pending, total },
      items: txs.map((t) => toQueueItem(t, byWallet)),
    });
  } catch (e) {
    if (e instanceof TenantAccessError) return json({ ok: false, error: e.message }, 404);
    console.error("[inspector] chain transactions failed", e);
    return json({ ok: false, error: "No se pudo leer ChainTransaction desde la base de datos." }, 500);
  }
}
