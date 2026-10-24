import { NextResponse, type NextRequest } from "next/server";
import { inspectorSourceAccess } from "@/app/_lib/server/inspector-access";
import { SOL_SOURCES } from "@/app/_lib/server/sol-sources";

export const dynamic = "force-dynamic";

/**
 * GET /api/inspector/sources?as=backoffice|platform — Solidity source of RWAXI's contracts for the On-Chain
 * Inspector, only to an authorized session (inspector-access.ts); anyone else gets 403 and the public interface.
 */
export async function GET(req: NextRequest) {
  const allowed = await inspectorSourceAccess(req.nextUrl.searchParams.get("as"));
  return NextResponse.json(allowed ? { ok: true, sources: SOL_SOURCES } : { ok: false }, {
    status: allowed ? 200 : 403,
    headers: { "Cache-Control": "private, no-store" },
  });
}
