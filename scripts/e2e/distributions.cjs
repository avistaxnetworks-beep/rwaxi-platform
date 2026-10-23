// E2E · yield distributions with a real Merkle tree, against Neon:
//   a second investor goes through NDA → KYC → payment → mint, so the offering has two MINTED holders;
//   the backoffice declares distributions (USD and COP), the pro-rata split, leaves, proofs and root
//   are recomputed independently, the anchorDistributionRoot() call is decoded and re-verified after
//   its signed execution, RLS isolates every action, and the investor's portfolio verifies its proof.
const lib = require("./lib.cjs");
const { launch, ownerDb, ok, fail, shot, url, viem, viemAccounts, viemChains, abi, canon, sha256, merkleRoot, foldProof, webEnv } = lib;
const { waitText, clickText, clickIn, fill, toastText, alertText, openBackofficeTab, replayAction } = lib;

const db = ownerDb();
const tokenAbi = abi("RwaxiPropertyToken");
const operator = viemAccounts.privateKeyToAccount(webEnv("OPERATOR_PRIVATE_KEY"));
const CHAIN_ID = { POLYGON: viemChains.polygon.id, BASE: viemChains.base.id, POLYGON_AMOY: viemChains.polygonAmoy.id, BASE_SEPOLIA: viemChains.baseSepolia.id, HARDHAT: viemChains.hardhat.id };
const ANCHOR = "anchorDistributionRoot(bytes32,bytes32,uint256,uint256)";

// Independent largest-remainder split in integer cents (ties: larger holding, then lower key).
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
const leafOf = (distributionId, wallet, units, amountCents) =>
  sha256(canon({ v: 1, kind: "rwaxi.distribution.allocation", distributionId, wallet: wallet.toLowerCase(), units, amountCents }));
/** USD cents of a COP amount at a COP/USD rate, both with 2 decimals, rounded half up. */
const copToUsdCents = (cop, fx) => {
  const [a, f] = [BigInt(Math.round(Number(cop) * 100)), BigInt(Math.round(Number(fx) * 100))];
  return Number((a * 200n + f) / (2n * f));
};

async function declare(page, offeringId, { period, currency, amount, fxRate }) {
  await fill(page, `#dist-period-${offeringId}`, period);
  await page.select(`#dist-currency-${offeringId}`, currency);
  await fill(page, `#dist-amount-${offeringId}`, amount);
  if (fxRate) {
    await page.waitForSelector(`#dist-fx-${offeringId}`, { timeout: 10000 });
    await fill(page, `#dist-fx-${offeringId}`, fxRate);
  }
  await page.waitForFunction((id) => !document.querySelector(`[data-declare-distribution="${id}"]`)?.disabled, { timeout: 10000 }, offeringId);
}

