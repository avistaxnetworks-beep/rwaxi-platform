// E2E · DocumentVault on S3 (run it through run-s3.cjs: fake-s3.cjs checks SigV4 on its own). Browsers upload
// straight to the bucket with presigned PUTs bound to the declared size, type and SHA-256 — the bucket refuses any
// other bytes —; the server confirms each upload by reading the object back and checking it (type from the bytes,
// size, hash) before giving it its content key; files above the inline limit (4 MB) download through presigned
// GETs; and the GC (pnpm vault:gc) removes what no row references once its grace window passed.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const lib = require("./lib.cjs");
const {
  launch,
  ownerDb,
  ok,
  fail,
  shot,
  url,
  ROOT,
  waitText,
  clickText,
  onboardInvestor,
  openBackofficeTab,
  pdfBytes,
  sha256Of,
  vaultGet,
} = lib;

const S3 = process.env.E2E_S3;
if (!S3) throw new Error("Ejecuta esta suite con run-s3.cjs (levanta el bucket S3 de prueba y fija E2E_S3)");
const db = ownerDb();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bucket = async () => await (await fetch(`${S3}/__fake/objects`)).json();
const objectAt = async (key) => (await bucket()).objects.find((o) => o.key === key) ?? null;
const age = (key, hours) =>
  fetch(`${S3}/__fake/age?key=${encodeURIComponent(key)}&hours=${hours}`, { method: "POST" });
const hex = (sha) => sha.replace(/^0x/, "");
const b64 = (bytes) => Buffer.from(bytes).toString("base64");
/** pnpm vault:gc with this run's bucket: { status, report }. */
function vaultGc(args) {
  const r = spawnSync(`pnpm -s vault:gc -- ${args} --json`, { cwd: ROOT, shell: true, encoding: "utf8" });
  const last = (r.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "";
  let report = null;
  try {
    report = JSON.parse(last);
  } catch {
    /* refused: no report */
  }
  return { status: r.status, report, stderr: r.stderr ?? "" };
}

/**
 * presign → PUT → confirm from `page` (its host and session). `put` alters what the browser sends to the bucket
 * (other bytes or headers); `confirm: false` stops after the PUT.
 */
const directUpload = (
  page,
  { purpose, bytes, type = "application/pdf", fields = {}, put = {}, confirm = true, declaredSize },
) =>
  page.evaluate(
    async ({ purpose, raw, type, fields, put, confirm, declaredSize }) => {
      const decode = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      const bytes = decode(raw);
      const digest = async (b) =>
        [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))]
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
      const post = async (p, body) => {
        const r = await fetch(p, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: r.status, body: await r.json().catch(() => null) };
      };
      const presign = await post("/api/vault/upload/presign", {
        purpose,
        sha256: `0x${await digest(bytes)}`,
        sizeBytes: declaredSize ?? bytes.byteLength,
        type,
        fileName: "documento.pdf",
        ...fields,
      });
      if (presign.status !== 200 || presign.body?.mode !== "direct") return { presign };
      const sent = put.bytes ? decode(put.bytes) : bytes;
      const headers = { ...presign.body.upload.headers, ...(put.headers ?? {}) };
      if (put.ownHash) headers["x-amz-content-sha256"] = await digest(sent);
      const r = await fetch(presign.body.upload.url, { method: "PUT", headers, body: sent });
      const bucket = { status: r.status, text: await r.text() };
      if (!confirm) return { presign, bucket };
      const done = await post("/api/vault/upload/confirm", {
        purpose,
        ticket: presign.body.ticket,
        fileName: "documento.pdf",
        ...fields,
      });
      return { presign, bucket, done };
    },
    {
      purpose,
      raw: b64(bytes),
      type,
      fields,
      put: { ...put, bytes: put.bytes ? b64(put.bytes) : undefined },
      confirm,
      declaredSize,
    },
  );
