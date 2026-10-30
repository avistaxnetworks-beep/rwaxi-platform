// E2E · live vitrina catalogue (rwaxi_public_offerings), PAYMENT_PENDING subscriptions, fiduciary
// reconciliation in the backoffice and ordered execution of the ChainTransaction queue in SIMULATION
// mode, re-verifying every signed transaction independently with OPERATOR_PRIVATE_KEY.
const lib = require("./lib.cjs");
const { launch, ownerDb, ok, fail, shot, url, viem, viemAccounts, viemChains, abi, canon, sha256, webEnv } = lib;
const { waitText, clickText, clickIn, toastText, alertText, waitAlert, openBackofficeTab, replayAction } = lib;

const tokenAbi = abi("RwaxiPropertyToken");
const registryAbi = abi("RwaxiComplianceRegistry");
const CHAIN_ID = {
  POLYGON: viemChains.polygon.id,
  BASE: viemChains.base.id,
  POLYGON_AMOY: viemChains.polygonAmoy.id,
  BASE_SEPOLIA: viemChains.baseSepolia.id,
  HARDHAT: viemChains.hardhat.id,
};
// the executor's fixed gas (chain-executor.ts GAS): a first mint records the holder's balance history too
const GAS = { approveInvestor: 120000n, mintSubscription: 260000n };
const STAGE = { PRESALE: "preventa", STRUCTURING: "estructuracion", OPERATING: "operacion" };
const db = ownerDb();
// The operator key as the web app sees it (never printed): the suite re-signs independently.
const operator = viemAccounts.privateKeyToAccount(webEnv("OPERATOR_PRIVATE_KEY"));

const vitrinaCards = (p) =>
  p.$$eval("[data-offering]", (n) =>
    n.map((x) => ({
      code: x.dataset.offering,
      units: Number(x.dataset.unitsSubscribed),
      total: Number(x.dataset.totalUnits),
      ticket: Number(x.dataset.minTicket),
      stage: x.dataset.stage,
      label: x.querySelector("[data-units-label]")?.textContent,
    })),
  );
const catalog = () => db.$queryRaw`SELECT offering_code, units_subscribed, total_units, min_ticket_usd, stage, tenant_slug FROM rwaxi_public_offerings()`;

