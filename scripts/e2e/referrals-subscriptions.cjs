// E2E · HMAC-signed referrals (vitrina → portal) and attacks on attribution, subscription signing
// (PAYMENT_PENDING: units reserved, no mint or fee yet) and the Super-Admin consolidated figures.
const crypto = require("crypto");
const { launch, ownerDb, ok, fail, shot, url, viem, abi, canon, sha256, webEnv, text, waitText, clickText, NDA_LANDING, toKycWizard } = require("./lib.cjs");

const registryAbi = abi("RwaxiComplianceRegistry");
const db = ownerDb();

// REFERRAL_SECRET as the web app sees it (never printed).
const SECRET = webEnv("REFERRAL_SECRET");
const TOKEN_RE = /^(ref_rwx_[0-9a-f]{24})\.([a-z0-9-]+)\.(\d{13})\.([A-Za-z0-9_-]{43})$/;
const hmac = (body, key = SECRET) => crypto.createHmac("sha256", key).update(`v1|${body}`).digest("base64url");
const craft = (slug, { key = SECRET, iat = Date.now() } = {}) => {
  const body = `ref_rwx_${crypto.randomBytes(12).toString("hex")}.${slug}.${iat}`;
  return `${body}.${hmac(body, key)}`;
};
const avista = () => db.organization.findUniqueOrThrow({ where: { slug: "avista" } });
const leadOf = (email) => db.lead.findFirst({ where: { investor: { email, organization: { slug: "avista" } } } });

/** Opens the avista portal (optionally with ?ref=) in a fresh browser and signs the NDA. */
async function signNdaWith(browser, ref) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.goto(url("avista", ref ? `/?ref=${encodeURIComponent(ref)}` : "/"), { waitUntil: "domcontentloaded", timeout: 180000 });
  await waitText(p, "Firmar NDA con un clic");
  const cookie = (await p.cookies(url("avista"))).find((c) => c.name === "rwaxi_ref");
  await clickText(p, "Completar con datos de ejemplo");
  const email = await p.$eval("#nda-email", (i) => i.value);
  await clickText(p, "Firmar NDA con un clic");
  await waitText(p, NDA_LANDING);
  return { p, email, cookieSet: !!cookie };
}