const confirmFrom = (page, purpose, ticket) =>
  page.evaluate(
    async (purpose, ticket) => {
      const r = await fetch("/api/vault/upload/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose, ticket, fileName: "documento.pdf" }),
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    purpose,
    ticket,
  );
/** A visitor who only signed the NDA (an investor session without KYC). */
async function ndaOnly(browser) {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.goto(url("avista"), { waitUntil: "domcontentloaded", timeout: 180000 });
  await waitText(page, "Firmar NDA con un clic", 180000);
  await clickText(page, "Completar con datos de ejemplo");
  await clickText(page, "Firmar NDA con un clic");
  await waitText(page, "Paso 2 · Verificación KYC", 60000);
  return page;
}

(async () => {
  const browser = await launch();
  try {
    const avista = await db.organization.findUniqueOrThrow({ where: { slug: "avista" } });
    const offering = await db.offering.findFirstOrThrow({
      where: { organizationId: avista.id, published: true },
      orderBy: { code: "asc" },
    });
    const seeded = await db.dataRoomDocument.findMany({ where: { organizationId: avista.id } });
    const atSeed = await bucket();
    ok(
      "el seed escribió el Data Room de demostración en el bucket (cabeceras SigV4 verificadas por el bucket), con su SHA-256",
      seeded.length > 0 &&
        seeded.every((d) =>
          atSeed.objects.some(
            (o) => o.key === d.storageKey && o.sha256 === hex(d.sha256) && o.metaSha256 === hex(d.sha256),
          ),
        ),
      `${atSeed.objects.length} objetos`,
    );

    // ── 1 · KYC through the UI: the documents go straight to the bucket (presigned PUT), the server confirms them ──
    const inv = await onboardInvestor(browser, db, "avista");
    const kyc = await db.kycCase.findFirstOrThrow({
      where: { investorId: inv.investor.id },
      orderBy: { createdAt: "desc" },
    });
    const evDocs = kyc.evidence.documents;
    const kycObjects = await db.vaultObject.findMany({
      where: { organizationId: avista.id, sha256: { in: evDocs.map((d) => d.sha256) } },
    });
    const afterKyc = await bucket();
    const presignedPuts = afterKyc.requests.filter(
      (r) => r.method === "PUT" && r.presigned && r.key.startsWith("incoming/") && r.status === 200,
    );
    ok(
      "KYC: frente y reverso subidos por el navegador con PUT prefirmado a incoming/, confirmados y copiados a su clave de contenido; nada queda en cuarentena",
      evDocs.length === 2 &&
        kycObjects.length === 2 &&
        kycObjects.every((o) =>
          afterKyc.objects.some((b) => b.key === o.storageKey && b.sha256 === hex(o.sha256)),
        ) &&
        presignedPuts.length >= 2 &&
        !afterKyc.objects.some((o) => o.key.startsWith("incoming/")),
      `${presignedPuts.length} PUT prefirmados`,
    );

    // ── 2 · The presigned PUT admits exactly the declared file ──
    const doc = pdfBytes();
    const probe = await directUpload(inv.page, { purpose: "kyc", bytes: doc, confirm: false });
    const signedUrl = new URL(probe.presign.body.upload.url);
    ok(
      "presign: URL del bucket por 15 min que firma content-length, content-type, host, x-amz-content-sha256 y x-amz-meta-sha256",
      probe.presign.status === 200 &&
        signedUrl.origin === S3 &&
        /^\/rwaxi-e2e\/incoming\/[0-9a-f]{32}$/.test(signedUrl.pathname) &&
        signedUrl.searchParams.get("X-Amz-Expires") === "900" &&
        signedUrl.searchParams.get("X-Amz-SignedHeaders") ===
          "content-length;content-type;host;x-amz-content-sha256;x-amz-meta-sha256" &&
        probe.bucket.status === 200,
      signedUrl.searchParams.get("X-Amz-SignedHeaders"),
    );
    const other = Buffer.from(doc);
    other[other.length - 3] ^= 0x01; // same size, other bytes
    const swapped = await directUpload(inv.page, {
      purpose: "kyc",
      bytes: doc,
      put: { bytes: other },
      confirm: false,
    });
    const swappedHash = await directUpload(inv.page, {
      purpose: "kyc",
      bytes: doc,
      put: { bytes: other, ownHash: true },
      confirm: false,
    });
    const shorter = await directUpload(inv.page, {
      purpose: "kyc",
      bytes: doc,
      put: { bytes: doc.subarray(0, doc.length - 4) },
      confirm: false,
    });
    const retyped = await directUpload(inv.page, {
      purpose: "kyc",
      bytes: doc,
      put: { headers: { "content-type": "image/png" } },
      confirm: false,
    });
    ok(
      "el bucket rechaza otros bytes (XAmzContentSHA256Mismatch), otro SHA-256, otro tamaño u otro tipo (firma inválida)",
      swapped.bucket.status === 400 &&
        /XAmzContentSHA256Mismatch/.test(swapped.bucket.text) &&
        swappedHash.bucket.status === 403 &&
        /SignatureDoesNotMatch/.test(swappedHash.bucket.text) &&
        shorter.bucket.status === 403 &&
        retyped.bucket.status === 403,
      `${swapped.bucket.status} · ${swappedHash.bucket.status} · ${shorter.bucket.status} · ${retyped.bucket.status}`,
    );

    const tooBig = await directUpload(inv.page, {
      purpose: "kyc",
      bytes: doc,
      declaredSize: 11 * 1024 * 1024,
    });
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    const disguised = await directUpload(inv.page, { purpose: "kyc", bytes: html, type: "application/pdf" });
    const disguisedKey = new URL(disguised.presign.body.upload.url).pathname.split("/").slice(2).join("/");
    ok(
      "declarar más de 10 MB → 413 sin URL; HTML declarado como PDF entra al bucket (su hash coincide) pero el servidor lo rechaza al confirmar (415) y lo borra",
      tooBig.presign.status === 413 &&
        !tooBig.presign.body?.upload &&
        disguised.bucket.status === 200 &&
        disguised.done.status === 415 &&
        !(await objectAt(disguisedKey)),
      `${tooBig.presign.body?.error} · ${disguised.done.body?.error}`,
    );

    const good = pdfBytes();
    const first = await directUpload(inv.page, { purpose: "kyc", bytes: good, confirm: false });
    const forgedTicket = first.presign.body.ticket.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    const forged = await confirmFrom(inv.page, "kyc", forgedTicket);
    const intruder = await ndaOnly(browser);
    const stolen = await confirmFrom(intruder, "kyc", first.presign.body.ticket);
    const confirmed = await confirmFrom(inv.page, "kyc", first.presign.body.ticket);
    const incomingKey = new URL(first.presign.body.upload.url).pathname.split("/").slice(2).join("/");
    const finalKey = `tenants/${avista.id}/sha256/${hex(sha256Of(good))}`;
    const again = await confirmFrom(inv.page, "kyc", first.presign.body.ticket);
    ok(
      "confirmar: ticket alterado → 403; el ticket de otro inversionista → 403; el propio → recibo, objeto en su clave de contenido y fuera de cuarentena; repetirlo → 409",
      forged.status === 403 &&
        stolen.status === 403 &&
        /no es válida o venció/.test(stolen.body?.error ?? "") &&
        confirmed.status === 200 &&
        confirmed.body.sha256 === sha256Of(good) &&
        typeof confirmed.body.receipt === "string" &&
        (await objectAt(finalKey))?.sha256 === hex(sha256Of(good)) &&
        !(await objectAt(incomingKey)) &&
        again.status === 409,
      `${forged.status} · ${stolen.status} · ${confirmed.status} · ${again.status}`,
    );
    await intruder.browserContext().close();

    // ── 3 · A 6 MB Data Room file: uploaded from the backoffice straight to the bucket ──
    const admin = await (await browser.createBrowserContext()).newPage();
    admin.on("pageerror", (e) => console.log("PAGEERROR(admin)", e.message));
    await openBackofficeTab(admin, "avista", "Data Room");
    await admin.waitForSelector(`[data-dr-offering="${offering.code}"]`, { timeout: 90000 });
    const big = Buffer.concat([
      Buffer.from("%PDF-1.4\n"),
      crypto.randomBytes(6 * 1024 * 1024),
      Buffer.from("\n%%EOF\n"),
    ]);
    const file = path.join(lib.ARTIFACTS, `vault-s3-${crypto.randomBytes(3).toString("hex")}.pdf`);
    fs.writeFileSync(file, big);
    await admin.click(`#drv-restricted-${offering.code}`); // public with the NDA: no AccessGrant needed
    const before = await db.dataRoomDocument.count({ where: { offeringId: offering.id } });
    await (await admin.$(`#drv-file-${offering.code}`)).uploadFile(file);
    for (
      let i = 0;
      i < 200 && (await db.dataRoomDocument.count({ where: { offeringId: offering.id } })) === before;
      i++
    )
      await sleep(300);
    const bigDoc = await db.dataRoomDocument.findFirst({
      where: { offeringId: offering.id, sha256: sha256Of(big) },
    });
    const bigPut = (await bucket()).requests
      .filter((r) => r.method === "PUT" && r.presigned && r.status === 200)
      .at(-1);
    ok(
      "Data Room: PDF de 6 MB (por encima del límite de 4,5 MB de una función serverless) subido directo al bucket y verificado al confirmar",
      !!bigDoc &&
        !bigDoc.restricted &&
        (await objectAt(bigDoc.storageKey))?.sha256 === hex(sha256Of(big)) &&
        bigPut?.key.startsWith("incoming/") &&
        !!(await db.chainTransaction.findFirst({
          where: { offeringId: offering.id, kind: "DATA_ROOM_ROOT_ANCHORED", status: "PENDING" },
        })),
      bigDoc ? `${bigDoc.sizeBytes} B` : "no se creó el documento",
    );

    // ── 4 · Downloads: large ones through a presigned GET, small ones re-hashed by the server ──
    const bigGet = await vaultGet(inv.page, `/api/vault/data-room/${bigDoc.id}`);
    const bigAudit = await db.auditEvent.findFirst({
      where: { action: "DATA_ROOM_DOCUMENT_DOWNLOADED", entityId: bigDoc.id },
      orderBy: { createdAt: "desc" },
    });
    ok(
      "descarga de 6 MB: 302 a un GET prefirmado de 60 s del bucket, nombre y tipo firmados, SHA-256 igual al anclado; auditada (delivery presigned)",
      bigGet.status === 200 &&
        bigGet.redirected &&
        bigGet.finalUrl.startsWith(`${S3}/rwaxi-e2e/${bigDoc.storageKey}?`) &&
        new URL(bigGet.finalUrl).searchParams.get("X-Amz-Expires") === "60" &&
        bigGet.sha256 === bigDoc.sha256 &&
        bigGet.type === "application/pdf" &&
        /filename\*=UTF-8''/.test(bigGet.disposition ?? "") &&
        bigAudit?.payload.delivery === "presigned",
      bigGet.finalUrl?.split("?")[0],
    );
    const small = seeded.find((d) => !d.restricted && d.storageKey);
    const smallGet = await vaultGet(inv.page, `/api/vault/data-room/${small.id}`);
    const smallAudit = await db.auditEvent.findFirst({
      where: { action: "DATA_ROOM_DOCUMENT_DOWNLOADED", entityId: small.id },
      orderBy: { createdAt: "desc" },
    });
    ok(
      "un documento pequeño sale por la app, re-hasheado en el servidor (delivery inline)",
      smallGet.status === 200 &&
        !smallGet.redirected &&
        smallGet.sha256 === small.sha256 &&
        smallAudit?.payload.delivery === "inline",
    );

    // ── 5 · GC: what no row references, once its grace window passed ──
    const consolePage = await (await browser.createBrowserContext()).newPage();
    await consolePage.goto(url("admin", "/"), { waitUntil: "domcontentloaded", timeout: 180000 });
    const staged = await directUpload(consolePage, { purpose: "onboarding", bytes: pdfBytes() });
    const stagedKey = `staging/sha256/${hex(staged.done?.body?.sha256 ?? "")}`;
    const abandoned = await directUpload(inv.page, { purpose: "kyc", bytes: pdfBytes(), confirm: false });
    const abandonedKey = new URL(abandoned.presign.body.upload.url).pathname.split("/").slice(2).join("/");
    const orphans = [stagedKey, abandonedKey, finalKey]; // staging never onboarded · PUT never confirmed · receipt never submitted
    const fresh = await directUpload(inv.page, { purpose: "kyc", bytes: pdfBytes() }); // unreferenced too, but just uploaded
    const freshKey = `tenants/${avista.id}/sha256/${hex(fresh.done.body.sha256)}`;
    for (const key of orphans) await age(key, 48);
    const keep = [
      ...seeded.map((d) => d.storageKey),
      ...kycObjects.map((o) => o.storageKey),
      bigDoc.storageKey,
    ];
    ok(
      "huérfanos preparados: staging sin alta, PUT sin confirmar, recibo nunca usado (envejecidos 48 h) y uno recién subido",
      staged.done?.status === 200 &&
        abandoned.bucket.status === 200 &&
        (await Promise.all(orphans.map(objectAt))).every(Boolean),
    );
    const refused = vaultGc("--grace-hours 1");
    const dry = vaultGc("--dry-run");
    const stillThere = (await Promise.all(orphans.map(objectAt))).every(Boolean);
    const run = vaultGc("");
    const afterGc = await bucket();
    const has = (key) => afterGc.objects.some((o) => o.key === key);
    ok(
      "pnpm vault:gc: ventana < 6 h rechazada; --dry-run sólo informa; luego borra justo los huérfanos vencidos y conserva lo referenciado y lo reciente",
      refused.status !== 0 &&
        /grace-hours/.test(refused.stderr) &&
        dry.status === 0 &&
        dry.report.dryRun &&
        orphans.every((k) => dry.report.purged.some((p) => p.key === k)) &&
        stillThere &&
        run.status === 0 &&
        orphans.every((k) => run.report.purged.some((p) => p.key === k) && !has(k)) &&
        keep.every(has) &&
        has(freshKey) &&
        run.report.kept.referenced >= keep.length,
      run.report
        ? `${run.report.purged.length} borrados · ${run.report.kept.referenced} referenciados · ${run.report.kept.recent} recientes`
        : run.stderr.split("\n")[0],
    );
    // ── 6 · The same GC over HTTP (/api/internal/maintenance, as Vercel Cron calls it), against the bucket ──
    const cron = async (query, auth) => {
      const r = await fetch(url(null, `/api/internal/maintenance${query}`), { headers: { Authorization: auth } });
      return { status: r.status, body: await r.json().catch(() => null) };
    };
    const late = await directUpload(inv.page, { purpose: "kyc", bytes: pdfBytes(), confirm: false });
    const lateKey = new URL(late.presign.body.upload.url).pathname.split("/").slice(2).join("/");
    await age(lateKey, 48);
    const denied = await cron("?only=vault", "Bearer not-the-secret");
    const stillUploaded = !!(await objectAt(lateKey));
    const viaCron = await cron("?only=vault", `Bearer ${lib.webEnv("CRON_SECRET")}`);
    const afterCron = await bucket();
    const inBucket = (key) => afterCron.objects.some((o) => o.key === key);
    ok(
      "/api/internal/maintenance?only=vault sobre S3: sin el secreto 401 y nada se toca; con él borra el PUT nunca confirmado y conserva lo referenciado",
      late.bucket.status === 200 &&
        denied.status === 401 &&
        stillUploaded &&
        viaCron.status === 200 &&
        viaCron.body?.vault?.driver === "s3" &&
        viaCron.body.vault.purged.some((p) => p.key === lateKey) &&
        !inBucket(lateKey) &&
        keep.every(inBucket) &&
        inBucket(freshKey),
      viaCron.body?.vault ? `${viaCron.body.vault.purgedCount} borrado(s) · digest ${viaCron.body.digest.slice(0, 18)}…` : JSON.stringify(viaCron.body),
    );
    await shot(admin, "vault-s3-data-room", { fullPage: true });
    for (const p of [inv.page, admin, consolePage]) await p.browserContext().close();
  } catch (e) {
    fail(e);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})();
