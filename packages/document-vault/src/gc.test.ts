import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  LocalDiskStore,
  MIME,
  POLICIES,
  inspectDeclared,
  objectKey,
  purgeUnreferencedBlobs,
  sha256Hex,
  type VaultStore,
} from "./index";
import { samplePdf } from "./sample";

const HOUR = 3600_000;
const NOW = new Date("2026-10-24T12:00:00Z");

async function storeWith(files: { key: string; ageHours: number }[]) {
  const root = await mkdtemp(path.join(os.tmpdir(), "rwaxi-vault-gc-"));
  const store = new LocalDiskStore(root);
  for (const f of files) {
    const bytes = samplePdf([f.key]);
    await store.put(f.key, bytes, {
      sizeBytes: bytes.byteLength,
      mimeType: MIME.pdf,
      sha256: sha256Hex(bytes),
    });
    const at = new Date(NOW.getTime() - f.ageHours * HOUR);
    await utimes(path.join(root, ...f.key.split("/")), at, at);
  }
  return { root, store };
}

const keys = async (store: VaultStore, prefix = "") => {
  const out: string[] = [];
  for await (const o of store.list(prefix)) out.push(o.key);
  return out.sort();
};

test("the local store lists vault objects by prefix, never their metadata or a write in progress", async () => {
  const tenant = objectKey({ organizationId: "org_a" }, "aa".repeat(32));
  const staged = objectKey("staging", "bb".repeat(32));
  const { root, store } = await storeWith([
    { key: tenant, ageHours: 1 },
    { key: staged, ageHours: 1 },
  ]);
  try {
    await writeFile(path.join(root, "tenants", "org_a", "sha256", `${"aa".repeat(32)}.1a2b3c.tmp`), "half");
    await writeFile(path.join(root, "notes.txt"), "not a vault key");
    assert.deepEqual(await keys(store), [staged, tenant].sort());
    assert.deepEqual(await keys(store, "staging/"), [staged]);
    assert.deepEqual(await keys(store, "incoming/"), []);
    const [listed] = await (async () => {
      const all = [];
      for await (const o of store.list("tenants/")) all.push(o);
      return all;
    })();
    assert.equal(listed!.sizeBytes, (await store.get(tenant))!.byteLength);
    assert.equal(listed!.lastModified.getTime(), NOW.getTime() - HOUR);
    assert.deepEqual(await keys(new LocalDiskStore(path.join(root, "missing"))), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GC purges unreferenced objects past their grace window and keeps referenced or recent ones", async () => {
  const referenced = objectKey({ organizationId: "org_a" }, "01".repeat(32)); // a VaultObject row points at it
  const orphanTenant = objectKey({ organizationId: "org_a" }, "02".repeat(32)); // a KYC upload never submitted
  const freshTenant = objectKey({ organizationId: "org_a" }, "03".repeat(32)); // uploaded an hour ago
  const oldStaging = objectKey("staging", "04".repeat(32)); // onboarding file, tenant created long ago
  const oldIncoming = `incoming/${"5".repeat(32)}`; // presigned PUT never confirmed
  const { root, store } = await storeWith([
    { key: referenced, ageHours: 400 },
    { key: orphanTenant, ageHours: 30 },
    { key: freshTenant, ageHours: 1 },
    { key: oldStaging, ageHours: 48 },
    { key: oldIncoming, ageHours: 25 },
  ]);
  try {
    const options = { referenced: new Set([referenced]), graceMs: 24 * HOUR, now: NOW };
    const dry = await purgeUnreferencedBlobs(store, { ...options, dryRun: true });
    assert.equal(dry.dryRun, true);
    assert.deepEqual(dry.purged.map((p) => p.key).sort(), [oldIncoming, oldStaging, orphanTenant].sort());
    assert.equal((await keys(store)).length, 5, "a dry run deletes nothing");

    const report = await purgeUnreferencedBlobs(store, options);
    assert.deepEqual(report.kept, { referenced: 1, recent: 1 });
    assert.equal(report.scanned, 5);
    assert.deepEqual(report.purged.find((p) => p.key === oldStaging)?.ageHours, 48);
    assert.deepEqual(await keys(store), [freshTenant, referenced].sort());
    assert.equal(await store.head(orphanTenant), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GC re-reads an object before deleting it: bytes written again since the listing survive", async () => {
  const key = objectKey({ organizationId: "org_a" }, "06".repeat(32));
  const { root, store } = await storeWith([{ key, ageHours: 72 }]);
  try {
    // The same bytes uploaded again (content-addressed: same key) between the listing and the deletion.
    const racing: VaultStore = {
      ...store,
      driver: store.driver,
      list: (prefix) => store.list(prefix),
      head: async (k) => ({ ...(await store.head(k))!, lastModified: NOW }),
      remove: (k) => store.remove(k),
      put: store.put.bind(store),
      get: store.get.bind(store),
      copy: store.copy.bind(store),
    };
    const report = await purgeUnreferencedBlobs(racing, {
      referenced: new Set(),
      graceMs: 24 * HOUR,
      now: NOW,
    });
    assert.deepEqual(report.purged, []);
    assert.equal(report.kept.recent, 1);
    assert.ok(await store.head(key));
    await assert.rejects(purgeUnreferencedBlobs(store, { referenced: new Set(), graceMs: -1 }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a direct upload's declaration is checked against the policy before any URL is issued", () => {
  const sha = "ab".repeat(32);
  assert.deepEqual(
    inspectDeclared({ sizeBytes: 1024, type: "Application/PDF", sha256: `0x${sha}` }, POLICIES.kyc),
    {
      ok: true,
      sha256: sha,
      mimeType: MIME.pdf,
      sizeBytes: 1024,
    },
  );
  assert.deepEqual(
    inspectDeclared({ sizeBytes: POLICIES.kyc.maxBytes + 1, type: MIME.pdf, sha256: sha }, POLICIES.kyc),
    { ok: false, code: "too_large" },
  );
  assert.deepEqual(inspectDeclared({ sizeBytes: 0, type: MIME.pdf, sha256: sha }, POLICIES.kyc), {
    ok: false,
    code: "empty",
  });
  assert.deepEqual(inspectDeclared({ sizeBytes: 1.5, type: MIME.pdf, sha256: sha }, POLICIES.kyc), {
    ok: false,
    code: "empty",
  });
  assert.deepEqual(inspectDeclared({ sizeBytes: 10, type: MIME.docx, sha256: sha }, POLICIES.kyc), {
    ok: false,
    code: "type",
  });
  assert.equal(inspectDeclared({ sizeBytes: 10, type: MIME.docx, sha256: sha }, POLICIES.dataRoom).ok, true);
  assert.deepEqual(inspectDeclared({ sizeBytes: 10, type: MIME.pdf, sha256: "xyz" }, POLICIES.kyc), {
    ok: false,
    code: "hash_format",
  });
});
