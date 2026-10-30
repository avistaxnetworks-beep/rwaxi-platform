// E2E · the Super-Admin's global reports against Neon (simulation). A second investor goes through the whole flow so
// the trail, the fees and the census move. Module G shows the contracts, a census that adds up — and the critical
// alerts of a queued call with failed attempts and of a register thrown off on purpose. Module F totals the fees per
// developer as the ledger does, reconciles each mint's PlatformFeeAccrued, invoices the current cycle, records its
// payment and exports the fee book with its SHA-256. Module E lists every event and filters it on the server, verifies
// the seals it can recompute (and flags a row altered behind the app), picks up a new event live and exports the trail
// with its SHA-256; every export is itself audited.
const lib = require("./lib.cjs");
const { launch, ownerDb, ok, fail, shot, url, canon, sha256 } = lib;
const { clickText, clickIn, fill, waitToast, openBackofficeTab } = lib;

const db = ownerDb();
const CRITICAL_ACTIONS = [
  "FEE_TERMS_UPDATED", "COMMERCIAL_TERMS_UPDATED", "FEE_INVOICED", "FEE_PAYMENT_RECORDED", // fees
  "OFFERING_TOKEN_DEPLOYMENT_QUEUED", // deployments
  "DATA_ROOM_DOCUMENT_ADDED", "DATA_ROOM_DOCUMENT_DOWNLOADED", "KYC_DOCUMENT_VIEWED", "VAULT_INTEGRITY_FAILED",
  "COMMERCIAL_AGREEMENT_DOWNLOADED", "DISTRIBUTION_SUPPORT_DOWNLOADED", // vault
  "REGISTRY_WALLETS_DECLARED", "INVESTOR_FREEZE_REQUESTED", "MINTER_ROLE_REQUESTED", // wallets
  "ACCOUNT_LOCKED", "KYC_REVOKED", "PORTAL_STATUS_CHANGED", // severe in themselves
];
const CRITICAL_KINDS = [
  "TENANT_REGISTRY_DEPLOYED", "OFFERING_TOKEN_DEPLOYED", "INVESTOR_WHITELISTED", "INVESTOR_REVOKED",
  "INVESTOR_FREEZE_UPDATED", "MINTER_ROLE_GRANTED", "DATA_ROOM_ROOT_ANCHORED",
];
const FEE_ACTIONS = ["FEE_TERMS_UPDATED", "COMMERCIAL_TERMS_UPDATED", "FEE_INVOICED", "FEE_PAYMENT_RECORDED"];

