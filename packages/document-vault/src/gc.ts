import type { VaultStore } from "./store";

/**
 * Garbage collection of the vault: objects no database row references once their grace window passed —
 *   incoming/   direct uploads (presigned PUT) never confirmed;
 *   staging/    onboarding files (copied into the tenant when it is created, or abandoned);
 *   tenants/    files a receipt was issued for but that no submission ever referenced (e.g. a KYC left unsent).
 * The grace window must outlast every way a fresh object can still become referenced (upload receipts and tickets
 * live 6 h): younger objects are always kept, and each one is re-read right before it is deleted, so bytes
 * uploaded again meanwhile (content-addressed: same key) survive.
 */
export interface PurgeOptions {
  /** storage keys the database references (vault_objects, data_room_documents): never deleted */
  referenced: ReadonlySet<string>;
  /** an unreferenced object younger than this is kept */
  graceMs: number;
  now?: Date;
  /** report what would be deleted, deleting nothing */
  dryRun?: boolean;
  /** key prefixes to sweep */
  prefixes?: readonly string[];
}

export interface PurgeReport {
  scanned: number;
  kept: { referenced: number; recent: number };
  purged: { key: string; sizeBytes: number; ageHours: number }[];
  dryRun: boolean;
}

export const GC_PREFIXES = ["incoming/", "staging/", "tenants/"] as const;
/** Default grace window: 24 h (4× the life of an upload receipt). */
export const DEFAULT_GRACE_MS = 24 * 3600_000;

export async function purgeUnreferencedBlobs(store: VaultStore, options: PurgeOptions): Promise<PurgeReport> {
  if (!Number.isFinite(options.graceMs) || options.graceMs < 0) throw new Error("graceMs must be ≥ 0");
  const now = (options.now ?? new Date()).getTime();
  const dryRun = options.dryRun === true;
  const report: PurgeReport = { scanned: 0, kept: { referenced: 0, recent: 0 }, purged: [], dryRun };
  const young = (modified: Date | null | undefined) =>
    !modified || now - modified.getTime() < options.graceMs;
  for (const prefix of options.prefixes ?? GC_PREFIXES) {
    for await (const object of store.list(prefix)) {
      report.scanned++;
      if (options.referenced.has(object.key)) {
        report.kept.referenced++;
        continue;
      }
      if (young(object.lastModified)) {
        report.kept.recent++;
        continue;
      }
      if (!dryRun) {
        const current = await store.head(object.key);
        if (!current) continue; // already gone
        if (young(current.lastModified)) {
          report.kept.recent++; // written again since it was listed
          continue;
        }
        await store.remove(object.key);
      }
      report.purged.push({
        key: object.key,
        sizeBytes: object.sizeBytes,
        ageHours: Math.round(((now - object.lastModified.getTime()) / 3600_000) * 10) / 10,
      });
    }
  }
  return report;
}