(async () => {
  const browser = await launch();
  try {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "avista" } });
    const offering0 = await db.offering.findFirstOrThrow({ where: { organizationId: org.id }, include: { token: true } });
    const admin = await db.user.findFirstOrThrow({ where: { organizationId: org.id, role: "TENANT_ADMIN", active: true }, orderBy: { createdAt: "asc" } });
    const officer = await db.user.findFirstOrThrow({ where: { organizationId: org.id, role: "COMPLIANCE_OFFICER", active: true }, orderBy: { createdAt: "asc" } });

    // ── 1 · Vitrina reads the public catalogue from Neon ────────────────────
    const v = await (await browser.createBrowserContext()).newPage();
    v.on("pageerror", (e) => console.log("PAGEERROR(V)", e.message));
    await v.goto(url(null), { waitUntil: "domcontentloaded", timeout: 180000 });
    await v.waitForSelector('[data-live-catalog="neon"] [data-offering]', { timeout: 180000 });
    const rows0 = await catalog();
    const cards0 = await vitrinaCards(v);
    ok("vitrina: catálogo en vivo desde rwaxi_public_offerings() (no el prototipo)", cards0.length === rows0.length && rows0.length === 3, `${cards0.length} ofertas`);
    ok(
      "vitrina: unidades comprometidas, total, ticket mínimo y etapa = Neon",
      rows0.every((r) => {
        const c = cards0.find((x) => x.code === r.offering_code);
        return c && c.units === r.units_subscribed && c.total === r.total_units && c.ticket === Number(r.min_ticket_usd) && c.stage === STAGE[r.stage];
      }),
      cards0.map((c) => `${c.code} ${c.label}`).join(" · "),
    );
    const avistaRow0 = rows0.find((r) => r.tenant_slug === "avista");

    // ── 2 · Investor: NDA → KYC → approval (whitelist queued) ──────────────
    const { page: a, investor } = await lib.onboardInvestor(browser, db, "avista");
    const b = await (await browser.createBrowserContext()).newPage();
    b.on("pageerror", (e) => console.log("PAGEERROR(B)", e.message));
    await lib.approveInvestor(b, "avista", investor.id);
    const approveTx = await db.chainTransaction.findFirstOrThrow({ where: { organizationId: org.id, kind: "INVESTOR_WHITELISTED", status: "PENDING" } });
    ok("KYC aprobado: approveInvestor() queda PENDING en la cola", approveTx.args.wallet === investor.walletAddress);

    // ── 3 · Signing the subscription only reserves units (PAYMENT_PENDING) ──
    await lib.subscribe(a, "avista");
    await clickText(a, "Ver mi portafolio");
    await a.waitForSelector('[data-holding="pago_pendiente"]', { timeout: 30000 });
    const sub1 = await db.subscription.findFirstOrThrow({ where: { investorId: investor.id }, orderBy: { createdAt: "asc" } });
    const offering1 = await db.offering.findUniqueOrThrow({ where: { id: offering0.id } });
    const audit1 = await db.auditEvent.findFirst({ where: { entityId: sub1.id, action: "SUBSCRIPTION_CREATED" } });
    const code1 = `SUB-${sub1.onchainId.slice(2, 10).toUpperCase()}`;
    ok("firma → Subscription PAYMENT_PENDING · 250 unidades · 25.000 USD", sub1.status === "PAYMENT_PENDING" && sub1.units === 250 && Number(sub1.capitalUsd) === 25000);
    ok("unidades reservadas atómicamente (Offering.unitsSubscribed +250)", offering1.unitsSubscribed === offering0.unitsSubscribed + 250, `${offering0.unitsSubscribed} → ${offering1.unitsSubscribed}`);
    ok(
      "agreementHash = SHA-256(JSON canónico del contrato firmado) — verificación independiente",
      sub1.agreementHash === sha256(canon(audit1?.payload?.agreement)) && audit1.subjectHash === sub1.agreementHash,
    );
    ok(
      "sin mint en cola, sin paymentEvidenceRef y sin comisión al firmar",
      (await db.chainTransaction.count({ where: { organizationId: org.id, kind: "SUBSCRIPTION_MINTED", status: "PENDING" } })) === 0 &&
        sub1.paymentEvidenceRef === null &&
        (await db.feeLedgerEntry.count({ where: { subscriptionId: sub1.id } })) === 0,
    );
    ok("portafolio: 'Pago pendiente' con la referencia de transferencia", audit1.payload.paymentCode === code1 && (await a.evaluate(() => document.body.innerText)).includes(code1), code1);

    await v.reload({ waitUntil: "domcontentloaded" });
    await v.waitForSelector('[data-live-catalog="neon"] [data-offering]', { timeout: 90000 });
    const avistaCard1 = (await vitrinaCards(v)).find((c) => c.code === avistaRow0.offering_code);
    ok("vitrina refleja la nueva reserva en vivo (+250 unidades comprometidas)", avistaCard1.units === avistaRow0.units_subscribed + 250, avistaCard1.label);

    await lib.subscribe(a, "avista"); // second subscription, to test reference reuse
    const sub2 = await db.subscription.findFirstOrThrow({ where: { investorId: investor.id, NOT: { id: sub1.id } } });

    // ── 4 · Backoffice: "Suscripciones y Pagos" ─────────────────────────────
    const actions = {};
    b.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (req.method() === "POST" && id) actions[req.postData() ?? ""] = id;
    });
    await openBackofficeTab(b, "avista", "Suscripciones y Pagos");
    await b.waitForSelector(`tr[data-subscription="${sub1.id}"][data-sub-status="PAYMENT_PENDING"]`, { timeout: 90000 });
    ok("la mesa lista ambas suscripciones como PAYMENT_PENDING", !!(await b.$(`tr[data-subscription="${sub2.id}"][data-sub-status="PAYMENT_PENDING"]`)));
    await shot(b, "payments-desk-payment-pending", { fullPage: true });

    const openPay = async (subId, reference) => {
      await clickIn(b, `tr[data-subscription="${subId}"]`, "Confirmar Pago Fiduciario");
      await b.waitForSelector("#pay-ref", { timeout: 30000 });
      await b.$eval("#pay-ref", (i) => (i.value = ""));
      await b.type("#pay-ref", reference);
    };

    // 4a · server-side validation of the receipt reference (tampered in flight)
    await openPay(sub1.id, "FID-2026-004512");
    await b.setRequestInterception(true);
    let tampered = false;
    const tamperRef = (req) => {
      if (req.method() === "POST" && req.headers()["next-action"] && !tampered && (req.postData() || "").includes("FID-2026-004512")) {
        tampered = true;
        req.continue({ postData: req.postData().replace("FID-2026-004512", "<x>") });
      } else req.continue();
    };
    b.on("request", tamperRef);
    await clickText(b, "Confirmar Pago Fiduciario", '[role="dialog"]');
    await waitAlert(b, /Referencia del comprobante inválida/);
    b.off("request", tamperRef);
    await b.setRequestInterception(false);
    ok("referencia alterada en tránsito → rechazada en el servidor, nada escrito", tampered && (await db.subscription.findUniqueOrThrow({ where: { id: sub1.id } })).status === "PAYMENT_PENDING");

    // 4b · real confirmation (lower case → normalised)
    await b.$eval("#pay-ref", (i) => (i.value = ""));
    await b.type("#pay-ref", "fid-2026-004512");
    await clickText(b, "Confirmar Pago Fiduciario", '[role="dialog"]');
    await b.waitForSelector(`tr[data-subscription="${sub1.id}"][data-sub-status="MINT_PENDING"]`, { timeout: 60000 });
    const toast1 = await toastText(b);
    const s1 = await db.subscription.findUniqueOrThrow({ where: { id: sub1.id } });
    const expectedRef = sha256(
      canon({ version: 1, kind: "rwaxi.subscription.payment", subscriptionId: s1.onchainId, agreementHash: s1.agreementHash, paymentReference: "FID-2026-004512" }),
    );
    const mint1 = await db.chainTransaction.findFirst({
      where: { organizationId: org.id, kind: "SUBSCRIPTION_MINTED", status: "PENDING", args: { path: ["subscriptionId"], equals: s1.onchainId } },
    });
    const fee1 = await db.feeLedgerEntry.findFirst({ where: { subscriptionId: sub1.id } });
    const pay1 = await db.auditEvent.findFirst({ where: { entityId: sub1.id, action: "PAYMENT_CONFIRMED" } });
    // the fee fixed in the offering's token (what its mint declares on-chain), else the agreed one
    const feeBps = offering0.token.platformFeeBps ?? org.platformFeeBps;
    const feeExpected = Math.round(250 * feeBps) / 100; // 25.000 USD × bps / 10.000
    ok(
      "Confirmar Pago Fiduciario → MINT_PENDING con referencia normalizada y conciliador",
      s1.status === "MINT_PENDING" && s1.paymentReference === "FID-2026-004512" && s1.paymentConfirmedById === admin.id && !!s1.paymentConfirmedAt,
      toast1,
    );
    ok("paymentEvidenceRef = SHA-256(contrato + referencia) — recalculado de forma independiente", s1.paymentEvidenceRef === expectedRef, expectedRef.slice(0, 18) + "…");
    ok(
      "ChainTransaction PENDING mintSubscription(subscriptionId, investor, 250, paymentEvidenceRef)",
      mint1?.contractAddress === offering0.token.contractAddress &&
        mint1.method === "mintSubscription(bytes32,address,uint256,bytes32)" &&
        mint1.args.investor === investor.walletAddress &&
        mint1.args.amount === 250 &&
        mint1.args.paymentEvidenceRef === expectedRef &&
        mint1.txHash === null,
    );
    ok(
      `FeeLedgerEntry INFRASTRUCTURE_USAGE ACCRUED = ${feeBps} pb (comisión del token) × 25.000 = ${feeExpected} USD`,
      fee1?.kind === "INFRASTRUCTURE_USAGE" &&
        fee1.status === "ACCRUED" &&
        Number(fee1.amountUsd) === feeExpected &&
        fee1.platformFeeBps === feeBps &&
        fee1.evidence === expectedRef,
    );
    ok(
      "AuditEvent PAYMENT_CONFIRMED enlaza evidencia, mint y comisión",
      pay1?.subjectHash === expectedRef &&
        pay1.actorEmail === admin.email &&
        pay1.payload.chainTransactionId === mint1?.id &&
        pay1.payload.feeLedgerEntryId === fee1?.id &&
        pay1.payload.platformFeeBps === feeBps &&
        pay1.payload.platformFeeSource === (offering0.token.platformFeeBps === null ? "agreement" : "token"),
    );

    // 4c · the same receipt cannot reconcile a second subscription
    await openPay(sub2.id, "FID-2026-004512");
    await clickText(b, "Confirmar Pago Fiduciario", '[role="dialog"]');
    await waitAlert(b, /ya se usó/);
    ok(
      "referencia de pago reutilizada → rechazada (UNIQUE organization_id + payment_reference), sin efectos",
      (await db.subscription.findUniqueOrThrow({ where: { id: sub2.id } })).status === "PAYMENT_PENDING" &&
        (await db.feeLedgerEntry.count({ where: { subscriptionId: sub2.id } })) === 0,
      await alertText(b),
    );
    await b.$eval("#pay-ref", (i) => (i.value = ""));
    await b.type("#pay-ref", "FID-2026-004513");
    await clickText(b, "Confirmar Pago Fiduciario", '[role="dialog"]');
    await b.waitForSelector(`tr[data-subscription="${sub2.id}"][data-sub-status="MINT_PENDING"]`, { timeout: 60000 });
    const s2 = await db.subscription.findUniqueOrThrow({ where: { id: sub2.id } });
    const mint2 = await db.chainTransaction.findFirstOrThrow({
      where: { organizationId: org.id, kind: "SUBSCRIPTION_MINTED", status: "PENDING", args: { path: ["subscriptionId"], equals: s2.onchainId } },
    });

    // ── 5 · Precedence: the mints wait for approveInvestor() ────────────────
    await b.waitForSelector(`[data-queue-item="${mint1.id}"][data-blocked="true"]`, { timeout: 30000 });
    const blockedText = await b.$eval(`tr[data-subscription="${sub1.id}"] [data-mint-blocked]`, (n) => n.textContent);
    ok(
      "mesa: el mint muestra el bloqueo por prelación y el approveInvestor está listo",
      /Prelación/.test(blockedText) && !!(await b.$(`[data-queue-item="${approveTx.id}"][data-blocked="false"]`)),
      blockedText,
    );

    // The UI disables the button; the server enforces it too: swap the approve id for the mint id in flight.
    await b.setRequestInterception(true);
    let swapped = false;
    const swap = (req) => {
      if (req.method() === "POST" && req.headers()["next-action"] && !swapped && (req.postData() || "").includes(approveTx.id)) {
        swapped = true;
        req.continue({ postData: req.postData().replace(approveTx.id, mint1.id) });
      } else req.continue();
    };
    b.on("request", swap);
    await clickIn(b, `[data-queue-item="${approveTx.id}"]`, "Firmar y ejecutar");
    await waitAlert(b, /Prelación/);
    b.off("request", swap);
    await b.setRequestInterception(false);
    const mint1After = await db.chainTransaction.findUniqueOrThrow({ where: { id: mint1.id } });
    const approveAfter = await db.chainTransaction.findUniqueOrThrow({ where: { id: approveTx.id } });
    ok("ejecutar el mint antes del approveInvestor (petición forjada) → rechazado por el servidor", swapped && mint1After.status === "PENDING" && approveAfter.status === "PENDING", await alertText(b));

    // ── 6 · Tenant isolation of the actions (replayed from elpoblado's host) ──
    const executeId = Object.entries(actions).find(([body]) => body.includes(approveTx.id))?.[1];
    const confirmId = Object.entries(actions).find(([body]) => body.includes("FID-2026-004513"))?.[1];
    const e = await (await browser.createBrowserContext()).newPage();
    await openBackofficeTab(e, "elpoblado", "Suscripciones y Pagos");
    const crossExec = await replayAction(e, executeId, [approveTx.id]);
    const crossPay = await replayAction(e, confirmId, [sub2.id, "FID-2026-009999"]);
    ok(
      "desde elpoblado.localhost no se puede ejecutar ni conciliar nada de avista (RLS)",
      /no encontrada en este tenant/.test(crossExec) &&
        /no encontrada en este tenant/.test(crossPay) &&
        (await db.chainTransaction.findUniqueOrThrow({ where: { id: approveTx.id } })).status === "PENDING",
      executeId && confirmId ? "ids de acción capturados" : "sin ids",
    );
    await e.browserContext().close();

    // ── 7 · Ordered execution of the whole queue ───────────────────────────
    const pendingBefore = await db.chainTransaction.count({ where: { organizationId: org.id, status: "PENDING" } });
    const prevNonce = (
      await db.chainTransaction.aggregate({
        where: { executionMode: "SIMULATION", signerAddress: operator.address, network: approveTx.network },
        _max: { nonce: true },
      })
    )._max.nonce;
    await clickText(b, "Procesar cola en orden");
    await b.waitForSelector(`tr[data-subscription="${sub2.id}"][data-sub-status="MINTED"]`, { timeout: 90000 });
    const toastQueue = await toastText(b);
    const done = await db.chainTransaction.findMany({ where: { id: { in: [approveTx.id, mint1.id, mint2.id] } } });
    const [txA, txM1, txM2] = [approveTx.id, mint1.id, mint2.id].map((id) => done.find((t) => t.id === id));
    ok(
      "cola procesada en orden: approveInvestor → mint 1 → mint 2, todas CONFIRMED",
      pendingBefore === 3 && done.every((t) => t.status === "CONFIRMED" && t.executionMode === "SIMULATION") && txA.executedAt < txM1.executedAt && txM1.executedAt < txM2.executedAt,
      toastQueue,
    );
    const base = prevNonce === null ? 0 : prevNonce + 1;
    ok("nonces secuenciales y globales del operador", txA.nonce === base && txM1.nonce === base + 1 && txM2.nonce === base + 2, `${txA.nonce}, ${txM1.nonce}, ${txM2.nonce}`);

    const norm = (_, x) => (typeof x === "bigint" || typeof x === "number" ? String(x) : typeof x === "string" ? x.toLowerCase() : x);
    const verify = async (tx, contractAbi, fn, args) => {
      const parsed = viem.parseTransaction(tx.signedTransaction);
      const signer = await viem.recoverTransactionAddress({ serializedTransaction: tx.signedTransaction });
      const decoded = viem.decodeFunctionData({ abi: contractAbi, data: parsed.data });
      const resigned = await operator.signTransaction({
        type: "eip1559",
        chainId: CHAIN_ID[tx.network],
        nonce: tx.nonce,
        to: tx.contractAddress,
        data: parsed.data,
        value: 0n,
        gas: GAS[fn],
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 1000000000n,
      });
      return {
        hash: tx.txHash === viem.keccak256(tx.signedTransaction),
        signer: signer === operator.address && tx.signerAddress === operator.address,
        chain: parsed.chainId === CHAIN_ID[tx.network] && parsed.nonce === tx.nonce && parsed.to.toLowerCase() === tx.contractAddress.toLowerCase(),
        call: decoded.functionName === fn && JSON.stringify(decoded.args, norm) === JSON.stringify(args.map((x) => String(x).toLowerCase())),
        deterministic: resigned === tx.signedTransaction,
      };
    };
    const checks = [
      ["approveInvestor", await verify(txA, registryAbi, "approveInvestor", [investor.walletAddress, approveTx.args.countryCode, approveTx.args.kycDossierHash])],
      ["mint 1", await verify(txM1, tokenAbi, "mintSubscription", [s1.onchainId, investor.walletAddress, 250, expectedRef])],
      ["mint 2", await verify(txM2, tokenAbi, "mintSubscription", [s2.onchainId, investor.walletAddress, 250, s2.paymentEvidenceRef])],
    ];
    for (const [label, r] of checks) {
      ok(
        `${label}: txHash = keccak256(tx firmada) · firmante recuperado = operador · chainId/nonce/to · calldata · firma determinista (RFC 6979)`,
        Object.values(r).every(Boolean),
        JSON.stringify(r),
      );
    }

    const finalSubs = await db.subscription.findMany({ where: { id: { in: [sub1.id, sub2.id] } } });
    const kyc = await db.kycCase.findFirstOrThrow({ where: { investorId: investor.id }, orderBy: { createdAt: "desc" } });
    const audits = await db.auditEvent.findMany({ where: { organizationId: org.id, action: { in: ["CHAIN_TX_CONFIRMED", "SUBSCRIPTION_MINTED"] } } });
    ok(
      "Subscription → MINTED con mintTxHash = hash del mint confirmado",
      finalSubs.every((s) => s.status === "MINTED") &&
        finalSubs.find((s) => s.id === sub1.id).mintTxHash === txM1.txHash &&
        finalSubs.find((s) => s.id === sub2.id).mintTxHash === txM2.txHash,
    );
    ok("KycCase.whitelistTxHash = hash del approveInvestor confirmado", kyc.whitelistTxHash === txA.txHash);
    ok(
      "AuditEvent: 3 CHAIN_TX_CONFIRMED + 2 SUBSCRIPTION_MINTED, actor según el rol del contrato",
      audits.filter((x) => x.action === "CHAIN_TX_CONFIRMED").length === 3 &&
        audits.filter((x) => x.action === "SUBSCRIPTION_MINTED").length === 2 &&
        audits.find((x) => x.entityId === txA.id).actorEmail === officer.email &&
        audits.find((x) => x.entityId === txM1.id).actorEmail === admin.email,
    );
    const again = await replayAction(b, executeId, [mint1.id]);
    ok("re-ejecutar un mint confirmado → rechazado (idempotente)", /ya no está PENDING/.test(again) && (await db.chainTransaction.findUniqueOrThrow({ where: { id: mint1.id } })).txHash === txM1.txHash);
    await shot(b, "payments-desk-minted", { fullPage: true });

    // ── 8 · Portal, Inspector and Super-Admin reflect the confirmations ─────
    await a.goto(url("avista"), { waitUntil: "domcontentloaded" });
    await waitText(a, "Firmar contrato del vehículo y suscribir");
    await clickText(a, "Ver mi portafolio").catch(() => {});
    await a.waitForFunction(() => document.querySelectorAll('[data-holding="en_wallet"]').length >= 2, { timeout: 60000 });
    ok("portafolio del inversionista: ambas suscripciones 'En wallet'", (await a.$$('[data-holding="en_wallet"]')).length === 2);

    await clickText(b, "Inspector On-Chain");
    await b.waitForSelector('[role="dialog"]', { timeout: 30000 });
    await clickText(b, "Cola PostgreSQL");
    await b.waitForSelector("[data-execution-mode]", { timeout: 60000 });
    await clickText(b, "Todas");
    await b.waitForFunction(
      () => [...document.querySelectorAll('[data-chain-tx="CONFIRMED"]')].some((n) => n.querySelector('[data-execution="SIMULATION"]') && n.innerText.includes("mintSubscription")),
      { timeout: 60000 },
    );
    const inspectorMode = await b.$eval("[data-execution-mode]", (n) => n.dataset.executionMode);
    ok("inspector: modo SIMULACIÓN, filas confirmadas con signer y nonce", inspectorMode === "SIMULATION" && (await b.$$('[data-chain-tx="CONFIRMED"] [data-execution="SIMULATION"]')).length === 3);
    await shot(b, "payments-inspector-confirmed");

    const s = await (await browser.createBrowserContext()).newPage();
    await s.goto(url("admin"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await s.waitForSelector("[data-platform-overview]", { timeout: 180000 });
    const kpi = Object.fromEntries(await s.$$eval("[data-kpi]", (n) => n.map((x) => [x.dataset.kpi, JSON.parse(x.dataset.value)])));
    const minted = Number((await db.subscription.aggregate({ where: { status: "MINTED" }, _sum: { capitalUsd: true } }))._sum.capitalUsd);
    const accrued = Number((await db.feeLedgerEntry.aggregate({ where: { status: "ACCRUED" }, _sum: { amountUsd: true } }))._sum.amountUsd);
    ok(
      "Super-Admin: volumen en wallet y comisiones devengadas incluyen las 2 emisiones",
      kpi.volume.mintedUsd === minted && kpi.volume.paymentPendingUsd === 0 && Math.abs(kpi.fees.ACCRUED - accrued) < 0.005 && accrued >= 2 * feeExpected,
      `en wallet ${minted} · ACCRUED ${accrued}`,
    );
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})().catch(fail);
