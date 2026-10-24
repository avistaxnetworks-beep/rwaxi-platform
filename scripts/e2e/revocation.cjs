// E2E · compliance after approval (SAGRILAFT/SARLAFT), CHAIN_EXECUTION=simulation, from the backoffice inbox:
//   · setFrozen(wallet, true/false) of an investor holding minted tokens, with the officer's justification —
//     queued with INVESTOR_FREEZE_REQUESTED and signed from the on-chain queue; a frozen (or freezing) wallet takes
//     no new subscription and its pending mint would revert;
//   · the revocation of an approved investor in one transaction: KYC REVOKED with its ground and note, Data Room
//     grants revoked, every unminted subscription CANCELLED with its units back to the offering, its unsent mint
//     withdrawn and its accrued fee voided (a reconciled payment is flagged for refund), revokeInvestor() queued and
//     signed from the queue, KYC_REVOKED + SUBSCRIPTION_CANCELLED audited (subjectHash recomputed here);
//   · the portal afterwards: no new subscription (server-side too), no Data Room document at all (they all opened
//     with the NDA), the minted tokens still in view and never the reason; while the wallet is frozen the portal shows
//     the notice instead of the subscribe button;
//   · an approveInvestor() never sent is withdrawn instead of revoked, and a revocation is refused while a
//     transaction of the investor is in flight on the network.
const crypto = require("crypto");
const lib = require("./lib.cjs");
const { launch, ownerDb, ok, fail, shot, url, canon, sha256, has, clickText, clickIn, fill, toastText, waitToast, alertText, waitAlert } = lib;
const { openBackofficeTab, replayAction, vaultGet } = lib;

