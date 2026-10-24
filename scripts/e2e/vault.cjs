// E2E · DocumentVault: KYC and Data Room files. The server only stores bytes it verified itself (type from the
// bytes, size, SHA-256 equal to the browser's), content-addressed per tenant; every download is authorized
// (role, NDA, AccessGrant, tenant), re-hashed against the anchored SHA-256 (a tampered file is refused and the
// incident audited) and recorded in AuditEvent. All staff browsers sign in for real (demo session opted out),
// so the suite behaves the same under RWAXI_DEMO_AUTH=0 (pnpm e2e:strict).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const lib = require("./lib.cjs");
const {
  launch,
  ownerDb,
  ok,
  fail,
  shot,
  url,
  merkleRoot,
  waitText,
  clickText,
  clickIn,
  onboardInvestor,
  toastText,
} = lib;
const { withoutDemo, staffLogin, vaultPath, fileSha256, pdfBytes, sha256Of, vaultUpload, vaultGet } = lib;

const db = ownerDb();
const lastAudit = (where) => db.auditEvent.findFirst({ where, orderBy: { createdAt: "desc" } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, timeout = 30000) => {
  for (const end = Date.now() + timeout; Date.now() < end; await sleep(300)) if (await fn()) return true;
  return false;
};
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = () => Buffer.concat([PNG_HEADER, crypto.randomBytes(64)]);

async function freshPage(browser, label, hosts) {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on("pageerror", (e) => console.log(`PAGEERROR(${label})`, e.message));
  if (hosts) await withoutDemo(page, hosts);
  return page;
}
const tab = async (page, label) => {
  await page.waitForFunction(
    (l) => [...document.querySelectorAll('[role="tab"]')].some((t) => t.textContent.includes(l)),
    { timeout: 180000 },
    label,
  );
  await page.evaluate(
    (l) => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes(l)).click(),
    label,
  );
};
async function signedIn(browser, label, slug, email) {
  const page = await freshPage(browser, label, [slug]);
  await page.goto(url(slug, "/backoffice"), { waitUntil: "domcontentloaded", timeout: 180000 });
  await staffLogin(page, email);
  await page.waitForSelector('[data-account="user"]', { timeout: 180000 });
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

    // ── 1 · KYC: the identity documents travel to the vault, verified, before the dossier references them ──
    const inv = await onboardInvestor(browser, db, "avista");
    await withoutDemo(inv.page, ["avista"]);
    const kyc = await db.kycCase.findFirstOrThrow({
      where: { investorId: inv.investor.id },
      orderBy: { createdAt: "desc" },
    });
    const evDocs = kyc.evidence.documents;
    const objects = await db.vaultObject.findMany({
      where: { organizationId: avista.id, sha256: { in: evDocs.map((d) => d.sha256) } },
    });
    ok(
      "expediente KYC: frente y reverso en la bóveda del tenant (VaultObject PNG) y en disco con el SHA-256 del expediente",
      evDocs.length === 2 &&
        objects.length === 2 &&
        objects.every(
          (o) =>
            o.mimeType === "image/png" && o.storageKey === `tenants/${avista.id}/sha256/${o.sha256.slice(2)}`,
        ) &&
        evDocs.every(
          (d) =>
            d.type === "image/png" &&
            fs.existsSync(vaultPath(avista.id, d.sha256)) &&
            fileSha256(vaultPath(avista.id, d.sha256)) === d.sha256,
        ),
      evDocs.map((d) => d.kind).join(" + "),
    );

    const real = png();
    const forged = await vaultUpload(inv.page, {
      purpose: "kyc",
      bytes: real,
      type: "image/png",
      name: "cedula.png",
      sha256: sha256Of(png()),
    });
    const text = Buffer.from("<script>alert(1)</script>");
    const disguised = await vaultUpload(inv.page, {
      purpose: "kyc",
      bytes: text,
      type: "image/png",
      name: "foto.png",
      sha256: sha256Of(text),
    });
    const big = Buffer.concat([PNG_HEADER, Buffer.alloc(10 * 1024 * 1024)]);
    const tooBig = await vaultUpload(inv.page, {
      purpose: "kyc",
      bytes: big,
      type: "image/png",
      name: "grande.png",
      sha256: sha256Of(big),
    });
    ok(
      "carga KYC con bytes que no corresponden al SHA-256 declarado → 422 y nada escrito; HTML disfrazado de PNG → 415; > 10 MB → 413",
      forged.status === 422 &&
        !fs.existsSync(vaultPath(avista.id, sha256Of(real))) &&
        disguised.status === 415 &&
        tooBig.status === 413,
      `${forged.status} · ${disguised.status} · ${tooBig.status} · ${forged.body?.error}`,
    );
    const stranger = await freshPage(browser, "stranger", ["avista"]);
    await stranger.goto(url("avista"), { waitUntil: "domcontentloaded", timeout: 180000 });
    const noNda = await vaultUpload(stranger, {
      purpose: "kyc",
      bytes: real,
      type: "image/png",
      sha256: sha256Of(real),
    });
    ok("carga KYC sin sesión de inversionista (sin NDA) → 401", noNda.status === 401, noNda.body?.error);

    // ── 2 · KYC files open for the compliance officer and the administrator of the tenant only ──
    const officer = await signedIn(browser, "officer", "avista", "compliance@avistaresort.co");
    await tab(officer, "Cumplimiento y Leads");
    await officer.waitForSelector(`tr[data-investor="${inv.investor.id}"]`, { timeout: 90000 });
    await clickIn(officer, `tr[data-investor="${inv.investor.id}"]`, "Revisar formulario");
    await officer.waitForSelector('[data-kyc-document="front"]', { timeout: 30000 });
    const front = evDocs.find((d) => d.kind === "front");
    const opened = await vaultGet(officer, `/api/vault/kyc/${kyc.id}/front`);
    const viewed = await lastAudit({
      organizationId: avista.id,
      action: "KYC_DOCUMENT_VIEWED",
      entityId: kyc.id,
    });
    const officerUser = await db.user.findUniqueOrThrow({ where: { email: "compliance@avistaresort.co" } });
    ok(
      "Oficial de Cumplimiento abre el frente del documento desde la bandeja: 200, PNG, nosniff, SHA-256 re-hasheado = expediente, KYC_DOCUMENT_VIEWED",
      opened.status === 200 &&
        opened.type === "image/png" &&
        opened.nosniff === "nosniff" &&
        opened.sha256 === front.sha256 &&
        opened.header === front.sha256 &&
        viewed?.actorUserId === officerUser.id &&
        viewed.subjectHash === front.sha256,
    );
    const admin = await signedIn(browser, "admin", "avista", "admin@avistaresort.co");
    const asAdmin = await vaultGet(admin, `/api/vault/kyc/${kyc.id}/back?download=1`);
    ok(
      "el Administrador también lo descarga (attachment)",
      asAdmin.status === 200 && /^attachment/.test(asAdmin.disposition ?? ""),
    );
    const investorTry = await vaultGet(inv.page, `/api/vault/kyc/${kyc.id}/front`);
    ok(
      "el propio inversionista (sin sesión de personal) no accede a la ruta del backoffice → 403",
      investorTry.status === 403,
      investorTry.error,
    );
    const valle = await signedIn(browser, "valle", "elpoblado", "oficialcumplimiento@vallealto.co");
    const cross = await vaultGet(valle, `/api/vault/kyc/${kyc.id}/front`);
    ok(
      "el oficial de otro tenant (elpoblado) pide el expediente de avista → 404 (RLS)",
      cross.status === 404,
      cross.error,
    );
    await valle.browserContext().close();

    // ── 3 · Backoffice Data Room: the issuer uploads, verified; a new root and its anchoring are queued ──
    await tab(admin, "Data Room");
    await admin.waitForSelector(`[data-dr-offering="${offering.code}"]`, { timeout: 60000 });
    const file = path.join(lib.ARTIFACTS, `vault-${crypto.randomBytes(3).toString("hex")}.pdf`);
    fs.writeFileSync(file, pdfBytes());
    const expected = fileSha256(file);
    const before = await db.dataRoomDocument.count({ where: { offeringId: offering.id } });
    await (await admin.$(`#drv-file-${offering.code}`)).uploadFile(file);
    await until(
      async () => (await db.dataRoomDocument.count({ where: { offeringId: offering.id } })) === before + 1,
      60000,
    );
    const added = await db.dataRoomDocument.findFirst({
      where: { offeringId: offering.id, sha256: expected },
    });
    const docs = await db.dataRoomDocument.findMany({ where: { offeringId: offering.id } });
    const offeringAfter = await db.offering.findUniqueOrThrow({ where: { id: offering.id } });
    const anchor = await db.chainTransaction.findFirst({
      where: { offeringId: offering.id, kind: "DATA_ROOM_ROOT_ANCHORED", status: "PENDING" },
    });
    const addedAudit = await lastAudit({ organizationId: avista.id, action: "DATA_ROOM_DOCUMENT_ADDED" });
    ok(
      "carga del emisor: DataRoomDocument + VaultObject + archivo en disco; raíz recalculada independientemente = Offering.dataRoomRoot",
      !!added &&
        added.storageKey === `tenants/${avista.id}/sha256/${expected.slice(2)}` &&
        fs.existsSync(vaultPath(avista.id, expected)) &&
        !!(await db.vaultObject.findFirst({
          where: { organizationId: avista.id, sha256: expected, mimeType: "application/pdf" },
        })) &&
        merkleRoot(docs.map((d) => d.sha256)) === offeringAfter.dataRoomRoot &&
        offeringAfter.dataRoomRoot !== offering.dataRoomRoot,
      await toastText(admin),
    );
    ok(
      "token desplegado → updateDataRoomMerkleRoot(nueva raíz) en cola para el emisor; DATA_ROOM_DOCUMENT_ADDED con su usuario",
      anchor?.args.newRoot === offeringAfter.dataRoomRoot &&
        addedAudit?.payload.anchorChainTransactionId === anchor.id &&
        addedAudit.subjectHash === expected &&
        addedAudit.actorEmail === "admin@avistaresort.co",
    );
    const replica = await vaultUpload(admin, {
      purpose: "data-room",
      bytes: fs.readFileSync(file),
      type: "application/pdf",
      sha256: expected,
      fields: { offeringId: offering.id, folder: added.folder, restricted: "1" },
    });
    const tampered = pdfBytes();
    const lie = await vaultUpload(admin, {
      purpose: "data-room",
      bytes: tampered,
      type: "application/pdf",
      sha256: sha256Of(pdfBytes()),
      fields: { offeringId: offering.id, folder: added.folder, restricted: "1" },
    });
    const byOfficer = await vaultUpload(officer, {
      purpose: "data-room",
      bytes: pdfBytes(),
      type: "application/pdf",
      sha256: sha256Of(pdfBytes()),
      fields: { offeringId: offering.id, folder: added.folder, restricted: "1" },
    });
    ok(
      "mismo archivo otra vez → 409; bytes que no corresponden a su SHA-256 → 422 sin fila ni archivo; el Oficial (no emisor) → 403",
      replica.status === 409 &&
        lie.status === 422 &&
        !fs.existsSync(vaultPath(avista.id, sha256Of(tampered))) &&
        byOfficer.status === 403 &&
        (await db.dataRoomDocument.count({ where: { offeringId: offering.id } })) === before + 1,
      `${lie.body?.error} · ${byOfficer.body?.error}`,
    );
    // Above the middleware's default 10 MB buffer: the Data Room's 20 MB limit holds end to end.
    const large = Buffer.concat([pdfBytes(), Buffer.alloc(15 * 1024 * 1024, 0x20)]);
    const largeUpload = await vaultUpload(admin, {
      purpose: "data-room",
      bytes: large,
      type: "application/pdf",
      name: "planos-15mb.pdf",
      sha256: sha256Of(large),
      fields: {
        offeringId: offering.id,
        folder: added.folder,
        name: "Planos arquitectónicos (15 MB)",
        restricted: "1",
      },
    });
    ok(
      "un PDF de 15 MB (por encima del búfer de 10 MB del middleware) entra completo y verificado al Data Room",
      largeUpload.status === 200 &&
        largeUpload.body?.sha256 === sha256Of(large) &&
        fileSha256(vaultPath(avista.id, sha256Of(large))) === sha256Of(large),
      `${largeUpload.status} ${largeUpload.body?.error ?? ""}`,
    );

    // ── 4 · Investors download Data Room files by NDA and AccessGrant, never across tenants ──
    const publicDoc = docs.find((d) => !d.restricted && d.storageKey);
    const restrictedDoc = docs.find((d) => d.restricted && d.storageKey && d.id !== added.id);
    const anonymous = await vaultGet(stranger, `/api/vault/data-room/${publicDoc.id}`);
    ok("visitante sin NDA: hasta el documento público → 401", anonymous.status === 401, anonymous.error);

    const b = await freshPage(browser, "nda-only");
    await b.goto(url("avista"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitText(b, "Firmar NDA con un clic", 180000);
    await clickText(b, "Completar con datos de ejemplo");
    await clickText(b, "Firmar NDA con un clic");
    await waitText(b, "Paso 2 · Verificación KYC", 60000);
    const pubForB = await vaultGet(b, `/api/vault/data-room/${publicDoc.id}`);
    const resForB = await vaultGet(b, `/api/vault/data-room/${restrictedDoc.id}`);
    ok(
      "inversionista con NDA (KYC sin aprobar): documento público → 200 con su SHA-256; restringido → 403 (exige AccessGrant)",
      pubForB.status === 200 &&
        pubForB.sha256 === publicDoc.sha256 &&
        resForB.status === 403 &&
        /AccessGrant/.test(resForB.error ?? ""),
    );

    await clickIn(officer, `tr[data-investor="${inv.investor.id}"]`, "Aprobar Inversionista").catch(
      async () => {
        await officer.keyboard.press("Escape");
        await clickIn(officer, `tr[data-investor="${inv.investor.id}"]`, "Aprobar Inversionista");
      },
    );
    await officer.waitForFunction(
      (id) => document.querySelector(`tr[data-investor="${id}"] [data-kyc]`)?.dataset.kyc === "aprobado",
      { timeout: 90000 },
      inv.investor.id,
    );
    const grant = await db.dataRoomAccessGrant.findFirstOrThrow({ where: { investorId: inv.investor.id } });
    const resForA = await vaultGet(inv.page, `/api/vault/data-room/${restrictedDoc.id}`);
    const downloaded = await lastAudit({
      organizationId: avista.id,
      action: "DATA_ROOM_DOCUMENT_DOWNLOADED",
      entityId: restrictedDoc.id,
    });
    ok(
      "con KYC aprobado (AccessGrant): documento restringido → 200, SHA-256 idéntico; DATA_ROOM_DOCUMENT_DOWNLOADED del inversionista con su grant",
      resForA.status === 200 &&
        resForA.sha256 === restrictedDoc.sha256 &&
        downloaded?.actorEmail === inv.email &&
        downloaded.payload.by === "investor" &&
        downloaded.payload.accessGrantId === grant.id,
    );
    const named = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(resForA.disposition ?? "")?.[1] ?? "");
    ok("el archivo llega con el título del documento y la extensión de su tipo verificado", named === `${restrictedDoc.name}.pdf`, named);

    await inv.page.goto(url("avista"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await inv.page.waitForSelector("#funnel", { timeout: 180000 });
    await clickText(inv.page, "Data Room desbloqueado");
    await inv.page.waitForSelector(`[data-room-document="${restrictedDoc.id}"]`, { timeout: 60000 });
    await clickIn(inv.page, `[data-room-document="${restrictedDoc.id}"]`, "");
    await inv.page.waitForSelector(`[data-room-document="${restrictedDoc.id}"][data-verified="true"]`, {
      timeout: 60000,
    });
    ok(
      "portal: el inversionista descarga el documento y su navegador verifica el SHA-256 contra la hoja anclada",
      true,
    );

    const session = (await inv.page.cookies(url("avista"))).find((c) => c.name === "rwaxi_inv");
    const elsewhere = await freshPage(browser, "cross-investor");
    await elsewhere.setCookie({
      name: "rwaxi_inv",
      value: session.value,
      url: url("elpoblado"),
      httpOnly: true,
    });
    await elsewhere.goto(url("elpoblado"), { waitUntil: "domcontentloaded", timeout: 180000 });
    const crossDoc = await vaultGet(elsewhere, `/api/vault/data-room/${restrictedDoc.id}`);
    ok(
      "la sesión del inversionista llevada a elpoblado.localhost: el documento de avista no existe ahí → 404",
      crossDoc.status === 404,
      crossDoc.error,
    );
    await elsewhere.browserContext().close();

    // ── 5 · A file altered in storage is never served: 409 and VAULT_INTEGRITY_FAILED ──
    const stored = vaultPath(avista.id, restrictedDoc.sha256);
    const original = fs.readFileSync(stored);
    const damage = Buffer.from("%PDF-1.4\n% alterado fuera de la plataforma\n%%EOF\n");
    fs.writeFileSync(stored, damage);
    const blocked = await vaultGet(inv.page, `/api/vault/data-room/${restrictedDoc.id}`);
    const incident = await lastAudit({
      organizationId: avista.id,
      action: "VAULT_INTEGRITY_FAILED",
      entityId: restrictedDoc.id,
    });
    fs.writeFileSync(stored, original);
    const restored = await vaultGet(inv.page, `/api/vault/data-room/${restrictedDoc.id}`);
    ok(
      "archivo manipulado en la bóveda → 409 sin entregar los bytes; VAULT_INTEGRITY_FAILED con el SHA-256 esperado y el recalculado",
      blocked.status === 409 &&
        blocked.sha256 !== sha256Of(damage) &&
        incident?.payload.expectedSha256 === restrictedDoc.sha256 &&
        incident.payload.actualSha256 === sha256Of(damage) &&
        restored.status === 200 &&
        restored.sha256 === restrictedDoc.sha256,
      blocked.error,
    );
    await shot(inv.page, "vault-portal");
    for (const p of [b, stranger, officer, admin, inv.page]) await p.browserContext().close();
  } catch (e) {
    fail(e);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})();
