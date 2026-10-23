// E2E · CHAIN_EXECUTION=rpc against a local Hardhat node (run it through run-rpc.cjs): custody split
// (the compliance officer signs approveInvestor and the issuer anchorDistributionRoot with their own
// wallets; RWAXI only sends mintSubscription and, from its console, the factory's deployTenantRegistry)
// and confirmations backed by real receipts and on-chain state.
const crypto = require("crypto");
const lib = require("./lib.cjs");
const { launch, ownerDb, ok, fail, shot, url, viem, viemAccounts, viemChains, abi, hardhatAccount, webEnv } = lib;
const { clickText, clickIn, fill, toastText, alertText, waitAlert, openBackofficeTab } = lib;
const { RPC_URL } = require("./rpc-fixtures.cjs");

const SETUP = JSON.parse(process.env.E2E_RPC_SETUP || "null");
if (!SETUP) throw new Error("Ejecuta esta suite con run-rpc.cjs (despliega los contratos y fija E2E_RPC_SETUP)");
const tokenAbi = abi("RwaxiPropertyToken");
const registryAbi = abi("RwaxiComplianceRegistry");
const factoryAbi = abi("RwaxiTenantFactory");
const db = ownerDb();
const transport = viem.http(RPC_URL);
const chain = viem.createPublicClient({ chain: viemChains.hardhat, transport });
const officer = viem.createWalletClient({ account: hardhatAccount(1), chain: viemChains.hardhat, transport });
const issuer = viem.createWalletClient({ account: hardhatAccount(0), chain: viemChains.hardhat, transport });

async function registerOfficerTx(page, chainTxId, txHash) {
  const sel = `[data-officer-form="${chainTxId}"] input`;
  await page.waitForSelector(sel, { timeout: 30000 });
  await page.$eval(sel, (i) => (i.value = ""));
  await page.type(sel, txHash);
  await clickText(page, "Registrar tx del Oficial", `[data-officer-form="${chainTxId}"]`);
}
/** Distributions desk: hash of the anchorDistributionRoot() the issuer signed with its own wallet. */
async function registerIssuerTx(page, chainTxId, txHash) {
  const sel = `[data-issuer-form="${chainTxId}"] input`;
  await page.waitForSelector(sel, { timeout: 30000 });
  await page.$eval(sel, (i) => (i.value = ""));
  await page.type(sel, txHash);
  await clickText(page, "Registrar tx del emisor", `[data-issuer-form="${chainTxId}"]`);
}

