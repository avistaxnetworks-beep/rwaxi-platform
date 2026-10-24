// E2E · persisted B2B onboarding of a developer from the Super-Admin console, against Neon:
//   the wizard (NIT check digit, live subdomain check, AA contrast, Data Room hashed in the browser)
//   creates organization, team, first offering with its Data Room, setup fee, queued registry and
//   audit event in one transaction; the server re-validates every field (forged requests). Then the
//   new {slug}.localhost portal and backoffice resolve from PostgreSQL with full RLS isolation, KYC
//   approval waits for the tenant's RwaxiComplianceRegistry, and RWAXI's operator deploys it.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const lib = require("./lib.cjs");
const { launch, ownerDb, PrismaClient, poolUrl, ok, fail, shot, url, viem, viemAccounts, viemChains, abi, canon, sha256, merkleRoot, webEnv } = lib;
const { nitDv, nitOf, randomNitBase: randomBase } = lib;
const { waitText, clickText, clickIn, fill, toastText, alertText, waitAlert, openGovernance, openBackofficeTab, replayAction, ARTIFACTS } = lib;

const db = ownerDb();
const factoryAbi = abi("RwaxiTenantFactory");
const operator = viemAccounts.privateKeyToAccount(webEnv("OPERATOR_PRIVATE_KEY"));
const CHAIN_ID = { POLYGON: viemChains.polygon.id, BASE: viemChains.base.id, POLYGON_AMOY: viemChains.polygonAmoy.id, BASE_SEPOLIA: viemChains.baseSepolia.id, HARDHAT: viemChains.hardhat.id };
const auditHash = (e) => sha256(canon({ action: e.action, organizationId: e.organizationId, entityId: e.entityId, ...e.payload }));

const slugState = (page) => page.$eval("[data-slug-state]", (n) => ({ state: n.dataset.slugState, text: n.textContent }));
const waitSlug = (page, state) => page.waitForFunction((s) => document.querySelector("[data-slug-state]")?.dataset.slugState === s, { timeout: 30000 }, state);

