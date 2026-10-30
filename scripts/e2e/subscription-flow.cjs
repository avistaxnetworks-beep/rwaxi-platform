// E2E · subscription and conversion of investors on a freshly onboarded developer, in the approved operating order,
// against Neon (SIMULATION):
//   STRUCTURING with its Data Room → the compliance registry (official wallets) → raising opened only with the
//   registry, the official wallets and an active compliance officer (checked again by the server) → an investor
//   signs the NDA (tenant legal wall, SHA-256), passes KYC and reserves in pre-sale: the subscription carries the
//   platform fee estimate (never in the agreement the investor signs) → RWAXI's console deploys the offering's
//   ERC-3643 token through the factory (same requirements, checked again by the server) with the agreed fee fixed in
//   it → the reservation becomes payable (SUB-… reference) → the fiat payment is reconciled (fee accrued at the
//   token's bps) → the mint declares PlatformFeeAccrued with that fee. Fiat never moves through RWAXI.
const crypto = require("crypto");
const lib = require("./lib.cjs");
const { launch, ownerDb, ok, fail, shot, url, viem, canon, sha256 } = lib;
const { nitOf, randomNitBase, clickText, clickIn, waitText, waitAlert, alertText, toastText, openGovernance, onboardTenant, openBackofficeTab, replayAction } = lib;

const db = ownerDb();
const auditHash = (e) => sha256(canon({ action: e.action, organizationId: e.organizationId, entityId: e.entityId, ...e.payload }));
const feeOf = (capitalUsd, bps) => Math.round((Number(capitalUsd) * bps) / 100) / 100;

