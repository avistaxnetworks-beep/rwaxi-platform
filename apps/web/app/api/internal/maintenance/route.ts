import { NextResponse, type NextRequest } from "next/server";
import { checkCronAuthorization } from "@/app/_lib/server/cron-auth";
import { maintenanceOptions, runMaintenance } from "@/app/_lib/server/maintenance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A batch of mails through the provider plus a listing of the vault: well beyond a page request.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET|POST /api/internal/maintenance — the batch of `pnpm mail:dispatch` and `pnpm vault:gc` for a scheduler
 * (Vercel Cron sends GET with `Authorization: Bearer <CRON_SECRET>`). Query: ?only=mail|vault, ?limit=1…500 (mails),
 * ?graceHours=≥6 and ?dryRun=1 (GC). Any host: it acts on every tenant, never on the one of the host, and only
 * through bounded SECURITY DEFINER functions (see maintenance.ts). Answers the auditable summary of the run:
 * 200 when every step succeeded, 500 otherwise; 401 without the secret, 503 when the deployment has none.
 */
async function handle(req: NextRequest) {
  const auth = checkCronAuthorization(req.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status, headers: auth.status === 401 ? { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="rwaxi-maintenance"' } : NO_STORE },
    );
  }
  const parsed = maintenanceOptions(req.nextUrl.searchParams);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400, headers: NO_STORE });

  const summary = await runMaintenance(parsed.options, { method: req.method, userAgent: req.headers.get("user-agent") });
  const mail = summary.mail;
  const gc = summary.vault;
  // One line per run in the server log (Vercel keeps it): the digest ties it to the summary the scheduler got.
  console.info(
    `[maintenance] run ${summary.runId} ${summary.ok ? "ok" : "FAILED"} · digest ${summary.digest} · ${summary.durationMs} ms` +
      (mail ? (mail.ok ? ` · mail ${mail.driver}: due ${mail.due}, sent ${mail.sent}, captured ${mail.captured}, retry ${mail.retry}, failed ${mail.failed}, exhausted ${mail.exhaustedFailed}, expired ${mail.expiredRedacted}` : ` · mail error: ${mail.error}`) : "") +
      (gc ? (gc.ok ? ` · vault ${gc.driver}${gc.dryRun ? " (dry run)" : ""}: scanned ${gc.scanned}, purged ${gc.purgedCount} (${gc.purgedBytes} B)` : ` · vault error: ${gc.error}`) : ""),
  );
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500, headers: NO_STORE });
}

export const GET = handle;
export const POST = handle;
