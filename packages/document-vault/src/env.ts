import { existsSync } from "node:fs";
import path from "node:path";
import { LocalDiskStore } from "./local";
import { S3Store } from "./s3";
import type { VaultStore } from "./store";

/** `<workspace root>/.vault` (the directory holding pnpm-workspace.yaml), from wherever the process runs. */
export function defaultVaultDir(from = process.cwd()): string {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return path.join(dir, ".vault");
    if (path.dirname(dir) === dir) return path.resolve(from, ".vault");
  }
}

/**
 * The store configured by the environment:
 *   DOCUMENT_VAULT_DRIVER  local (default outside production) | s3 (default in production)
 *   DOCUMENT_VAULT_DIR     local: private directory, default `<workspace>/.vault`
 *   S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY   s3 (R2: endpoint + region "auto")
 * Fails closed: in production without its S3 settings it throws instead of writing to an ephemeral disk.
 */
export function vaultFromEnv(env: NodeJS.ProcessEnv = process.env): VaultStore {
  const driver = env.DOCUMENT_VAULT_DRIVER || (env.NODE_ENV === "production" ? "s3" : "local");
  if (driver === "local") return new LocalDiskStore(env.DOCUMENT_VAULT_DIR || defaultVaultDir());
  if (driver !== "s3") throw new Error(`DOCUMENT_VAULT_DRIVER inválido: ${driver} (local | s3)`);
  const missing = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`DocumentVault S3 sin configurar: falta ${missing.join(", ")}`);
  return new S3Store({
    endpoint: env.S3_ENDPOINT || undefined,
    region: env.S3_REGION || "auto",
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
  });
}
