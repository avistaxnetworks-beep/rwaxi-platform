import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalDiskStore, MIME, POLICIES, inspectUpload, objectKey, sha256Hex, sniffMime } from "./index";
import { samplePdf } from "./sample";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const ZIP = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 20, 0]);

test("the type comes from the bytes; a ZIP is only an OOXML document when declared as one", () => {
  assert.equal(sniffMime(samplePdf(["x"])), MIME.pdf);
  assert.equal(sniffMime(PNG), MIME.png);
  assert.equal(sniffMime(JPEG), MIME.jpeg);
  assert.equal(sniffMime(WEBP), MIME.webp);
  assert.equal(sniffMime(ZIP, MIME.docx), MIME.docx);
  assert.equal(sniffMime(ZIP), null);
  assert.equal(sniffMime(new TextEncoder().encode("<html><script>")), null);
});

test("an upload passes only with its exact SHA-256, an allowed type that matches the bytes and its size limit", () => {
  const pdf = samplePdf(["Escritura pública"]);
  const hash = sha256Hex(pdf);
  assert.deepEqual(inspectUpload(pdf, { type: MIME.pdf, sha256: `0x${hash.toUpperCase()}` }, POLICIES.kyc), {
    ok: true,
    sha256: hash,
    mimeType: MIME.pdf,
    sizeBytes: pdf.byteLength,
  });
  const flipped = `${hash.slice(0, -1)}${hash.endsWith("0") ? "1" : "0"}`;
  assert.deepEqual(inspectUpload(pdf, { type: MIME.pdf, sha256: flipped }, POLICIES.kyc), {
    ok: false,
    code: "mismatch",
    sha256: hash,
  });
  assert.equal(inspectUpload(pdf, { type: MIME.png, sha256: hash }, POLICIES.kyc).ok, false); // declared PNG, bytes PDF
  assert.deepEqual(inspectUpload(ZIP, { type: MIME.xlsx, sha256: sha256Hex(ZIP) }, POLICIES.kyc), {
    ok: false,
    code: "type",
  });
  assert.equal(inspectUpload(ZIP, { type: MIME.xlsx, sha256: sha256Hex(ZIP) }, POLICIES.dataRoom).ok, true);
  assert.deepEqual(inspectUpload(new Uint8Array(), { sha256: hash }, POLICIES.kyc), {
    ok: false,
    code: "empty",
  });
  assert.deepEqual(inspectUpload(pdf, { sha256: "not-a-hash" }, POLICIES.kyc), {
    ok: false,
    code: "hash_format",
  });
  const big = new Uint8Array(POLICIES.kyc.maxBytes + 1);
  big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  assert.deepEqual(inspectUpload(big, { type: MIME.pdf, sha256: sha256Hex(big) }, POLICIES.kyc), {
    ok: false,
    code: "too_large",
  });
});

test("keys are content-addressed and isolated per tenant", () => {
  const hash = "ab".repeat(32);
  assert.equal(
    objectKey({ organizationId: "org_avista" }, `0x${hash.toUpperCase()}`),
    `tenants/org_avista/sha256/${hash}`,
  );
  assert.notEqual(objectKey({ organizationId: "org_a" }, hash), objectKey({ organizationId: "org_b" }, hash));
  assert.equal(objectKey("staging", hash), `staging/sha256/${hash}`);
  assert.throws(() => objectKey({ organizationId: "../org" }, hash));
  assert.throws(() => objectKey({ organizationId: "org" }, "abc"));
});

test("the local store writes, reads, copies and removes by key, and refuses paths outside its layout", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "rwaxi-vault-"));
  try {
    const store = new LocalDiskStore(root);
    const pdf = samplePdf(["Data Room", "Licencia de construcción"]);
    const hash = sha256Hex(pdf);
    const staged = objectKey("staging", hash);
    const tenant = objectKey({ organizationId: "org_test" }, hash);
    assert.equal(await store.get(staged), null);
    assert.equal(await store.head(staged), null);
    await store.put(staged, pdf, { sizeBytes: pdf.byteLength, mimeType: MIME.pdf, sha256: hash });
    const { lastModified, ...meta } = (await store.head(staged))!;
    assert.deepEqual(meta, { sizeBytes: pdf.byteLength, mimeType: MIME.pdf, sha256: hash });
    assert.ok(lastModified instanceof Date && Date.now() - lastModified.getTime() < 60_000);
    await store.copy(staged, tenant);
    assert.equal(sha256Hex((await store.get(tenant))!), hash);
    await store.remove(staged);
    assert.equal(await store.get(staged), null);
    assert.ok(await store.head(tenant));
    // Tampering on disk is detectable: the bytes no longer hash to their key.
    await writeFile(path.join(root, ...tenant.split("/")), "manipulado");
    assert.notEqual(sha256Hex((await store.get(tenant))!), hash);
    await assert.rejects(store.get("tenants/org_test/../../etc/passwd"));
    await assert.rejects(
      store.put("tenants/org_test/sha256/zz", pdf, { sizeBytes: 1, mimeType: MIME.pdf, sha256: hash }),
    );
    assert.match(
      await readFile(path.join(root, ...tenant.split("/")) + ".json", "utf8"),
      /"mimeType":"application\/pdf"/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sample PDFs are valid, deterministic and ASCII-safe", () => {
  const a = samplePdf(["RWAXI · Data Room", "Señalización (fase 1)"]);
  const b = samplePdf(["RWAXI · Data Room", "Señalización (fase 1)"]);
  assert.equal(sha256Hex(a), sha256Hex(b));
  const text = new TextDecoder().decode(a);
  assert.match(text, /^%PDF-1\.4\n/);
  assert.match(text, /\(Senalizacion \\\(fase 1\\\)\) Tj/);
  assert.match(text, /startxref\n\d+\n%%EOF\n$/);
  assert.ok([...a].every((byte) => byte < 0x80));
});
