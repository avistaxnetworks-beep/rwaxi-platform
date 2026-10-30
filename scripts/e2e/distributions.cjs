// E2E · yield distributions against Neon (simulation): a second investor goes through NDA → KYC → payment → mint, so
// the offering has two holders; the backoffice declares distributions at a record date (the register of holders is
// the token balances at that instant), in a payment currency (COP through the fiduciary, USDC from the issuer's
// treasury), with a supporting document verified into the vault. Allocations, v2 leaves, root and the
// anchorDistributionRoot(…, recordTimestamp, currency, evidenceHash) call are recomputed independently; the queue
// replays the token's SnapshotSupplyMismatch; a frozen wallet is withheld from the payment instruction and paid in a
// later one; the portal never says why (no tipping-off); RLS, append-only tables, the audited and re-hashed support
// download, and the console's module D (read-only supervision) close it.
const fs = require("fs");
const lib = require("./lib.cjs");
const { launch, ownerDb, ok, fail, shot, url, viem, viemAccounts, viemChains, abi, canon, sha256, merkleRoot, foldProof, webEnv, PrismaClient, poolUrl } = lib;
const { waitText, clickText, clickIn, fill, toastText, openBackofficeTab, replayAction, openComplianceCase, attachDistributionSupport, vaultGet, vaultPath } = lib;

const db = ownerDb();
const tokenAbi = abi("RwaxiPropertyToken");
const operator = viemAccounts.privateKeyToAccount(webEnv("OPERATOR_PRIVATE_KEY"));
const CHAIN_ID = { POLYGON: viemChains.polygon.id, BASE: viemChains.base.id, POLYGON_AMOY: viemChains.polygonAmoy.id, BASE_SEPOLIA: viemChains.baseSepolia.id, HARDHAT: viemChains.hardhat.id };
const ANCHOR = "anchorDistributionRoot(bytes32,bytes32,uint256,uint256,uint64,string,bytes32)";

// Independent largest-remainder split in integer hundredths (ties: larger holding, then lower key).
function prorata(totalCents, holdings) {
  const total = BigInt(totalCents);
  const supply = holdings.reduce((s, h) => s + BigInt(h.units), 0n);
  const shares = holdings.map((h) => ({ key: h.key, units: h.units, cents: (total * BigInt(h.units)) / supply, rem: (total * BigInt(h.units)) % supply }));
  let left = total - shares.reduce((s, x) => s + x.cents, 0n);
  [...shares]
    .sort((a, b) => (a.rem !== b.rem ? (b.rem > a.rem ? 1 : -1) : b.units !== a.units ? b.units - a.units : a.key < b.key ? -1 : 1))
    .forEach((x) => left > 0n && ((x.cents += 1n), (left -= 1n)));
  return new Map(shares.map((x) => [x.key, Number(x.cents)]));
}
/** v2 leaf: the payment currency is part of the committed claim. */
const leafOf = (distributionId, wallet, units, currency, amountCents) =>
  sha256(canon({ v: 2, kind: "rwaxi.distribution.allocation", distributionId, wallet: wallet.toLowerCase(), units, currency, amountCents }));
const cents = (decimal) => Math.round(Number(decimal) * 100);
// Record dates live in Bogotá (UTC-5 all year): a past date ends at 23:59:59 there.
const bogota = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
const shiftDay = (date, n) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const endOfDay = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d + 1, 5) / 1000 - 1;
};

async function executeRow(page, chainTxId) {
  await openBackofficeTab(page, "avista", "Suscripciones y Pagos");
  await page.waitForSelector(`[data-queue-item="${chainTxId}"][data-blocked="false"]`, { timeout: 90000 });
  await clickIn(page, `[data-queue-item="${chainTxId}"]`, "Firmar y ejecutar");
  await page.waitForFunction((id) => !document.querySelector(`[data-queue-item="${id}"]`), { timeout: 90000 }, chainTxId);
  return db.chainTransaction.findUniqueOrThrow({ where: { id: chainTxId } });
}
async function openDistributions(page, code) {
  await openBackofficeTab(page, "avista", "Distribuciones y Rendimientos");
  await page.waitForSelector(`[data-distribution-offering="${code}"]`, { timeout: 90000 });
}
/** The register the desk previews: the [data-holder] rows (wallet → units) and the supply it states. */
const previewRegister = (page) =>
  page.evaluate(() => ({
    supply: Number(document.querySelector("[data-register-supply]")?.dataset.registerSupply ?? -1),
    holders: Object.fromEntries([...document.querySelectorAll("[data-holder]")].map((n) => [n.dataset.holder, Number(n.dataset.holderUnits)])),
  }));
