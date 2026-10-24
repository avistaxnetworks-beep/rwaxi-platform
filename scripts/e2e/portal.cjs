// E2E · investor onboarding persisted in Neon (vitrina → portal → NDA → Data Room → KYC), its arrival in the
// backoffice inbox, the On-Chain Inspector queue and attacks on the investor session. The funnel's order: 1 NDA,
// 2 Data Room (every document opens with the NDA), 3 KYC (what investing requires), 4 subscription.
const { launch, ownerDb, ok, fail, shot, url, viem, abi, canon, sha256, text, has, waitText, clickText, openBackofficeTab } = require("./lib.cjs");
const { NDA_LANDING, toKycWizard, vaultGet } = require("./lib.cjs");

const registryAbi = abi("RwaxiComplianceRegistry");
const db = ownerDb();
const NAME = "María Fernanda Ríos Ospina";

const rows = (page) =>
  page.$$eval("tr[data-investor]", (trs) =>
    trs.map((tr) => ({ name: tr.querySelector("td p").textContent.trim(), kyc: tr.querySelector("[data-kyc]").dataset.kyc })),
  );
async function openCompliance(page, slug) {
  await openBackofficeTab(page, slug, "Cumplimiento");
  await page.waitForSelector("tr[data-investor], [role=alert]", { timeout: 90000 });
  return rows(page);
}
const apiQueue = (page, scope = "pending") =>
  page.evaluate((s) => fetch(`/api/chain/transactions?scope=${s}`, { cache: "no-store" }).then((r) => r.json()), scope);