(async () => {
  const browser = await launch();
  try {
    const avista = await db.organization.findUniqueOrThrow({ where: { slug: "avista" } });
    const superAdmin = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN", organizationId: null } });
    const codes = (await db.offering.findMany({ select: { code: true } })).map((o) => Number(/^P-(\d+)$/.exec(o.code)?.[1] ?? 0));
    const expectedCode = `P-${String(Math.max(...codes) + 1).padStart(2, "0")}`;
    const before = { orgs: await db.organization.count(), fees: await db.feeLedgerEntry.count() };

    const suffix = crypto.randomBytes(3).toString("hex");
    const slug = `costaazul-${suffix}`;
    const legalName = `Constructora Costa Azul ${suffix.toUpperCase()} S.A.S.`;
    const displayName = `Costa Azul ${suffix.toUpperCase()}`;
    const base = randomBase();
    const nit = nitOf(base);
    const brand = "#1F4E79";

    // ── 1 · Wizard · step 1: company (client checks backed by the server) ──
    const s = await (await browser.createBrowserContext()).newPage();
    s.on("pageerror", (e) => console.log("PAGEERROR(S)", e.message));
    const actions = {};
    s.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (req.method() === "POST" && id) actions[req.postData() ?? ""] = id;
    });
    await openGovernance(s);
    await clickText(s, "Dar de Alta Nuevo Desarrollador");
    await s.waitForSelector('[data-onboarding-step="0"]', { timeout: 30000 });
    await clickText(s, "Completar con datos de ejemplo");
    await fill(s, "#ob-legal", legalName);
    await fill(s, "#ob-display", displayName);

    await fill(s, "#ob-slug", "admin");
    await waitSlug(s, "taken");
    const reserved = await slugState(s);
    await fill(s, "#ob-slug", "elpoblado");
    await waitSlug(s, "taken");
    const taken = await slugState(s);
    ok("subdominio: «admin» reservado y «elpoblado» ocupado (consulta en vivo a Neon)", /reservado/i.test(reserved.text) && /otro desarrollador/i.test(taken.text), `${reserved.text} | ${taken.text}`);
    await fill(s, "#ob-slug", slug);
    await waitSlug(s, "available");

    await fill(s, "#ob-nit", nitOf(base, (nitDv(base) + 1) % 10));
    await clickText(s, "Continuar");
    await waitAlert(s, /NIT inválido/);
    ok("NIT con dígito de verificación incorrecto → no avanza", (await s.$('[data-onboarding-step="0"]')) !== null);
    await fill(s, "#ob-nit", nit);
    await fill(s, "#ob-color", "#777777");
    await clickText(s, "Continuar");
    await waitAlert(s, /contraste AA/);
    ok("color de marca sin contraste AA (#777777) → no avanza", (await s.$('[data-onboarding-step="0"]')) !== null);
    await fill(s, "#ob-color", brand);
    await clickText(s, "Continuar");

    // ── steps 2–5: team, first offering, Data Room (real files hashed in the browser), fees ──
    await s.waitForSelector('[data-onboarding-step="1"]', { timeout: 30000 });
    await clickText(s, "Completar con datos de ejemplo");
    const adminEmail = await s.$eval("#ob-admin-email", (i) => i.value);
    const officerEmail = await s.$eval("#ob-officer-email", (i) => i.value);
    const adminWallet = await s.$eval("#ob-admin-wallet", (i) => i.value);
    const officerWallet = await s.$eval("#ob-officer-wallet", (i) => i.value);
    await fill(s, "#ob-admin-name", "Laura Salazar Mejía");
    await clickText(s, "Continuar");
    await s.waitForSelector('[data-onboarding-step="2"]', { timeout: 30000 });
    await clickText(s, "Completar con datos de ejemplo");
    const code = await s.$eval("#ob-code", (i) => i.value);
    ok(`código sugerido = siguiente de la plataforma (${expectedCode})`, code === expectedCode, code);
    await clickText(s, "Continuar");

    await s.waitForSelector('[data-onboarding-step="3"]', { timeout: 30000 });
    await clickText(s, "Adjuntar documentos de ejemplo");
    await s.waitForFunction(() => document.querySelectorAll('[data-doc-loaded="true"]').length === 13, { timeout: 30000 });
    // Real files are PDFs: the DocumentVault reads the type from the bytes and refuses plain text.
    const files = [0, 4].map((slot) => {
      const file = path.join(ARTIFACTS, `onboarding-${suffix}-${slot}.pdf`);
      fs.writeFileSync(file, `%PDF-1.4\n% Documento real ${slot} · ${legalName} · ${crypto.randomBytes(16).toString("hex")}\n%%EOF\n`);
      return { slot, file, sha256: "0x" + crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") };
    });
    for (const f of files) {
      const input = await s.$(`input[data-doc-slot="${f.slot}"]`);
      await input.uploadFile(f.file);
      await s.waitForFunction((slot, name) => document.querySelector(`[data-doc-row="${slot}"]`)?.textContent.includes(name), { timeout: 30000 }, f.slot, path.basename(f.file));
    }
    const uiRoot = await s.$eval("[data-dataroom-root]", (n) => n.dataset.dataroomRoot);
    await clickText(s, "Continuar");
    await s.waitForSelector('[data-onboarding-step="4"]', { timeout: 30000 });
    await fill(s, "#ob-setup", "9000");
    await shot(s, "onboarding-wizard-confirm", { fullPage: true });
    await clickText(s, "Crear tenant y causar Setup Fee");
    await s.waitForSelector(`[data-onboarded-slug="${slug}"]`, { timeout: 90000 });
    const toast = await toastText(s);

    // ── 2 · One transaction in Neon: everything the onboarding promises ──
    const org = await db.organization.findUnique({
      where: { slug },
      include: { users: true, offerings: { include: { token: true, documents: true } }, feeEntries: true, chainTxs: true },
    });
    ok("Organization creada: razón social, NIT, slug, color, régimen · REVIEW y fuera de la vitrina", !!org && org.legalName === legalName && org.taxId === nit && org.displayName === displayName && org.brandColor === brand && org.portalStatus === "REVIEW" && !org.published, toast);
    ok(
      "tarifas pactadas persistidas (setup 9.000 · SaaS 1.200 · uso 1,2 %) y onchainId = keccak256(id)",
      Number(org.feeSetupUsd) === 9000 && Number(org.feeMonthlyUsd) === 1200 && Number(org.feeUsagePct) === 1.2 && org.onchainId === viem.keccak256(viem.toHex(org.id)) && org.complianceRegistry === null,
    );
    const admin = org.users.find((u) => u.role === "TENANT_ADMIN");
    const officer = org.users.find((u) => u.role === "COMPLIANCE_OFFICER");
    ok(
      "usuarios iniciales: TENANT_ADMIN y COMPLIANCE_OFFICER con correo y wallet (minúsculas)",
      org.users.length === 2 && admin?.email === adminEmail.toLowerCase() && officer?.email === officerEmail.toLowerCase() && admin.walletAddress === adminWallet.toLowerCase() && officer.walletAddress === officerWallet.toLowerCase() && admin.fullName === "Laura Salazar Mejía",
    );
    const offering = org.offerings[0];
    ok(
      `primera oferta ${code} en pre-venta, publicada en su portal, con token NOT_DEPLOYED`,
      org.offerings.length === 1 && offering.code === code && offering.stage === "PRESALE" && offering.published && offering.token?.status === "NOT_DEPLOYED" && offering.token.maxSupply === offering.totalUnits && offering.token.onchainId === viem.keccak256(viem.toHex(offering.id)),
      `${offering.assetName} · ${offering.token?.symbol}`,
    );
    const docs = offering.documents;
    const recomputed = merkleRoot(docs.map((d) => d.sha256));
    ok(
      "Data Room base: 13 documentos y raíz de Merkle recalculada independientemente = la del navegador = Offering.dataRoomRoot",
      docs.length === 13 && recomputed === offering.dataRoomRoot && uiRoot === offering.dataRoomRoot,
      offering.dataRoomRoot,
    );
    ok("los archivos reales subidos quedaron con su SHA-256 exacto", files.every((f) => docs.some((d) => d.sha256 === f.sha256)));
    const setup = org.feeEntries.filter((f) => f.kind === "ONBOARDING_SETUP");
    ok("asiento ONBOARDING_SETUP 9.000 USD en ACCRUED (sin factura)", setup.length === 1 && Number(setup[0].amountUsd) === 9000 && setup[0].status === "ACCRUED" && setup[0].invoiceId === null);
    const registryTx = org.chainTxs.find((t) => t.kind === "TENANT_REGISTRY_DEPLOYED");
    ok(
      "deployTenantRegistry() en cola (PENDING) con el admin y el oficial del tenant",
      org.chainTxs.length === 1 && registryTx?.status === "PENDING" && registryTx.args.organizationId === org.onchainId && registryTx.args.organizationTaxId === nit && registryTx.args.tenantAdmin === admin.walletAddress && registryTx.args.complianceOfficer === officer.walletAddress,
      registryTx?.contractAddress,
    );
    const onboardAudit = await db.auditEvent.findFirst({ where: { organizationId: org.id, action: "ORGANIZATION_ONBOARDED" } });
    ok(
      "AuditEvent ORGANIZATION_ONBOARDED del Super-Admin · subjectHash recalculado",
      !!onboardAudit && onboardAudit.actorEmail === superAdmin.email && onboardAudit.subjectHash === auditHash(onboardAudit) && onboardAudit.payload.dataRoomRoot === offering.dataRoomRoot && onboardAudit.payload.setupFeeEntryId === setup[0].id,
    );

    // ── 3 · The server re-validates (forged requests replayed with the captured action id) ──
    const [body, onboardId] = Object.entries(actions).find(([b]) => b.includes(slug) && b.includes("documents")) ?? [];
    const input = JSON.parse(body ?? "[{}]")[0];
    const variant = (patch) => {
      const v = JSON.parse(JSON.stringify(input));
      patch(v);
      return [v];
    };
    const freshNit = nitOf(randomBase());
    const cases = [
      ["mismo subdominio", (v) => ((v.company.taxId = freshNit), (v.offering.code = "P-901")), /subdominio ya pertenece/],
      ["mismo NIT", (v) => ((v.company.slug = `${slug}-b`), (v.offering.code = "P-902")), /ya existe un desarrollador con ese NIT/i],
      ["mismo código de oferta", (v) => ((v.company.slug = `${slug}-c`), (v.company.taxId = freshNit)), /ya se usa en la plataforma/],
      ["NIT con DV alterado", (v) => (v.company.taxId = nitOf(base, (nitDv(base) + 3) % 10)), /dígito de verificación no corresponde/],
      ["subdominio reservado", (v) => (v.company.slug = "api"), /reservado/],
      ["color sin contraste", (v) => (v.company.brandColor = "#777777"), /contraste AA/],
      ["correos iguales", (v) => (v.team.officer.email = v.team.admin.email), /correos distintos/],
      ["documento sin SHA-256", (v) => (v.documents[0].sha256 = "0x1234"), /SHA-256 inválido/],
      ["ticket menor que una unidad", (v) => (v.offering.minTicketUsd = "1"), /Ticket mínimo/],
    ];
    const outcomes = [];
    for (const [label, patch, re] of cases) outcomes.push([label, re.test(await replayAction(s, onboardId, variant(patch)))]);
    ok(
      "servidor: duplicados (subdominio, NIT, código), DV, reservado, contraste, correos, hash y ticket → rechazados",
      !!onboardId && outcomes.every(([, pass]) => pass),
      outcomes.filter(([, pass]) => !pass).map(([l]) => l).join(", ") || `${outcomes.length} variantes`,
    );
    ok("nada quedó a medias: exactamente 1 organización y 1 asiento nuevos", (await db.organization.count()) === before.orgs + 1 && (await db.feeLedgerEntry.count()) === before.fees + 1);

    // ── 4 · Super-Admin lists it: REVIEW, registry queued for RWAXI's operator ──
    await openGovernance(s);
    await s.waitForSelector(`[data-governance-row="${slug}"]`, { timeout: 60000 });
    const row = await s.$eval(`[data-governance-row="${slug}"]`, (n) => ({ status: n.dataset.portalStatus, registry: n.querySelector("[data-registry-status]")?.dataset.registryStatus, text: n.innerText }));
    ok("Módulo A: el nuevo tenant aparece en REVIEW con el registro en cola", row.status === "REVIEW" && row.registry === "PENDING" && row.text.includes(code), row.text.split("\n").slice(0, 2).join(" · "));

    // ── 5 · {slug}.localhost resolves from PostgreSQL, with its own brand ──
    const p = await (await browser.createBrowserContext()).newPage();
    const pageErrors = [];
    p.on("pageerror", (e) => pageErrors.push(e.message));
    await p.goto(url(slug), { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitText(p, "Firmar NDA con un clic", 180000);
    const portal = await p.evaluate(() => ({
      title: document.title,
      tc: [...document.querySelectorAll("[style]")].map((n) => n.style.getPropertyValue("--tc").trim().toUpperCase()).filter(Boolean),
      text: document.body.innerText,
    }));
    ok(
      `${slug}.localhost: portal del tenant nuevo con su nombre, color y oferta (sin 404)`,
      portal.title.includes(displayName) && portal.tc.includes(brand) && portal.text.includes(offering.assetName) && pageErrors.length === 0,
      `${portal.title} · --tc ${portal.tc[0]}`,
    );
    await clickText(p, "Ficha técnica");
    await waitText(p, `NIT ${nit}`);
    const rootShown = `${offering.dataRoomRoot.slice(2, 18)}…${offering.dataRoomRoot.slice(-10)}`;
    ok("ficha técnica: razón social, NIT y raíz de Merkle real del Data Room (no la del prototipo)", (await p.evaluate(() => document.body.innerText)).includes(rootShown), rootShown);
    await shot(p, "onboarding-new-portal", { fullPage: true });

    const health = await p.evaluate(() => fetch("/api/health").then((r) => r.json()));
    ok("/api/health en el host nuevo → visibleOrganizations: 1", health.visibleOrganizations === 1, JSON.stringify({ tenant: health.tenant, visible: health.visibleOrganizations }));

    const b = await (await browser.createBrowserContext()).newPage();
    b.on("pageerror", (e) => console.log("PAGEERROR(B)", e.message));
    const bActions = {};
    b.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (req.method() === "POST" && id) bActions[req.postData() ?? ""] = id;
    });
    await openBackofficeTab(b, slug, "Cumplimiento y Leads");
    await waitText(b, legalName);
    await waitText(b, officer.email);
    ok(`${slug}.localhost/backoffice: su backoffice, sesión demo de su propio oficial y bandeja vacía`, !(await b.$("tr[data-investor]")) && (await b.title()).includes(displayName));
    await openBackofficeTab(b, slug, "Suscripciones y Pagos");
    await b.waitForSelector(`[data-queue-item="${registryTx.id}"]`, { timeout: 90000 });
    const registryItem = await b.$eval(`[data-queue-item="${registryTx.id}"]`, (n) => ({ blocked: n.dataset.blocked, text: n.innerText }));
    ok("su cola muestra deployTenantRegistry() reservado al operador RWAXI (no ejecutable desde el tenant)", registryItem.blocked === "true" && /operador RWAXI/i.test(registryItem.text), registryItem.text.split("\n").find((l) => /operador/i.test(l)));

    // ── 6 · RLS: the app role sees only the new tenant (and other tenants never see it) ──
    const app = new PrismaClient({ datasourceUrl: poolUrl(process.env.DATABASE_URL) });
    const scoped = (orgId, sql) => app.$transaction([app.$executeRaw`SELECT set_config('app.current_organization_id', ${orgId}, TRUE)`, sql]).then(([, r]) => r);
    const mine = await scoped(org.id, app.$queryRaw`SELECT (SELECT count(*) FROM organizations)::int AS orgs, (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM data_room_documents)::int AS docs, (SELECT count(*) FROM kyc_cases)::int AS kyc, (SELECT count(*) FROM fee_ledger_entries)::int AS fees`);
    const fromAvista = await scoped(avista.id, app.$queryRaw`SELECT (SELECT count(*) FROM organizations WHERE id = ${org.id})::int AS orgs, (SELECT count(*) FROM data_room_documents WHERE organization_id = ${org.id})::int AS docs, (SELECT count(*) FROM users WHERE organization_id = ${org.id})::int AS users`);
    const none = await app.$queryRaw`SELECT count(*)::int AS n FROM organizations`;
    ok(
      "rwaxi_app con el tenant nuevo: 1 organización, 2 usuarios, 13 documentos, 0 KYC, 1 asiento",
      mine[0].orgs === 1 && mine[0].users === 2 && mine[0].docs === 13 && mine[0].kyc === 0 && mine[0].fees === 1,
      JSON.stringify(mine[0]),
    );
    ok("rwaxi_app con avista no ve nada del tenant nuevo; sin contexto, nada (fail-closed)", fromAvista[0].orgs === 0 && fromAvista[0].docs === 0 && fromAvista[0].users === 0 && none[0].n === 0);
    await app.$disconnect();

    // ── 7 · Investor on the new portal: KYC approval waits for the registry ──
    const { page: inv, investor } = await lib.onboardInvestor(browser, db, slug);
    ok("inversionista: NDA y KYC persistidos en el tenant nuevo", investor.organizationId === org.id);
    await openBackofficeTab(b, slug, "Cumplimiento y Leads");
    await b.waitForSelector(`tr[data-investor="${investor.id}"]`, { timeout: 90000 });
    await clickIn(b, `tr[data-investor="${investor.id}"]`, "Aprobar Inversionista");
    await waitAlert(b, /no tiene RwaxiComplianceRegistry desplegado/);
    const kycBefore = await db.kycCase.findFirstOrThrow({ where: { investorId: investor.id } });
    ok("aprobar KYC sin registro desplegado → rechazado, el caso sigue PENDING", kycBefore.status === "PENDING", await alertText(b));

    // A record of another tenant through the new tenant's host is "not found" (RLS).
    const avistaCase = await db.kycCase.findFirstOrThrow({ where: { organizationId: avista.id, status: "PENDING" } });
    const approveId = Object.entries(bActions).find(([bd]) => bd.includes(kycBefore.id))?.[1];
    const cross = approveId ? await replayAction(b, approveId, [avistaCase.id]) : "";
    ok("desde el host nuevo, aprobar un expediente de avista → no encontrado (RLS)", /no encontrado/i.test(cross) && (await db.kycCase.findUniqueOrThrow({ where: { id: avistaCase.id } })).status === "PENDING");

    // ── 8 · RWAXI's operator deploys the registry from the Super-Admin console ──
    const madeBefore = await db.chainTransaction.count({
      where: { network: registryTx.network, status: "CONFIRMED", executionMode: "SIMULATION", kind: { in: ["TENANT_REGISTRY_DEPLOYED", "OFFERING_TOKEN_DEPLOYED"] }, contractAddress: { equals: registryTx.contractAddress, mode: "insensitive" } },
    });
    await clickIn(s, `[data-governance-row="${slug}"]`, "Desplegar registro");
    await s.waitForSelector("[data-governance-dialog]", { timeout: 30000 });
    await clickText(s, "Confirmar decisión", '[role="dialog"]');
    await s.waitForFunction((sl) => document.querySelector(`[data-governance-row="${sl}"] [data-registry-status]`)?.dataset.registryStatus === "DEPLOYED", { timeout: 90000 }, slug);
    const deployed = await db.chainTransaction.findUniqueOrThrow({ where: { id: registryTx.id } });
    const orgAfter = await db.organization.findUniqueOrThrow({ where: { id: org.id } });
    const expected = viem.getContractAddress({ from: registryTx.contractAddress, nonce: BigInt(1 + madeBefore) });
    ok(
      "registro desplegado: dirección = CREATE(factory, nonce) recalculada · Organization.complianceRegistry",
      deployed.status === "CONFIRMED" && orgAfter.complianceRegistry === expected && deployed.args.registry === expected,
      expected,
    );
    const parsed = viem.parseTransaction(deployed.signedTransaction);
    const signer = await viem.recoverTransactionAddress({ serializedTransaction: deployed.signedTransaction });
    const call = viem.decodeFunctionData({ abi: factoryAbi, data: parsed.data });
    ok(
      "tx firmada por el operador RWAXI (RWAXI_OPERATOR_ROLE): hash, firmante, chainId y calldata deployTenantRegistry(...)",
      deployed.txHash === viem.keccak256(deployed.signedTransaction) &&
        signer === operator.address &&
        parsed.chainId === CHAIN_ID[deployed.network] &&
        call.functionName === "deployTenantRegistry" &&
        call.args[0] === org.onchainId &&
        call.args[1] === nit &&
        call.args[3].toLowerCase() === admin.walletAddress &&
        call.args[4].toLowerCase() === officer.walletAddress &&
        deployed.executionMode === "SIMULATION",
      `nonce ${deployed.nonce}`,
    );
    const confirmedAudit = await db.auditEvent.findFirst({ where: { organizationId: org.id, action: "CHAIN_TX_CONFIRMED", entityId: registryTx.id } });
    ok("AuditEvent CHAIN_TX_CONFIRMED del Super-Admin con la dirección creada", confirmedAudit?.actorEmail === superAdmin.email && confirmedAudit.payload.created === expected);

    // ── 9 · Now the officer can approve: whitelisting targets the new registry ──
    await b.reload({ waitUntil: "domcontentloaded" });
    await lib.approveInvestor(b, slug, investor.id);
    const wl = await db.chainTransaction.findFirstOrThrow({ where: { organizationId: org.id, kind: "INVESTOR_WHITELISTED" } });
    ok("KYC aprobado tras el despliegue: approveInvestor() en cola contra el registro del tenant", wl.status === "PENDING" && wl.contractAddress === expected && wl.args.wallet === investor.walletAddress);
    await inv.goto(url(slug), { waitUntil: "domcontentloaded" });
    await waitText(inv, "Firmar contrato y reservar unidades");
    ok("portal: KYC aprobado y suscripción como reserva de pre-venta (token aún sin emitir)", await lib.has(inv, "Firmar contrato y reservar unidades"));

    // ── 10 · Activated and published, it joins the live vitrina ──
    await db.organization.update({ where: { id: org.id }, data: { portalStatus: "ACTIVE", published: true } });
    const v = await (await browser.createBrowserContext()).newPage();
    v.on("pageerror", (e) => console.log("PAGEERROR(V)", e.message));
    await v.goto(url(null), { waitUntil: "domcontentloaded", timeout: 180000 });
    await v.waitForSelector(`[data-live-catalog="neon"] [data-offering="${code}"]`, { timeout: 180000 });
    const card = await v.$eval(`[data-offering="${code}"]`, (n) => ({ portal: n.dataset.portalStatus, text: n.innerText }));
    ok("vitrina: la oferta del tenant nuevo aparece en el catálogo en vivo al activarlo y publicarlo", card.portal === "ACTIVE" && card.text.includes(offering.assetName), card.text.split("\n").slice(0, 2).join(" · "));
    await shot(v, "onboarding-vitrina", { fullPage: false });
  } catch (e) {
    fail(e);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})();
