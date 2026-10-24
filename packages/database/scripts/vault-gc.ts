/**
 * Garbage collection of the DocumentVault configured by the environment (DOCUMENT_VAULT_DRIVER: local disk or
 * S3/R2): deletes the objects no database row references (vault_objects, data_room_documents) once their grace
 * window passed — direct uploads never confirmed (incoming/), onboarding files left in staging/, tenant files
 * whose submission never happened. Referenced objects are never touched.
 *
 *   pnpm vault:gc [--grace-hours 24] [--dry-run] [--json]      (from the repo root; run it from a cron job)
 *
 * The references are read with the owner connection (DIRECT_URL: every tenant). The grace window cannot be shorter
 * than an upload receipt's life (6 h): a fresh upload may still be referenced by the submission it was made for.
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_GRACE_MS, purgeUnreferencedBlobs, vaultFromEnv } from "@rwaxi/document-vault";

const MIN_GRACE_HOURS = 6;

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const value = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const graceHours =
    value("--grace-hours") === undefined ? DEFAULT_GRACE_MS / 3600_000 : Number(value("--grace-hours"));
  if (!Number.isFinite(graceHours) || graceHours < MIN_GRACE_HOURS) {
    throw new Error(`--grace-hours must be a number ≥ ${MIN_GRACE_HOURS} (an upload receipt lives 6 h)`);
  }
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("DIRECT_URL (owner connection) is not set");
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const rows = await db.$queryRaw<{ key: string }[]>`
      SELECT storage_key AS key FROM vault_objects
      UNION
      SELECT storage_key AS key FROM data_room_documents WHERE storage_key IS NOT NULL`;
    const store = vaultFromEnv();
    const report = await purgeUnreferencedBlobs(store, {
      referenced: new Set(rows.map((r) => r.key)),
      graceMs: graceHours * 3600_000,
      dryRun: args.includes("--dry-run"),
    });
    if (args.includes("--json")) {
      console.log(JSON.stringify(report));
      return;
    }
    const bytes = report.purged.reduce((s, p) => s + p.sizeBytes, 0);
    console.error(
      `[vault:gc] ${store.driver} · ${report.scanned} objeto(s) revisado(s) · ${report.kept.referenced} referenciado(s) · ${report.kept.recent} dentro de la ventana de ${graceHours} h`,
    );
    for (const p of report.purged)
      console.error(
        `  ${report.dryRun ? "eliminaría" : "eliminado"} ${p.key} (${p.sizeBytes} B, ${p.ageHours} h)`,
      );
    console.error(
      `[vault:gc] ${report.dryRun ? "simulación: " : ""}${report.purged.length} objeto(s) · ${bytes} B`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(`[vault:gc] ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