async function setWalletFrozen(page, investorId, frozen, note) {
  await openComplianceCase(page, "avista", investorId);
  await page.waitForSelector(`[data-freeze-form][data-frozen="${!frozen}"]`, { timeout: 30000 });
  await fill(page, "#freeze-note", note);
  await clickText(page, frozen ? "Congelar wallet (setFrozen)" : "Descongelar wallet (setFrozen)", "[data-freeze-form]");
  for (let i = 0; i < 60; i++) {
    const row = await db.chainTransaction.findFirst({ where: { kind: "INVESTOR_FREEZE_UPDATED", status: "PENDING", args: { path: ["frozen"], equals: frozen } } });
    if (row) return row;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("setFrozen no quedó en cola");
}

(async () => {
  const browser = await launch();
  try {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "avista" } });
    const elpoblado = await db.organization.findUniqueOrThrow({ where: { slug: "elpoblado" }, include: { offerings: true } });
    const offering = await db.offering.findFirstOrThrow({ where: { organizationId: org.id, token: { status: "DEPLOYED" } }, include: { token: true } });
    const token = offering.token.contractAddress.toLowerCase();
    const admin = await db.user.findFirstOrThrow({ where: { organizationId: org.id, role: "TENANT_ADMIN", active: true }, orderBy: { createdAt: "asc" } });
    const today = bogota();
    const yesterday = shiftDay(today, -1);

    // ── 1 · A second holder through the whole persisted flow ────────────────
    const { page: a, investor } = await lib.onboardInvestor(browser, db, "avista");
    const b = await (await browser.createBrowserContext()).newPage();
    b.on("pageerror", (e) => console.log("PAGEERROR(B)", e.message));
    const actions = {};
    b.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (req.method() === "POST" && id) actions[req.postData() ?? ""] = id;
    });
    const actionFor = (...needles) => Object.entries(actions).find(([body]) => needles.every((n) => body.includes(n)));
    await lib.approveInvestor(b, "avista", investor.id);
    await lib.subscribe(a, "avista");
    const sub = await db.subscription.findFirstOrThrow({ where: { investorId: investor.id } });
    await openBackofficeTab(b, "avista", "Suscripciones y Pagos");
    await lib.confirmPayment(b, sub.id, "FID-DIST-000451");
    await clickText(b, "Procesar cola en orden");
    await b.waitForSelector(`tr[data-subscription="${sub.id}"][data-sub-status="MINTED"]`, { timeout: 90000 });

    // The token's register, replayed independently from its confirmed mints (what balanceOfAt keeps on-chain).
    const investors = await db.investor.findMany({ where: { organizationId: org.id, walletAddress: { not: null } } });
    const byWallet = new Map(investors.map((i) => [i.walletAddress.toLowerCase(), i]));
    const mints = (await db.chainTransaction.findMany({ where: { organizationId: org.id, kind: "SUBSCRIPTION_MINTED", status: "CONFIRMED" } })).filter(
      (t) => t.contractAddress.toLowerCase() === token,
    );
    const registerAt = (seconds) => {
      const units = new Map();
      for (const t of mints) {
        if (Math.floor((t.executedAt ?? t.createdAt).getTime() / 1000) > seconds) continue;
        const w = t.args.investor.toLowerCase();
        units.set(w, (units.get(w) ?? 0) + Number(t.args.amount));
      }
      return [...units].map(([wallet, u]) => ({ key: byWallet.get(wallet).id, wallet, units: u, name: byWallet.get(wallet).fullName }));
    };
    const nowHolders = registerAt(Math.floor(Date.now() / 1000));
    const yHolders = registerAt(endOfDay(yesterday));
    const supply = nowHolders.reduce((s, h) => s + h.units, 0);
    const seeded = nowHolders.find((h) => h.key !== investor.id);
    ok(
      "registro del token hoy: tenedor del seed + inversionista nuevo de 250 tokens; a la fecha de corte de ayer solo el del seed",
      nowHolders.length === 2 && nowHolders.some((h) => h.key === investor.id && h.units === 250) && yHolders.length === 1 && yHolders[0].key === seeded.key,
      `${nowHolders.map((h) => `${h.name} ${h.units}`).join(" · ")} | ayer ${yHolders.map((h) => h.units).join("")}`,
    );

    // ── 2 · The desk previews the register at the record date ──────────────
    await openDistributions(b, offering.code);
    const todayView = await previewRegister(b);
    await fill(b, `#dist-record-${offering.id}`, yesterday);
    await b.waitForFunction((s) => document.querySelector("[data-register-supply]")?.dataset.registerSupply === String(s), { timeout: 10000 }, yHolders[0].units);
    const yView = await previewRegister(b);
    await fill(b, `#dist-record-${offering.id}`, shiftDay(today, 1));
    await waitText(b, "Elige una fecha de corte válida que no sea futura.");
    ok(
      "vista previa: fecha de corte hoy → 2 tenedores / 450 tokens; ayer → solo el del seed; mañana → rechazada",
      todayView.supply === supply &&
        nowHolders.every((h) => todayView.holders[h.wallet] === h.units) &&
        yView.supply === yHolders[0].units &&
        Object.keys(yView.holders).length === 1,
      `${todayView.supply} · ${yView.supply}`,
    );

    // ── 3 · Declare 2026-Q3 in COP at today's record date, with its supporting document ──
    await fill(b, `#dist-record-${offering.id}`, today);
    await fill(b, `#dist-period-${offering.id}`, "2026-Q3");
    await b.select(`#dist-currency-${offering.id}`, "COP");
    await fill(b, `#dist-amount-${offering.id}`, "41000000");
    await b.waitForSelector(`#dist-fx-${offering.id}`, { timeout: 10000 });
    await fill(b, `#dist-fx-${offering.id}`, "4100");
    const declareDisabledWithoutSupport = await b.$eval(`[data-declare-distribution="${offering.id}"]`, (n) => n.disabled);
    const support1 = await attachDistributionSupport(b, offering.id, "certificacion-fiduciaria-q3");
    await b.waitForFunction((id) => !document.querySelector(`[data-declare-distribution="${id}"]`)?.disabled, { timeout: 10000 }, offering.id);
    const preview = await b.$$eval("[data-holder]", (n) => Object.fromEntries(n.map((x) => [x.dataset.holder, Number(x.querySelector("[data-preview-cents]").dataset.previewCents)])));
    const expectedQ3 = prorata(4_100_000_000, nowHolders);
    ok(
      "sin soporte el botón «Declarar» queda deshabilitado; con él, vista previa en COP: 41.000.000 → 18.222.222,22 / 22.777.777,78 (mayor residuo)",
      declareDisabledWithoutSupport &&
        nowHolders.every((h) => preview[h.wallet] === expectedQ3.get(h.key)) &&
        expectedQ3.get(investor.id) === 2_277_777_778 &&
        [...expectedQ3.values()].reduce((x, y) => x + y, 0) === 4_100_000_000,
      JSON.stringify(Object.values(preview)),
    );
    await shot(b, "distributions-preview", { fullPage: true });
    const before = Date.now();
    await clickIn(b, `[data-distribution-offering="${offering.code}"]`, "Declarar y encolar raíz de Merkle");
    await b.waitForSelector('[data-distribution="2026-Q3"]', { timeout: 60000 });
    const toast = await toastText(b);
    const q3 = await db.distribution.findFirstOrThrow({ where: { offeringId: offering.id, period: "2026-Q3" }, include: { allocations: true } });
    const expectedId = viem.keccak256(viem.toHex(`rwaxi.distribution:${offering.id}:2026-Q3`));
    ok(
      "Distribution v2: COP 41.000.000 a 4.100 (≈ 10.000 USD) · 450 tokens · 2 tenedores · fecha de corte hoy · snapshot al declarar · DECLARED",
      q3.leafVersion === 2 &&
        q3.currency === "COP" &&
        Number(q3.amountDeclared) === 41_000_000 &&
        Number(q3.fxRate) === 4100 &&
        Number(q3.totalUsd) === 10000 &&
        q3.totalUnits === supply &&
        q3.holders === 2 &&
        q3.recordDate.toISOString().slice(0, 10) === today &&
        q3.snapshotMode === "SIMULATION" &&
        q3.snapshotAt.getTime() <= Date.now() &&
        q3.snapshotAt.getTime() >= before - 5000 &&
        q3.status === "DECLARED" &&
        q3.onchainId === expectedId &&
        q3.declaredById === admin.id,
      toast,
    );
    const stored = fs.readFileSync(vaultPath(org.id, support1.sha256));
    const vaulted = await db.vaultObject.findUnique({ where: { organizationId_sha256: { organizationId: org.id, sha256: support1.sha256 } } });
    ok(
      "soporte documental en la bóveda del tenant por su SHA-256 (clave del tenant, tipo leído de los bytes, mismo hash en disco)",
      q3.supportSha256 === support1.sha256 &&
        q3.supportStorageKey === `tenants/${org.id}/sha256/${support1.sha256.slice(2)}` &&
        q3.supportMimeType === "application/pdf" &&
        q3.supportSizeBytes === fs.statSync(support1.file).size &&
        !!vaulted &&
        lib.sha256Of(stored) === support1.sha256,
      support1.sha256,
    );
    const allocs = q3.allocations;
    ok(
      "asignaciones en COP (centésimas exactas) con su equivalente en USD; suman exactamente el total",
      allocs.length === 2 &&
        allocs.every((x) => cents(x.amount) === expectedQ3.get(x.investorId) && Math.abs(Number(x.amountUsd) - Number(x.amount) / 4100) <= 0.005) &&
        allocs.reduce((s, x) => s + cents(x.amount), 0) === 4_100_000_000,
      allocs.map((x) => `${x.units} → COP ${x.amount} ≈ USD ${x.amountUsd}`).join(" · "),
    );
    const leaves = allocs.map((x) => leafOf(q3.onchainId, x.wallet, x.units, "COP", cents(x.amount)));
    ok("hojas v2 = SHA-256(JSON canónico con la moneda de pago), recalculadas independientemente", allocs.every((x, i) => x.leafHash === leaves[i]));
    ok("raíz de Merkle recalculada = Distribution.merkleRoot; cada prueba persistida la reconstruye", merkleRoot(leaves) === q3.merkleRoot && allocs.every((x) => foldProof(x.leafHash, x.merkleProof) === q3.merkleRoot));
    const q3Record = Math.floor(q3.snapshotAt.getTime() / 1000);
    const anchorTx = await db.chainTransaction.findFirstOrThrow({ where: { organizationId: org.id, kind: "DISTRIBUTION_ROOT_ANCHORED", args: { path: ["distributionId"], equals: q3.onchainId } } });
    const calldata = viem.encodeFunctionData({
      abi: tokenAbi,
      functionName: "anchorDistributionRoot",
      args: [q3.onchainId, q3.merkleRoot, 4_100_000_000n, BigInt(supply), BigInt(q3Record), "COP", support1.sha256],
    });
    ok(
      "anchorDistributionRoot(id, raíz, 4.100.000.000 centavos COP, 450, fecha de corte, «COP», SHA-256 del soporte) en cola contra el token",
      anchorTx.status === "PENDING" &&
        anchorTx.method === ANCHOR &&
        anchorTx.contractAddress.toLowerCase() === token &&
        anchorTx.args.merkleRoot === q3.merkleRoot &&
        anchorTx.args.totalAmountCents === "4100000000" &&
        anchorTx.args.snapshotSupply === supply &&
        anchorTx.args.recordTimestamp === q3Record &&
        anchorTx.args.currency === "COP" &&
        anchorTx.args.evidenceHash === support1.sha256 &&
        calldata.slice(0, 10) === viem.toFunctionSelector(ANCHOR),
    );
    const declaredAudit = await db.auditEvent.findFirstOrThrow({ where: { organizationId: org.id, action: "DISTRIBUTION_DECLARED", entityId: q3.id } });
    const dp = declaredAudit.payload;
    ok(
      "AuditEvent DISTRIBUTION_DECLARED: raíz, montos, beneficiarios (hojas y whitelist), fecha de corte y SHA-256 del soporte",
      declaredAudit.subjectHash === q3.merkleRoot &&
        declaredAudit.actorEmail === admin.email &&
        dp.recordDate === today &&
        dp.currency === "COP" &&
        dp.amountDeclared === "41000000.00" &&
        dp.support.sha256 === support1.sha256 &&
        dp.allocations.length === 2 &&
        dp.allocations.every((x) => leaves.includes(x.leaf) && x.whitelist === "CLEARED") &&
        dp.chainTransactionId === anchorTx.id,
    );

    // ── 4 · The server re-validates (replayed with the captured action id) ──
    const [body, declareId] = actionFor("2026-Q3", offering.id) ?? [];
    const input = JSON.parse(body ?? "[{}]")[0];
    const replay = (patch) => replayAction(b, declareId, [{ ...input, ...patch }]);
    const results = {
      duplicate: await replay({}),
      period: await replay({ period: "2026-13" }),
      amount: await replay({ period: "2026-08", amount: "-5" }),
      currency: await replay({ period: "2026-08", currency: "EUR" }),
      fx: await replay({ period: "2026-08", fxRate: "12" }),
      future: await replay({ period: "2026-08", recordDate: shiftDay(today, 1) }),
      forged: await replay({ period: "2026-08", support: { ...input.support, receipt: "Zm9yZ2Vk.forged" } }),
      swapped: await replay({ period: "2026-08", support: { ...input.support, sha256: `0x${"ab".repeat(32)}` } }),
      foreign: await replay({ period: "2026-08", offeringId: elpoblado.offerings[0].id }),
    };
    ok("periodo duplicado → rechazado (una distribución por oferta y periodo)", /Ya existe una distribución de ese periodo/.test(results.duplicate));
    ok(
      "servidor: periodo, monto, moneda, tasa y fecha de corte futura → rechazados",
      /Periodo/.test(results.period) && /Monto en COP/.test(results.amount) && /Moneda de pago/.test(results.currency) && /Tasa COP\/USD/.test(results.fx) && /Fecha de corte/.test(results.future),
    );
    ok("servidor: recibo del soporte falsificado o con otro SHA-256 → rechazado", /soporte documental no fue verificado/.test(results.forged) && /soporte documental no fue verificado/.test(results.swapped));
    ok("la oferta de otro tenant desde el host de avista → no encontrada (RLS)", /Oferta no encontrada en este tenant/.test(results.foreign));
    ok("nada escrito por los intentos rechazados", (await db.distribution.count({ where: { organizationId: org.id } })) === 1 && (await db.distribution.count({ where: { organizationId: elpoblado.id } })) === 0);

    // ── 5 · The issuer anchors Q3 (simulation): signed, decoded and confirmed ──
    await openDistributions(b, offering.code);
    await b.waitForSelector(`[data-anchor-execute="${anchorTx.id}"]`, { timeout: 30000 });
    await clickIn(b, '[data-distribution="2026-Q3"]', "Firmar y ejecutar");
    await b.waitForSelector('[data-distribution="2026-Q3"][data-distribution-status="ANCHORED"]', { timeout: 90000 });
    const anchored = await db.chainTransaction.findUniqueOrThrow({ where: { id: anchorTx.id } });
    const parsed = viem.parseTransaction(anchored.signedTransaction);
    const signer = await viem.recoverTransactionAddress({ serializedTransaction: anchored.signedTransaction });
    const call = viem.decodeFunctionData({ abi: tokenAbi, data: parsed.data });
    ok(
      "ejecutada: txHash = keccak256(tx firmada) · chainId/nonce/to · calldata con la fecha de corte, «COP» y el SHA-256 del soporte",
      anchored.status === "CONFIRMED" &&
        anchored.executionMode === "SIMULATION" &&
        anchored.txHash === viem.keccak256(anchored.signedTransaction) &&
        signer === operator.address &&
        parsed.chainId === CHAIN_ID[anchored.network] &&
        parsed.nonce === anchored.nonce &&
        parsed.to.toLowerCase() === token &&
        call.functionName === "anchorDistributionRoot" &&
        call.args[0] === q3.onchainId &&
        call.args[1] === q3.merkleRoot &&
        call.args[2] === 4_100_000_000n &&
        call.args[3] === BigInt(supply) &&
        call.args[4] === BigInt(q3Record) &&
        call.args[5] === "COP" &&
        call.args[6] === support1.sha256,
      `nonce ${anchored.nonce}`,
    );
    const q3After = await db.distribution.findUniqueOrThrow({ where: { id: q3.id } });
    ok("Distribution → ANCHORED con anchorTxHash = hash confirmado", q3After.status === "ANCHORED" && q3After.anchorTxHash === anchored.txHash);

    // ── 6 · The whitelist decides the payment: a wallet with a freeze queued is withheld ──
    const freezeTx = await setWalletFrozen(b, investor.id, true, "Embargo judicial notificado: oficio 2026-0457 del juzgado.");
    await openDistributions(b, offering.code);
    await clickIn(b, '[data-distribution="2026-Q3"]', "Ver asignaciones y pruebas");
    await b.waitForSelector(`[data-allocation="${investor.walletAddress}"][data-allocation-payout="withheld-FREEZE_PENDING"]`, { timeout: 30000 });
    ok(
      "la mesa marca la asignación del inversionista como retenida (congelamiento en cola) y la del seed como pagable",
      !!(await b.$(`[data-allocation="${seeded.wallet}"][data-allocation-payout="payable"]`)),
    );
    await clickIn(b, '[data-distribution="2026-Q3"]', "Emitir instrucción de pago");
    await b.waitForSelector('[data-distribution="2026-Q3"] [data-payout-batch="1"]', { timeout: 60000 });
    const batch1 = await db.distributionPayoutBatch.findFirstOrThrow({ where: { distributionId: q3.id, sequence: 1 }, include: { payouts: true } });
    const instr1 = batch1.instruction;
    const seededAlloc = allocs.find((x) => x.investorId === seeded.key);
    const investorAlloc = allocs.find((x) => x.investorId === investor.id);
    ok(
      "instrucción #1: solo la wallet que la whitelist habilita (la del seed); la congelada queda retenida con su motivo",
      batch1.payees === 1 &&
        batch1.withheld === 1 &&
        batch1.registryMode === "SIMULATION" &&
        batch1.currency === "COP" &&
        Number(batch1.totalAmount) === Number(seededAlloc.amount) &&
        batch1.payouts.length === 1 &&
        batch1.payouts[0].allocationId === seededAlloc.id &&
        instr1.payees.length === 1 &&
        instr1.payees[0].wallet === seeded.wallet &&
        instr1.payees[0].leaf === seededAlloc.leafHash &&
        instr1.withheld.length === 1 &&
        instr1.withheld[0].reason === "FREEZE_PENDING" &&
        instr1.executor === "fiduciary" &&
        instr1.distribution.supportSha256 === support1.sha256 &&
        instr1.distribution.anchorTxHash === anchored.txHash,
      `${batch1.totalAmount} COP`,
    );
    const payoutAudit = await db.auditEvent.findFirstOrThrow({ where: { organizationId: org.id, action: "DISTRIBUTION_PAYOUT_INSTRUCTED", entityId: batch1.id } });
    ok(
      "instructionHash = SHA-256(JSON canónico de la instrucción), recalculado; AuditEvent DISTRIBUTION_PAYOUT_INSTRUCTED lo cita con beneficiarios y retenidos",
      batch1.instructionHash === sha256(canon(instr1)) &&
        payoutAudit.subjectHash === batch1.instructionHash &&
        payoutAudit.actorEmail === admin.email &&
        payoutAudit.payload.withheldReasons?.[0]?.reason === "FREEZE_PENDING" &&
        sha256(canon(payoutAudit.payload.instruction)) === batch1.instructionHash,
      batch1.instructionHash,
    );

    // The investor sees only that the payment is pending: never why (no tipping-off).
    await a.goto(url("avista"), { waitUntil: "domcontentloaded" });
    await a.waitForSelector('[data-distribution-allocation="2026-Q3"]', { timeout: 90000 });
    const pendingItem = await a.$eval('[data-distribution-allocation="2026-Q3"]', (n) => ({ payout: n.dataset.payout, currency: n.dataset.currency, text: n.textContent }));
    ok(
      "portal: «Pago pendiente de instrucción del emisor», sin causal (ni congelamiento, ni whitelist, ni retención)",
      pendingItem.payout === "pending" &&
        pendingItem.currency === "COP" &&
        pendingItem.text.includes("Pago pendiente de instrucción del emisor") &&
        !/congel|whitelist|retenid|frozen|embargo/i.test(pendingItem.text),
      pendingItem.text.slice(0, 120),
    );

    // Confirmed freeze: still withheld; the server issues nothing.
    await executeRow(b, freezeTx.id);
    const [, instructId] = actionFor(q3.id) ?? [];
    const nothing = instructId ? await replayAction(b, instructId, [q3.id]) : "";
    ok(
      "wallet congelada en el registro: ninguna asignación pendiente pasa la whitelist → nada emitido",
      /Ninguna asignación pendiente supera hoy la validación de la whitelist/.test(nothing) && (await db.distributionPayoutBatch.count({ where: { distributionId: q3.id } })) === 1,
      nothing.match(/"error":"([^"]+)"/)?.[1],
    );

    // Unfrozen: the next instruction pays the withheld allocation.
    const unfreezeTx = await setWalletFrozen(b, investor.id, false, "Levantamiento del embargo: oficio 2026-0521 del mismo juzgado.");
    await executeRow(b, unfreezeTx.id);
    await openDistributions(b, offering.code);
    await clickIn(b, '[data-distribution="2026-Q3"]', "Emitir instrucción de pago");
    await b.waitForSelector('[data-distribution="2026-Q3"] [data-payout-batch="2"]', { timeout: 60000 });
    const batch2 = await db.distributionPayoutBatch.findFirstOrThrow({ where: { distributionId: q3.id, sequence: 2 }, include: { payouts: true } });
    const instructedAll = await db.distributionPayout.count({ where: { batch: { distributionId: q3.id } } });
    ok(
      "instrucción #2 tras descongelar: paga la asignación retenida; cada asignación instruida una sola vez",
      batch2.payees === 1 &&
        batch2.withheld === 0 &&
        batch2.payouts[0].allocationId === investorAlloc.id &&
        Number(batch2.payouts[0].amount) === Number(investorAlloc.amount) &&
        batch2.instructionHash === sha256(canon(batch2.instruction)) &&
        instructedAll === 2 &&
        !(await b.$(`[data-payout-instruct="${q3.id}"]`)),
    );
    const again = instructId ? await replayAction(b, instructId, [q3.id]) : "";
    ok("re-emitir → rechazado: todas las asignaciones ya tienen instrucción de pago", /ya tienen instrucción de pago/.test(again));

    // ── 7 · USDC from the issuer's treasury, at yesterday's record date ─────
    await fill(b, `#dist-record-${offering.id}`, yesterday);
    await fill(b, `#dist-period-${offering.id}`, "2026-09");
    await b.select(`#dist-currency-${offering.id}`, "USDC");
    await fill(b, `#dist-amount-${offering.id}`, "12500.50");
    const support2 = await attachDistributionSupport(b, offering.id, "comprobante-tesoreria-usdc");
    await b.waitForFunction((id) => !document.querySelector(`[data-declare-distribution="${id}"]`)?.disabled, { timeout: 10000 }, offering.id);
    await clickIn(b, `[data-distribution-offering="${offering.code}"]`, "Declarar y encolar raíz de Merkle");
    await b.waitForSelector('[data-distribution="2026-09"]', { timeout: 60000 });
    const sep = await db.distribution.findFirstOrThrow({ where: { offeringId: offering.id, period: "2026-09" }, include: { allocations: true } });
    const sepAnchor = await db.chainTransaction.findFirstOrThrow({ where: { kind: "DISTRIBUTION_ROOT_ANCHORED", args: { path: ["distributionId"], equals: sep.onchainId } } });
    ok(
      "USDC a la fecha de corte de ayer: solo el tenedor de ese día (200 tokens), snapshot = 23:59:59 de Bogotá, hoja v2 «USDC», sin tasa",
      sep.currency === "USDC" &&
        sep.fxRate === null &&
        Number(sep.totalUsd) === 12500.5 &&
        sep.holders === 1 &&
        sep.totalUnits === yHolders[0].units &&
        sep.recordDate.toISOString().slice(0, 10) === yesterday &&
        Math.floor(sep.snapshotAt.getTime() / 1000) === endOfDay(yesterday) &&
        sep.allocations[0].investorId === seeded.key &&
        cents(sep.allocations[0].amount) === 1_250_050 &&
        sep.allocations[0].leafHash === leafOf(sep.onchainId, seeded.wallet, yHolders[0].units, "USDC", 1_250_050) &&
        sepAnchor.args.recordTimestamp === endOfDay(yesterday) &&
        sepAnchor.args.currency === "USDC" &&
        sepAnchor.args.evidenceHash === support2.sha256,
      `${sep.snapshotAt.toISOString()}`,
    );
    const early = instructId ? await replayAction(b, instructId, [sep.id]) : "";
    ok("instrucción de pago antes de anclar la raíz → rechazada", /aún no está anclada/.test(early));

    // The queue replays the token's own check: a snapshot supply that differs from totalSupplyAt(record) would revert.
    await db.chainTransaction.update({ where: { id: sepAnchor.id }, data: { args: { ...sepAnchor.args, snapshotSupply: yHolders[0].units + 1 } } });
    await openDistributions(b, offering.code);
    const blocked = await b.$eval('[data-distribution="2026-09"]', (n) => n.textContent);
    await db.chainTransaction.update({ where: { id: sepAnchor.id }, data: { args: sepAnchor.args } });
    ok(
      "cola: una oferta total distinta a la registrada a la fecha de corte → «Revertiría: SnapshotSupplyMismatch(201, 200)»",
      new RegExp(`SnapshotSupplyMismatch\\(${yHolders[0].units + 1}, ${yHolders[0].units}\\)`).test(blocked),
    );
    await openDistributions(b, offering.code);
    await clickIn(b, '[data-distribution="2026-09"]', "Firmar y ejecutar");
    await b.waitForSelector('[data-distribution="2026-09"][data-distribution-status="ANCHORED"]', { timeout: 90000 });
    await clickIn(b, '[data-distribution="2026-09"]', "Emitir instrucción de pago");
    await b.waitForSelector('[data-distribution="2026-09"] [data-payout-batch="1"]', { timeout: 60000 });
    const usdc = await db.distributionPayoutBatch.findFirstOrThrow({ where: { distributionId: sep.id } });
    ok(
      "instrucción USDC: la ejecuta la tesorería del emisor, con unidades base de 6 decimales (12.500,50 → 12500500000)",
      usdc.instruction.executor === "issuer-treasury" && usdc.instruction.payees[0].baseUnits === "12500500000" && usdc.instructionHash === sha256(canon(usdc.instruction)),
    );
    await shot(b, "distributions-desk", { fullPage: true });

    // ── 8 · RLS from another tenant's host ─────────────────────────────────
    const e = await (await browser.createBrowserContext()).newPage();
    await openBackofficeTab(e, "elpoblado", "Distribuciones y Rendimientos");
    await waitText(e, "Ninguna oferta de este tenant tiene su token emitido");
    const fromElpoblado = await replayAction(e, declareId, [{ ...input, period: "2026-Q4" }]);
    const payFromElpoblado = instructId ? await replayAction(e, instructId, [q3.id]) : "";
    const supportFromElpoblado = await vaultGet(e, `/api/vault/distribution/${q3.id}`);
    ok(
      "desde elpoblado.localhost: la oferta, la distribución y su soporte de avista no existen (RLS)",
      /Oferta no encontrada en este tenant/.test(fromElpoblado) && /Distribución no encontrada en este tenant/.test(payFromElpoblado) && supportFromElpoblado.status === 404,
      `${supportFromElpoblado.status}`,
    );
    await e.browserContext().close();

    // ── 9 · Append-only for the app role ───────────────────────────────────
    const app = new PrismaClient({ datasourceUrl: poolUrl(process.env.DATABASE_URL) });
    try {
      const refused = [];
      for (const sql of [
        "UPDATE distribution_payouts SET amount = 1",
        "DELETE FROM distribution_payouts",
        "UPDATE distribution_payout_batches SET total_amount = 1",
        "DELETE FROM distribution_payout_batches",
      ]) {
        try {
          await app.$transaction([app.$executeRaw`SELECT set_config('app.current_organization_id', ${org.id}, TRUE)`, app.$executeRawUnsafe(sql)]);
          refused.push(false);
        } catch (err) {
          refused.push(/permission denied/i.test(err.meta?.message || err.message || ""));
        }
      }
      ok("rwaxi_app no puede modificar ni borrar instrucciones de pago (append-only)", refused.every(Boolean), refused.join(","));
    } finally {
      await app.$disconnect();
    }
    // In PostgreSQL itself, for every role — the owner included: a declared distribution keeps what it declared.
    const ownerRefused = [];
    for (const sql of [
      `UPDATE distributions SET amount_declared = 1 WHERE id = '${q3.id}'`,
      `UPDATE distributions SET support_sha256 = '0x${"a".repeat(64)}' WHERE id = '${q3.id}'`,
      `UPDATE distributions SET anchor_tx_hash = '0x${"c".repeat(64)}' WHERE id = '${q3.id}'`,
      `DELETE FROM distributions WHERE id = '${q3.id}'`,
      `UPDATE distribution_allocations SET amount = 0 WHERE distribution_id = '${q3.id}'`,
      `DELETE FROM distribution_payouts WHERE allocation_id IN (SELECT id FROM distribution_allocations WHERE distribution_id = '${q3.id}')`,
    ]) {
      try {
        await db.$executeRawUnsafe(sql);
        ownerRefused.push("ejecutado");
      } catch (err) {
        ownerRefused.push(/inmutables|no se elimina|no cambia|solo inserción/.test(err.meta?.message || err.message || "") ? "rechazado" : "otro error");
      }
    }
    const q3Final = await db.distribution.findUniqueOrThrow({ where: { id: q3.id } });
    ok(
      "inmutable en PostgreSQL (también para el owner): monto, SHA-256 del soporte y anclaje no cambian; ni la distribución ni sus asignaciones ni sus pagos se eliminan",
      ownerRefused.every((x) => x === "rechazado") &&
        Number(q3Final.amountDeclared) === 41_000_000 &&
        q3Final.supportSha256 === support1.sha256 &&
        q3Final.anchorTxHash === anchored.txHash,
      ownerRefused.join(","),
    );

    // ── 10 · The supporting document: served re-hashed and audited; tampering is blocked ──
    const fromDesk = await vaultGet(b, `/api/vault/distribution/${q3.id}`);
    const deskRead = await db.auditEvent.findFirst({ where: { organizationId: org.id, action: "DISTRIBUTION_SUPPORT_DOWNLOADED", entityId: q3.id }, orderBy: { createdAt: "desc" } });
    ok(
      "«Ver soporte» desde el backoffice: el archivo con su SHA-256 registrado, y DISTRIBUTION_SUPPORT_DOWNLOADED en la auditoría",
      fromDesk.status === 200 && fromDesk.sha256 === support1.sha256 && deskRead?.payload.by === "backoffice" && deskRead.subjectHash === support1.sha256,
      `${fromDesk.status}`,
    );
    const file = vaultPath(org.id, support1.sha256);
    fs.writeFileSync(file, Buffer.concat([stored, Buffer.from("alterado")]));
    const tampered = await vaultGet(b, `/api/vault/distribution/${q3.id}`);
    fs.writeFileSync(file, stored);
    const incident = await db.auditEvent.findFirst({ where: { organizationId: org.id, action: "VAULT_INTEGRITY_FAILED", entityId: q3.id } });
    ok("un soporte alterado en la bóveda → 409 y VAULT_INTEGRITY_FAILED (el original se restaura)", tampered.status === 409 && !!incident, tampered.error);

    // ── 11 · Investor portfolio: paid in COP, record date, support hash, proof verified in the browser ──
    await a.goto(url("avista"), { waitUntil: "domcontentloaded" });
    await a.waitForSelector('[data-distribution-allocation="2026-Q3"][data-payout="instructed-2"]', { timeout: 90000 });
    await clickIn(a, '[data-distribution-allocation="2026-Q3"]', "Verificar prueba de Merkle");
    await a.waitForSelector('[data-distribution-allocation="2026-Q3"] [data-proof-check]', { timeout: 30000 });
    const item = await a.$eval('[data-distribution-allocation="2026-Q3"]', (n) => ({ check: n.querySelector("[data-proof-check]").dataset.proofCheck, text: n.textContent }));
    ok(
      "portafolio: asignación en COP, fecha de corte, SHA-256 del soporte, «Pago instruido · instrucción #2» y prueba v2 válida en el navegador",
      item.check === "valid" &&
        item.text.includes(`Fecha de corte ${today}`) &&
        item.text.includes(support1.sha256.slice(0, 10)) &&
        item.text.includes("Pago instruido · instrucción #2") &&
        item.text.includes("COP"),
      item.text.slice(0, 140),
    );
    await shot(a, "distributions-portfolio", { fullPage: true });

    // ── 12 · The console supervises (module D): read-only, every tenant, audited support reads ──
    const s = await (await browser.createBrowserContext()).newPage();
    await s.goto(url("admin"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await s.waitForSelector("[data-platform-overview]", { timeout: 180000 });
    await s.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((x) => x.textContent.includes("Supervisión de Distribuciones")).click());
    await s.waitForSelector(`[data-platform-distribution="${q3.id}"]`, { timeout: 60000 });
    const consoleRow = await s.$eval(`[data-platform-distribution="${q3.id}"]`, (n) => ({
      status: n.dataset.status,
      instructed: n.querySelector("[data-payouts-instructed]")?.dataset.payoutsInstructed,
      batches: n.querySelectorAll("[data-console-batch]").length,
      support: n.querySelector("[data-support-sha256]")?.dataset.supportSha256,
    }));
    const consoleButtons = await s.$$eval("[data-platform-distributions] button", (ns) => ns.map((n) => n.textContent.trim()));
    ok(
      "Módulo D: la distribución con raíz anclada, 2/2 asignaciones instruidas en 2 instrucciones y el SHA-256 del soporte; sin acciones (solo lectura)",
      consoleRow.status === "ANCHORED" &&
        consoleRow.instructed === "2" &&
        consoleRow.batches === 2 &&
        consoleRow.support === support1.sha256 &&
        !consoleButtons.some((t) => /Declarar|Emitir|Firmar|Anclar|Pagar/i.test(t)),
      consoleButtons.join(" | "),
    );
    const fromConsole = await vaultGet(s, `/api/vault/distribution/${q3.id}`);
    const consoleRead = await db.auditEvent.findFirst({ where: { organizationId: org.id, action: "DISTRIBUTION_SUPPORT_DOWNLOADED", entityId: q3.id }, orderBy: { createdAt: "desc" } });
    ok(
      "la consola descarga el soporte re-hasheado; queda auditado en el registro del desarrollador como lectura de la plataforma",
      fromConsole.status === 200 && fromConsole.sha256 === support1.sha256 && consoleRead?.payload.by === "platform",
      `${fromConsole.status}`,
    );
    await shot(s, "distributions-console", { fullPage: true });
    await s.browserContext().close();
  } catch (e) {
    fail(e);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})();
