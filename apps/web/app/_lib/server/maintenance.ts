import "server-only";
import { randomUUID } from "node:crypto";
import { evidenceHash } from "@rwaxi/blockchain-sdk/canonical";
import { prisma, retryTransient, withTenant } from "@rwaxi/database";
import { DEFAULT_GRACE_MS, purgeUnreferencedBlobs, type PurgeReport } from "@rwaxi/document-vault";
import { LEASE_MS, MAX_ATTEMPTS, MailDispatcher, mailDriverFromEnv, type DeliveryOutcome, type RunInDb } from "@rwaxi/mail";
import { vault } from "./vault";

/**
 * RWAXI's periodic maintenance over HTTP — the batch of `pnpm mail:dispatch` and `pnpm vault:gc`, for Vercel Cron
 * (/api/internal/maintenance) — run with the app role: no owner connection, no BYPASSRLS. What crosses tenants goes
 * through bounded SECURITY DEFINER functions, and every mail is delivered under its own tenant's RLS:
 *   mail   rwaxi_mail_fail_exhausted() → rwaxi_mail_due() → MailDispatcher.deliver() per mail (withTenant)
 *          → rwaxi_redact_expired_mail()
 *   vault  rwaxi_vault_referenced_keys() → purgeUnreferencedBlobs() over the configured DocumentVault
 * Overlapping runs are safe: each mail attempt is claimed by a lease and the GC re-reads every object before
 * deleting it. The summary is auditable: its `digest` is the SHA-256 of its canonical JSON (evidenceHash), and the
 * same line goes to the server log.
 */
export const MIN_GRACE_HOURS = 6; // an upload receipt lives 6 h
export const MAX_MAIL_BATCH = 500; // rwaxi_mail_due's own cap
const DEFAULT_MAIL_BATCH = 50;
/** Purged objects listed one by one in the summary; the counts always cover all of them. */
const PURGED_LISTED = 200;

export interface MaintenanceOptions {
  /** mails attempted at most in this run */
  mailLimit: number;
  /** objects no row references are kept while younger than this */
  graceHours: number;
  /** GC: report what would go, delete nothing */
  dryRun: boolean;
  /** run one step only (e.g. mail every few minutes, GC once a day) */
  only: "mail" | "vault" | null;
}

export type MailStep =
  | ({
      ok: true;
      driver: string;
      /** mails due when the run started (rwaxi_mail_due) */
      due: number;
      /** attempts that failed before reaching the dispatcher (the mail stays PENDING for the next run) */
      errors: number;
      /** PENDING mails whose attempts were all used up: FAILED, body cleared */
      exhaustedFailed: number;
      /** bodies cleared because their code or link expired */
      expiredRedacted: number;
    } & Record<DeliveryOutcome, number>)
  | { ok: false; error: string };

export type VaultStep =
  | {
      ok: true;
      driver: string;
      dryRun: boolean;
      graceHours: number;
      scanned: number;
      kept: PurgeReport["kept"];
      purgedCount: number;
      purgedBytes: number;
      purged: PurgeReport["purged"];
      /** more objects were purged than `purged` lists */
      truncated: boolean;
    }
  | { ok: false; error: string };

export interface MaintenanceSummary {
  job: "rwaxi.maintenance";
  version: 1;
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  trigger: { method: string; userAgent: string | null };
  options: MaintenanceOptions;
  /** every step that ran succeeded */
  ok: boolean;
  mail: MailStep | null;
  vault: VaultStep | null;
  /** evidenceHash (SHA-256 of the canonical JSON) of every field above */
  digest: string;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0]!.slice(0, 300);

/** Query parameters → options: ?only=mail|vault · ?limit=1…500 · ?graceHours=≥6 · ?dryRun=1. */
export function maintenanceOptions(params: URLSearchParams): { ok: true; options: MaintenanceOptions } | { ok: false; error: string } {
  const only = params.get("only");
  if (only !== null && only !== "mail" && only !== "vault") return { ok: false, error: "only must be mail or vault" };
  const limit = params.get("limit") === null ? DEFAULT_MAIL_BATCH : Number(params.get("limit"));
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_MAIL_BATCH) return { ok: false, error: `limit must be an integer 1…${MAX_MAIL_BATCH}` };
  const graceHours = params.get("graceHours") === null ? DEFAULT_GRACE_MS / 3600_000 : Number(params.get("graceHours"));
  if (!Number.isFinite(graceHours) || graceHours < MIN_GRACE_HOURS || graceHours > 24 * 365) {
    return { ok: false, error: `graceHours must be a number ≥ ${MIN_GRACE_HOURS} (an upload receipt lives 6 h)` };
  }
  const dryRun = params.get("dryRun");
  if (dryRun !== null && dryRun !== "1" && dryRun !== "0" && dryRun !== "true" && dryRun !== "false") {
    return { ok: false, error: "dryRun must be 1 or 0" };
  }
  return { ok: true, options: { mailLimit: limit, graceHours, dryRun: dryRun === "1" || dryRun === "true", only } };
}

