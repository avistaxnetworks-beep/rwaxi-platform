// E2E · operational actions of the Super-Admin console against Neon:
//   Module C — invoice ACCRUED fees (→ INVOICED), record payments (→ PAID), agreed setup / SaaS (next accrual);
//   Module A — the commercial agreement and the platform fee it sets (25–500 bps, signed PDF verified into the
//   tenant's vault, re-hashed on view; deployed tokens keep theirs), suspend / reactivate a portal, pause / resume an
//   offering's capture, vitrina publication,
//   with the effect checked at once in the vitrina, the tenant portal (also on pages opened before the
//   decision) and the AuditEvent trail (subjectHash recomputed independently).
const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const lib = require("./lib.cjs");
const { launch, ownerDb, ok, fail, shot, url, canon, sha256, ARTIFACTS, PORT } = lib;
const { waitText, clickText, clickIn, fill, toastText, alertText, waitAlert, openBackofficeTab, replayAction } = lib;

const db = ownerDb();
const today = new Date().toISOString().slice(0, 10);
const kpiOf = async (page, id) => JSON.parse(await page.$eval(`[data-kpi="${id}"]`, (n) => n.dataset.value));
const auditHash = (e) => sha256(canon({ action: e.action, organizationId: e.organizationId, entityId: e.entityId, ...e.payload }));
const lastAudit = (organizationId, action) => db.auditEvent.findFirst({ where: { organizationId, action }, orderBy: { createdAt: "desc" } });
/** Status of a GET on `{host}.localhost` (Node cannot resolve *.localhost: 127.0.0.1 with its Host header). */
const hostGet = (host, pathname) =>
  new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port: PORT, path: pathname, headers: { Host: `${host}.localhost:${PORT}` } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", () => resolve(0));
    req.end();
  });

