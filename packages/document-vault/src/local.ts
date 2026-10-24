import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertKey, type StoredObject, type VaultStore } from "./store";

const missing = (e: unknown) => (e as NodeJS.ErrnoException)?.code === "ENOENT";

/**
 * Private directory on the server's disk (development, tests, or a host with a persistent volume). Never inside
 * a web root or git: by default `<workspace>/.vault`, ignored. Each object is `{key}` plus `{key}.json`.
 */
export class LocalDiskStore implements VaultStore {
  readonly driver = "local" as const;
  constructor(readonly root: string) {}

  private file(key: string) {
    return path.join(this.root, ...assertKey(key).split("/"));
  }

  async put(key: string, bytes: Uint8Array, meta: StoredObject): Promise<void> {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    // Written to a temporary name and renamed: a reader never sees half a file.
    const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(`${file}.json`, JSON.stringify(meta), { mode: 0o600 });
    await writeFile(tmp, bytes, { mode: 0o600 });
    await rename(tmp, file);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.file(key)));
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const meta = JSON.parse(await readFile(`${this.file(key)}.json`, "utf8")) as StoredObject;
      await stat(this.file(key)); // the bytes too, not only their metadata
      return meta;
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
  }

  async copy(from: string, to: string): Promise<void> {
    const [src, dst] = [this.file(from), this.file(to)];
    await mkdir(path.dirname(dst), { recursive: true });
    await copyFile(`${src}.json`, `${dst}.json`);
    await copyFile(src, dst);
  }

  async remove(key: string): Promise<void> {
    const file = this.file(key);
    await rm(file, { force: true });
    await rm(`${file}.json`, { force: true });
  }
}