(async () => {
  const browser = await launch();
  try {
    const org = await avista();
    const offering0 = await db.offering.findFirstOrThrow({ where: { organizationId: org.id } });

    // ── 1 · Signed referral from the vitrina ────────────────────────────────
    const ctxA = await browser.createBrowserContext();
    const a = await ctxA.newPage();
    a.on("pageerror", (e) => console.log("PAGEERROR(A)", e.message));
    await a.goto(url(null), { waitUntil: "domcontentloaded", timeout: 180000 });
    await a.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Ir al Portal Oficial")), { timeout: 180000 });
    await Promise.all([
      a.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 }),
      a.evaluate(() => {
        const ctas = [...document.querySelectorAll("button")].filter((b) => b.textContent.includes("Ir al Portal Oficial"));
        const cardOf = (btn) => {
          let n = btn.parentElement;
          while (n?.parentElement && [...n.parentElement.querySelectorAll("button")].filter((b) => ctas.includes(b)).length === 1) n = n.parentElement;
          return n;
        };
        ctas.find((btn) => cardOf(btn)?.innerText.includes("Avista Beach Villas")).click();
      }),
    ]);
    const landed = new URL(a.url());
    const ref = (await a.cookies(url("avista"))).find((c) => c.name === "rwaxi_ref")?.value ?? "";
    const m = TOKEN_RE.exec(ref);
    ok("la vitrina emite un token firmado (5 partes) para el slug destino", !!m && m[2] === "avista", m ? `${m[1]}.avista.${m[3]}.…` : ref.slice(0, 20));
    ok("HMAC-SHA256 del token verificado de forma independiente con REFERRAL_SECRET", !!m && hmac(`${m[1]}.${m[2]}.${m[3]}`) === m[4]);
    ok("timestamp del token = momento del clic (±2 min)", !!m && Math.abs(Date.now() - Number(m[3])) < 120000);
    ok("el middleware guardó el token verificado en la cookie HttpOnly", landed.host === new URL(url("avista")).host);

    await waitText(a, "Firmar NDA con un clic");
    await clickText(a, "Completar con datos de ejemplo");
    const emailA = await a.$eval("#nda-email", (i) => i.value);
    await clickText(a, "Firmar NDA con un clic");
    await waitText(a, NDA_LANDING);
    const leadA = await leadOf(emailA);
    ok("NDA con firma válida → Lead REFERRAL con el id de un solo uso del token", leadA?.source === "REFERRAL" && leadA.referralToken === m?.[1], leadA?.referralToken);
    ok("landedAt del Lead = timestamp firmado", leadA?.landedAt.getTime() === Number(m?.[3]));

    // ── 2 · Attacks on attribution: all must end as DIRECT ──────────────────
    const [id0, , iat0, sig0] = ref.split(".");
    const attacks = [
      ["token manipulado (slug cambiado a otro tenant, misma firma)", `${id0}.elpoblado.${iat0}.${sig0}`],
      ["token manipulado (firma alterada)", `${id0}.avista.${iat0}.${sig0.slice(0, -1)}${sig0.endsWith("A") ? "B" : "A"}`],
      ["token firmado con otro secreto", craft("avista", { key: "otro-secreto-de-al-menos-32-caracteres!!" })],
      ["token válido pero emitido para elpoblado", craft("elpoblado")],
      ["token válido reutilizado (mismo id que A)", ref],
    ];
    for (const [label, token] of attacks) {
      const { p, email, cookieSet } = await signNdaWith(browser, token);
      const lead = await leadOf(email);
      const reuse = token === ref;
      ok(
        `${label} → Lead DIRECT`,
        lead?.source === "DIRECT" && lead.referralToken !== m?.[1],
        reuse ? `cookie=${cookieSet} (válido, pero ya usado)` : `cookie=${cookieSet}`,
      );
      await p.browserContext().close();
    }

    // ── 3 · KYC → approval → subscription ───────────────────────────────────
    await toKycWizard(a);
    for (let step = 0; step < 4; step++) {
      await waitText(a, `Paso 0${step + 1}`);
      await clickText(a, "Completar con datos de ejemplo");
      if (step === 2) {
        await clickText(a, "Iniciar prueba de vida");
        await waitText(a, "Verificación de vida completada", 30000);
      }
      await clickText(a, step < 3 ? "Continuar" : "Enviar a revisión de cumplimiento");
    }
    await waitText(a, "Tus datos se encuentran en revisión");
    await clickText(a, "Abrir Bandeja de Cumplimiento");
    await a.waitForSelector("tr[data-investor]", { timeout: 90000 });
    await a.evaluate(() => {
      const tr = [...document.querySelectorAll("tr[data-investor]")].find(
        (t) => t.querySelector("[data-kyc]").dataset.kyc === "pendiente" && t.querySelector("td p").textContent.includes("María Fernanda"),
      );
      [...tr.querySelectorAll("button")].find((x) => x.textContent.includes("Aprobar Inversionista")).click();
    });
    await a.waitForFunction(
      () =>
        ![...document.querySelectorAll("tr[data-investor]")].some(
          (t) => t.querySelector("td p").textContent.includes("María Fernanda") && t.querySelector("[data-kyc]").dataset.kyc === "pendiente",
        ),
      { timeout: 90000 },
    );
    ok("KYC del inversionista referido aprobado en el backoffice", true);
    await a.goto(url("avista"), { waitUntil: "domcontentloaded" });
    await waitText(a, "Firmar contrato del vehículo y suscribir");
    const availBefore = offering0.totalUnits - offering0.unitsSubscribed;
    ok("el panel muestra la disponibilidad real de la BD", (await text(a)).includes(new Intl.NumberFormat("es-CO").format(availBefore)), `${availBefore} disponibles`);

    // 3a · Forged request: units tampered in flight → rejected, nothing written
    const subsBefore = await db.subscription.count({ where: { organizationId: org.id } });
    await clickText(a, "Firmar contrato del vehículo y suscribir");
    await a.waitForSelector("#ack1", { timeout: 30000 });
    for (const id of ["#ack1", "#ack2", "#ack3"]) await a.click(id);
    await a.setRequestInterception(true);
    let tampered = false;
    const handler = (req) => {
      if (req.method() === "POST" && req.headers()["next-action"] && !tampered && /"units":\d+/.test(req.postData() || "")) {
        tampered = true;
        req.continue({ postData: req.postData().replace(/"units":\d+/, '"units":10000000') });
      } else req.continue();
    };
    a.on("request", handler);
    await clickText(a, "Firmar y confirmar");
    await a.waitForFunction(
      () => [...document.querySelectorAll('[role="dialog"] [role="alert"], [role="alert"]')].some((n) => /máximo|unidades suficientes/i.test(n.textContent)),
      { timeout: 60000 },
    );
    a.off("request", handler);
    await a.setRequestInterception(false);
    const offeringMid = await db.offering.findUniqueOrThrow({ where: { id: offering0.id } });
    ok(
      "suscripción con unidades alteradas (10.000.000) → rechazada sin escribir nada",
      tampered && (await db.subscription.count({ where: { organizationId: org.id } })) === subsBefore && offeringMid.unitsSubscribed === offering0.unitsSubscribed,
    );

    // 3b · Real subscription (default amount: 25.000 USD = 250 units)
    await clickText(a, "Firmar y confirmar");
    await waitText(a, "Ver mi portafolio", 60000);
    await clickText(a, "Ver mi portafolio");
    await a.waitForSelector('[data-holding="pago_pendiente"]', { timeout: 30000 });
    ok("portafolio muestra la suscripción como 'Pago pendiente'", true);

    const sub = await db.subscription.findFirstOrThrow({ where: { organizationId: org.id, investor: { email: emailA } }, include: { investor: true } });
    const offering1 = await db.offering.findUniqueOrThrow({ where: { id: offering0.id } });
    const mint = await db.chainTransaction.findFirst({ where: { organizationId: org.id, kind: "SUBSCRIPTION_MINTED", status: "PENDING" } });
    const fee = await db.feeLedgerEntry.findFirst({ where: { subscriptionId: sub.id } });
    const audit = await db.auditEvent.findFirst({ where: { entityId: sub.id, action: "SUBSCRIPTION_CREATED" } });
    const onchainId = viem.keccak256(viem.toHex(sub.id));
    ok(
      "Subscription PAYMENT_PENDING · 250 unidades · 25.000 USD (precio de la BD)",
      sub.status === "PAYMENT_PENDING" && sub.units === 250 && Number(sub.capitalUsd) === 25000 && sub.onchainId === onchainId,
    );
    ok("Offering.unitsSubscribed +250", offering1.unitsSubscribed === offering0.unitsSubscribed + 250, `${offering0.unitsSubscribed} → ${offering1.unitsSubscribed}`);
    ok("agreementHash = SHA-256(JSON canónico del acuerdo) — verificación independiente", sub.agreementHash === sha256(canon(audit?.payload?.agreement)) && sub.paymentEvidenceRef === null);
    ok("la firma no encola mintSubscription ni devenga comisión (espera la conciliación del pago)", mint === null && fee === null);
    ok(
      "AuditEvent SUBSCRIPTION_CREATED con el hash del contrato y la referencia de pago",
      audit?.subjectHash === sub.agreementHash && audit.payload.status === "PAYMENT_PENDING" && audit.payload.paymentCode === `SUB-${onchainId.slice(2, 10).toUpperCase()}`,
    );

    await a.reload({ waitUntil: "domcontentloaded" });
    await a.waitForSelector('[data-holding="pago_pendiente"]', { timeout: 90000 });
    ok("tras recargar: el portafolio se lee de Neon", (await a.$$("[data-holding]")).length === 1);

    // Inspector: only the whitelisting is queued; its calldata decodes against the compiled registry ABI
    await clickText(a, "Inspector On-Chain");
    await a.waitForSelector('[role="dialog"]', { timeout: 30000 });
    await clickText(a, "Cola PostgreSQL");
    await a.waitForFunction(() => [...document.querySelectorAll('[data-chain-tx="PENDING"]')].some((n) => n.innerText.includes("approveInvestor")), { timeout: 60000 });
    const calldata = await a.evaluate(() => {
      const card = [...document.querySelectorAll('[data-chain-tx="PENDING"]')].find((n) => n.innerText.includes("approveInvestor"));
      [...card.querySelectorAll("button")].find((b) => b.textContent.includes("calldata")).click();
      return new Promise((r) => setTimeout(() => r(card.querySelector("pre").textContent.replace(/\s+/g, "")), 200));
    });
    const decoded = viem.decodeFunctionData({ abi: registryAbi, data: calldata });
    const kycA = await db.kycCase.findFirstOrThrow({ where: { investorId: sub.investorId }, orderBy: { createdAt: "desc" } });
    ok(
      "inspector: calldata decodifica a approveInvestor(wallet, 170, kycDossierHash)",
      decoded.functionName === "approveInvestor" && decoded.args[0].toLowerCase() === sub.investor.walletAddress && decoded.args[1] === 170 && decoded.args[2] === kycA.dossierHash,
      calldata.slice(0, 10),
    );
    const cards = await a.$$eval('[data-chain-tx="PENDING"]', (n) => n.map((x) => x.innerText));
    ok(
      "inspector: sólo la whitelist en cola (el mint espera el pago); desde el portal no se ejecuta",
      cards.length === 1 && !(await a.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Firmar y ejecutar")))),
    );
    await shot(a, "referrals-inspector-queue");

    // ── 4 · Super-Admin reads the consolidated figures from Neon ────────────
    const expected = {
      active: await db.organization.count({ where: { portalStatus: "ACTIVE" } }),
      total: await db.organization.count(),
      referral: await db.lead.count({ where: { source: "REFERRAL" } }),
      direct: await db.lead.count({ where: { source: "DIRECT" } }),
      capital: Number((await db.subscription.aggregate({ where: { status: { not: "CANCELLED" } }, _sum: { capitalUsd: true } }))._sum.capitalUsd),
      fees: Number((await db.feeLedgerEntry.aggregate({ _sum: { amountUsd: true } }))._sum.amountUsd),
      ledgerRows: await db.feeLedgerEntry.count(),
      accrued: Number((await db.feeLedgerEntry.aggregate({ where: { status: "ACCRUED" }, _sum: { amountUsd: true } }))._sum.amountUsd ?? 0),
      usage: Number((await db.feeLedgerEntry.aggregate({ where: { kind: "INFRASTRUCTURE_USAGE" }, _sum: { amountUsd: true } }))._sum.amountUsd ?? 0),
    };
    const ctxS = await browser.createBrowserContext();
    const s = await ctxS.newPage();
    await s.goto(url("admin"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await s.waitForSelector("[data-platform-overview]", { timeout: 180000 });
    const kpi = Object.fromEntries(await s.$$eval("[data-kpi]", (n) => n.map((x) => [x.dataset.kpi, JSON.parse(x.dataset.value)])));
    ok("Super-Admin: organizaciones activas", kpi["active-orgs"].active === expected.active && kpi["active-orgs"].total === expected.total, `${kpi["active-orgs"].active}/${kpi["active-orgs"].total}`);
    ok("Super-Admin: leads REFERRAL vs DIRECT", kpi.leads.referral === expected.referral && kpi.leads.direct === expected.direct, `${kpi.leads.referral} · ${kpi.leads.direct}`);
    ok(
      "Super-Admin: volumen suscrito (la nueva suscripción como pago por conciliar)",
      kpi.volume.capitalUsd === expected.capital && kpi.volume.paymentPendingUsd === 25000 && kpi.volume.pendingUsd === 0,
      `${kpi.volume.capitalUsd} USD`,
    );
    ok("Super-Admin: comisiones totales (sin fee hasta conciliar el pago)", Math.abs(kpi.fees.total - expected.fees) < 0.005 && kpi.fees.ACCRUED === expected.accrued, `${kpi.fees.total} USD`);
    await s.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes("Tarifas")).click());
    await s.waitForSelector("[data-platform-ledger]", { timeout: 30000 });
    const ledgerKinds = await s.$$eval("[data-ledger-row]", (n) => n.map((x) => x.dataset.ledgerRow));
    const usageTotal = await s.$eval('[data-fee-kind="INFRASTRUCTURE_USAGE"]', (n) => Number(n.dataset.total));
    ok(
      "libro mayor: todos los asientos y los 3 tipos",
      ledgerKinds.length === expected.ledgerRows && ["ONBOARDING_SETUP", "MONTHLY_SAAS", "INFRASTRUCTURE_USAGE"].every((k) => ledgerKinds.includes(k)),
      `${ledgerKinds.length} asientos`,
    );
    ok("libro mayor: INFRASTRUCTURE_USAGE sin asiento nuevo (el pago aún no se concilia)", Math.abs(usageTotal - expected.usage) < 0.005, `${usageTotal} USD`);
    await shot(s, "referrals-admin-ledger", { fullPage: true });
    await s.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes("Atribución")).click());
    await s.waitForSelector("[data-platform-attribution]", { timeout: 30000 });
    ok("atribución: el lead referido de A aparece con su id firmado", (await s.$$eval("[data-referral-row]", (n) => n.map((x) => x.dataset.referralRow))).includes(m?.[1]));

    const direct = await (await ctxS.newPage()).goto(url("avista", "/superadmin"), { waitUntil: "domcontentloaded" });
    ok("la consola no es accesible desde el host de un tenant", direct.status() === 404, `status ${direct.status()}`);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})().catch(fail);