async function openConsole(page, label, selector) {
  await page.goto(url("admin"), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector("[data-platform-overview]", { timeout: 180000 });
  await page.evaluate((l) => [...document.querySelectorAll('[role="tab"]')].find((x) => x.textContent.includes(l)).click(), label);
  await page.waitForSelector(selector, { timeout: 60000 });
}
const apiJson = (page, path) =>
  page.evaluate(async (p) => {
    const r = await fetch(p, { cache: "no-store" });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, path);
/** A file export fetched from the page: its bytes' SHA-256, the one the server announced, and the rows it says. */
const apiFile = (page, path) =>
  page.evaluate(async (p) => {
    const r = await fetch(p, { cache: "no-store" });
    const buf = await r.arrayBuffer();
    const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((x) => x.toString(16).padStart(2, "0")).join("");
    return { status: r.status, sha: `0x${hex}`, header: r.headers.get("x-content-sha256"), rows: Number(r.headers.get("x-report-rows")), text: new TextDecoder().decode(buf) };
  }, path);
const money = (rows) => Math.round(rows.reduce((s, e) => s + Number(e.amountUsd) * 100, 0)) / 100;

(async () => {
  const browser = await launch();
  try {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "avista" } });
    const offering = await db.offering.findFirstOrThrow({ where: { organizationId: org.id, token: { status: "DEPLOYED" } }, include: { token: true } });
    const cycle = new Date().toISOString().slice(0, 7);

    // ── 1 · Activity: an investor through the persisted flow, the whitelist and the mint left in the queue ──
    const { page: a, investor } = await lib.onboardInvestor(browser, db, "avista");
    const b = await (await browser.createBrowserContext()).newPage();
    b.on("pageerror", (e) => console.log("PAGEERROR(B)", e.message));
    await lib.approveInvestor(b, "avista", investor.id);
    await lib.subscribe(a, "avista");
    const sub = await db.subscription.findFirstOrThrow({ where: { investorId: investor.id } });
    await openBackofficeTab(b, "avista", "Suscripciones y Pagos");
    await lib.confirmPayment(b, sub.id, "FID-REP-000777");
    const approveTx = await db.chainTransaction.findFirstOrThrow({ where: { organizationId: org.id, kind: "INVESTOR_WHITELISTED", status: "PENDING" } });
    const mintTx = await db.chainTransaction.findFirstOrThrow({ where: { organizationId: org.id, kind: "SUBSCRIPTION_MINTED", status: "PENDING" } });
    // Three failed executions of the whitelist call, as the executor records them (a node that refused it).
    const failedAt = new Date();
    await db.chainTransaction.update({
      where: { id: approveTx.id },
      data: { attempts: 3, lastAttemptAt: failedAt, error: `${failedAt.toISOString()} · Modo RPC: el nodo rechazó la transacción (prueba E2E).` },
    });

    // ── 2 · Module G: contracts, census and the queue's alerts ─────────────
    const s = await (await browser.createBrowserContext()).newPage();
    s.on("pageerror", (e) => console.log("PAGEERROR(S)", e.message));
    await openConsole(s, "Salud Operativa", "[data-health-panel]");
    const census = await s.$eval(`[data-census-row="${offering.code}"]`, (n) => ({ ...n.dataset }));
    const minted = await db.subscription.aggregate({ where: { offeringId: offering.id, status: "MINTED" }, _sum: { units: true } });
    ok(
      "censo: registro de la plataforma (MINTED) = emisiones confirmadas en el token de avista; el mint en cola aún no cuenta",
      census.consistent === "true" && Number(census.dbMinted) === minted._sum.units && Number(census.outboxMinted) === minted._sum.units,
      `${census.dbMinted} = ${census.outboxMinted}`,
    );
    const alerts = await s.$$eval("[data-health-alert]", (ns) => ns.map((n) => ({ area: n.dataset.healthAlert, severity: n.dataset.severity, text: n.textContent })));
    ok(
      "alerta CRÍTICA: 3 intentos fallidos del approveInvestor en cola, con el motivo del último fallo",
      alerts.some((x) => x.severity === "critical" && x.area === "chain" && /3 intento\(s\) fallido\(s\) · INVESTOR_WHITELISTED/.test(x.text) && /nodo rechazó/.test(x.text)),
      alerts.map((x) => `${x.severity}:${x.text.slice(0, 60)}`).join(" | "),
    );
    await clickIn(s, '[data-queue-tenant="avista"]', "ver pendientes");
    await s.waitForSelector(`[data-pending-row="${mintTx.id}"]`, { timeout: 30000 });
    const queueRow = await s.$eval('[data-queue-tenant="avista"]', (n) => [...n.querySelectorAll("td")].map((td) => td.textContent.trim()));
    const mintRow = await s.$eval(`[data-pending-row="${mintTx.id}"]`, (n) => n.textContent);
    ok(
      "cola por desarrollador: 2 en cola, 1 con reintentos; el mint dice por qué espera (prelación del approveInvestor)",
      queueRow[1] === "2" && queueRow[3] === "1" && /Bloqueada: Prelación: el approveInvestor\(\) de esta wallet sigue PENDING/.test(mintRow),
      `${queueRow.join(" | ")} · ${mintRow.slice(0, 120)}`,
    );
    const contracts = await s.$$eval("[data-contract]", (ns) => ns.map((n) => `${n.dataset.contract}:${n.dataset.contractStatus}`));
    ok(
      "contratos ERC-3643: el registro y los tokens desplegados de cada desarrollador, con su estado",
      contracts.filter((c) => c === "registry:DEPLOYED").length >= 3 && contracts.some((c) => c === "token:DEPLOYED"),
      contracts.join(" "),
    );

    // A register thrown off behind the app: the census flags it as critical.
    const seeded = await db.subscription.findFirstOrThrow({ where: { offeringId: offering.id, status: "MINTED" } });
    await db.subscription.update({ where: { id: seeded.id }, data: { units: seeded.units + 1 } });
    await s.reload({ waitUntil: "domcontentloaded" });
    await s.waitForSelector("[data-platform-overview]", { timeout: 180000 });
    await s.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((x) => x.textContent.includes("Salud Operativa")).click());
    await s.waitForSelector(`[data-census-row="${offering.code}"][data-consistent="false"]`, { timeout: 60000 });
    const offAlert = await s.$$eval('[data-health-alert="census"]', (ns) => ns.map((n) => `${n.dataset.severity}:${n.textContent}`));
    await db.subscription.update({ where: { id: seeded.id }, data: { units: seeded.units } });
    ok("un registro alterado fuera de la app → censo descuadrado y alerta CRÍTICA del censo", offAlert.some((x) => /^critical:.*descuadrado/.test(x)), offAlert[0]?.slice(0, 120));

    // The queue runs: both rows confirm; the attempts stay as history, without alerts.
    await openBackofficeTab(b, "avista", "Suscripciones y Pagos");
    await clickText(b, "Procesar cola en orden");
    await b.waitForSelector(`tr[data-subscription="${sub.id}"][data-sub-status="MINTED"]`, { timeout: 90000 });
    await openConsole(s, "Salud Operativa", "[data-health-panel]");
    const after = await s.$eval(`[data-census-row="${offering.code}"]`, (n) => ({ ...n.dataset }));
    const chainAlerts = await s.$$eval('[data-health-alert="chain"]', (ns) => ns.length);
    const approved = await db.chainTransaction.findUniqueOrThrow({ where: { id: approveTx.id } });
    ok(
      "tras procesar la cola: censo cuadrado con los 250 tokens nuevos, sin alertas de la cola (los 3 intentos quedan como historial)",
      after.consistent === "true" && Number(after.dbMinted) === minted._sum.units + 250 && chainAlerts === 0 && approved.status === "CONFIRMED" && approved.attempts === 3,
      `${after.dbMinted} tokens`,
    );
    await shot(s, "reports-health", { fullPage: true });

    // ── 3 · Module F: fees per developer, cycle billing, payment and the fee book ──
    await openConsole(s, "Reportes Financieros", "[data-finance-panel]");
    const entries = await db.feeLedgerEntry.findMany({ where: { organizationId: org.id } });
    const accrued = money(entries.filter((e) => e.status === "ACCRUED"));
    const usageFee = money(entries.filter((e) => e.kind === "INFRASTRUCTURE_USAGE" && e.status !== "VOIDED"));
    const row = await s.$eval('[data-finance-tenant="avista"]', (n) => ({
      accrued: Number(n.querySelector("[data-accrued]").dataset.accrued),
      usage: Number(n.querySelector("[data-usage-fee]").dataset.usageFee),
      bps: Number(n.querySelector("[data-agreed-bps]").dataset.agreedBps),
      reconciliation: n.querySelector("[data-reconciliation]").dataset.reconciliation,
      text: n.textContent,
    }));
    ok(
      "avista: por facturar y comisión de uso = sumas del libro mayor; comisión pactada vigente en puntos básicos",
      row.accrued === accrued && row.usage === usageFee && row.bps === org.platformFeeBps,
      `${row.accrued} · ${row.usage} · ${row.bps} pb`,
    );
    const mintAudit = await db.auditEvent.findFirstOrThrow({ where: { organizationId: org.id, action: "SUBSCRIPTION_MINTED", entityId: sub.id } });
    ok(
      "cotejo con PlatformFeeAccrued: el mint nuevo declaró la misma tasa que su asiento del libro",
      row.reconciliation === "ok" && mintAudit.payload.platformFee?.matchesLedger === true && /mint\(s\) cuadran con el libro/.test(row.text),
    );

    const cycleRows = entries.filter((e) => e.status === "ACCRUED" && e.accruedOn.toISOString().slice(0, 7) === cycle);
    const cell = await s.$eval(`[data-cycle-cell="avista:${cycle}"]`, (n) => Number(n.dataset.accrued));
    ok("ciclo actual de avista: lo devengado sin facturar del mes, listo para facturar", cell === money(cycleRows) && cycleRows.length > 0, `${cycleRows.length} asiento(s) · ${cell} USD`);
    await s.click(`[data-invoice-cycle="avista:${cycle}"]`);
    await s.waitForSelector('[data-finance-dialog="cycle"]', { timeout: 30000 });
    const number = await s.$eval("#finance-invoice-number", (i) => i.value);
    await clickText(s, "Emitir factura", '[role="dialog"]');
    await waitToast(s, `Factura ${number} emitida`);
    const invoice = await db.feeInvoice.findUniqueOrThrow({ where: { number }, include: { entries: true } });
    ok(
      `«Facturar ciclo» → factura ${number} con los asientos del ciclo (INVOICED) por su total`,
      number === `RWX-AVISTA-${cycle.replace("-", "")}` &&
        invoice.entries.length === Math.min(50, cycleRows.length) &&
        invoice.entries.every((e) => e.status === "INVOICED") &&
        Number(invoice.totalUsd) === money(invoice.entries),
      `${invoice.entries.length} asiento(s) · ${invoice.totalUsd} USD`,
    );
    await s.waitForSelector(`[data-invoice-row="${number}"][data-bucket="0-30"]`, { timeout: 60000 });
    await s.click(`[data-pay-invoice="${number}"]`);
    await s.waitForSelector('[data-finance-dialog="payment"]', { timeout: 30000 });
    await fill(s, "#finance-receipt", "TRF-E2E-REP-0001");
    await clickText(s, "Registrar pago", '[role="dialog"]');
    await s.waitForSelector(`[data-invoice-row="${number}"][data-bucket="pagada"]`, { timeout: 60000 });
    const paid = await db.feeInvoice.findUniqueOrThrow({ where: { number }, include: { entries: true } });
    ok("«Registrar pago» → la factura y sus asientos quedan PAID, y el seguimiento la muestra pagada", !!paid.paidOn && paid.paymentReceipt === "TRF-E2E-REP-0001" && paid.entries.every((e) => e.status === "PAID"));

    const feeFile = await apiFile(s, `/api/platform/finance?format=csv&cycle=${cycle}`);
    const cycleCount = await db.feeLedgerEntry.count({
      where: { accruedOn: { gte: new Date(`${cycle}-01T00:00:00Z`), lt: new Date(Date.UTC(Number(cycle.slice(0, 4)), Number(cycle.slice(5, 7)), 1)) } },
    });
    const feeExport = await db.auditEvent.findFirst({ where: { action: "PLATFORM_REPORT_EXPORTED", subjectHash: feeFile.sha } });
    ok(
      "libro de comisiones del ciclo (CSV): su SHA-256 es el anunciado y queda en PLATFORM_REPORT_EXPORTED (sin organización)",
      feeFile.status === 200 && feeFile.sha === feeFile.header && feeFile.rows === cycleCount && feeExport?.organizationId === null && feeExport.payload.report === "fees",
      `${feeFile.rows} fila(s) · ${feeFile.sha.slice(0, 18)}…`,
    );
    await shot(s, "reports-finance", { fullPage: true });

    // ── 4 · Module E: the global trail ──────────────────────────────────────
    await openConsole(s, "Auditoría Global", "[data-audit-console]");
    await s.waitForSelector("[data-audit-row]", { timeout: 60000 });
    const all = await apiJson(s, "/api/platform/audit?limit=1");
    ok("la consola cuenta todos los AuditEvent de todos los desarrolladores y de la consola", all.status === 200 && all.body.total === (await db.auditEvent.count()), `${all.body?.total}`);

    const fees = await apiJson(s, "/api/platform/audit?category=fees&limit=200");
    const criticalCount = await db.auditEvent.count({
      where: {
        OR: [
          { action: { in: CRITICAL_ACTIONS } },
          ...CRITICAL_KINDS.map((kind) => ({ action: "CHAIN_TX_CONFIRMED", payload: { path: ["kind"], equals: kind } })),
        ],
      },
    });
    const critical = await apiJson(s, "/api/platform/audit?critical=1&limit=200");
    ok(
      "filtros en el servidor: «Comisiones y facturación» y «Solo críticos» cuentan lo mismo que la base (factura y pago incluidos)",
      fees.body.total === (await db.auditEvent.count({ where: { action: { in: FEE_ACTIONS } } })) &&
        fees.body.events.some((e) => e.action === "FEE_INVOICED") &&
        critical.body.total === criticalCount &&
        critical.body.events.every((e) => e.critical),
      `comisiones ${fees.body.total} · críticos ${critical.body.total}`,
    );
    await s.click("#audit-critical");
    await s.select("#audit-tenant", org.id);
    await s.waitForFunction(
      () => {
        const rows = [...document.querySelectorAll("[data-audit-row]")];
        return rows.length > 0 && rows.every((r) => r.dataset.critical === "true" && r.dataset.tenant === "avista");
      },
      { timeout: 30000 },
    );
    ok("en la pantalla: solo críticos de avista (comisiones, despliegues, bóveda, wallets)", true);

    const trail = await apiJson(s, `/api/platform/audit?tenant=${org.id}&limit=200`);
    const byAction = (action) => trail.body.events.find((e) => e.action === action);
    const sealed = ["FEE_INVOICED", "FEE_PAYMENT_RECORDED", "SUBSCRIPTION_CREATED", "PAYMENT_CONFIRMED", "CHAIN_TX_CONFIRMED"].map(byAction);
    ok(
      "sellos recalculados y verificados: factura, pago de factura, acuerdo de suscripción, conciliación y tx simulada; ninguno alterado",
      sealed.every((e) => e?.integrity.status === "verified") && !trail.body.events.some((e) => e.integrity.status === "mismatch"),
      sealed.map((e) => `${e?.action}:${e?.integrity.status}`).join(" "),
    );

    // A row altered behind the app (the owner role bypasses the app's append-only grants): its seal no longer matches.
    const invoiced = await db.auditEvent.findFirstOrThrow({ where: { action: "FEE_INVOICED", entityId: invoice.id } });
    await db.auditEvent.update({ where: { id: invoiced.id }, data: { payload: { ...invoiced.payload, totalUsd: "1.00" } } });
    const tampered = await apiJson(s, `/api/platform/audit?action=FEE_INVOICED&tenant=${org.id}`);
    await db.auditEvent.update({ where: { id: invoiced.id }, data: { payload: invoiced.payload } });
    const restored = await apiJson(s, `/api/platform/audit?action=FEE_INVOICED&tenant=${org.id}`);
    ok(
      "una factura alterada en la base fuera de la app → «sello no coincide»; restaurada → verificado otra vez",
      tampered.body.events.find((e) => e.id === invoiced.id)?.integrity.status === "mismatch" &&
        restored.body.events.find((e) => e.id === invoiced.id)?.integrity.status === "verified" &&
        invoiced.subjectHash === sha256(canon({ action: "FEE_INVOICED", organizationId: org.id, entityId: invoice.id, ...invoiced.payload })),
    );

    // Live: a document uploaded from the backoffice shows up without reloading the console.
    await s.select("#audit-tenant", "");
    await s.click("#audit-critical");
    await s.waitForFunction(() => !document.querySelector("#audit-critical").checked, { timeout: 10000 });
    const folder = (await db.dataRoomDocument.findFirstOrThrow({ where: { offeringId: offering.id } })).folder;
    const bytes = lib.pdfBytes(`reports-live-${Date.now()}`);
    const upload = await lib.vaultUpload(b, {
      purpose: "data-room",
      bytes,
      type: "application/pdf",
      sha256: lib.sha256Of(bytes),
      name: "acta-comite-e2e.pdf",
      fields: { offeringId: offering.id, folder, name: "Acta de comité (E2E en vivo)", restricted: "0" },
    });
    const added = await db.auditEvent.findFirstOrThrow({ where: { action: "DATA_ROOM_DOCUMENT_ADDED", subjectHash: lib.sha256Of(bytes) } });
    await s.waitForSelector(`[data-audit-row="${added.id}"]`, { timeout: 45000 });
    const liveRow = await s.$eval(`[data-audit-row="${added.id}"]`, (n) => ({ ...n.dataset, text: n.textContent }));
    ok(
      "en vivo: la subida al Data Room aparece sola (sin recargar), crítica de bóveda con su SHA-256",
      upload.status === 200 && liveRow.action === "DATA_ROOM_DOCUMENT_ADDED" && liveRow.category === "vault" && liveRow.critical === "true",
      liveRow.text.slice(0, 120),
    );

    const auditFile = await apiFile(s, "/api/platform/audit?format=csv&critical=1");
    const auditExport = await db.auditEvent.findFirst({ where: { action: "PLATFORM_REPORT_EXPORTED", subjectHash: auditFile.sha } });
    ok(
      "exportación del rastro (CSV): SHA-256 del archivo = el anunciado; queda auditada con sus filtros y filas",
      auditFile.status === 200 &&
        auditFile.sha === auditFile.header &&
        auditFile.text.split("\r\n").filter(Boolean).length === auditFile.rows + 1 &&
        auditExport?.payload.report === "audit" &&
        auditExport.payload.filters.critical === true &&
        auditExport.payload.rows === auditFile.rows,
      `${auditFile.rows} fila(s)`,
    );
    const exports = await apiJson(s, "/api/platform/audit?tenant=platform&action=PLATFORM_REPORT_EXPORTED");
    ok("las exportaciones aparecen en el rastro como eventos de la consola (sin organización)", exports.body.total >= 2 && exports.body.events.every((e) => e.tenant === null));

    const fromTenant = await apiJson(b, "/api/platform/audit");
    const financeFromTenant = await apiJson(b, "/api/platform/finance?format=csv");
    ok("desde el host de un desarrollador las rutas de reportes no existen (404)", fromTenant.status === 404 && financeFromTenant.status === 404);
    await shot(s, "reports-audit", { fullPage: true });
  } catch (e) {
    fail(e);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})();