async function openAdmin(page, tab) {
  await page.goto(url("admin"), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector("[data-platform-overview]", { timeout: 180000 });
  await page.evaluate((t) => [...document.querySelectorAll('[role="tab"]')].find((x) => x.textContent.includes(t)).click(), tab);
  await page.waitForSelector(tab === "Tarifas" ? "[data-platform-ledger]" : "[data-platform-governance]", { timeout: 60000 });
}
/** Module A decision dialog: fills the reason and confirms. */
async function decide(page, reason) {
  await page.waitForSelector("[data-governance-dialog]", { timeout: 30000 });
  await fill(page, "#gov-reason", reason);
  await clickText(page, "Confirmar decisión", '[role="dialog"]');
}
/** Clicks a request-producing control while rewriting the Server Action body in flight. */
async function tampered(page, trigger, rewrite) {
  let done = false;
  await page.setRequestInterception(true);
  const handler = (req) => {
    if (req.method() === "POST" && req.headers()["next-action"] && !done) {
      done = true;
      req.continue({ postData: rewrite(req.postData() || "") });
    } else req.continue();
  };
  page.on("request", handler);
  await trigger();
  return async (re) => {
    await waitAlert(page, re);
    page.off("request", handler);
    await page.setRequestInterception(false);
    return done;
  };
}
const vitrinaCard = async (page, code) => {
  await page.goto(url(null), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector('[data-live-catalog="neon"] [data-offering]', { timeout: 180000 });
  return page.evaluate((code) => {
    const card = document.querySelector(`[data-offering="${code}"]`);
    if (!card) return null;
    return {
      portal: card.dataset.portalStatus,
      capture: card.dataset.capture,
      cta: [...card.querySelectorAll("button")].some((b) => b.textContent.includes("Ir al Portal Oficial")),
      text: card.innerText,
    };
  }, code);
};

(async () => {
  const browser = await launch();
  try {
    const avista = await db.organization.findUniqueOrThrow({ where: { slug: "avista" }, include: { offerings: true } });
    const elpoblado = await db.organization.findUniqueOrThrow({ where: { slug: "elpoblado" }, include: { offerings: true } });
    const offering = avista.offerings[0];
    const admin = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN", organizationId: null } });
    const accruedAv = await db.feeLedgerEntry.findFirstOrThrow({ where: { organizationId: avista.id, status: "ACCRUED" } });
    const accruedEl = await db.feeLedgerEntry.findFirstOrThrow({ where: { organizationId: elpoblado.id, status: "ACCRUED" } });
    const paidAv = await db.feeLedgerEntry.findFirstOrThrow({ where: { organizationId: avista.id, status: "PAID" } });

    const s = await (await browser.createBrowserContext()).newPage();
    s.on("pageerror", (e) => console.log("PAGEERROR(S)", e.message));
    const actions = {};
    s.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (req.method() === "POST" && id) actions[req.postData() ?? ""] = id;
    });
    const actionId = (needle) => Object.entries(actions).find(([body]) => body.includes(needle))?.[1];

    // ══ Module C · billing ═════════════════════════════════════════════════
    await openAdmin(s, "Tarifas");
    await s.click(`input[data-select-entry="${accruedAv.id}"]`);
    await s.click(`input[data-select-entry="${accruedEl.id}"]`);
    const mixedDisabled = await s.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Facturar seleccionadas")).disabled);
    ok("selección de asientos de dos desarrolladores → no se puede facturar (UI)", mixedDisabled && (await lib.has(s, "Una factura agrupa asientos de un solo desarrollador")));
    await s.click(`input[data-select-entry="${accruedEl.id}"]`);

    await clickText(s, "Facturar seleccionadas");
    await s.waitForSelector("#invoice-number", { timeout: 30000 });
    await fill(s, "#invoice-number", "rwx-avi-2026-0101");
    let settle = await tampered(s, () => clickText(s, "Emitir factura", '[role="dialog"]'), (body) =>
      body.replace(`["${accruedAv.id}"]`, `["${accruedAv.id}","${accruedEl.id}"]`),
    );
    ok(
      "petición forjada que mezcla asientos de dos tenants → rechazada en el servidor",
      (await settle(/un solo desarrollador/)) && (await db.feeInvoice.count({ where: { number: "RWX-AVI-2026-0101" } })) === 0,
      await alertText(s),
    );
    settle = await tampered(s, () => clickText(s, "Emitir factura", '[role="dialog"]'), (body) => body.replace(accruedAv.id, paidAv.id));
    ok(
      "petición forjada sobre un asiento ya PAID → rechazada (sólo ACCRUED)",
      (await settle(/Sólo se facturan asientos ACCRUED/)) && (await db.feeLedgerEntry.findUniqueOrThrow({ where: { id: paidAv.id } })).status === "PAID",
    );

    await clickText(s, "Emitir factura", '[role="dialog"]');
    await s.waitForSelector('tr[data-invoice="RWX-AVI-2026-0101"][data-invoice-status="INVOICED"]', { timeout: 60000 });
    const invoice = await db.feeInvoice.findUniqueOrThrow({ where: { number: "RWX-AVI-2026-0101" }, include: { entries: true } });
    const invAudit = await lastAudit(avista.id, "FEE_INVOICED");
    ok(
      "factura emitida (número normalizado) → asiento INVOICED enlazado, total = importe",
      invoice.organizationId === avista.id &&
        invoice.entries.length === 1 &&
        invoice.entries[0].id === accruedAv.id &&
        invoice.entries[0].status === "INVOICED" &&
        Number(invoice.totalUsd) === Number(accruedAv.amountUsd) &&
        invoice.paidOn === null,
      await toastText(s),
    );
    ok(
      "AuditEvent FEE_INVOICED por el SUPER_ADMIN · subjectHash = SHA-256 canónico de la decisión (recalculado)",
      invAudit?.actorUserId === admin.id && invAudit.actorEmail === admin.email && invAudit.entityId === invoice.id && invAudit.subjectHash === auditHash(invAudit),
    );

    // The same invoice number cannot bill another developer (UNIQUE fee_invoices.number)
    await openAdmin(s, "Tarifas");
    await s.click(`input[data-select-entry="${accruedEl.id}"]`);
    await clickText(s, "Facturar seleccionadas");
    await s.waitForSelector("#invoice-number", { timeout: 30000 });
    await fill(s, "#invoice-number", "RWX-AVI-2026-0101");
    await clickText(s, "Emitir factura", '[role="dialog"]');
    await waitAlert(s, /ya existe/);
    ok(
      "número de factura repetido para otro tenant → rechazado, el asiento sigue ACCRUED",
      (await db.feeLedgerEntry.findUniqueOrThrow({ where: { id: accruedEl.id } })).status === "ACCRUED",
      await alertText(s),
    );
    await clickText(s, "Cancelar", '[role="dialog"]');

    // Payment: future / earlier-than-issue dates refused on the server, then recorded
    await clickIn(s, 'tr[data-invoice="RWX-AVI-2026-0101"]', "Registrar pago");
    await s.waitForSelector("#pay-date", { timeout: 30000 });
    await fill(s, "#pay-receipt", "trf  2026 10 0042");
    await fill(s, "#pay-date", "2099-01-01");
    await clickText(s, "Registrar pago", '[role="dialog"]');
    await waitAlert(s, /no puede ser futura/);
    await fill(s, "#pay-date", "2020-01-01");
    await clickText(s, "Registrar pago", '[role="dialog"]');
    await waitAlert(s, /anterior a la emisión/);
    ok("fecha de pago futura o anterior a la emisión → rechazada en el servidor", (await db.feeInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).paidOn === null);
    await fill(s, "#pay-date", today);
    await clickText(s, "Registrar pago", '[role="dialog"]');
    await s.waitForSelector('tr[data-invoice="RWX-AVI-2026-0101"][data-invoice-status="PAID"]', { timeout: 60000 });
    const paid = await db.feeInvoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { entries: true } });
    const payAudit = await lastAudit(avista.id, "FEE_PAYMENT_RECORDED");
    ok(
      "pago registrado: factura con fecha y comprobante (normalizado), asientos PAID",
      paid.paidOn?.toISOString().slice(0, 10) === today && paid.paymentReceipt === "TRF 2026 10 0042" && paid.entries.every((e) => e.status === "PAID"),
      `${today} · ${paid.paymentReceipt}`,
    );
    ok("AuditEvent FEE_PAYMENT_RECORDED con hash recalculable", payAudit?.entityId === invoice.id && payAudit.subjectHash === auditHash(payAudit) && payAudit.payload.paidOn === today);
    const payId = actionId(`"${invoice.id}"`);
    const again = await replayAction(s, payId, [invoice.id, today, "TRF-OTRA-0001"]);
    ok("registrar de nuevo el pago (petición reenviada) → rechazado", /ya tiene un pago registrado/.test(again) && (await db.feeInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).paymentReceipt === "TRF 2026 10 0042");

    await openAdmin(s, "Tarifas");
    const fees = await kpiOf(s, "fees");
    const byStatus = Object.fromEntries(
      (await db.feeLedgerEntry.groupBy({ by: ["status"], _sum: { amountUsd: true } })).map((g) => [g.status, Number(g._sum.amountUsd)]),
    );
    ok(
      "KPIs de comisiones (Causado / Facturado / Pagado) = agregados de Neon",
      ["ACCRUED", "INVOICED", "PAID"].every((k) => Math.abs((fees[k] ?? 0) - (byStatus[k] ?? 0)) < 0.005),
      JSON.stringify(fees),
    );
    await shot(s, "superadmin-ledger", { fullPage: true });

    // Agreed fixed terms (module C): setup and SaaS. The platform fee is agreed in module A, with its signed agreement.
    const platformFeeShown = await s.$eval('[data-fee-terms="avista"] [data-platform-fee-bps]', (n) => n.dataset.platformFeeBps);
    await clickIn(s, '[data-fee-terms="avista"]', "Editar tarifas");
    await s.waitForSelector("#fee-monthly", { timeout: 30000 });
    ok(
      "módulo C: muestra la comisión de plataforma pactada pero no la edita (sin campo de uso)",
      platformFeeShown === String(avista.platformFeeBps) && !(await s.$("#fee-usage")),
      `${platformFeeShown} pb`,
    );
    await fill(s, "#fee-monthly", "abc");
    await clickText(s, "Guardar tarifas", '[role="dialog"]');
    await waitAlert(s, /SaaS mensual: importe en USD/);
    ok("SaaS mensual inválido → rechazado", Number((await db.organization.findUniqueOrThrow({ where: { id: avista.id } })).feeMonthlyUsd) === Number(avista.feeMonthlyUsd));
    await fill(s, "#fee-monthly", "6000");
    await clickText(s, "Guardar tarifas", '[role="dialog"]');
    await s.waitForFunction(() => !document.querySelector("[data-billing-dialog]"), { timeout: 60000 });
    const termsOrg = await db.organization.findUniqueOrThrow({ where: { id: avista.id } });
    const termsAudit = await lastAudit(avista.id, "FEE_TERMS_UPDATED");
    ok(
      "tarifas pactadas actualizadas en Neon + AuditEvent con valores anteriores y nuevos",
      Number(termsOrg.feeMonthlyUsd) === 6000 &&
        termsOrg.platformFeeBps === avista.platformFeeBps &&
        termsAudit?.payload.from.monthlyUsd === Number(avista.feeMonthlyUsd).toFixed(2) &&
        termsAudit.payload.to.monthlyUsd === "6000.00" &&
        !("usagePct" in termsAudit.payload.to) &&
        termsAudit.subjectHash === auditHash(termsAudit),
      `SaaS ${termsAudit?.payload.from.monthlyUsd} → ${termsAudit?.payload.to.monthlyUsd}`,
    );

    // ══ Commercial agreement and platform fee (module A) ═══════════════════
    const consoleActions = {};
    s.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (req.method() === "POST" && id) consoleActions[req.postData() ?? ""] = id;
    });
    await openAdmin(s, "Gobierno");
    const seeded = await db.commercialAgreement.findFirstOrThrow({ where: { organizationId: avista.id }, orderBy: { createdAt: "desc" } });
    const cell = await s.$eval('[data-commercial-terms="avista"]', (n) => ({ bps: n.dataset.platformFeeBps, agreement: n.dataset.agreement, text: n.textContent }));
    ok(
      "módulo A: comisión pactada y acuerdo vigente (referencia, fecha y SHA-256)",
      cell.bps === String(avista.platformFeeBps) && cell.agreement === seeded.id && cell.text.includes(seeded.reference) && cell.text.includes(seeded.sha256.slice(0, 10)),
      cell.text.slice(0, 90),
    );
    const pdf = await s.evaluate(async (id) => {
      const r = await fetch(`/api/vault/agreement/${id}`, { cache: "no-store" });
      const bytes = new Uint8Array(await r.arrayBuffer());
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      return { status: r.status, type: r.headers.get("content-type"), sha256: `0x${[...digest].map((x) => x.toString(16).padStart(2, "0")).join("")}` };
    }, seeded.id);
    const viewed = await lastAudit(avista.id, "COMMERCIAL_AGREEMENT_DOWNLOADED");
    ok(
      "PDF del acuerdo servido re-hasheado (= SHA-256 registrado) y la consulta queda en la auditoría del desarrollador",
      pdf.status === 200 && /pdf/.test(pdf.type ?? "") && pdf.sha256 === seeded.sha256 && viewed?.subjectHash === seeded.sha256 && viewed.actorUserId === admin.id,
      `${pdf.status} ${pdf.sha256.slice(0, 18)}…`,
    );
    ok("el PDF del acuerdo no se sirve en el host de un tenant", (await hostGet("avista", `/api/vault/agreement/${seeded.id}`)) === 404);

    await clickIn(s, '[data-commercial-terms="avista"]', "Registrar acuerdo y comisión");
    await s.waitForSelector("#gov-fee-bps", { timeout: 30000 });
    const confirmDisabled = () =>
      s.$eval('[role="dialog"]', (d) => [...d.querySelectorAll("button")].find((b) => b.textContent.includes("Confirmar decisión")).disabled);
    await fill(s, "#gov-agreement-ref", "RWX-COM-2026-099");
    const outOfRange = [];
    for (const bad of ["24", "501", "1.5"]) {
      await fill(s, "#gov-fee-bps", bad);
      const problem = await s.$eval("[data-terms-problem]", (n) => n.textContent).catch(() => "");
      outOfRange.push(/entre 25 \(0,25 %\) y 500 \(5 %\)/.test(problem) && (await confirmDisabled()));
    }
    ok("formulario: 24, 501 y 1.5 pb → aviso del rango 0,25 %–5 % y «Confirmar» deshabilitado", outOfRange.every(Boolean));

    // A real, signed PDF: verified by the server (type from the bytes, SHA-256 recomputed) before it can be registered.
    const agreementFile = path.join(ARTIFACTS, `acuerdo-avista-${Date.now()}.pdf`);
    fs.writeFileSync(agreementFile, `%PDF-1.4\n% Acuerdo comercial RWAXI - Avista · comision 150 pb · ${crypto.randomBytes(16).toString("hex")}\n%%EOF\n`);
    const agreementSha = `0x${crypto.createHash("sha256").update(fs.readFileSync(agreementFile)).digest("hex")}`;
    await fill(s, "#gov-fee-bps", "150");
    await (await s.$("#gov-agreement-file")).uploadFile(agreementFile);
    await s.waitForSelector(`[data-agreement-verified="${agreementSha}"]`, { timeout: 60000 });
    await clickText(s, "Confirmar decisión", '[role="dialog"]');
    await s.waitForFunction(() => !document.querySelector("[data-governance-dialog]"), { timeout: 60000 });
    await s.waitForFunction(() => document.querySelector('[data-commercial-terms="avista"]')?.dataset.platformFeeBps === "150", { timeout: 60000 });

    const afterTerms = await db.organization.findUniqueOrThrow({ where: { id: avista.id }, include: { tokens: true } });
    const agreement = await db.commercialAgreement.findFirstOrThrow({ where: { organizationId: avista.id }, orderBy: { createdAt: "desc" } });
    const vaulted = await db.vaultObject.findUnique({ where: { organizationId_sha256: { organizationId: avista.id, sha256: agreementSha } } });
    const termsEvent = await lastAudit(avista.id, "COMMERCIAL_TERMS_UPDATED");
    ok(
      "acuerdo registrado: PDF en la bóveda del tenant por su SHA-256, comisión 150 pb en la organización",
      afterTerms.platformFeeBps === 150 &&
        agreement.reference === "RWX-COM-2026-099" &&
        agreement.platformFeeBps === 150 &&
        agreement.sha256 === agreementSha &&
        agreement.storageKey === `tenants/${avista.id}/sha256/${agreementSha.slice(2)}` &&
        vaulted?.storageKey === agreement.storageKey &&
        vaulted.mimeType === "application/pdf",
      agreement.reference,
    );
    ok(
      "AuditEvent COMMERCIAL_TERMS_UPDATED: comisión anterior y nueva, cita el SHA-256 del acuerdo, hash recalculable",
      termsEvent?.entityId === agreement.id &&
        termsEvent.payload.from.platformFeeBps === avista.platformFeeBps &&
        termsEvent.payload.to.platformFeeBps === 150 &&
        termsEvent.payload.agreement.sha256 === agreementSha &&
        termsEvent.actorUserId === admin.id &&
        termsEvent.subjectHash === auditHash(termsEvent),
      `${termsEvent?.payload.from.platformFeeBps} → ${termsEvent?.payload.to.platformFeeBps} pb`,
    );
    const deployedTokens = avista.offerings.length ? await db.tokenDeployment.findMany({ where: { organizationId: avista.id, status: "DEPLOYED" } }) : [];
    ok(
      "los tokens ya desplegados conservan su comisión (inmutable on-chain)",
      deployedTokens.length > 0 && deployedTokens.every((t) => t.platformFeeBps === avista.platformFeeBps),
      deployedTokens.map((t) => `${t.symbol}=${t.platformFeeBps}`).join(" "),
    );
    const termsId = Object.entries(consoleActions).find(([body]) => body.includes(avista.id) && body.includes("RWX-COM-2026-099"))?.[1];
    const forgedFees = [];
    for (const bad of ["24", "501", "1.5", 600]) {
      const out = termsId
        ? await replayAction(s, termsId, [avista.id, { platformFeeBps: bad, reference: "RWX-COM-2026-100", signedOn: today, document: {} }])
        : "sin id de acción";
      forgedFees.push(/entre 25 \(0,25 %\) y 500 \(5 %\)/.test(out));
    }
    ok(
      "acciones forjadas: comisiones fuera de 25–500 pb rechazadas en el servidor, nada cambia",
      forgedFees.every(Boolean) &&
        (await db.organization.findUniqueOrThrow({ where: { id: avista.id } })).platformFeeBps === 150 &&
        (await db.commercialAgreement.count({ where: { organizationId: avista.id } })) === 2,
    );

    // ══ An investor signs a subscription before the governance tests ═══════
    const { page: inv, investor } = await lib.onboardInvestor(browser, db, "avista");
    const b = await (await browser.createBrowserContext()).newPage();
    await lib.approveInvestor(b, "avista", investor.id);
    await lib.subscribe(inv, "avista");
    const sub = await db.subscription.findFirstOrThrow({ where: { investorId: investor.id } });

    // Pages opened before the decisions: an anonymous visitor at the NDA and the vitrina CTA.
    const anon = await (await browser.createBrowserContext()).newPage();
    await anon.goto(url("avista"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitText(anon, "Firmar NDA con un clic");
    const v = await (await browser.createBrowserContext()).newPage();
    let issueId = null;
    v.on("request", (req) => {
      if (req.method() === "POST" && req.headers()["next-action"] && (req.postData() || "").includes('"avista"')) issueId = req.headers()["next-action"];
    });
    await v.goto(url(null), { waitUntil: "domcontentloaded", timeout: 180000 });
    await v.waitForSelector('[data-offering="P-03"]', { timeout: 180000 });
    await Promise.all([v.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 }), clickIn(v, '[data-offering="P-03"]', "Ir al Portal Oficial")]);

    // ══ Module A · suspend the portal ══════════════════════════════════════
    await openAdmin(s, "Gobierno");
    await s.select("#gov-status-avista", "SUSPENDED");
    await s.waitForSelector("[data-governance-dialog]", { timeout: 30000 });
    await fill(s, "#gov-reason", "Revisión regulatoria de la Superfinanciera en curso");
    settle = await tampered(s, () => clickText(s, "Confirmar decisión", '[role="dialog"]'), (body) => body.replace("Revisión regulatoria de la Superfinanciera en curso", "x"));
    ok("suspensión con motivo vacío (petición forjada) → rechazada", (await settle(/Indica el motivo/)) && (await db.organization.findUniqueOrThrow({ where: { id: avista.id } })).portalStatus === "ACTIVE");
    await clickText(s, "Confirmar decisión", '[role="dialog"]');
    await s.waitForSelector('[data-governance-row="avista"][data-portal-status="SUSPENDED"]', { timeout: 60000 });
    const suspended = await lastAudit(avista.id, "PORTAL_STATUS_CHANGED");
    ok(
      "portal SUSPENDED en Neon + AuditEvent (de ACTIVE a SUSPENDED, motivo, actor, hash)",
      suspended?.payload.from === "ACTIVE" && suspended.payload.to === "SUSPENDED" && /Superfinanciera/.test(suspended.payload.reason) && suspended.actorUserId === admin.id && suspended.subjectHash === auditHash(suspended),
      await toastText(s),
    );

    const investorsBefore = await db.investor.count({ where: { organizationId: avista.id } });
    await clickText(anon, "Completar con datos de ejemplo");
    await clickText(anon, "Firmar NDA con un clic");
    await waitAlert(anon, /suspendido/);
    ok("página del portal abierta antes de la suspensión: firmar NDA → rechazado al instante", (await db.investor.count({ where: { organizationId: avista.id } })) === investorsBefore, await alertText(anon));
    const cardS = await vitrinaCard(v, "P-03");
    ok("vitrina: tarjeta de Avista 'Portal suspendido temporalmente', sin enlace al portal", cardS.portal === "SUSPENDED" && !cardS.cta && /Portal suspendido temporalmente/.test(cardS.text));
    ok("vitrina: emitir referido hacia el portal suspendido (petición reenviada) → rechazado", /no está disponible desde la vitrina/.test(await replayAction(v, issueId, ["avista"])));
    const fresh = await (await browser.createBrowserContext()).newPage();
    await fresh.goto(url("avista"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitText(fresh, "Portal temporalmente suspendido para nuevas operaciones");
    ok("portal recién cargado: aviso institucional y NDA bloqueado", await lib.has(fresh, "no se pueden firmar nuevos NDA"));
    await shot(fresh, "superadmin-portal-suspended");
    await openBackofficeTab(b, "avista", "Cumplimiento y Leads");
    await b.waitForSelector('[data-audit="PORTAL_STATUS_CHANGED"]', { timeout: 60000 });
    ok("el backoffice del tenant ve la decisión de RWAXI en su registro de auditoría", true);

    // Reactivate
    await openAdmin(s, "Gobierno");
    await s.select("#gov-status-avista", "ACTIVE");
    await decide(s, "");
    await s.waitForSelector('[data-governance-row="avista"][data-portal-status="ACTIVE"]', { timeout: 60000 });
    const cardA = await vitrinaCard(v, "P-03");
    await fresh.goto(url("avista"), { waitUntil: "domcontentloaded" });
    await waitText(fresh, "Firmar NDA con un clic");
    await clickText(fresh, "Completar con datos de ejemplo");
    await clickText(fresh, "Firmar NDA con un clic");
    await waitText(fresh, lib.NDA_LANDING);
    ok(
      "reactivado: la vitrina vuelve a enlazar el portal y el NDA se firma",
      cardA.portal === "ACTIVE" && cardA.cta && (await db.investor.count({ where: { organizationId: avista.id } })) === investorsBefore + 1,
    );
    // A platform action posted from a tenant host is never executed: the tenant page does not bundle it, the copy
    // Next forwards to /superadmin is refused by the middleware at once (before, the host rewrite turned it into an
    // endless loop of forwarded self-requests, and this request timed out) and requirePlatformAccess() would refuse
    // it anyway. Nothing may change in Neon.
    const statusId = actionId('"SUSPENDED"');
    const eventsBefore = await db.auditEvent.count({ where: { organizationId: avista.id, action: "PORTAL_STATUS_CHANGED" } });
    const t = await (await browser.createBrowserContext()).newPage();
    await t.goto(url("avista"), { waitUntil: "domcontentloaded" });
    const cross = await lib.tryAction(t, statusId, [avista.id, "SUSPENDED", "Intento desde el host de un tenant"]);
    ok(
      "acción de plataforma enviada desde avista.localhost → rechazada al instante (sin bucle de reenvíos), sin cambios en Neon",
      cross !== "timeout" &&
        !/"ok":true/.test(cross) &&
        (await db.organization.findUniqueOrThrow({ where: { id: avista.id } })).portalStatus === "ACTIVE" &&
        (await db.auditEvent.count({ where: { organizationId: avista.id, action: "PORTAL_STATUS_CHANGED" } })) === eventsBefore,
      cross.slice(0, 60).replace(/\s+/g, " "),
    );
    await t.browserContext().close();

    // ══ Module A · pause capital raising of P-03 ═══════════════════════════
    await inv.goto(url("avista"), { waitUntil: "domcontentloaded" });
    await waitText(inv, "Firmar contrato del vehículo y suscribir"); // opened before the pause
    await openAdmin(s, "Gobierno");
    await s.click(`[data-capture-toggle="${offering.id}"]`);
    await decide(s, "Actualización del avalúo comercial del activo");
    await s.waitForSelector('[data-offering-capture="P-03"][data-capture="paused"]', { timeout: 60000 });
    const pausedRow = await db.offering.findUniqueOrThrow({ where: { id: offering.id } });
    const pausedAudit = await lastAudit(avista.id, "OFFERING_CAPTURE_PAUSED");
    ok(
      "captación pausada en Neon + AuditEvent OFFERING_CAPTURE_PAUSED",
      !!pausedRow.capturePausedAt && pausedAudit?.entityId === offering.id && /avalúo/.test(pausedAudit.payload.reason) && pausedAudit.subjectHash === auditHash(pausedAudit),
    );
    const unitsBefore = pausedRow.unitsSubscribed;
    await clickText(inv, "Firmar contrato del vehículo y suscribir");
    await lib.attestEligibility(inv);
    await inv.waitForSelector("#ack1", { timeout: 30000 });
    for (const id of ["#ack1", "#ack2", "#ack3"]) await inv.click(id);
    await clickText(inv, "Firmar y confirmar");
    await waitAlert(inv, /pausada/);
    ok(
      "portal abierto antes de la pausa: suscribir → rechazado al instante, sin unidades comprometidas",
      (await db.subscription.count({ where: { investorId: investor.id } })) === 1 && (await db.offering.findUniqueOrThrow({ where: { id: offering.id } })).unitsSubscribed === unitsBefore,
      await alertText(inv),
    );
    await inv.goto(url("avista"), { waitUntil: "domcontentloaded" });
    await waitText(inv, "La captación de esta oferta está pausada temporalmente");
    ok("portal recién cargado: aviso de captación pausada y sin botón de suscripción", !(await lib.has(inv, "Firmar contrato del vehículo y suscribir")));
    const cardP = await vitrinaCard(v, "P-03");
    ok("vitrina: 'Captación pausada temporalmente', sin enlace", cardP.capture === "paused" && !cardP.cta && /Captación pausada temporalmente/.test(cardP.text));
    ok("vitrina: emitir referido con la captación pausada → rechazado", /pausada temporalmente/.test(await replayAction(v, issueId, ["avista"])));

    // Subscriptions signed before the pause continue. The payment accrues the fee fixed in the deployed token (what its
    // mint declares on-chain), not the 150 bps of the agreement registered above: deployed tokens keep theirs.
    await openBackofficeTab(b, "avista", "Suscripciones y Pagos");
    await lib.confirmPayment(b, sub.id, "FID-SA-000001");
    const fee = await db.feeLedgerEntry.findFirst({ where: { subscriptionId: sub.id } });
    const subToken = await db.tokenDeployment.findUniqueOrThrow({ where: { offeringId: sub.offeringId } });
    const tokenFee = Math.round(Number(sub.capitalUsd) * subToken.platformFeeBps) / 10000;
    ok(
      `la suscripción firmada antes de la pausa se concilia; comisión fijada en el token (${subToken.platformFeeBps} pb × ${Number(sub.capitalUsd)} = ${tokenFee} USD), no la del acuerdo nuevo (150 pb)`,
      subToken.platformFeeBps !== 150 &&
        Number(fee?.amountUsd) === tokenFee &&
        fee.platformFeeBps === subToken.platformFeeBps &&
        fee.status === "ACCRUED" &&
        (await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status === "MINT_PENDING",
      `${fee?.amountUsd} USD a ${fee?.platformFeeBps} pb`,
    );

    // Resume
    await openAdmin(s, "Gobierno");
    await s.click(`[data-capture-toggle="${offering.id}"]`);
    await decide(s, "Avalúo actualizado y publicado en el Data Room");
    await s.waitForSelector('[data-offering-capture="P-03"][data-capture="open"]', { timeout: 60000 });
    const cardR = await vitrinaCard(v, "P-03");
    ok(
      "captación reanudada: la vitrina vuelve a enlazar y el AuditEvent OFFERING_CAPTURE_RESUMED queda registrado",
      cardR.capture === "open" && cardR.cta && !(await db.offering.findUniqueOrThrow({ where: { id: offering.id } })).capturePausedAt && !!(await lastAudit(avista.id, "OFFERING_CAPTURE_RESUMED")),
    );

    // ══ Module A · publication in the vitrina ══════════════════════════════
    await s.click("#gov-pub-elpoblado");
    await decide(s, "Material comercial pendiente de actualización");
    await s.waitForFunction(() => document.querySelector("#gov-pub-elpoblado")?.getAttribute("aria-checked") === "false", { timeout: 60000 });
    const gone = await vitrinaCard(v, "P-02");
    const portalEl = await (await browser.createBrowserContext()).newPage();
    await portalEl.goto(url("elpoblado"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitText(portalEl, "Firmar NDA con un clic");
    ok("retirado de la vitrina: P-02 desaparece del catálogo y su portal sigue operando", gone === null);
    await openAdmin(s, "Gobierno");
    await s.click("#gov-pub-elpoblado");
    await decide(s, "");
    await s.waitForFunction(() => document.querySelector("#gov-pub-elpoblado")?.getAttribute("aria-checked") === "true", { timeout: 60000 });
    ok("publicado de nuevo: P-02 vuelve a la vitrina", (await vitrinaCard(v, "P-02")) !== null);

    // ══ Audit trail ════════════════════════════════════════════════════════
    await openAdmin(s, "Gobierno");
    const listed = await s.$$eval("[data-platform-audit]", (n) => n.map((x) => x.dataset.platformAudit));
    const platformEvents = await db.auditEvent.findMany({
      where: {
        action: {
          in: [
            "PORTAL_STATUS_CHANGED",
            "ORGANIZATION_PUBLICATION_CHANGED",
            "OFFERING_CAPTURE_PAUSED",
            "OFFERING_CAPTURE_RESUMED",
            "FEE_TERMS_UPDATED",
            "FEE_INVOICED",
            "FEE_PAYMENT_RECORDED",
            "COMMERCIAL_TERMS_UPDATED",
          ],
        },
      },
    });
    // the console's decisions, plus the audited view of the seeded agreement (its subject is the PDF's SHA-256)
    ok(
      "cada acción de plataforma: un AuditEvent del SUPER_ADMIN con hash recalculable (y listado en el módulo A)",
      platformEvents.length === 10 &&
        platformEvents.every((e) => e.actorUserId === admin.id && e.subjectHash === auditHash(e)) &&
        listed.length === 11 &&
        listed.includes("COMMERCIAL_AGREEMENT_DOWNLOADED"),
      `${platformEvents.length} decisiones · ${listed.length} listadas`,
    );
    await shot(s, "superadmin-governance", { fullPage: true });
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})().catch(fail);