const db = ownerDb();
const NOTE_FREEZE = "Embargo judicial notificado por el Juzgado 12 Civil del Circuito, oficio 2026-0457.";
const NOTE_UNFREEZE = "Levantamiento del embargo: oficio 2026-0521 del mismo juzgado.";
const NOTE_REVOKE = "Coincidencia en la lista OFAC SDN tras la actualización semanal; ROS radicado ante la UIAF.";
const ROS = "Operación inusual o sospechosa reportada a la UIAF (ROS).";
const ref = (tag) => `FID-${tag}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
/** subjectHash of a platform/tenant decision: evidenceHash({ action, organizationId, entityId, ...payload }). */
const subjectOf = (event) =>
  sha256(canon({ action: event.action, organizationId: event.organizationId, entityId: event.entityId, ...event.payload }));

const openCase = (page, investorId) => lib.openComplianceCase(page, "avista", investorId);
/** "Firmar y ejecutar" of one queued row on the Suscripciones y Pagos desk (simulation); waits until it leaves the queue. */
async function executeRow(page, chainTxId) {
  await openBackofficeTab(page, "avista", "Suscripciones y Pagos");
  await page.waitForSelector(`[data-queue-item="${chainTxId}"][data-blocked="false"]`, { timeout: 90000 });
  await clickIn(page, `[data-queue-item="${chainTxId}"]`, "Firmar y ejecutar");
  await page.waitForFunction((id) => !document.querySelector(`[data-queue-item="${id}"]`), { timeout: 90000 }, chainTxId);
  return db.chainTransaction.findUniqueOrThrow({ where: { id: chainTxId } });
}
const registryRows = (wallet, kind) =>
  db.chainTransaction.findMany({ where: { kind, args: { path: ["wallet"], equals: wallet } }, orderBy: { createdAt: "asc" } });

(async () => {
  const browser = await launch();
  try {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "avista" } });
    const offering = await db.offering.findFirstOrThrow({ where: { organizationId: org.id }, include: { token: true } });
    const officer = await db.user.findFirstOrThrow({
      where: { organizationId: org.id, role: "COMPLIANCE_OFFICER", active: true },
      orderBy: { createdAt: "asc" },
    });

    // ── 1 · An approved investor: one subscription minted, one paid (mint queued), one unpaid ──
    const { page: a, investor } = await lib.onboardInvestor(browser, db, "avista");
    const wallet = investor.walletAddress;
    const subscribeCalls = [];
    a.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (req.method() === "POST" && id && (req.postData() ?? "").includes("acknowledgments")) subscribeCalls.push([id, req.postData()]);
    });
    const b = await (await browser.createBrowserContext()).newPage();
    b.on("pageerror", (e) => console.log("PAGEERROR(B)", e.message));
    const actions = {};
    b.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (req.method() === "POST" && id) actions[req.postData() ?? ""] = id;
    });
    await lib.approveInvestor(b, "avista", investor.id);
    const [approveTx] = await registryRows(wallet, "INVESTOR_WHITELISTED");
    await executeRow(b, approveTx.id);

    await lib.subscribe(a, "avista");
    const sub1 = await db.subscription.findFirstOrThrow({ where: { investorId: investor.id } });
    await openBackofficeTab(b, "avista", "Suscripciones y Pagos");
    await lib.confirmPayment(b, sub1.id, ref("REV1"));
    const mint1 = await db.chainTransaction.findFirstOrThrow({ where: { kind: "SUBSCRIPTION_MINTED", status: "PENDING", args: { path: ["investor"], equals: wallet } } });
    await executeRow(b, mint1.id);
    await lib.subscribe(a, "avista");
    const sub2 = await db.subscription.findFirstOrThrow({ where: { investorId: investor.id, status: "PAYMENT_PENDING" } });
    await openBackofficeTab(b, "avista", "Suscripciones y Pagos");
    await lib.confirmPayment(b, sub2.id, ref("REV2"));
    const mint2 = await db.chainTransaction.findFirstOrThrow({ where: { kind: "SUBSCRIPTION_MINTED", status: "PENDING", args: { path: ["investor"], equals: wallet } } });
    await lib.subscribe(a, "avista");
    const sub3 = await db.subscription.findFirstOrThrow({ where: { investorId: investor.id, status: "PAYMENT_PENDING" } });
    const subs = await db.subscription.findMany({ where: { investorId: investor.id }, orderBy: { createdAt: "asc" } });
    ok(
      "inversionista aprobado y en whitelist (simulación) con una suscripción MINTED, una MINT_PENDING (pago conciliado) y una PAYMENT_PENDING",
      subs.map((s) => s.status).join(",") === "MINTED,MINT_PENDING,PAYMENT_PENDING" &&
        (await db.chainTransaction.findUniqueOrThrow({ where: { id: approveTx.id } })).status === "CONFIRMED",
    );
    const [subscribeId, subscribeBody] = subscribeCalls.at(-1) ?? [];
    const subscribeInput = JSON.parse(subscribeBody ?? "[{}]")[0];
    const trySubscribe = () => replayAction(a, subscribeId, [subscribeInput]);

    // ── 2 · Freeze from the inbox: queued with its justification, signed from the queue ──
    await openCase(b, investor.id);
    await b.waitForSelector('[data-freeze-form][data-frozen="false"]', { timeout: 30000 });
    await fill(b, "#freeze-note", "corto");
    const tooShort = await b.evaluate(() =>
      [...document.querySelectorAll('[data-freeze-form] button')].every((x) => x.disabled),
    );
    await fill(b, "#freeze-note", NOTE_FREEZE);
    await clickText(b, "Congelar wallet (setFrozen)", "[data-freeze-form]");
    await waitToast(b, "Congelamiento de la wallet");
    const [freezeTx] = await registryRows(wallet, "INVESTOR_FREEZE_UPDATED");
    const freezeAudit = await db.auditEvent.findFirst({ where: { action: "INVESTOR_FREEZE_REQUESTED", entityId: investor.id }, orderBy: { createdAt: "desc" } });
    ok(
      "«Congelar wallet» (justificación de 10–300 caracteres) → setFrozen(wallet, true) PENDING en el registro del tenant",
      tooShort &&
        freezeTx?.status === "PENDING" &&
        freezeTx.method === "setFrozen(address,bool)" &&
        freezeTx.args.frozen === true &&
        freezeTx.contractAddress === org.complianceRegistry,
      await toastText(b),
    );
    ok(
      "AuditEvent INVESTOR_FREEZE_REQUESTED: oficial, nota, unidades emitidas y la tx en cola; subjectHash recalculado",
      freezeAudit?.actorUserId === officer.id &&
        freezeAudit.payload.note === NOTE_FREEZE &&
        freezeAudit.payload.frozen === true &&
        freezeAudit.payload.mintedUnits === sub1.units &&
        freezeAudit.payload.chainTransactionId === freezeTx.id &&
        freezeAudit.subjectHash === subjectOf(freezeAudit),
    );
    const [noteBody, freezeId] = Object.entries(actions).find(([body]) => body.includes(NOTE_FREEZE)) ?? [];
    const shortNote = freezeId ? await replayAction(b, freezeId, [investor.id, true, "corto"]) : "";
    const duplicate = freezeId ? await replayAction(b, freezeId, JSON.parse(noteBody)) : "";
    ok(
      "el servidor revalida: nota corta rechazada y un segundo setFrozen() mientras hay uno en cola, también",
      /entre 10 y 300 caracteres/.test(shortNote) && /Ya hay un setFrozen\(\) en cola/.test(duplicate) &&
        (await registryRows(wallet, "INVESTOR_FREEZE_UPDATED")).length === 1,
    );
    ok(
      "mientras se congela, el portal no acepta suscripciones (servidor) y el mint en cola espera por prelación",
      /Tu wallet está congelada por una decisión de cumplimiento/.test(await trySubscribe()) &&
        (await db.subscription.count({ where: { investorId: investor.id } })) === 3,
    );
    await executeRow(b, freezeTx.id);
    await openBackofficeTab(b, "avista", "Suscripciones y Pagos");
    await b.waitForSelector(`tr[data-subscription="${sub2.id}"] [data-mint-blocked]`, { timeout: 60000 });
    const frozenBlock = await b.$eval(`tr[data-subscription="${sub2.id}"] [data-mint-blocked]`, (n) => n.textContent);
    await openBackofficeTab(b, "avista", "Cumplimiento y Leads");
    await b.waitForSelector(`tr[data-investor="${investor.id}"] [data-frozen="true"]`, { timeout: 60000 });
    ok(
      "setFrozen(true) CONFIRMED (firmado en simulación): la bandeja marca «Wallet congelada» y el mint pendiente revertiría (isEligible = false)",
      (await db.chainTransaction.findUniqueOrThrow({ where: { id: freezeTx.id } })).status === "CONFIRMED" &&
        /congelada \(isEligible = false\)/.test(frozenBlock),
      frozenBlock,
    );
    await a.goto(url("avista"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await a.waitForSelector("#funnel-4", { timeout: 90000 });
    await a.click("#funnel-4");
    await a.waitForSelector('[data-subscribe-locked="frozen"]', { timeout: 60000 });
    ok(
      "portal con la wallet congelada: aviso en lugar del botón de suscribir (además del rechazo del servidor)",
      !(await has(a, "Firmar contrato del vehículo y suscribir")) && (await has(a, "Tu wallet está congelada por una decisión de cumplimiento")),
    );

    // ── 3 · …and unfreeze ──────────────────────────────────────────────────
    await openCase(b, investor.id);
    await b.waitForSelector('[data-freeze-form][data-frozen="true"]', { timeout: 30000 });
    ok("el formulario muestra la última decisión de congelamiento con su justificación", await has(b, NOTE_FREEZE));
    await fill(b, "#freeze-note", NOTE_UNFREEZE);
    await clickText(b, "Descongelar wallet (setFrozen)", "[data-freeze-form]");
    await waitToast(b, "Descongelamiento de la wallet");
    const unfreezeTx = (await registryRows(wallet, "INVESTOR_FREEZE_UPDATED")).at(-1);
    await executeRow(b, unfreezeTx.id);
    await openBackofficeTab(b, "avista", "Cumplimiento y Leads");
    await b.waitForSelector(`tr[data-investor="${investor.id}"]`, { timeout: 60000 });
    ok(
      "«Descongelar wallet» → setFrozen(wallet, false) CONFIRMED; la bandeja ya no marca la wallet",
      unfreezeTx.args.frozen === false &&
        (await db.chainTransaction.findUniqueOrThrow({ where: { id: unfreezeTx.id } })).status === "CONFIRMED" &&
        !(await b.$(`tr[data-investor="${investor.id}"] [data-frozen="true"]`)),
    );

    // ── 4 · Revocation, in one transaction ─────────────────────────────────
    const restricted = await db.dataRoomDocument.findFirstOrThrow({ where: { offeringId: offering.id, restricted: true, storageKey: { not: null } } });
    const open = await db.dataRoomDocument.findFirstOrThrow({ where: { offeringId: offering.id, restricted: false, storageKey: { not: null } } });
    const before = {
      restricted: await vaultGet(a, `/api/vault/data-room/${restricted.id}`),
      open: await vaultGet(a, `/api/vault/data-room/${open.id}`),
      units: (await db.offering.findUniqueOrThrow({ where: { id: offering.id } })).unitsSubscribed,
      fees: await db.feeLedgerEntry.findMany({ where: { subscriptionId: { in: [sub1.id, sub2.id] } } }),
      grants: await db.dataRoomAccessGrant.count({ where: { investorId: investor.id, revokedAt: null } }),
    };
    ok(
      "antes de revocar: con su NDA descarga el documento reservado y el general, tiene su AccessGrant y dos comisiones ACCRUED",
      before.restricted.status === 200 && before.restricted.sha256 === restricted.sha256 && before.open.status === 200 && before.grants >= 1 &&
        before.fees.length === 2 && before.fees.every((f) => f.status === "ACCRUED"),
    );
    await openCase(b, investor.id);
    await b.waitForSelector("[data-revoke-form]", { timeout: 30000 });
    const impact = await b.$eval("[data-revoke-form]", (n) => n.innerText);
    ok(
      "el formulario de revocación anticipa el impacto: 2 suscripciones sin emitir, sus unidades y 1 pago a reembolsar",
      impact.includes(`Se cancelarán 2 suscripción(es) sin emitir (${sub2.units + sub3.units} unidades vuelven a la oferta; 1 con pago conciliado a reembolsar)`),
      impact.split("\n")[1],
    );
    await b.select("#revoke-reason", "1");
    await fill(b, "#revoke-note", NOTE_REVOKE);
    await clickText(b, "Revocar inversionista", "[data-revoke-form]");
    await waitToast(b, "revocado · 2 suscripción(es) cancelada(s) · revokeInvestor en cola");

    const kyc = await db.kycCase.findFirstOrThrow({ where: { investorId: investor.id }, orderBy: { createdAt: "desc" } });
    const after = await db.subscription.findMany({ where: { investorId: investor.id }, orderBy: { createdAt: "asc" } });
    const unitsAfter = (await db.offering.findUniqueOrThrow({ where: { id: offering.id } })).unitsSubscribed;
    const fees = await db.feeLedgerEntry.findMany({ where: { subscriptionId: { in: [sub1.id, sub2.id] } } });
    const [revokeTx] = await registryRows(wallet, "INVESTOR_REVOKED");
    const mint2After = await db.chainTransaction.findUniqueOrThrow({ where: { id: mint2.id } });
    ok(
      "KycCase REVOKED con fecha, oficial, causal (ROS UIAF) y justificación",
      kyc.status === "REVOKED" && !!kyc.revokedAt && kyc.revokedById === officer.id && kyc.revocationReason === ROS && kyc.revocationNote === NOTE_REVOKE,
    );
    ok(
      "AccessGrant del Data Room revocados",
      (await db.dataRoomAccessGrant.count({ where: { investorId: investor.id, revokedAt: null } })) === 0 &&
        (await db.dataRoomAccessGrant.count({ where: { investorId: investor.id, revokedAt: kyc.revokedAt } })) === before.grants,
    );
    ok(
      "las suscripciones sin emitir quedan CANCELLED (KYC_REVOKED) y la MINTED sigue igual",
      after[0].status === "MINTED" &&
        after.slice(1).every((s) => s.status === "CANCELLED" && s.cancellationReason === "KYC_REVOKED" && s.cancelledAt?.getTime() === kyc.revokedAt.getTime()),
      after.map((s) => s.status).join(","),
    );
    ok(
      "las unidades comprometidas vuelven a la oferta (units_subscribed − las de las dos canceladas)",
      unitsAfter === before.units - sub2.units - sub3.units,
      `${before.units} → ${unitsAfter}`,
    );
    ok(
      "el mintSubscription() no enviado se retira (CANCELLED) y la comisión de esa suscripción queda VOIDED; la del mint emitido sigue ACCRUED",
      mint2After.status === "CANCELLED" &&
        mint2After.txHash === null &&
        /withdrawn: KYC/.test(mint2After.error ?? "") &&
        fees.find((f) => f.subscriptionId === sub2.id)?.status === "VOIDED" &&
        !!fees.find((f) => f.subscriptionId === sub2.id)?.voidedAt &&
        fees.find((f) => f.subscriptionId === sub1.id)?.status === "ACCRUED",
    );
    ok(
      "revokeInvestor(wallet) PENDING en el RwaxiComplianceRegistry del tenant",
      revokeTx?.status === "PENDING" && revokeTx.method === "revokeInvestor(address)" && revokeTx.contractAddress === org.complianceRegistry,
    );
    const revokedAudit = await db.auditEvent.findFirst({ where: { action: "KYC_REVOKED", entityId: kyc.id } });
    const cancelledAudits = await db.auditEvent.findMany({ where: { action: "SUBSCRIPTION_CANCELLED", entityId: { in: [sub2.id, sub3.id] } } });
    const p = revokedAudit?.payload ?? {};
    ok(
      "AuditEvent KYC_REVOKED: causal, nota, suscripciones canceladas (reembolso sólo de la pagada), unidades, mint retirado, fee anulado y revokeInvestor; subjectHash recalculado",
      revokedAudit?.actorUserId === officer.id &&
        p.reason === ROS &&
        p.note === NOTE_REVOKE &&
        p.wallet === wallet &&
        p.cancelledSubscriptions.length === 2 &&
        p.cancelledSubscriptions.find((s) => s.id === sub2.id)?.refundDue === true &&
        p.cancelledSubscriptions.find((s) => s.id === sub3.id)?.refundDue === false &&
        p.unitsReleased === sub2.units + sub3.units &&
        p.withdrawnChainTransactionIds.length === 1 &&
        p.withdrawnChainTransactionIds[0] === mint2.id &&
        p.voidedFeeIds.length === 1 &&
        p.revokeChainTransactionId === revokeTx.id &&
        revokedAudit.subjectHash === subjectOf(revokedAudit),
    );
    ok(
      "un AuditEvent SUBSCRIPTION_CANCELLED por suscripción, en la misma transacción; subjectHash recalculado",
      cancelledAudits.length === 2 &&
        cancelledAudits.every((e) => e.subjectHash === subjectOf(e) && e.createdAt.getTime() === revokedAudit.createdAt.getTime() && e.payload.kycCaseId === kyc.id),
    );

    // backoffice views
    await openBackofficeTab(b, "avista", "Cumplimiento y Leads");
    await b.waitForFunction((id) => document.querySelector(`tr[data-investor="${id}"] [data-kyc]`)?.dataset.kyc === "revocado", { timeout: 60000 }, investor.id);
    await clickIn(b, `tr[data-investor="${investor.id}"]`, "Revisar formulario");
    await b.waitForSelector("[data-revocation]", { timeout: 30000 });
    const detail = await b.$eval("[data-revocation]", (n) => n.textContent); // innerText would upper-case the header
    ok(
      "la bandeja muestra «Revocado» y, sólo al personal, la causal, la nota y quién revocó",
      detail.includes(ROS) && detail.includes(NOTE_REVOKE) && detail.includes(officer.email) && !(await b.$("[data-revoke-form]")),
    );
    await openBackofficeTab(b, "avista", "Suscripciones y Pagos");
    await b.waitForSelector(`tr[data-subscription="${sub2.id}"][data-sub-status="CANCELLED"]`, { timeout: 60000 });
    ok(
      "Suscripciones y Pagos: las canceladas se listan; la pagada avisa del reembolso pendiente fuera de la plataforma",
      !!(await b.$(`tr[data-subscription="${sub2.id}"] [data-refund-due="true"]`)) &&
        !!(await b.$(`tr[data-subscription="${sub3.id}"][data-sub-status="CANCELLED"]`)) &&
        !(await b.$(`tr[data-subscription="${sub3.id}"] [data-refund-due]`)) &&
        !(await b.$(`[data-queue-item="${mint2.id}"]`)),
    );

    // ── 5 · The portal of the revoked investor ─────────────────────────────
    await a.goto(url("avista"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await a.waitForSelector("#funnel-3", { timeout: 90000 });
    await a.click("#funnel-3"); // step 3: the KYC
    await a.waitForSelector("[data-kyc-revoked]", { timeout: 60000 });
    const portalText = await a.evaluate(() => document.body.textContent); // as written: innerText applies CSS upper-casing
    const portalHtml = await a.content(); // includes the server's serialized props (RSC payload)
    const leaks = ["OFAC SDN tras la actualizaci", "ROS radicado ante la UIAF", "reportada a la UIAF (ROS)"].filter(
      (s) => portalText.includes(s) || portalHtml.includes(s),
    );
    ok(
      "portal: «Verificación revocada» sin la causal ni la nota del Oficial, ni en pantalla ni en los datos enviados al navegador",
      portalText.includes("Verificación revocada") && portalText.includes("KYC revocado") && leaks.length === 0,
      leaks.join(" | "),
    );
    await a.click("#funnel-4");
    await a.waitForSelector('[data-subscribe-locked="revoked"]', { timeout: 60000 });
    const holdings = await a.$$eval("[data-holding]", (n) => n.map((x) => x.dataset.holding));
    ok(
      "portal: no ofrece suscribir, pero el portafolio sigue mostrando los tokens emitidos (no las canceladas)",
      !(await has(a, "Firmar contrato del vehículo y suscribir")) && holdings.join(",") === "en_wallet",
      holdings.join(","),
    );
    const refused = await trySubscribe();
    ok(
      "el servidor rechaza una suscripción nueva del revocado (acción reenviada) y no crea nada",
      /Tu KYC debe estar aprobado/.test(refused) && (await db.subscription.count({ where: { investorId: investor.id } })) === 3,
    );
    const denied = await vaultGet(a, `/api/vault/data-room/${restricted.id}`);
    const deniedOpen = await vaultGet(a, `/api/vault/data-room/${open.id}`);
    const roomDocs = await db.dataRoomDocument.findMany({ where: { offeringId: offering.id, storageKey: { not: null } } });
    const all = [];
    for (const d of roomDocs) all.push(await vaultGet(a, `/api/vault/data-room/${d.id}`));
    ok(
      `Data Room tras la revocación: 403 en todos los documentos (${roomDocs.length}), el reservado y el general, aunque el NDA siga firmado`,
      denied.status === 403 &&
        /Data Room de este proyecto ya no está disponible/.test(denied.error ?? "") &&
        deniedOpen.status === 403 &&
        all.every((r) => r.status === 403),
      `${denied.status} ${denied.error}`,
    );
    await a.click("#funnel-2"); // step 2: the Data Room
    await a.waitForSelector('[data-investor-data-room][data-room-access="revoked"]', { timeout: 60000 });
    const downloadable = await a.$$eval("[data-room-document] button", (bs) => bs.filter((b) => !b.disabled).length);
    ok(
      "portal: el Data Room se muestra cerrado (ningún documento descargable) y sin el CTA de invertir",
      downloadable === 0 && !(await a.$("[data-invest-cta]")),
      `${downloadable} habilitados`,
    );

    // ── 6 · revokeInvestor() signed from the queue ─────────────────────────
    const revoked = await executeRow(b, revokeTx.id);
    const confirmedAudit = await db.auditEvent.findFirst({ where: { action: "CHAIN_TX_CONFIRMED", entityId: revokeTx.id } });
    ok(
      "revokeInvestor() CONFIRMED (simulación firmada por la clave de demostración) con su AuditEvent",
      revoked.status === "CONFIRMED" && revoked.executionMode === "SIMULATION" && !!revoked.txHash && confirmedAudit?.subjectHash === revoked.txHash,
    );
    await openBackofficeTab(b, "avista", "Cumplimiento y Leads");
    await b.waitForSelector(`tr[data-investor="${investor.id}"]`, { timeout: 60000 });
    ok("la bitácora de cumplimiento muestra la revocación", (await has(b, "Inversionista revocado")) && (await has(b, "Suscripción cancelada")));
    await shot(b, "revocation-inbox", { fullPage: true });

    // ── 7 · Approved but never whitelisted: the unsent approveInvestor() is withdrawn ──
    const { page: c, investor: second } = await lib.onboardInvestor(browser, db, "avista");
    await lib.approveInvestor(b, "avista", second.id);
    const [pendingApprove] = await registryRows(second.walletAddress, "INVESTOR_WHITELISTED");
    await openCase(b, second.id);
    await b.waitForSelector("[data-revoke-form]", { timeout: 30000 });
    await b.select("#revoke-reason", "0");
    await fill(b, "#revoke-note", "Coincidencia confirmada en lista restrictiva antes de enviar la whitelist.");
    await clickText(b, "Revocar inversionista", "[data-revoke-form]");
    await waitToast(b, "whitelist retirada antes de enviarse");
    const secondAudit = await db.auditEvent.findFirst({ where: { action: "KYC_REVOKED", payload: { path: ["investorId"], equals: second.id } } });
    ok(
      "approveInvestor() aún sin enviar → se retira (CANCELLED) en vez de encolar revokeInvestor()",
      (await db.chainTransaction.findUniqueOrThrow({ where: { id: pendingApprove.id } })).status === "CANCELLED" &&
        (await registryRows(second.walletAddress, "INVESTOR_REVOKED")).length === 0 &&
        secondAudit?.payload.withdrawnChainTransactionIds?.[0] === pendingApprove.id &&
        secondAudit.payload.revokeChainTransactionId === null,
    );
    await c.browserContext().close();

    // ── 8 · A transaction of the investor in flight: the revocation waits ──
    const { page: d, investor: third } = await lib.onboardInvestor(browser, db, "avista");
    await lib.approveInvestor(b, "avista", third.id);
    const [inFlight] = await registryRows(third.walletAddress, "INVESTOR_WHITELISTED");
    const sentHash = `0x${crypto.randomBytes(32).toString("hex")}`;
    await db.chainTransaction.update({ where: { id: inFlight.id }, data: { executionMode: "RPC", txHash: sentHash, signerAddress: officer.walletAddress } });
    await openCase(b, third.id);
    await b.waitForSelector("[data-revoke-form]", { timeout: 30000 });
    await fill(b, "#revoke-note", "Requerimiento de autoridad competente recibido hoy por correo certificado.");
    await clickText(b, "Revocar inversionista", "[data-revoke-form]");
    await waitAlert(b, /en curso en la red/);
    const thirdKyc = await db.kycCase.findFirstOrThrow({ where: { investorId: third.id }, orderBy: { createdAt: "desc" } });
    ok(
      "con su approveInvestor() enviado y sin recibo, la revocación se rechaza sin tocar nada",
      thirdKyc.status === "APPROVED" &&
        (await db.chainTransaction.findUniqueOrThrow({ where: { id: inFlight.id } })).txHash === sentHash &&
        (await db.dataRoomAccessGrant.count({ where: { investorId: third.id, revokedAt: null } })) >= 1,
      await alertText(b),
    );
    await db.chainTransaction.update({ where: { id: inFlight.id }, data: { executionMode: null, txHash: null, signerAddress: null } });
    await d.browserContext().close();
    await a.browserContext().close();
    await b.browserContext().close();
  } catch (e) {
    fail(e);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})();
