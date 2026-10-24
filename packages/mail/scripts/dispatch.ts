/**
 * The mail job (run it from a cron, e.g. every minute): retries the mail_outbox rows still PENDING in every
 * tenant — the app delivers each one right after queuing it; this covers the attempts that failed — and clears
 * the bodies whose code or link expired.
 *
 *   pnpm mail:dispatch [--limit 50] [--json]      (from the repo root)
 *
 * Owner connection (DIRECT_URL), provider from the environment (MAIL_DRIVER, RESEND_API_KEY…, MAIL_FROM): see
 * mailDriverFromEnv in src/drivers.ts.
 */
import { PrismaClient } from "@rwaxi/database";
import { MailDispatcher, mailDriverFromEnv, type RunInDb } from "../src/index";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const i = args.indexOf("--limit");
  const limit = i >= 0 ? Number(args[i + 1]) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("--limit must be 1…1000");
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("DIRECT_URL (owner connection) is not set");
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const dispatcher = new MailDispatcher(mailDriverFromEnv());
    const run: RunInDb = (fn) => db.$transaction((tx) => fn(tx), { maxWait: 10_000, timeout: 20_000 });
    const delivered = await dispatcher.deliverPending(run, limit);
    const expired = await dispatcher.sweepExpired(run);
    const report = { driver: dispatcher.driver.name, ...delivered, expiredRedacted: expired };
    if (args.includes("--json")) console.log(JSON.stringify(report));
    else
      console.error(
        `[mail:dispatch] ${report.driver} · enviados ${report.sent} · capturados ${report.captured} · reintento ${report.retry} · fallidos ${report.failed} · vencidos redactados ${report.expiredRedacted}`,
      );
  } finally {
    await db.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(`[mail:dispatch] ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