(async () => {
  const browser = await launch();
  try {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "avista" } });
    const elpoblado = await db.organization.findUniqueOrThrow({ where: { slug: "elpoblado" }, include: { offerings: true } });
    const offering = await db.offering.findFirstOrThrow({ where: { organizationId: org.id, token: { status: "DEPLOYED" } }, include: { token: true } });
    const admin = await db.user.findFirstOrThrow({ where: { organizationId: org.id, role: "TENANT_ADMIN", active: true }, orderBy: { createdAt: "asc" } });

    // ── 1 · A second MINTED holder through the whole persisted flow ────────
    const { page: a, investor } = await lib.onboardInvestor(browser, db, "avista");
    const b = await (await browser.createBrowserContext()).newPage();
    b.on("pageerror", (e) => console.log("PAGEERROR(B)", e.message));
    const actions = {};
    b.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (req.method() === "POST" && id) actions[req.postData() ?? ""] = id;
    });
    await lib.approveInvestor(b, "avista", investor.id);
    await lib.subscribe(a, "avista");
    const sub = await db.subscription.findFirstOrThrow({ where: { investorId: investor.id } });
    await openBackofficeTab(b, "avista", "Suscripciones y Pagos");
    await lib.confirmPayment(b, sub.id, "FID-DIST-000451");
    await clickText(b, "Procesar cola en orden");
    await b.waitForSelector(`tr[data-subscription="${sub.id}"][data-sub-status="MINTED"]`, { timeout: 90000 });
    const minted = await db.subscription.findMany({ where: { offeringId: offering.id, status: "MINTED" }, include: { investor: true } });
    const holders = Object.values(
      minted.reduce((m, s) => ((m[s.investorId] = { key: s.investorId, wallet: s.investor.walletAddress, name: s.investor.fullName, units: (m[s.investorId]?.units ?? 0) + s.units }), m), {}),
    );
    const supply = holders.reduce((s, h) => s + h.units, 0);
    ok("dos tenedores MINTED en P-03 (seed + inversionista nuevo de 250 tokens)", holders.length === 2 && holders.some((h) => h.key === investor.id && h.units === 250), holders.map((h) => `${h.name} ${h.units}`).join(" · "));

    // ── 2 · Backoffice · "Distribuciones y Rendimientos": snapshot and preview ──
    await openBackofficeTab(b, "avista", "Distribuciones y Rendimientos");
    await b.waitForSelector(`[data-distribution-offering="${offering.code}"]`, { timeout: 90000 });
    const snapshot = await b.$$eval(`[data-distribution-offering="${offering.code}"] [data-holder]`, (n) => n.map((x) => x.dataset.holder));
    ok("snapshot de tenedores = MINTED en PostgreSQL (wallets y tokens)", snapshot.length === 2 && holders.every((h) => snapshot.includes(h.wallet)), `${supply} tokens`);
    await declare(b, offering.id, { period: "2026-Q3", currency: "USD", amount: "10000" });
    const preview = await b.$$eval("[data-holder]", (n) => Object.fromEntries(n.map((x) => [x.dataset.holder, Number(x.querySelector("[data-preview-cents]").dataset.previewCents)])));
    const expectedQ3 = prorata(1_000_000, holders);
    ok(
      "vista previa en el navegador: 10.000 USD → 4.444,44 / 5.555,56 (centavos exactos, mayor residuo)",
      holders.every((h) => preview[h.wallet] === expectedQ3.get(h.key)) && expectedQ3.get(investor.id) === 555556 && [...expectedQ3.values()].reduce((x, y) => x + y, 0) === 1_000_000,
      JSON.stringify(Object.values(preview)),
    );
    await shot(b, "distributions-preview", { fullPage: true });

    // ── 3 · Declare: distribution, allocations with proofs, queued anchor, audit ──
    await clickIn(b, `[data-distribution-offering="${offering.code}"]`, "Declarar y encolar raíz de Merkle");
    await b.waitForSelector('[data-distribution="2026-Q3"]', { timeout: 60000 });
    const toast = await toastText(b);
    const q3 = await db.distribution.findFirstOrThrow({ where: { offeringId: offering.id, period: "2026-Q3" }, include: { allocations: true } });
    const expectedId = viem.keccak256(viem.toHex(`rwaxi.distribution:${offering.id}:2026-Q3`));
    ok(
      "Distribution 2026-Q3: 10.000 USD · 450 tokens · 2 tenedores · DECLARED · distributionId = keccak256(oferta:periodo)",
      q3.currency === "USD" && Number(q3.amountDeclared) === 10000 && Number(q3.totalUsd) === 10000 && q3.totalUnits === supply && q3.holders === 2 && q3.status === "DECLARED" && q3.onchainId === expectedId && q3.declaredById === admin.id,
      toast,
    );
    const allocs = q3.allocations;
    ok(
      "asignaciones prorrata por tokens MINTED; suman exactamente el total",
      allocs.length === 2 && allocs.every((x) => Math.round(Number(x.amountUsd) * 100) === expectedQ3.get(x.investorId)) && allocs.reduce((s, x) => s + Math.round(Number(x.amountUsd) * 100), 0) === 1_000_000,
      allocs.map((x) => `${x.units} → ${x.amountUsd}`).join(" · "),
    );
    const leaves = allocs.map((x) => leafOf(q3.onchainId, x.wallet, x.units, Math.round(Number(x.amountUsd) * 100)));
    ok("hojas = SHA-256(JSON canónico de cada asignación), recalculadas independientemente", allocs.every((x, i) => x.leafHash === leaves[i]));
    ok("raíz de Merkle recalculada de las hojas = Distribution.merkleRoot", merkleRoot(leaves) === q3.merkleRoot, q3.merkleRoot);
    ok("cada merkleProof persistida reconstruye la raíz", allocs.every((x) => foldProof(x.leafHash, x.merkleProof) === q3.merkleRoot), allocs.map((x) => `${x.merkleProof.length} hash`).join(" · "));
    const anchorTx = await db.chainTransaction.findFirstOrThrow({ where: { organizationId: org.id, kind: "DISTRIBUTION_ROOT_ANCHORED", args: { path: ["distributionId"], equals: q3.onchainId } } });
    const calldata = viem.encodeFunctionData({ abi: tokenAbi, functionName: "anchorDistributionRoot", args: [q3.onchainId, q3.merkleRoot, 1_000_000n, BigInt(supply)] });
    ok(
      "anchorDistributionRoot(distributionId, root, 1.000.000 centavos, 450) en cola contra el token de la oferta",
      anchorTx.status === "PENDING" && anchorTx.method === ANCHOR && anchorTx.contractAddress === offering.token.contractAddress && anchorTx.args.merkleRoot === q3.merkleRoot && anchorTx.args.totalAmountCents === "1000000" && anchorTx.args.snapshotSupply === supply && calldata.slice(0, 10) === viem.toFunctionSelector(ANCHOR),
    );
    const declaredAudit = await db.auditEvent.findFirstOrThrow({ where: { organizationId: org.id, action: "DISTRIBUTION_DECLARED", entityId: q3.id } });
    ok(
      "AuditEvent DISTRIBUTION_DECLARED: subjectHash = raíz, snapshot de asignaciones y actor TENANT_ADMIN",
      declaredAudit.subjectHash === q3.merkleRoot && declaredAudit.actorEmail === admin.email && declaredAudit.payload.allocations.length === 2 && declaredAudit.payload.allocations.every((x) => leaves.includes(x.leaf)) && declaredAudit.payload.chainTransactionId === anchorTx.id,
    );

    // ── 4 · The server re-validates (replayed with the captured action id) ──
    const [body, declareId] = Object.entries(actions).find(([bd]) => bd.includes("2026-Q3") && bd.includes(offering.id)) ?? [];
    const input = JSON.parse(body ?? "[{}]")[0];
    const replay = (patch) => replayAction(b, declareId, [{ ...input, ...patch }]);
    const results = {
      duplicate: await replay({}),
      period: await replay({ period: "2026-13" }),
      amount: await replay({ amount: "-5" }),
      currency: await replay({ currency: "EUR" }),
      fx: await replay({ period: "2026-08", currency: "COP", amount: "41000000", fxRate: "12" }),
      foreign: await replay({ offeringId: elpoblado.offerings[0].id }),
    };
    ok("periodo duplicado → rechazado (una distribución por oferta y periodo)", /Ya existe una distribución de ese periodo/.test(results.duplicate));
    ok(
      "servidor: periodo, monto, moneda y tasa COP/USD inválidos → rechazados",
      /Periodo/.test(results.period) && /Monto en USD/.test(results.amount) && /Moneda/.test(results.currency) && /Tasa COP\/USD/.test(results.fx),
    );
    ok("la oferta de otro tenant desde el host de avista → no encontrada (RLS)", /Oferta no encontrada en este tenant/.test(results.foreign));
    ok("nada escrito por los intentos rechazados", (await db.distribution.count({ where: { organizationId: org.id } })) === 1 && (await db.distribution.count({ where: { organizationId: elpoblado.id } })) === 0);

    const e = await (await browser.createBrowserContext()).newPage();
    await openBackofficeTab(e, "elpoblado", "Distribuciones y Rendimientos");
    await waitText(e, "Ninguna oferta de este tenant tiene su token emitido");
    const fromElpoblado = await replayAction(e, declareId, [{ ...input, period: "2026-Q4" }]);
    const ownUndeployed = await replayAction(e, declareId, [{ ...input, offeringId: elpoblado.offerings[0].id, period: "2026-Q4" }]);
    ok(
      "desde elpoblado.localhost: la oferta de avista no existe (RLS) y la propia no tiene token emitido",
      /Oferta no encontrada en este tenant/.test(fromElpoblado) && /no está desplegado/.test(ownUndeployed) && (await db.distribution.count()) === 1,
    );
    await e.browserContext().close();

    // ── 5 · COP declarations: converted at the declared rate, rounded half up ──
    await b.reload({ waitUntil: "domcontentloaded" });
    await b.waitForFunction(() => [...document.querySelectorAll('[role="tab"]')].some((t) => t.textContent.includes("Distribuciones")), { timeout: 90000 });
    await b.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes("Distribuciones")).click());
    await b.waitForSelector(`[data-distribution-offering="${offering.code}"]`, { timeout: 60000 });
    await declare(b, offering.id, { period: "2026-09", currency: "COP", amount: "12345678.90", fxRate: "3987.65" });
    await clickIn(b, `[data-distribution-offering="${offering.code}"]`, "Declarar y encolar raíz de Merkle");
    await b.waitForSelector('[data-distribution="2026-09"]', { timeout: 60000 });
    const sep = await db.distribution.findFirstOrThrow({ where: { offeringId: offering.id, period: "2026-09" }, include: { allocations: true } });
    const sepCents = copToUsdCents("12345678.90", "3987.65");
    const expectedSep = prorata(sepCents, holders);
    ok(
      "COP 12.345.678,90 a 3.987,65 → 3.095,98 USD; asignaciones, hojas y raíz recalculadas",
      sep.currency === "COP" && Number(sep.amountDeclared) === 12345678.9 && Number(sep.fxRate) === 3987.65 && Math.round(Number(sep.totalUsd) * 100) === sepCents &&
        sep.allocations.every((x) => Math.round(Number(x.amountUsd) * 100) === expectedSep.get(x.investorId) && x.leafHash === leafOf(sep.onchainId, x.wallet, x.units, expectedSep.get(x.investorId))) &&
        merkleRoot(sep.allocations.map((x) => x.leafHash)) === sep.merkleRoot,
      `${sep.totalUsd} USD · ${sep.allocations.map((x) => x.amountUsd).join(" / ")}`,
    );

    // ── 6 · The issuer anchors the root: signed, decoded and confirmed ──────
    await b.waitForSelector(`[data-anchor-execute="${anchorTx.id}"]`, { timeout: 30000 });
    await clickIn(b, '[data-distribution="2026-Q3"]', "Firmar y ejecutar");
    await b.waitForSelector('[data-distribution="2026-Q3"][data-distribution-status="ANCHORED"]', { timeout: 90000 });
    const anchored = await db.chainTransaction.findUniqueOrThrow({ where: { id: anchorTx.id } });
    const q3After = await db.distribution.findUniqueOrThrow({ where: { id: q3.id } });
    const parsed = viem.parseTransaction(anchored.signedTransaction);
    const signer = await viem.recoverTransactionAddress({ serializedTransaction: anchored.signedTransaction });
    const call = viem.decodeFunctionData({ abi: tokenAbi, data: parsed.data });
    ok(
      "ejecutada: txHash = keccak256(tx firmada) · chainId/nonce/to · calldata anchorDistributionRoot(id, raíz, 1000000, 450)",
      anchored.status === "CONFIRMED" &&
        anchored.executionMode === "SIMULATION" &&
        anchored.txHash === viem.keccak256(anchored.signedTransaction) &&
        signer === operator.address &&
        parsed.chainId === CHAIN_ID[anchored.network] &&
        parsed.nonce === anchored.nonce &&
        parsed.to.toLowerCase() === offering.token.contractAddress.toLowerCase() &&
        call.functionName === "anchorDistributionRoot" &&
        call.args[0] === q3.onchainId &&
        call.args[1] === q3.merkleRoot &&
        call.args[2] === 1_000_000n &&
        call.args[3] === BigInt(supply),
      `nonce ${anchored.nonce}`,
    );
    ok("Distribution → ANCHORED con anchorTxHash = hash confirmado (la del COP sigue DECLARED)", q3After.status === "ANCHORED" && q3After.anchorTxHash === anchored.txHash && (await db.distribution.findUniqueOrThrow({ where: { id: sep.id } })).status === "DECLARED");
    const confirmedAudit = await db.auditEvent.findFirst({ where: { organizationId: org.id, action: "CHAIN_TX_CONFIRMED", entityId: anchorTx.id } });
    ok("AuditEvent CHAIN_TX_CONFIRMED del administrador (DISTRIBUTION_ROLE del emisor)", confirmedAudit?.actorEmail === admin.email && confirmedAudit.payload.kind === "DISTRIBUTION_ROOT_ANCHORED");
    const executeId = Object.entries(actions).find(([bd]) => bd.includes(anchorTx.id))?.[1];
    const again = executeId ? await replayAction(b, executeId, [anchorTx.id]) : "";
    ok("re-anclar la misma raíz → rechazado (DistributionAlreadyAnchored / ya no PENDING)", /ya|PENDING/i.test(again) && (await db.chainTransaction.findUniqueOrThrow({ where: { id: anchorTx.id } })).txHash === anchored.txHash, again.match(/"error":"([^"]+)"/)?.[1]);
    await shot(b, "distributions-anchored", { fullPage: true });

    // ── 7 · Investor portfolio: allocations from Neon, proof verified in the browser ──
    await a.goto(url("avista"), { waitUntil: "domcontentloaded" });
    await a.waitForSelector("[data-investor-distributions]", { timeout: 90000 });
    const mine = await db.distributionAllocation.findMany({ where: { investorId: investor.id }, include: { distribution: true } });
    const shown = await a.$$eval("[data-distribution-allocation]", (n) => n.map((x) => ({ period: x.dataset.distributionAllocation, status: x.dataset.status })));
    const total = await a.$eval("[data-distributions-total]", (n) => Number(n.dataset.distributionsTotal));
    ok(
      "portafolio: sus 2 distribuciones con estado (Q3 anclada, 2026-09 en cola) y total asignado",
      shown.length === 2 && shown.find((x) => x.period === "2026-Q3")?.status === "ANCHORED" && shown.find((x) => x.period === "2026-09")?.status === "DECLARED" && Math.round(total * 100) === mine.reduce((s, x) => s + Math.round(Number(x.amountUsd) * 100), 0),
      `${total} USD`,
    );
    for (const alloc of mine) await clickIn(a, `[data-distribution-allocation="${alloc.distribution.period}"]`, "Verificar prueba de Merkle");
    await a.waitForFunction(() => document.querySelectorAll("[data-proof-check]").length === 2, { timeout: 30000 });
    const checks = await a.$$eval("[data-proof-check]", (n) => n.map((x) => x.dataset.proofCheck));
    ok("«Verificar prueba de Merkle» en el navegador: ambas pruebas reconstruyen la raíz", checks.every((c) => c === "valid"), checks.join(" · "));
    await clickIn(a, '[data-distribution-allocation="2026-Q3"]', "Ver prueba");
    const panel = await a.$eval('[data-distribution-allocation="2026-Q3"]', (n) => n.innerText);
    const q3Mine = mine.find((x) => x.distribution.period === "2026-Q3");
    ok(
      "la prueba mostrada al inversionista = raíz anclada, su hoja, sus hermanos y el tx hash con su modo",
      panel.includes(q3.merkleRoot) && panel.includes(q3Mine.leafHash) && q3Mine.merkleProof.every((h) => panel.includes(h)) && /simulación firmada/.test(panel),
    );
    await shot(a, "distributions-portfolio", { fullPage: true });
  } catch (e) {
    fail(e);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})();