async function mailStep(limit: number): Promise<MailStep> {
  let dispatcher: MailDispatcher;
  try {
    dispatcher = new MailDispatcher(mailDriverFromEnv());
  } catch (e) {
    return { ok: false, error: message(e) }; // a misconfigured provider: nothing is attempted, nothing is lost
  }
  try {
    const lease = Math.ceil(LEASE_MS / 1000);
    const [exhausted] = await retryTransient(
      () => prisma.$queryRaw<{ n: number }[]>`SELECT rwaxi_mail_fail_exhausted(${MAX_ATTEMPTS}::integer, ${lease}::integer) AS n`,
      { repeatable: false },
    );
    const due = await retryTransient(
      () =>
        prisma.$queryRaw<{ id: string; organization_id: string }[]>`
          SELECT id, organization_id FROM rwaxi_mail_due(${limit}::integer, ${MAX_ATTEMPTS}::integer, ${lease}::integer)`,
      { repeatable: true },
    );
    const counts: Record<DeliveryOutcome, number> = { sent: 0, captured: 0, retry: 0, failed: 0, skipped: 0 };
    let errors = 0;
    for (const mail of due) {
      const run: RunInDb = (fn) => withTenant(mail.organization_id, fn);
      try {
        counts[await dispatcher.deliver(run, mail.id)]++;
      } catch (e) {
        errors++;
        console.error(`[maintenance] mail ${mail.id}: ${message(e)}`);
      }
    }
    const expired = await dispatcher.sweepExpired((fn) => prisma.$transaction((db) => fn(db)));
    return {
      ok: true,
      driver: dispatcher.driver.name,
      due: due.length,
      ...counts,
      errors,
      exhaustedFailed: Number(exhausted?.n ?? 0),
      expiredRedacted: expired,
    };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

async function vaultStep(graceHours: number, dryRun: boolean): Promise<VaultStep> {
  try {
    const store = vault();
    // Every key any tenant references (SECURITY DEFINER): an object is only ever deleted against the full set.
    const rows = await retryTransient(
      () => prisma.$queryRaw<{ key: string }[]>`SELECT k AS key FROM rwaxi_vault_referenced_keys() AS k`,
      { repeatable: true },
    );
    const report = await purgeUnreferencedBlobs(store, {
      referenced: new Set(rows.map((r) => r.key)),
      graceMs: graceHours * 3600_000,
      dryRun,
    });
    return {
      ok: true,
      driver: store.driver,
      dryRun: report.dryRun,
      graceHours,
      scanned: report.scanned,
      kept: report.kept,
      purgedCount: report.purged.length,
      purgedBytes: report.purged.reduce((s, p) => s + p.sizeBytes, 0),
      purged: report.purged.slice(0, PURGED_LISTED),
      truncated: report.purged.length > PURGED_LISTED,
    };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** One maintenance run. Never throws: a failed step is reported in the summary (ok: false) and the next one runs. */
export async function runMaintenance(options: MaintenanceOptions, trigger: MaintenanceSummary["trigger"]): Promise<MaintenanceSummary> {
  const started = new Date();
  const mail = options.only === "vault" ? null : await mailStep(options.mailLimit);
  const vaultReport = options.only === "mail" ? null : await vaultStep(options.graceHours, options.dryRun);
  const finished = new Date();
  const body: Omit<MaintenanceSummary, "digest"> = {
    job: "rwaxi.maintenance",
    version: 1,
    runId: randomUUID(),
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    trigger,
    options,
    ok: (mail?.ok ?? true) && (vaultReport?.ok ?? true),
    mail,
    vault: vaultReport,
  };
  return { ...body, digest: evidenceHash(body) };
}