(async () => {
  const browser = await launch();
  try {
    const baseline = Object.fromEntries(
      await Promise.all(["avista", "elpoblado", "santabarbara"].map(async (s) => [s, await db.investor.count({ where: { organization: { slug: s } } })])),
    );

    // ── A · investor arrives from the vitrina ───────────────────────────────
    const ctxA = await browser.createBrowserContext();
    const a = await ctxA.newPage();
    a.on("pageerror", (e) => console.log("PAGEERROR(A)", e.message));
    await a.goto(url(null), { waitUntil: "domcontentloaded", timeout: 180000 });
    await a.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Ir al Portal Oficial")), { timeout: 180000 });
    await Promise.all([
      a.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 }),
      a.evaluate(() => {
        // The card of a button = its closest ancestor that contains only that CTA.
        const ctas = [...document.querySelectorAll("button")].filter((b) => b.textContent.includes("Ir al Portal Oficial"));
        const cardOf = (btn) => {
          let n = btn.parentElement;
          while (n?.parentElement && [...n.parentElement.querySelectorAll("button")].filter((b) => ctas.includes(b)).length === 1) n = n.parentElement;
          return n;
        };
        const target = ctas.find((btn) => cardOf(btn)?.innerText.includes("Avista Beach Villas"));
        if (!target) throw new Error("Avista card not found");
        target.click();
      }),
    ]);
    await waitText(a, "Firmar NDA con un clic");
    const refCookie = (await a.cookies(url("avista"))).find((c) => c.name === "rwaxi_ref");
    const refToken = refCookie?.value.split(".")[0];
    ok(
      "vitrina → portal Avista con cookie de referido (HttpOnly)",
      a.url().startsWith(url("avista")) && !!refCookie?.httpOnly && /^ref_rwx_[0-9a-f]{24}$/.test(refToken || ""),
      refToken,
    );
    ok("la URL ya no expone ?ref", !a.url().includes("ref="));
    ok("badge 'Referido desde RWAXI' visible", await has(a, "Referido desde RWAXI"));

    // NDA
    await clickText(a, "Completar con datos de ejemplo");
    const email = await a.$eval("#nda-email", (i) => i.value);
    await clickText(a, "Firmar NDA con un clic");
    await waitText(a, NDA_LANDING);
    const session = (await a.cookies(url("avista"))).find((c) => c.name === "rwaxi_inv");
    const inv = await db.investor.findFirst({ where: { email, organization: { slug: "avista" } }, include: { ndas: true, leads: true } });
    ok("NDA → Investor + NdaAcceptance en BD", !!inv && inv.ndas.length === 1 && /^0x[0-9a-f]{64}$/.test(inv.ndas[0].documentHash), email);
    ok("Lead atribuido a RWAXI con el token de la vitrina", inv?.leads[0]?.source === "REFERRAL" && inv.leads[0].referralToken === refToken);
    ok("cookie de sesión del inversionista HttpOnly y firmada", !!session?.httpOnly && session.value.split(".").length === 5);

    // Step 2: the whole Data Room opens with the NDA, before any KYC.
    await a.waitForSelector('[data-investor-data-room][data-room-access="nda"]', { timeout: 60000 });
    const steps = await a.$$eval('[id^="funnel-"]', (bs) => bs.map((b) => ({ id: b.id, state: b.dataset.stepState, text: b.textContent })));
    ok(
      "embudo en orden 1 NDA · 2 Data Room · 3 KYC · 4 Suscripción; tras el NDA aterriza en el Data Room (Disponible) y la suscripción espera al KYC",
      steps.map((x) => x.id).join(",") === "funnel-1,funnel-2,funnel-3,funnel-4" &&
        /NDA/.test(steps[0].text) &&
        /Data Room/.test(steps[1].text) &&
        /KYC/.test(steps[2].text) &&
        /Suscripción/.test(steps[3].text) &&
        steps.map((x) => x.state).join(",") === "done,open,open,locked" &&
        (await a.$eval("[data-funnel-step]", (n) => n.dataset.funnelStep)) === "2",
      steps.map((x) => `${x.id}:${x.state}`).join(" "),
    );
    const roomDocs = await db.dataRoomDocument.findMany({ where: { organization: { slug: "avista" }, storageKey: { not: null } } });
    const roomGets = [];
    for (const d of roomDocs) roomGets.push(await vaultGet(a, `/api/vault/data-room/${d.id}`));
    ok(
      `con solo el NDA descarga el 100 % del Data Room (${roomDocs.length} documentos, reservados incluidos), cada uno con su SHA-256`,
      roomDocs.length > 0 &&
        roomDocs.some((d) => d.restricted) &&
        roomGets.every((r, i) => r.status === 200 && r.sha256 === roomDocs[i].sha256),
      roomGets.filter((r) => r.status !== 200).map((r) => `${r.status} ${r.error}`).join(" | "),
    );
    ok("el Data Room ofrece pasar a invertir: «Quiero invertir en este proyecto — Completar KYC y Suscribir»", await has(a, "Quiero invertir en este proyecto — Completar KYC y Suscribir"));

    await a.reload({ waitUntil: "domcontentloaded" });
    await waitText(a, NDA_LANDING);
    ok("tras recargar: NDA firmado y Data Room abierto (desde BD)", !!(await a.$('[data-room-access="nda"]')));

    // KYC wizard, from the Data Room's call to action
    await toKycWizard(a);
    ok("el CTA del Data Room lleva al Paso 3 (asistente KYC)", await has(a, "Completar con datos de ejemplo"));
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
    const kyc = await db.kycCase.findFirst({ where: { investorId: inv.id }, include: { investor: true } });
    const ev = kyc?.evidence;
    ok("KYC → KycCase PENDING en Neon", kyc?.status === "PENDING", kyc?.id);
    ok("dossierHash = SHA-256(JSON canónico de evidence) — verificación independiente", kyc?.dossierHash === sha256(canon(ev)), kyc?.dossierHash?.slice(0, 18) + "…");
    ok(
      "evidence: 2 documentos con SHA-256 de su contenido, prueba de vida simulada, NDA enlazado",
      ev?.documents?.length === 2 &&
        ev.documents.every((d) => /^0x[0-9a-f]{64}$/.test(d.sha256) && d.size > 0) &&
        ev.liveness?.method === "simulated" &&
        ev.nda?.id === inv.ndas[0].id,
    );
    ok(
      "Investor completado: documento, país (170) y wallet declarada",
      kyc?.investor.docType === "CC" &&
        /^\d{10}$/.test(kyc.investor.docNumber) &&
        kyc.investor.countryCode === 170 &&
        /^0x[0-9a-f]{40}$/.test(kyc.investor.walletAddress) &&
        ev.investor.wallet === kyc.investor.walletAddress,
    );
    ok("listas restrictivas no se dan por superadas", kyc?.listsResult === "Pendiente de consulta");
    await a.reload({ waitUntil: "domcontentloaded" });
    await waitText(a, "Tus datos se encuentran en revisión");
    ok("tras recargar: el portal sigue mostrando Pendiente", true);

    // Appears immediately in the backoffice inbox of the same developer
    await clickText(a, "Abrir Bandeja de Cumplimiento");
    await a.waitForSelector("tr[data-investor]", { timeout: 90000 });
    const inboxA = await rows(a);
    const me = inboxA.find((r) => r.name === NAME);
    ok("aparece de inmediato en la bandeja del backoffice como PENDING", inboxA.length === baseline.avista + 1 && me?.kyc === "pendiente", `${inboxA.length} filas`);
    await shot(a, "portal-inbox", { fullPage: true });

    // ── B · fresh browser: data comes from the DB, isolated per tenant ──────
    const ctxB = await browser.createBrowserContext();
    const b = await ctxB.newPage();
    const avB = await openCompliance(b, "avista");
    ok("otro navegador ve el expediente en avista (no es estado local)", avB.some((r) => r.name === NAME && r.kyc === "pendiente"));
    const elB = await openCompliance(b, "elpoblado");
    ok("elpoblado no lo ve", elB.length === baseline.elpoblado && !elB.some((r) => r.name === NAME), `${elB.length} filas`);

    // Approve in avista → ChainTransaction PENDING
    await openCompliance(b, "avista");
    await b.evaluate((name) => {
      const tr = [...document.querySelectorAll("tr[data-investor]")].find((t) => t.querySelector("td p").textContent.trim() === name);
      [...tr.querySelectorAll("button")].find((x) => x.textContent.includes("Aprobar Inversionista")).click();
    }, NAME);
    await b.waitForFunction(
      (name) => {
        const tr = [...document.querySelectorAll("tr[data-investor]")].find((t) => t.querySelector("td p").textContent.trim() === name);
        return tr?.querySelector("[data-kyc]").dataset.kyc === "aprobado";
      },
      { timeout: 90000 },
      NAME,
    );
    ok("backoffice aprueba el expediente del portal", true);

    // ── Inspector: PENDING ChainTransaction with its payload ────────────────
    await clickText(b, "Inspector On-Chain");
    await b.waitForSelector('[role="dialog"]', { timeout: 30000 });
    await clickText(b, "Cola PostgreSQL");
    await b.waitForSelector('[data-chain-tx="PENDING"]', { timeout: 60000 });
    const card = await b.$eval('[data-chain-tx="PENDING"]', (n) => n.innerText);
    await b.evaluate(() => [...document.querySelectorAll('[data-chain-tx="PENDING"] button')].find((x) => x.textContent.includes("calldata")).click());
    const pre = await b.$eval('[data-chain-tx="PENDING"] pre', (n) => n.textContent.replace(/\s+/g, ""));
    await shot(b, "portal-inspector-queue");
    const wallet = kyc.investor.walletAddress;
    ok(
      "inspector lista la tx PENDING de RwaxiComplianceRegistry.approveInvestor",
      /PENDING/.test(card) && card.includes("RwaxiComplianceRegistry") && card.includes("approveInvestor") && card.includes("María Fernanda"),
    );
    const decoded = viem.decodeFunctionData({ abi: registryAbi, data: pre });
    ok(
      "calldata mostrado decodifica (ABI compilado) a approveInvestor(wallet, 170, dossierHash)",
      decoded.functionName === "approveInvestor" && decoded.args[0].toLowerCase() === wallet && decoded.args[1] === 170 && decoded.args[2] === kyc.dossierHash,
      pre.slice(0, 10),
    );
    const qB = await apiQueue(b);
    const expectTopic = viem.toEventSelector("InvestorWhitelisted(address,uint16,bytes32)");
    ok(
      "API: 1 pendiente en avista, evento esperado InvestorWhitelisted",
      qB.ok && qB.tenant.slug === "avista" && qB.counts.pending === 1 && qB.items[0].expectedEvent?.topic0 === expectTopic,
    );

    // Portal reflects approval: lands on step 4 with the subscription enabled
    await a.goto(url("avista"), { waitUntil: "domcontentloaded" });
    await waitText(a, "Paso 4 · Suscripción de tokens y portafolio");
    const portalText = await text(a);
    ok(
      "portal: KYC aprobado → aterriza en el Paso 4 con la suscripción habilitada (desde BD)",
      portalText.includes("inversionista elegible") && portalText.includes("firmar contrato del vehículo y suscribir"),
    );

    // ── Isolation of the inspector API ──────────────────────────────────────
    await b.goto(url("elpoblado"), { waitUntil: "domcontentloaded" });
    const qEl = await apiQueue(b);
    ok("inspector en elpoblado: 0 pendientes (RLS)", qEl.ok && qEl.tenant.slug === "elpoblado" && qEl.counts.pending === 0);
    await b.goto(url(null), { waitUntil: "domcontentloaded" });
    const qWww = await apiQueue(b);
    ok("inspector en la vitrina: sin tenant → rechazado", qWww.ok === false, qWww.error);

    // ── Attacks on the investor session ─────────────────────────────────────
    // Flip one character of the investor id: the HMAC no longer matches.
    const forgedValue = session.value.replace(/^v1\.(.)/, (_, ch) => `v1.${ch === "a" ? "b" : "a"}`);
    const ctxC = await browser.createBrowserContext();
    const c = await ctxC.newPage();
    await c.setCookie({ name: "rwaxi_inv", value: forgedValue, domain: "avista.localhost", path: "/", httpOnly: true });
    await c.goto(url("avista"), { waitUntil: "domcontentloaded" });
    await waitText(c, "Firmar NDA con un clic");
    ok("cookie de sesión manipulada → visitante anónimo", (await has(c, "Firmar NDA con un clic")) && !(await has(c, "Paso 01")));
    await c.setCookie({ name: "rwaxi_inv", value: session.value, domain: "elpoblado.localhost", path: "/", httpOnly: true });
    await c.goto(url("elpoblado"), { waitUntil: "domcontentloaded" });
    await waitText(c, "Firmar NDA con un clic");
    ok("cookie válida de avista reutilizada en elpoblado → anónimo", (await has(c, "Firmar NDA con un clic")) && !(await has(c, "Paso 01")));

    // Email takeover attempt with A's email from another browser
    await c.goto(url("avista"), { waitUntil: "domcontentloaded" });
    await waitText(c, "Firmar NDA con un clic");
    await c.type("#nda-name", "Otra Persona Distinta");
    await c.type("#nda-email", email);
    await c.click("#nda-ok");
    await clickText(c, "Firmar NDA con un clic");
    await c.waitForFunction(() => [...document.querySelectorAll('[role="alert"]')].some((n) => n.textContent.includes("correo")), { timeout: 60000 });
    const takeover = await db.investor.count({ where: { email, organization: { slug: "avista" } } });
    ok("mismo email desde otro navegador → rechazado, sin tocar al inversionista", takeover === 1);

    // Replayed referral token → DIRECT lead
    const ctxD = await browser.createBrowserContext();
    const dpg = await ctxD.newPage();
    await dpg.goto(url("avista", `/?ref=${encodeURIComponent(refCookie.value)}`), { waitUntil: "domcontentloaded" });
    await waitText(dpg, "Firmar NDA con un clic");
    await clickText(dpg, "Completar con datos de ejemplo");
    const emailD = await dpg.$eval("#nda-email", (i) => i.value);
    await clickText(dpg, "Firmar NDA con un clic");
    await waitText(dpg, NDA_LANDING);
    const leadD = await db.lead.findFirst({ where: { investor: { email: emailD, organization: { slug: "avista" } } } });
    ok("token de referido reutilizado → Lead DIRECT (sin doble atribución)", leadD?.source === "DIRECT" && leadD.referralToken !== refToken);

    // ── Final database state ────────────────────────────────────────────────
    const after = Object.fromEntries(
      await Promise.all(["avista", "elpoblado", "santabarbara"].map(async (s) => [s, await db.investor.count({ where: { organization: { slug: s } } })])),
    );
    ok(
      "sólo avista creció (+2 inversionistas)",
      after.avista === baseline.avista + 2 && after.elpoblado === baseline.elpoblado && after.santabarbara === baseline.santabarbara,
      JSON.stringify(after),
    );
    const approved = await db.kycCase.findUniqueOrThrow({ where: { id: kyc.id } });
    const audit = await db.auditEvent.findFirst({ where: { entityId: kyc.id, action: "KYC_APPROVED" } });
    const wl = await db.chainTransaction.findFirst({ where: { kind: "INVESTOR_WHITELISTED", status: "PENDING", organization: { slug: "avista" } } });
    ok("BD: KycCase APPROVED + AuditEvent con el mismo dossierHash", approved.status === "APPROVED" && audit?.subjectHash === kyc.dossierHash);
    ok("BD: ChainTransaction PENDING args = wallet + dossierHash del portal", wl?.args?.wallet === wallet && wl?.args?.kycDossierHash === kyc.dossierHash && wl?.txHash === null);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})().catch(fail);