(async () => {
  const browser = await launch();
  try {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "avista" } });

    // ── Investor: NDA → KYC → approval → subscription → payment reconciled ──
    const { page: a, investor } = await lib.onboardInvestor(browser, db, "avista");
    const b = await (await browser.createBrowserContext()).newPage();
    b.on("pageerror", (e) => console.log("PAGEERROR(B)", e.message));
    await lib.approveInvestor(b, "avista", investor.id);
    const approveTx = await db.chainTransaction.findFirstOrThrow({ where: { organizationId: org.id, kind: "INVESTOR_WHITELISTED", status: "PENDING" } });
    ok("approveInvestor() en cola contra el registro desplegado en Hardhat", approveTx.network === "HARDHAT" && approveTx.contractAddress.toLowerCase() === SETUP.registry.toLowerCase());

    await lib.subscribe(a, "avista");
    const sub = await db.subscription.findFirstOrThrow({ where: { investorId: investor.id } });
    await openBackofficeTab(b, "avista", "Suscripciones y Pagos");
    await b.waitForSelector('[data-execution-mode="RPC"]', { timeout: 90000 });
    ok("la mesa indica modo RPC (nodo configurado)", true);
    await lib.confirmPayment(b, sub.id, "FID-RPC-000001");
    const mintTx = await db.chainTransaction.findFirstOrThrow({ where: { organizationId: org.id, kind: "SUBSCRIPTION_MINTED", status: "PENDING" } });
    const s1 = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    ok("pago conciliado: mintSubscription() en cola contra el token desplegado en Hardhat", mintTx.network === "HARDHAT" && mintTx.contractAddress.toLowerCase() === SETUP.token.toLowerCase());

    // ── Custody: RWAXI does not sign approveInvestor in RPC mode ────────────
    ok("la mesa ofrece registrar la tx del Oficial (no 'Firmar y ejecutar') para approveInvestor", !!(await b.$(`[data-officer-form="${approveTx.id}"]`)));
    await clickText(b, "Procesar cola en orden");
    await b.waitForFunction(() => /Nada ejecutable/.test(document.querySelector(".toast-wrap")?.textContent ?? ""), { timeout: 90000 });
    const queueText = await b.$eval("[data-chain-desk]", (n) => n.innerText);
    const approveAfter = await db.chainTransaction.findUniqueOrThrow({ where: { id: approveTx.id } });
    ok(
      "procesar la cola no firma el approveInvestor con la clave de RWAXI y no adelanta el mint",
      approveAfter.status === "PENDING" && approveAfter.executionMode === null && /no custodia COMPLIANCE_OFFICER_ROLE/.test(queueText) && /Prelación/.test(queueText),
      await toastText(b),
    );

    // ── The officer signs with their own wallet; wrong evidence is refused ──
    const strayHash = await officer.writeContract({
      address: SETUP.registry,
      abi: registryAbi,
      functionName: "approveInvestor",
      args: [`0x${"7".repeat(40)}`, 170, approveTx.args.kycDossierHash],
    });
    await chain.waitForTransactionReceipt({ hash: strayHash });
    await registerOfficerTx(b, approveTx.id, strayHash);
    await waitAlert(b, /no emitió InvestorWhitelisted con los argumentos en cola/);
    ok("tx del Oficial para otra wallet → rechazada (evento no coincide con la cola)", (await db.chainTransaction.findUniqueOrThrow({ where: { id: approveTx.id } })).status === "PENDING", await alertText(b));

    const officerHash = await officer.writeContract({
      address: SETUP.registry,
      abi: registryAbi,
      functionName: "approveInvestor",
      args: [investor.walletAddress, approveTx.args.countryCode, approveTx.args.kycDossierHash],
    });
    const officerReceipt = await chain.waitForTransactionReceipt({ hash: officerHash });
    await registerOfficerTx(b, approveTx.id, officerHash);
    await b.waitForFunction((id) => !document.querySelector(`[data-queue-item="${id}"]`), { timeout: 90000 }, approveTx.id);
    const wl = await db.chainTransaction.findUniqueOrThrow({ where: { id: approveTx.id } });
    ok(
      "approveInvestor CONFIRMED con el hash, bloque y firmante reales del Oficial",
      wl.status === "CONFIRMED" &&
        wl.executionMode === "RPC" &&
        wl.txHash === officerHash &&
        wl.blockNumber === officerReceipt.blockNumber &&
        wl.signerAddress === SETUP.officer &&
        wl.signedTransaction === null,
      `bloque ${wl.blockNumber}`,
    );
    ok("on-chain: isEligible(wallet) = true", await chain.readContract({ address: SETUP.registry, abi: registryAbi, functionName: "isEligible", args: [investor.walletAddress] }));

    // ── RWAXI sends the mint (MINTER_ROLE) and confirms it with the receipt ─
    await b.waitForSelector(`[data-queue-item="${mintTx.id}"][data-blocked="false"]`, { timeout: 60000 });
    await clickText(b, "Procesar cola en orden");
    await b.waitForSelector(`tr[data-subscription="${sub.id}"][data-sub-status="MINTED"]`, { timeout: 120000 });
    const m = await db.chainTransaction.findUniqueOrThrow({ where: { id: mintTx.id } });
    const sent = await chain.getTransaction({ hash: m.txHash });
    const receipt = await chain.getTransactionReceipt({ hash: m.txHash });
    const [event] = viem.parseEventLogs({ abi: tokenAbi, logs: receipt.logs, eventName: "SubscriptionTokensMinted" });
    ok(
      "mintSubscription CONFIRMED: enviada por el operador RWAXI, recibo exitoso en el bloque registrado",
      m.status === "CONFIRMED" &&
        m.executionMode === "RPC" &&
        sent.from.toLowerCase() === SETUP.operator.toLowerCase() &&
        m.signerAddress === SETUP.operator &&
        receipt.status === "success" &&
        m.blockNumber === receipt.blockNumber &&
        m.nonce === sent.nonce,
      `tx ${m.txHash.slice(0, 12)}… bloque ${m.blockNumber} nonce ${m.nonce}`,
    );
    ok(
      "evento SubscriptionTokensMinted(subscriptionId, wallet, 250, paymentEvidenceRef) = BD",
      event.args.subscriptionId === s1.onchainId &&
        event.args.investor.toLowerCase() === investor.walletAddress &&
        event.args.amount === 250n &&
        event.args.paymentEvidenceRef === s1.paymentEvidenceRef,
    );
    const balance = await chain.readContract({ address: SETUP.token, abi: tokenAbi, functionName: "balanceOf", args: [investor.walletAddress] });
    const processed = await chain.readContract({ address: SETUP.token, abi: tokenAbi, functionName: "processedSubscriptionIds", args: [s1.onchainId] });
    const final = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    ok("on-chain: balanceOf(wallet) = 250 y processedSubscriptionIds = true; Subscription MINTED", balance === 250n && processed === true && final.status === "MINTED" && final.mintTxHash === m.txHash);
    await shot(b, "rpc-desk", { fullPage: true });

    await a.goto(url("avista"), { waitUntil: "domcontentloaded" });
    await a.waitForSelector('[data-holding="en_wallet"]', { timeout: 90000 });
    ok("portafolio: 'En wallet' tras el recibo de la red", true);

    // ── Distribution: the issuer anchors the Merkle root (DISTRIBUTION_ROLE), RWAXI cannot ──
    const offering = await db.offering.findFirstOrThrow({ where: { organizationId: org.id }, include: { token: true } });
    await openBackofficeTab(b, "avista", "Distribuciones y Rendimientos");
    await b.waitForSelector(`[data-distribution-offering="${offering.code}"]`, { timeout: 90000 });
    await fill(b, `#dist-period-${offering.id}`, "2026-Q3");
    await fill(b, `#dist-amount-${offering.id}`, "10000");
    await b.waitForFunction((id) => !document.querySelector(`[data-declare-distribution="${id}"]`)?.disabled, { timeout: 10000 }, offering.id);
    await clickIn(b, `[data-distribution-offering="${offering.code}"]`, "Declarar y encolar raíz de Merkle");
    await b.waitForSelector('[data-distribution="2026-Q3"]', { timeout: 60000 });
    const dist = await db.distribution.findFirstOrThrow({ where: { offeringId: offering.id, period: "2026-Q3" } });
    const anchorTx = await db.chainTransaction.findFirstOrThrow({ where: { organizationId: org.id, kind: "DISTRIBUTION_ROOT_ANCHORED" } });
    ok(
      "anchorDistributionRoot() en cola contra el token en Hardhat; la mesa pide la tx del emisor (sin «Firmar y ejecutar»)",
      anchorTx.network === "HARDHAT" &&
        anchorTx.contractAddress.toLowerCase() === SETUP.token.toLowerCase() &&
        !!(await b.$(`[data-issuer-form="${anchorTx.id}"]`)) &&
        !(await b.$(`[data-anchor-execute="${anchorTx.id}"]`)),
    );
    const operatorAccount = viemAccounts.privateKeyToAccount(webEnv("OPERATOR_PRIVATE_KEY"));
    const refused = await chain
      .simulateContract({
        account: operatorAccount,
        address: SETUP.token,
        abi: tokenAbi,
        functionName: "anchorDistributionRoot",
        args: [dist.onchainId, dist.merkleRoot, 1_000_000n, BigInt(dist.totalUnits)],
      })
      .then(
        () => "",
        (e) => `${e.shortMessage ?? ""} ${e.message ?? ""}`,
      );
    ok("on-chain: el operador RWAXI no tiene DISTRIBUTION_ROLE (AccessControlUnauthorizedAccount)", /AccessControlUnauthorizedAccount/.test(refused), refused.split("\n")[0].trim());

    await openBackofficeTab(b, "avista", "Suscripciones y Pagos");
    await b.waitForSelector(`[data-queue-item="${anchorTx.id}"]`, { timeout: 90000 });
    await clickText(b, "Procesar cola en orden");
    await b.waitForFunction(() => /Nada ejecutable/.test(document.querySelector(".toast-wrap")?.textContent ?? ""), { timeout: 90000 });
    const anchorAfterRun = await db.chainTransaction.findUniqueOrThrow({ where: { id: anchorTx.id } });
    ok(
      "procesar la cola no envía anchorDistributionRoot con la clave de RWAXI (la mesa pide la tx del emisor)",
      anchorAfterRun.status === "PENDING" && anchorAfterRun.executionMode === null && !!(await b.$(`[data-officer-form="${anchorTx.id}"]`)),
    );

    const strayId = viem.keccak256(viem.toHex(`rwaxi.distribution:${offering.id}:stray`));
    const stray = await issuer.writeContract({
      address: SETUP.token,
      abi: tokenAbi,
      functionName: "anchorDistributionRoot",
      args: [strayId, dist.merkleRoot, 1_000_000n, BigInt(dist.totalUnits)],
    });
    await chain.waitForTransactionReceipt({ hash: stray });
    await openBackofficeTab(b, "avista", "Distribuciones y Rendimientos");
    await registerIssuerTx(b, anchorTx.id, stray);
    await waitAlert(b, /no emitió DistributionRootAnchored con los argumentos en cola/);
    ok(
      "tx del emisor para otro distributionId → rechazada (evento no coincide con la cola)",
      (await db.chainTransaction.findUniqueOrThrow({ where: { id: anchorTx.id } })).status === "PENDING",
      await alertText(b),
    );

    const anchorHash = await issuer.writeContract({
      address: SETUP.token,
      abi: tokenAbi,
      functionName: "anchorDistributionRoot",
      args: [dist.onchainId, dist.merkleRoot, BigInt(anchorTx.args.totalAmountCents), BigInt(anchorTx.args.snapshotSupply)],
    });
    const anchorReceipt = await chain.waitForTransactionReceipt({ hash: anchorHash });
    await registerIssuerTx(b, anchorTx.id, anchorHash);
    await b.waitForSelector('[data-distribution="2026-Q3"][data-distribution-status="ANCHORED"]', { timeout: 90000 });
    const anchored = await db.chainTransaction.findUniqueOrThrow({ where: { id: anchorTx.id } });
    const distAfter = await db.distribution.findUniqueOrThrow({ where: { id: dist.id } });
    ok(
      "anchorDistributionRoot CONFIRMED con hash, bloque y firmante reales del emisor; Distribution ANCHORED",
      anchored.status === "CONFIRMED" &&
        anchored.executionMode === "RPC" &&
        anchored.txHash === anchorHash &&
        anchored.blockNumber === anchorReceipt.blockNumber &&
        anchored.signerAddress === SETUP.issuer &&
        distAfter.status === "ANCHORED" &&
        distAfter.anchorTxHash === anchorHash,
      `bloque ${anchored.blockNumber}`,
    );
    const onchainRoot = await chain.readContract({ address: SETUP.token, abi: tokenAbi, functionName: "distributionRoots", args: [dist.onchainId] });
    ok("on-chain: distributionRoots(distributionId) = raíz de Merkle persistida en Neon", onchainRoot === dist.merkleRoot, onchainRoot);
    await shot(b, "rpc-distribution", { fullPage: true });

    // ── New developer on HARDHAT: RWAXI's operator deploys its registry through the factory ──
    const s = await (await browser.createBrowserContext()).newPage();
    s.on("pageerror", (e) => console.log("PAGEERROR(S)", e.message));
    const slug = `rpc-${crypto.randomBytes(3).toString("hex")}`;
    await lib.onboardTenant(s, {
      slug,
      legalName: `Desarrollos ${slug.toUpperCase()} S.A.S.`,
      displayName: `Desarrollos ${slug.toUpperCase()}`,
      nit: lib.nitOf(lib.randomNitBase()),
      network: "HARDHAT",
    });
    const newOrg = await db.organization.findUniqueOrThrow({ where: { slug }, include: { users: true } });
    const registryTx = await db.chainTransaction.findFirstOrThrow({ where: { organizationId: newOrg.id, kind: "TENANT_REGISTRY_DEPLOYED" } });
    ok(
      "alta en HARDHAT: deployTenantRegistry() en cola contra la RwaxiTenantFactory local (RWAXI_FACTORY_ADDRESS)",
      registryTx.network === "HARDHAT" && registryTx.contractAddress.toLowerCase() === SETUP.factory.toLowerCase(),
    );
    await lib.openGovernance(s);
    await clickIn(s, `[data-governance-row="${slug}"]`, "Desplegar registro");
    await s.waitForSelector("[data-governance-dialog]", { timeout: 30000 });
    await clickText(s, "Confirmar decisión", '[role="dialog"]');
    await s.waitForFunction(
      (sl) => document.querySelector(`[data-governance-row="${sl}"] [data-registry-status]`)?.dataset.registryStatus === "DEPLOYED",
      { timeout: 120000 },
      slug,
    );
    const deployed = await db.chainTransaction.findUniqueOrThrow({ where: { id: registryTx.id } });
    const orgAfter = await db.organization.findUniqueOrThrow({ where: { id: newOrg.id } });
    const deployReceipt = await chain.getTransactionReceipt({ hash: deployed.txHash });
    const deploySent = await chain.getTransaction({ hash: deployed.txHash });
    const onchainRegistry = await chain.readContract({ address: SETUP.factory, abi: factoryAbi, functionName: "tenantRegistries", args: [newOrg.onchainId] });
    ok(
      "deployTenantRegistry CONFIRMED: enviada por el operador RWAXI; el registro del evento = Organization.complianceRegistry = factory.tenantRegistries(orgId)",
      deployed.status === "CONFIRMED" &&
        deployed.executionMode === "RPC" &&
        deploySent.from.toLowerCase() === SETUP.operator.toLowerCase() &&
        deployReceipt.status === "success" &&
        onchainRegistry !== viem.zeroAddress &&
        orgAfter.complianceRegistry === onchainRegistry &&
        deployed.args.registry === onchainRegistry,
      onchainRegistry,
    );
    const admin2 = newOrg.users.find((u) => u.role === "TENANT_ADMIN");
    const officer2 = newOrg.users.find((u) => u.role === "COMPLIANCE_OFFICER");
    const OFFICER_ROLE = viem.keccak256(viem.toHex("COMPLIANCE_OFFICER_ROLE"));
    const hasRole = (role, who) => chain.readContract({ address: onchainRegistry, abi: registryAbi, functionName: "hasRole", args: [role, who] });
    const taxId = await chain.readContract({ address: onchainRegistry, abi: registryAbi, functionName: "organizationTaxId" });
    ok(
      "on-chain: el registro es del tenant (admin y oficial con sus roles, su NIT) y RWAXI no conserva ningún rol",
      (await hasRole(viem.zeroHash, admin2.walletAddress)) &&
        (await hasRole(OFFICER_ROLE, officer2.walletAddress)) &&
        !(await hasRole(viem.zeroHash, SETUP.operator)) &&
        !(await hasRole(OFFICER_ROLE, SETUP.operator)) &&
        taxId === newOrg.taxId,
      taxId,
    );
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})().catch(fail);
