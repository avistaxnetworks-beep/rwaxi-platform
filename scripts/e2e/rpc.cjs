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
    // The agreed platform fee: fixed in the token, declared by the mint, the same the ledger accrued; no units to RWAXI.
    const [feeEvent] = viem.parseEventLogs({ abi: tokenAbi, logs: receipt.logs, eventName: "PlatformFeeAccrued" });
    const tokenFeeBps = await chain.readContract({ address: SETUP.token, abi: tokenAbi, functionName: "platformFeeBps" });
    const feeEntry = await db.feeLedgerEntry.findFirst({ where: { subscriptionId: sub.id, kind: "INFRASTRUCTURE_USAGE" } });
    const operatorUnits = await chain.readContract({ address: SETUP.token, abi: tokenAbi, functionName: "balanceOf", args: [SETUP.operator] });
    ok(
      "evento PlatformFeeAccrued(subscriptionId, wallet, 250, platformFeeBps) = comisión fijada en el token = asiento del libro mayor",
      feeEvent?.args.subscriptionId === s1.onchainId &&
        feeEvent.args.amount === 250n &&
        feeEvent.args.platformFeeBps === tokenFeeBps &&
        tokenFeeBps === SETUP.platformFeeBps &&
        feeEntry?.platformFeeBps === tokenFeeBps &&
        Number(feeEntry.amountUsd) === Math.round((Number(s1.capitalUsd) * tokenFeeBps) / 100) / 100 &&
        operatorUnits === 0n,
      `${tokenFeeBps} pb · asiento ${feeEntry?.amountUsd} USD`,
    );
    const balance = await chain.readContract({ address: SETUP.token, abi: tokenAbi, functionName: "balanceOf", args: [investor.walletAddress] });
    const processed = await chain.readContract({ address: SETUP.token, abi: tokenAbi, functionName: "processedSubscriptionIds", args: [s1.onchainId] });
    const final = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    ok("on-chain: balanceOf(wallet) = 250 y processedSubscriptionIds = true; Subscription MINTED", balance === 250n && processed === true && final.status === "MINTED" && final.mintTxHash === m.txHash);
    await shot(b, "rpc-desk", { fullPage: true });

    await a.goto(url("avista"), { waitUntil: "domcontentloaded" });
    await a.waitForSelector('[data-holding="en_wallet"]', { timeout: 90000 });
    ok("portafolio: 'En wallet' tras el recibo de la red", true);

    // ── Distribution: the register at the record date checked against the token's own history; the issuer
    //    anchors the Merkle root (DISTRIBUTION_ROLE), RWAXI cannot; the payment reads the whitelist on-chain ──
    const offering = await db.offering.findFirstOrThrow({ where: { organizationId: org.id }, include: { token: true } });
    await openBackofficeTab(b, "avista", "Distribuciones y Rendimientos");
    await b.waitForSelector(`[data-distribution-offering="${offering.code}"]`, { timeout: 90000 });
    await fill(b, `#dist-period-${offering.id}`, "2026-Q3");
    await b.select(`#dist-currency-${offering.id}`, "USD");
    await fill(b, `#dist-amount-${offering.id}`, "10000");
    const support = await lib.attachDistributionSupport(b, offering.id, "certificacion-fiduciaria-rpc");
    await b.waitForFunction((id) => !document.querySelector(`[data-declare-distribution="${id}"]`)?.disabled, { timeout: 10000 }, offering.id);
    await clickIn(b, `[data-distribution-offering="${offering.code}"]`, "Declarar y encolar raíz de Merkle");
    await b.waitForSelector('[data-distribution="2026-Q3"]', { timeout: 60000 });
    const dist = await db.distribution.findFirstOrThrow({ where: { offeringId: offering.id, period: "2026-Q3" } });
    const anchorTx = await db.chainTransaction.findFirstOrThrow({ where: { organizationId: org.id, kind: "DISTRIBUTION_ROOT_ANCHORED" } });
    const declared = await db.auditEvent.findFirstOrThrow({ where: { organizationId: org.id, action: "DISTRIBUTION_DECLARED", entityId: dist.id } });
    const supplyNow = await chain.readContract({ address: SETUP.token, abi: tokenAbi, functionName: "totalSupply" });
    ok(
      "declaración en RPC: el registro a la fecha de corte se cotejó con el token en Hardhat (oferta total y saldo de cada wallet) y la whitelist se leyó del registro",
      dist.snapshotMode === "RPC" &&
        declared.payload.onchainCheck?.supply === dist.totalUnits &&
        BigInt(dist.totalUnits) === supplyNow &&
        dist.supportSha256 === support.sha256 &&
        declared.payload.allocations.every((x) => x.whitelist === "CLEARED"),
      `${dist.totalUnits} tokens · ${declared.payload.onchainCheck?.source}`,
    );
    const anchorArgs = (id, supply = BigInt(anchorTx.args.snapshotSupply)) => [
      id,
      dist.merkleRoot,
      BigInt(anchorTx.args.totalAmountCents),
      supply,
      BigInt(anchorTx.args.recordTimestamp),
      anchorTx.args.currency,
      anchorTx.args.evidenceHash,
    ];
    ok(
      "anchorDistributionRoot() en cola contra el token en Hardhat, con la fecha de corte, «USD» y el SHA-256 del soporte; la mesa pide la tx del emisor",
      anchorTx.network === "HARDHAT" &&
        anchorTx.contractAddress.toLowerCase() === SETUP.token.toLowerCase() &&
        anchorTx.args.currency === "USD" &&
        anchorTx.args.evidenceHash === support.sha256 &&
        !!(await b.$(`[data-issuer-form="${anchorTx.id}"]`)) &&
        !(await b.$(`[data-anchor-execute="${anchorTx.id}"]`)),
    );
    const operatorAccount = viemAccounts.privateKeyToAccount(webEnv("OPERATOR_PRIVATE_KEY"));
    const simulateAnchor = (account, args) =>
      chain.simulateContract({ account, address: SETUP.token, abi: tokenAbi, functionName: "anchorDistributionRoot", args }).then(
        () => "",
        (e) => `${e.shortMessage ?? ""} ${e.message ?? ""}`,
      );
    const refused = await simulateAnchor(operatorAccount, anchorArgs(dist.onchainId));
    ok("on-chain: el operador RWAXI no tiene DISTRIBUTION_ROLE (AccessControlUnauthorizedAccount)", /AccessControlUnauthorizedAccount/.test(refused), refused.split("\n")[0].trim());
    // An eth_call runs on the latest block: one mined after the record instant, as the issuer's transaction will be.
    await chain.request({ method: "evm_mine", params: [] });
    const mismatch = await simulateAnchor(issuer.account, anchorArgs(dist.onchainId, BigInt(dist.totalUnits) + 1n));
    ok(
      "on-chain: el token rechaza una oferta total distinta a la de su historial a la fecha de corte (SnapshotSupplyMismatch)",
      /SnapshotSupplyMismatch/.test(mismatch),
      mismatch.split("\n")[0].trim(),
    );

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
    const stray = await issuer.writeContract({ address: SETUP.token, abi: tokenAbi, functionName: "anchorDistributionRoot", args: anchorArgs(strayId) });
    await chain.waitForTransactionReceipt({ hash: stray });
    await openBackofficeTab(b, "avista", "Distribuciones y Rendimientos");
    await registerIssuerTx(b, anchorTx.id, stray);
    await waitAlert(b, /no emitió DistributionRootAnchored con los argumentos en cola/);
    ok(
      "tx del emisor para otro distributionId → rechazada (evento no coincide con la cola)",
      (await db.chainTransaction.findUniqueOrThrow({ where: { id: anchorTx.id } })).status === "PENDING",
      await alertText(b),
    );

    const anchorHash = await issuer.writeContract({ address: SETUP.token, abi: tokenAbi, functionName: "anchorDistributionRoot", args: anchorArgs(dist.onchainId) });
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
    const [anchorEvent] = viem.parseEventLogs({ abi: tokenAbi, logs: anchorReceipt.logs, eventName: "DistributionRootAnchored" });
    ok(
      "evento DistributionRootAnchored: la fecha de corte, «USD» y el SHA-256 del soporte quedan on-chain",
      anchorEvent?.args.recordTimestamp === BigInt(anchorTx.args.recordTimestamp) &&
        anchorEvent.args.currency === "USD" &&
        anchorEvent.args.evidenceHash === support.sha256 &&
        anchorEvent.args.snapshotSupply === BigInt(dist.totalUnits),
    );
    const onchainRoot = await chain.readContract({ address: SETUP.token, abi: tokenAbi, functionName: "distributionRoots", args: [dist.onchainId] });
    ok("on-chain: distributionRoots(distributionId) = raíz de Merkle persistida en Neon", onchainRoot === dist.merkleRoot, onchainRoot);

    // The payment instruction reads the whitelist from the registry contract.
    await openBackofficeTab(b, "avista", "Distribuciones y Rendimientos");
    await b.waitForSelector('[data-distribution="2026-Q3"][data-distribution-status="ANCHORED"]', { timeout: 90000 });
    await clickIn(b, '[data-distribution="2026-Q3"]', "Emitir instrucción de pago");
    await b.waitForSelector('[data-distribution="2026-Q3"] [data-payout-batch="1"]', { timeout: 60000 });
    const batch = await db.distributionPayoutBatch.findFirstOrThrow({ where: { distributionId: dist.id } });
    const entry = await chain.readContract({ address: SETUP.registry, abi: registryAbi, functionName: "investor", args: [investor.walletAddress] });
    ok(
      "instrucción de pago en RPC: la whitelist se leyó del registro on-chain (wallet aprobada, no congelada)",
      batch.registryMode === "RPC" && batch.payees === 1 && batch.instruction.registry.mode === "RPC" && entry.isApproved && !entry.isFrozen,
    );

    // Tokens moved outside the platform's register: RWAXI's operator mints straight to the whitelisted wallet,
    // bypassing the outbox. The next declaration is refused: the register no longer matches the token.
    const rogueClient = viem.createWalletClient({ account: operatorAccount, chain: viemChains.hardhat, transport });
    const rogue = await rogueClient.writeContract({
      address: SETUP.token,
      abi: tokenAbi,
      functionName: "mintSubscription",
      args: [viem.keccak256(viem.toHex("rogue-mint")), investor.walletAddress, 5n, viem.keccak256(viem.toHex("sin-pago"))],
    });
    await chain.waitForTransactionReceipt({ hash: rogue });
    await openBackofficeTab(b, "avista", "Distribuciones y Rendimientos");
    await b.waitForSelector(`[data-distribution-offering="${offering.code}"]`, { timeout: 90000 });
    await fill(b, `#dist-period-${offering.id}`, "2026-Q4");
    await b.select(`#dist-currency-${offering.id}`, "USD");
    await fill(b, `#dist-amount-${offering.id}`, "500");
    await lib.attachDistributionSupport(b, offering.id, "certificacion-fiduciaria-q4");
    await b.waitForFunction((id) => !document.querySelector(`[data-declare-distribution="${id}"]`)?.disabled, { timeout: 10000 }, offering.id);
    await clickIn(b, `[data-distribution-offering="${offering.code}"]`, "Declarar y encolar raíz de Merkle");
    await waitAlert(b, /no coincide con el token on-chain/);
    ok(
      "un mint fuera del registro de la plataforma → la declaración se rechaza: oferta total on-chain distinta a la del registro",
      (await db.distribution.count({ where: { offeringId: offering.id, period: "2026-Q4" } })) === 0,
      await alertText(b),
    );
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

    // ── …and its offering's token: the factory fixes the developer's agreed platform fee in it ──
    const offering2 = await db.offering.findFirstOrThrow({ where: { organizationId: newOrg.id }, include: { token: true } });
    await lib.openGovernance(s);
    await s.waitForSelector(`[data-deploy-token="${offering2.id}"]:not([disabled])`, { timeout: 90000 });
    await clickIn(s, `[data-governance-row="${slug}"]`, "Desplegar token");
    await s.waitForSelector("[data-token-dialog]", { timeout: 30000 });
    await clickText(s, "Confirmar decisión", '[role="dialog"]');
    await s.waitForSelector(`[data-governance-row="${slug}"] [data-token-fee-bps]`, { timeout: 180000 });
    const tokenTx = await db.chainTransaction.findFirstOrThrow({ where: { organizationId: newOrg.id, kind: "OFFERING_TOKEN_DEPLOYED" } });
    const token2 = await db.tokenDeployment.findUniqueOrThrow({ where: { offeringId: offering2.id } });
    const tokenReceipt = await chain.getTransactionReceipt({ hash: tokenTx.txHash });
    const tokenSent = await chain.getTransaction({ hash: tokenTx.txHash });
    const [tokenEvent] = viem.parseEventLogs({ abi: factoryAbi, logs: tokenReceipt.logs, eventName: "OfferingTokenDeployed" });
    const onchainToken = await chain.readContract({ address: SETUP.factory, abi: factoryAbi, functionName: "offeringTokens", args: [offering2.token.onchainId] });
    ok(
      "deployOfferingToken CONFIRMED (RPC): enviada por el operador RWAXI; OfferingTokenDeployed = factory.offeringTokens(offeringId) = TokenDeployment DEPLOYED",
      tokenTx.status === "CONFIRMED" &&
        tokenTx.executionMode === "RPC" &&
        tokenSent.from.toLowerCase() === SETUP.operator.toLowerCase() &&
        tokenReceipt.status === "success" &&
        tokenEvent?.args.token === onchainToken &&
        tokenEvent.args.platformFeeBps === newOrg.platformFeeBps &&
        token2.status === "DEPLOYED" &&
        token2.contractAddress === onchainToken &&
        token2.platformFeeBps === newOrg.platformFeeBps &&
        token2.deployTxHash === tokenTx.txHash,
      onchainToken,
    );
    const read = (functionName, args = []) => chain.readContract({ address: onchainToken, abi: tokenAbi, functionName, args });
    const MINTER_ROLE = viem.keccak256(viem.toHex("MINTER_ROLE"));
    ok(
      "on-chain: comisión de plataforma fija en el token, raíz del Data Room anclada, roles del emisor en sus wallets y RWAXI solo con MINTER_ROLE",
      (await read("platformFeeBps")) === newOrg.platformFeeBps &&
        (await read("dataRoomMerkleRoot")) === offering2.dataRoomRoot &&
        (await read("hasRole", [viem.zeroHash, admin2.walletAddress])) &&
        (await read("hasRole", [OFFICER_ROLE, officer2.walletAddress])) &&
        (await read("hasRole", [MINTER_ROLE, SETUP.operator])) &&
        !(await read("hasRole", [viem.zeroHash, SETUP.operator])),
      `${await read("platformFeeBps")} pb`,
    );
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})().catch(fail);
