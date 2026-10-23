// E2E · CHAIN_EXECUTION=rpc against a local Hardhat node (run it through run-rpc.cjs): custody split
// (the compliance officer signs approveInvestor with their wallet, RWAXI only sends mintSubscription)
// and confirmations backed by real receipts and on-chain state.
const lib = require("./lib.cjs");
const { launch, ownerDb, ok, fail, shot, url, viem, viemChains, abi, hardhatAccount } = lib;
const { clickText, toastText, alertText, waitAlert, openBackofficeTab } = lib;
const { RPC_URL } = require("./rpc-fixtures.cjs");

const SETUP = JSON.parse(process.env.E2E_RPC_SETUP || "null");
if (!SETUP) throw new Error("Ejecuta esta suite con run-rpc.cjs (despliega los contratos y fija E2E_RPC_SETUP)");
const tokenAbi = abi("RwaxiPropertyToken");
const registryAbi = abi("RwaxiComplianceRegistry");
const db = ownerDb();
const transport = viem.http(RPC_URL);
const chain = viem.createPublicClient({ chain: viemChains.hardhat, transport });
const officer = viem.createWalletClient({ account: hardhatAccount(1), chain: viemChains.hardhat, transport });

async function registerOfficerTx(page, chainTxId, txHash) {
  const sel = `[data-officer-form="${chainTxId}"] input`;
  await page.waitForSelector(sel, { timeout: 30000 });
  await page.$eval(sel, (i) => (i.value = ""));
  await page.type(sel, txHash);
  await clickText(page, "Registrar tx del Oficial", `[data-officer-form="${chainTxId}"]`);
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
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})().catch(fail);