(async () => {
  const browser = await launch();
  try {
    const s = await (await browser.createBrowserContext()).newPage();
    s.on("pageerror", (e) => console.log("PAGEERROR(S)", e.message));
    const consoleActions = {};
    s.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (req.method() === "POST" && id) consoleActions[req.postData() ?? ""] = id;
    });

    // ── 1 · Onboarding: STRUCTURING, its Data Room, the registry queued with the official wallets ──
    const suffix = crypto.randomBytes(3).toString("hex");
    const slug = `flujo-${suffix}`;
    await onboardTenant(s, {
      slug,
      legalName: `Inversiones Flujo ${suffix.toUpperCase()} S.A.S.`,
      displayName: `Flujo ${suffix.toUpperCase()}`,
      nit: nitOf(randomNitBase()),
    });
    const org = await db.organization.findUniqueOrThrow({ where: { slug }, include: { users: true, offerings: { include: { token: true, documents: true } } } });
    const offering = org.offerings[0];
    const code = offering.code;
    const admin = org.users.find((u) => u.role === "TENANT_ADMIN");
    const officer = org.users.find((u) => u.role === "COMPLIANCE_OFFICER");
    ok(
      "alta: oferta en STRUCTURING con su Data Room, token sin desplegar y comisión pactada en la organización",
      offering.status === "STRUCTURING" && offering.documents.length > 0 && !!offering.dataRoomRoot && offering.token.status === "NOT_DEPLOYED" && org.platformFeeBps >= 25,
      `${code} · ${offering.documents.length} documentos · ${org.platformFeeBps} pb`,
    );

    // ── 2 · Before the registry: no token, no raise (UI) ──
    await openGovernance(s);
    await s.waitForSelector(`[data-deploy-token="${offering.id}"]`, { timeout: 60000 });
    const tokenCell = await s.$eval(`[data-token-deploy="${code}"]`, (n) => ({
      disabled: n.querySelector("[data-deploy-token]").disabled,
      gaps: n.querySelector("[data-token-gaps]")?.textContent ?? "",
    }));
    const b = await (await browser.createBrowserContext()).newPage();
    b.on("pageerror", (e) => console.log("PAGEERROR(B)", e.message));
    await openBackofficeTab(b, slug, "Suscripciones y Pagos");
    await b.waitForSelector("[data-raising-gaps]", { timeout: 90000 });
    const raisingGaps = await b.$eval("[data-raising-gaps]", (n) => n.textContent);
    const activeDisabled = await b.$eval(`[data-set-status="${code}:ACTIVE"]`, (n) => n.disabled);
    ok(
      "sin registro de cumplimiento: «Desplegar token» y «Abrir captación» deshabilitados, con el requisito pendiente",
      tokenCell.disabled && /registro de cumplimiento/.test(tokenCell.gaps) && /registro de cumplimiento/.test(raisingGaps) && activeDisabled,
      tokenCell.gaps.slice(0, 80),
    );

    // ── 3 · RWAXI deploys the registry (official wallets) ──
    await clickIn(s, `[data-governance-row="${slug}"]`, "Desplegar registro");
    await s.waitForSelector("[data-governance-dialog]", { timeout: 30000 });
    await clickText(s, "Confirmar decisión", '[role="dialog"]');
    await s.waitForFunction((sl) => document.querySelector(`[data-governance-row="${sl}"] [data-registry-status]`)?.dataset.registryStatus === "DEPLOYED", { timeout: 90000 }, slug);

    // ── 4 · Opening the raise: the server checks the compliance officer again ──
    await openBackofficeTab(b, slug, "Suscripciones y Pagos");
    await b.waitForSelector(`[data-set-status="${code}:ACTIVE"]:not([disabled])`, { timeout: 90000 });
    await db.user.update({ where: { id: officer.id }, data: { walletAddress: null } }); // after the page said "ready"
    await b.click(`[data-set-status="${code}:ACTIVE"]`);
    await b.waitForSelector("[data-confirm-status]", { timeout: 30000 });
    await b.click("[data-confirm-status]");
    await waitAlert(b, /No se puede abrir la captación/);
    const refusedRaise = await alertText(b);
    ok(
      "servidor: abrir la captación sin la wallet oficial del Oficial de Cumplimiento → rechazado, sigue en STRUCTURING",
      /Falta la wallet oficial del Oficial de Cumplimiento/.test(refusedRaise) &&
        (await db.offering.findUniqueOrThrow({ where: { id: offering.id } })).status === "STRUCTURING",
      refusedRaise.slice(0, 90),
    );
    await db.user.update({ where: { id: officer.id }, data: { walletAddress: officer.walletAddress } });
    await openBackofficeTab(b, slug, "Suscripciones y Pagos");
    await b.waitForSelector(`[data-set-status="${code}:ACTIVE"]:not([disabled])`, { timeout: 90000 });
    await b.click(`[data-set-status="${code}:ACTIVE"]`);
    await b.waitForSelector("[data-confirm-status]", { timeout: 30000 });
    await b.click("[data-confirm-status]");
    await b.waitForSelector(`[data-raising-offering="${code}"][data-offering-status="ACTIVE"]`, { timeout: 90000 });
    ok("con registro, wallets oficiales y Oficial de Cumplimiento: captación abierta (ACTIVE)", (await db.offering.findUniqueOrThrow({ where: { id: offering.id } })).status === "ACTIVE");

    // ── 5 · The investor: NDA (tenant legal wall), KYC, approval ──
    const { page: inv, investor } = await lib.onboardInvestor(browser, db, slug);
    const nda = await db.ndaAcceptance.findFirstOrThrow({ where: { investorId: investor.id, offeringId: offering.id } });
    const invRow = await db.investor.findUniqueOrThrow({ where: { id: investor.id } });
    ok(
      "muro legal del tenant: NDA con su SHA-256 y el inversionista marcado (tenantNdaAccepted, fecha)",
      /^0x[0-9a-f]{64}$/.test(nda.documentHash) && invRow.tenantNdaAccepted && invRow.tenantNdaDate?.getTime() === nda.acceptedAt.getTime(),
      nda.documentHash.slice(0, 18),
    );
    await lib.approveInvestor(b, slug, investor.id);

    // ── 6 · Pre-sale reservation linked to the platform fee (never in the investor's agreement) ──
    await inv.goto(url(slug), { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitText(inv, "Firmar contrato y reservar unidades");
    await clickText(inv, "Firmar contrato y reservar unidades");
    await inv.waitForSelector("#ack1", { timeout: 30000 });
    for (const id of ["#ack1", "#ack2", "#ack3"]) await inv.click(id);
    await clickText(inv, "Firmar y confirmar");
    await waitText(inv, "Ver mi portafolio", 60000);
    const sub = await db.subscription.findFirstOrThrow({ where: { investorId: investor.id }, orderBy: { createdAt: "desc" } });
    const created = await db.auditEvent.findFirstOrThrow({ where: { entityId: sub.id, action: "SUBSCRIPTION_CREATED" } });
    const agreement = created.payload.agreement;
    ok(
      "reserva de pre-venta (RESERVED) vinculada a la comisión pactada: bps y comisión estimada en la suscripción",
      sub.status === "RESERVED" && sub.platformFeeBps === org.platformFeeBps && Number(sub.platformFeeUsd) === feeOf(sub.capitalUsd, org.platformFeeBps),
      `${sub.units} unidades · ${sub.capitalUsd} USD · ${sub.platformFeeBps} pb = ${sub.platformFeeUsd} USD`,
    );
    ok(
      "acuerdo v3: cita el SHA-256 del NDA, su hash = agreementHash, y no incluye la comisión (B2B, la paga el desarrollador)",
      agreement.version === 3 &&
        agreement.nda.documentHash === nda.documentHash &&
        sha256(canon(agreement)) === sub.agreementHash &&
        created.subjectHash === sub.agreementHash &&
        !("platformFee" in agreement) &&
        created.payload.platformFee.platformFeeBps === org.platformFeeBps &&
        created.payload.platformFee.payer === "developer" &&
        created.payload.platformFee.source === "agreement",
    );

    // ── 7 · RWAXI deploys the token: the server checks the official wallets again ──
    await openGovernance(s);
    await s.waitForSelector(`[data-deploy-token="${offering.id}"]:not([disabled])`, { timeout: 90000 });
    const reservations = await s.$eval(`[data-token-deploy="${code}"] [data-reservations]`, (n) => n.dataset.reservations).catch(() => null);
    await db.user.update({ where: { id: admin.id }, data: { walletAddress: null } }); // after the console said "ready"
    await clickIn(s, `[data-governance-row="${slug}"]`, "Desplegar token");
    await s.waitForSelector("[data-token-dialog]", { timeout: 30000 });
    await clickText(s, "Confirmar decisión", '[role="dialog"]');
    await waitAlert(s, /No se puede desplegar el token/);
    const refusedToken = await alertText(s);
    ok(
      "servidor: desplegar el token sin la wallet oficial del Administrador → rechazado, nada en cola",
      /Falta la wallet oficial del Administrador/.test(refusedToken) &&
        (await db.chainTransaction.count({ where: { organizationId: org.id, kind: "OFFERING_TOKEN_DEPLOYED" } })) === 0 &&
        (await db.tokenDeployment.findUniqueOrThrow({ where: { offeringId: offering.id } })).status === "NOT_DEPLOYED",
      refusedToken.slice(0, 90),
    );
    await clickText(s, "Cancelar", '[role="dialog"]');
    await db.user.update({ where: { id: admin.id }, data: { walletAddress: admin.walletAddress } });
    await openGovernance(s);
    await s.waitForSelector(`[data-deploy-token="${offering.id}"]:not([disabled])`, { timeout: 90000 });
    await clickIn(s, `[data-governance-row="${slug}"]`, "Desplegar token");
    await s.waitForSelector("[data-token-dialog]", { timeout: 30000 });
    await clickText(s, "Confirmar decisión", '[role="dialog"]');
    await s.waitForSelector(`[data-governance-row="${slug}"] [data-token-fee-bps="${org.platformFeeBps}"]`, { timeout: 90000 });
    const toast = await toastText(s);

    const tokenTx = await db.chainTransaction.findFirstOrThrow({ where: { organizationId: org.id, kind: "OFFERING_TOKEN_DEPLOYED" } });
    const token = await db.tokenDeployment.findUniqueOrThrow({ where: { offeringId: offering.id } });
    const made = await db.chainTransaction.count({
      where: {
        id: { not: tokenTx.id },
        network: tokenTx.network,
        status: "CONFIRMED",
        executionMode: "SIMULATION",
        kind: { in: ["TENANT_REGISTRY_DEPLOYED", "OFFERING_TOKEN_DEPLOYED"] },
        contractAddress: { equals: tokenTx.contractAddress, mode: "insensitive" },
      },
    });
    const expected = viem.getContractAddress({ from: tokenTx.contractAddress, nonce: BigInt(1 + made) });
    ok(
      "deployOfferingToken CONFIRMED por el operador RWAXI: TokenConfig con la comisión pactada, raíz del Data Room y wallets oficiales",
      tokenTx.status === "CONFIRMED" &&
        tokenTx.executionMode === "SIMULATION" &&
        tokenTx.args.cfg.platformFeeBps === org.platformFeeBps &&
        tokenTx.args.cfg.dataRoomMerkleRoot === offering.dataRoomRoot &&
        tokenTx.args.cfg.maxSupplyCap === offering.token.maxSupply &&
        tokenTx.args.tenantAdmin === admin.walletAddress &&
        tokenTx.args.complianceOfficer === officer.walletAddress &&
        tokenTx.txHash === viem.keccak256(tokenTx.signedTransaction),
      tokenTx.method,
    );
    ok(
      "token DEPLOYED en CREATE(factory, nonce) recalculada, con la comisión fija (TokenDeployment.platformFeeBps)",
      token.status === "DEPLOYED" && token.contractAddress === expected && tokenTx.args.token === expected && token.platformFeeBps === org.platformFeeBps && token.deployTxHash === tokenTx.txHash,
      `${expected} · ${toast.slice(0, 60)}`,
    );
    const queuedAudit = await db.auditEvent.findFirst({ where: { organizationId: org.id, action: "OFFERING_TOKEN_DEPLOYMENT_QUEUED" } });
    const confirmedAudit = await db.auditEvent.findFirst({ where: { organizationId: org.id, action: "CHAIN_TX_CONFIRMED", entityId: tokenTx.id } });
    ok(
      "AuditEvent OFFERING_TOKEN_DEPLOYMENT_QUEUED (hash recalculable, comisión, reservas) y CHAIN_TX_CONFIRMED con las reservas abiertas",
      queuedAudit?.subjectHash === auditHash(queuedAudit) &&
        queuedAudit.payload.platformFeeBps === org.platformFeeBps &&
        queuedAudit.payload.reservations === 1 &&
        reservations === "1" &&
        confirmedAudit?.payload.created === expected &&
        confirmedAudit.payload.reservationsOpened === 1,
    );

    // ── 8 · The reservation becomes payable ──
    const opened = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    const openedAudit = await db.auditEvent.findFirst({ where: { entityId: sub.id, action: "SUBSCRIPTION_PAYMENT_OPENED" } });
    const paymentCode = `SUB-${sub.onchainId.slice(2, 10).toUpperCase()}`;
    ok(
      "la reserva pasa a PAYMENT_PENDING con su referencia SUB-… y la comisión fijada en el token (auditado, cita el contrato)",
      opened.status === "PAYMENT_PENDING" &&
        opened.platformFeeBps === token.platformFeeBps &&
        openedAudit?.payload.paymentCode === paymentCode &&
        openedAudit.payload.from === "RESERVED" &&
        openedAudit.subjectHash === sub.agreementHash,
      paymentCode,
    );
    await inv.goto(url(slug), { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitText(inv, paymentCode, 120000);
    ok("portal: el inversionista ve su referencia de transferencia para el pago fiduciario", true, paymentCode);

    // ── 9 · Fiat payment reconciled → fee accrued at the token's bps → mint declares PlatformFeeAccrued ──
    await openBackofficeTab(b, slug, "Suscripciones y Pagos");
    await lib.confirmPayment(b, sub.id, `FID-FLOW-${suffix.toUpperCase()}`);
    const fee = await db.feeLedgerEntry.findFirstOrThrow({ where: { subscriptionId: sub.id, kind: "INFRASTRUCTURE_USAGE" } });
    const reconciled = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    ok(
      "pago conciliado: comisión INFRASTRUCTURE_USAGE ACCRUED a los bps del token = la estimada; la suscripción guarda la devengada",
      fee.status === "ACCRUED" &&
        fee.platformFeeBps === token.platformFeeBps &&
        Number(fee.amountUsd) === feeOf(sub.capitalUsd, token.platformFeeBps) &&
        Number(reconciled.platformFeeUsd) === Number(fee.amountUsd) &&
        reconciled.status === "MINT_PENDING",
      `${fee.amountUsd} USD`,
    );
    await clickText(b, "Procesar cola en orden");
    await b.waitForSelector(`tr[data-subscription="${sub.id}"][data-sub-status="MINTED"]`, { timeout: 120000 });
    const mintedAudit = await db.auditEvent.findFirst({ where: { entityId: sub.id, action: "SUBSCRIPTION_MINTED" } });
    const pf = mintedAudit?.payload.platformFee;
    ok(
      "mint confirmado: PlatformFeeAccrued con la comisión del token, enlazado al asiento del libro mayor (simulación: no observado en red)",
      pf?.event === "PlatformFeeAccrued" &&
        pf.platformFeeBps === token.platformFeeBps &&
        pf.feeLedgerEntryId === fee.id &&
        pf.matchesLedger === true &&
        pf.observedOnChain === false &&
        mintedAudit.payload.mode === "SIMULATION",
      JSON.stringify(pf),
    );
    await shot(b, "subscription-flow-desk", { fullPage: true });

    // ── 10 · Replays: the token is deployed once ──
    const deployId = Object.entries(consoleActions).find(([body]) => body.includes(offering.id))?.[1];
    const again = deployId ? await replayAction(s, deployId, [offering.id]) : "sin id de acción";
    ok(
      "acción reenviada: el token ya está desplegado, nada cambia",
      /ya está desplegado/.test(again) && (await db.chainTransaction.count({ where: { organizationId: org.id, kind: "OFFERING_TOKEN_DEPLOYED" } })) === 1,
    );
  } catch (e) {
    fail(e);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})();
