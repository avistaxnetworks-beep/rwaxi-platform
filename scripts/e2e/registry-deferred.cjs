// E2E · deferred compliance registry, Super-Admin module A, against Neon (SIMULATION):
//   a developer onboarded without staff wallets shows «Registro diferido · faltan las wallets»; «Declarar wallets y
//   desplegar» checks the two wallets (valid, distinct, never RWAXI's operator) in the browser and again in the
//   server (forged calls), stores them on the TENANT_ADMIN and COMPLIANCE_OFFICER, queues deployTenantRegistry()
//   with REGISTRY_WALLETS_DECLARED and has RWAXI's operator execute it at once. A reverted deployment offers the
//   declaration again; an execution that fails leaves the wallets stored and the call PENDING with why it failed
//   (alert + row), and «Desplegar registro» retries that same row until the ERC-3643 registry is active (mode shown).
// One onboarding only: the wizard's Data Room uploads count against the vault's per-session limit.
const crypto = require("crypto");
const lib = require("./lib.cjs");
const { launch, ownerDb, ok, fail, shot, viem, viemAccounts, canon, sha256, webEnv } = lib;
const { nitOf, randomNitBase, clickText, clickIn, fill, waitAlert, alertText, waitToast, toastText, openGovernance, onboardTenant, replayAction } = lib;

const db = ownerDb();
const operator = viemAccounts.privateKeyToAccount(webEnv("OPERATOR_PRIVATE_KEY")).address.toLowerCase();
const auditHash = (e) => sha256(canon({ action: e.action, organizationId: e.organizationId, entityId: e.entityId, ...e.payload }));
const randomWallet = () => `0x${crypto.randomBytes(20).toString("hex")}`;
const mixedCase = (w) => `0x${w.slice(2).toUpperCase()}`;
const optionalEnv = (key) => {
  try {
    return webEnv(key);
  } catch {
    return null;
  }
};
const rowOf = (page, slug) =>
  page.$eval(`[data-governance-row="${slug}"]`, (n) => {
    const cell = n.querySelector("[data-registry-status]");
    return {
      status: cell?.dataset.registryStatus,
      mode: cell?.querySelector("[data-registry-mode]")?.dataset.registryMode ?? null,
      text: cell?.textContent ?? "",
      error: cell?.querySelector("[data-registry-error]")?.textContent ?? null,
    };
  });
const waitStatus = (page, slug, status) =>
  page.waitForFunction(
    (sl, st) => document.querySelector(`[data-governance-row="${sl}"] [data-registry-status]`)?.dataset.registryStatus === st,
    { timeout: 90000 },
    slug,
    status,
  );
/** CREATE address of the registry confirmed by row `tx` in SIMULATION: factory nonce = 1 + the contracts it created before. */
async function registryAddressOf(tx) {
  const made = await db.chainTransaction.count({
    where: {
      id: { not: tx.id },
      network: tx.network,
      status: "CONFIRMED",
      executionMode: "SIMULATION",
      kind: { in: ["TENANT_REGISTRY_DEPLOYED", "OFFERING_TOKEN_DEPLOYED"] },
      contractAddress: { equals: tx.contractAddress, mode: "insensitive" },
    },
  });
  return viem.getContractAddress({ from: tx.contractAddress, nonce: BigInt(1 + made) });
}

(async () => {
  const browser = await launch();
  try {
    const s = await (await browser.createBrowserContext()).newPage();
    s.on("pageerror", (e) => console.log("PAGEERROR(S)", e.message));
    const actions = {};
    s.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (req.method() === "POST" && id) actions[req.postData() ?? ""] = id;
    });

    // ── 1 · Onboarding without wallets: nothing queued, the registry is deferred ──
    const suffix = crypto.randomBytes(3).toString("hex");
    const slug = `registro-${suffix}`;
    await onboardTenant(s, {
      slug,
      legalName: `Inmobiliaria Registro ${suffix.toUpperCase()} S.A.S.`,
      displayName: `Registro ${suffix.toUpperCase()}`,
      nit: nitOf(randomNitBase()),
      wallets: false,
    });
    const org = await db.organization.findUniqueOrThrow({ where: { slug }, include: { users: true, chainTxs: true, offerings: true } });
    const offering = org.offerings[0];
    const onboarded = await db.auditEvent.findFirstOrThrow({ where: { organizationId: org.id, action: "ORGANIZATION_ONBOARDED" } });
    ok(
      "alta sin wallets: ningún deployTenantRegistry() en cola, staff sin wallet, registryDeferred en la auditoría",
      org.chainTxs.length === 0 &&
        org.complianceRegistry === null &&
        org.users.length === 2 &&
        org.users.every((u) => u.walletAddress === null) &&
        onboarded.payload.registryDeferred === true,
    );

    await openGovernance(s);
    await s.waitForSelector(`[data-governance-row="${slug}"] [data-declare-wallets]`, { timeout: 60000 });
    const deferred = await rowOf(s, slug);
    ok(
      "Módulo A: «Registro diferido · faltan las wallets» con «Declarar wallets y desplegar»",
      deferred.status === "DEFERRED" && deferred.text.includes("Registro diferido · faltan las wallets") && deferred.text.includes("Declarar wallets y desplegar"),
      deferred.text,
    );

    // ── 2 · The dialog checks the wallets as they are typed ──
    const openDeclare = async () => {
      await clickIn(s, `[data-governance-row="${slug}"]`, "Declarar wallets y desplegar");
      await s.waitForSelector("[data-governance-dialog] #gov-wallet-admin", { timeout: 30000 });
    };
    const confirmDisabled = () =>
      s.$eval('[role="dialog"]', (d) => [...d.querySelectorAll("button")].find((b) => b.textContent.includes("Confirmar decisión")).disabled);
    const problem = () => s.$eval("[data-wallets-problem]", (n) => n.textContent).catch(() => "");
    await openDeclare();
    const same = randomWallet();
    await fill(s, "#gov-wallet-admin", same);
    await fill(s, "#gov-wallet-officer", mixedCase(same));
    const sameProblem = await problem();
    const sameDisabled = await confirmDisabled();
    await fill(s, "#gov-wallet-officer", operator);
    const operatorProblem = await problem();
    const operatorDisabled = await confirmDisabled();
    ok(
      "formulario: wallets iguales (aun en otras mayúsculas) o la del operador RWAXI → aviso y «Confirmar» deshabilitado",
      /distintas/.test(sameProblem) && sameDisabled && /operador RWAXI/.test(operatorProblem) && operatorDisabled,
      `${sameProblem} | ${operatorProblem}`,
    );
    await clickText(s, "Cancelar", '[role="dialog"]');

    // ── 3 · A reverted deployment offers the declaration again ──
    // the factory the console uses (factoryFor): RWAXI_FACTORY_ADDRESS, else the one used on that network, else any
    const known = async (where) =>
      (await db.chainTransaction.findFirst({ where: { kind: "TENANT_REGISTRY_DEPLOYED", ...where }, orderBy: { createdAt: "desc" } }))?.contractAddress;
    const factory = optionalEnv("RWAXI_FACTORY_ADDRESS") || (await known({ network: offering.network })) || (await known({}));
    if (!factory) throw new Error("No hay RwaxiTenantFactory conocida: define RWAXI_FACTORY_ADDRESS");
    await db.chainTransaction.create({
      data: {
        organizationId: org.id,
        offeringId: offering.id,
        network: offering.network,
        kind: "TENANT_REGISTRY_DEPLOYED",
        contractAddress: factory,
        method: "deployTenantRegistry(bytes32,string,string,address,address)",
        args: { organizationId: org.onchainId, organizationTaxId: org.taxId, complianceRegime: org.complianceRegime, tenantAdmin: randomWallet(), complianceOfficer: randomWallet() },
        status: "REVERTED",
        error: "reverted on-chain",
      },
    });
    await openGovernance(s);
    await waitStatus(s, slug, "REVERTED");
    const reverted = await rowOf(s, slug);
    ok(
      "despliegue revertido: «Despliegue revertido en red» y de nuevo «Declarar wallets y desplegar»",
      reverted.text.includes("Despliegue revertido en red") && reverted.text.includes("Declarar wallets y desplegar"),
      reverted.text,
    );

    // ── 4 · Declare valid wallets while the execution fails: wallets stored, call PENDING with its error ──
    // Fixture: an organizationId that is not a bytes32 cannot be encoded, so RWAXI's operator cannot execute the call.
    await db.organization.update({ where: { id: org.id }, data: { onchainId: `sin-bytes32-${suffix}` } });
    const adminWallet = randomWallet();
    const officerWallet = randomWallet();
    await openDeclare();
    await fill(s, "#gov-wallet-admin", mixedCase(adminWallet));
    await fill(s, "#gov-wallet-officer", officerWallet);
    await clickText(s, "Confirmar decisión", '[role="dialog"]');
    await waitAlert(s, /declaradas y despliegue en cola, pero la ejecución falló/);
    const warning = await alertText(s);
    await waitStatus(s, slug, "PENDING");
    await s.waitForFunction((sl) => !!document.querySelector(`[data-governance-row="${sl}"] [data-registry-error]`), { timeout: 60000 }, slug);
    const failedRow = await rowOf(s, slug);
    const failedOrg = await db.organization.findUniqueOrThrow({ where: { id: org.id }, include: { users: true } });
    const queued = await db.chainTransaction.findFirstOrThrow({ where: { organizationId: org.id, kind: "TENANT_REGISTRY_DEPLOYED", status: "PENDING" } });
    const declared = await db.auditEvent.findFirst({ where: { organizationId: org.id, action: "REGISTRY_WALLETS_DECLARED" } });
    ok(
      "wallets guardadas (minúsculas) en el administrador y el oficial, con REGISTRY_WALLETS_DECLARED (SHA-256 recalculado)",
      failedOrg.users.find((u) => u.role === "TENANT_ADMIN").walletAddress === adminWallet &&
        failedOrg.users.find((u) => u.role === "COMPLIANCE_OFFICER").walletAddress === officerWallet &&
        !!declared &&
        declared.payload.tenantAdmin === adminWallet &&
        declared.payload.complianceOfficer === officerWallet &&
        declared.payload.previous.tenantAdmin === null &&
        declared.payload.registryChainTransactionId === queued.id &&
        declared.subjectHash === auditHash(declared),
    );
    ok(
      "ejecución fallida: aviso en la consola, fila PENDING con «Último intento fallido» y el motivo en chain_transactions.error",
      /Desplegar registro/.test(warning) &&
        failedRow.status === "PENDING" &&
        /Último intento fallido: .*Argumentos incompletos/.test(failedRow.error ?? "") &&
        failedRow.text.includes("Desplegar registro") &&
        queued.executionMode === null &&
        queued.args.tenantAdmin === adminWallet &&
        queued.args.complianceOfficer === officerWallet &&
        /Argumentos incompletos/.test(queued.error ?? ""),
      `${warning} · ${failedRow.error}`,
    );
    await shot(s, "registry-deferred-failed");

    // ── 5 · «Desplegar registro» retries the same row: ERC-3643 registry active ──
    await db.organization.update({ where: { id: org.id }, data: { onchainId: org.onchainId } });
    await db.chainTransaction.update({ where: { id: queued.id }, data: { args: { ...queued.args, organizationId: org.onchainId } } });
    await clickIn(s, `[data-governance-row="${slug}"]`, "Desplegar registro");
    await s.waitForSelector("[data-governance-dialog]", { timeout: 30000 });
    const dialog = await s.$eval("[data-governance-dialog]", (n) => n.textContent);
    await clickText(s, "Confirmar decisión", '[role="dialog"]');
    await waitStatus(s, slug, "DEPLOYED");
    await waitToast(s, "ERC-3643").catch(() => {});
    const toast = await toastText(s);
    const active = await rowOf(s, slug);
    const deployed = await db.chainTransaction.findUniqueOrThrow({ where: { id: queued.id } });
    const after = await db.organization.findUniqueOrThrow({ where: { id: org.id } });
    const expected = await registryAddressOf(deployed);
    const confirmed = await db.auditEvent.findFirst({ where: { organizationId: org.id, action: "CHAIN_TX_CONFIRMED", entityId: deployed.id } });
    ok(
      "reintento: el diálogo muestra el fallo anterior; la misma fila se confirma (error borrado) y CREATE(factory, nonce) = complianceRegistry",
      dialog.includes("Último intento fallido") &&
        deployed.status === "CONFIRMED" &&
        deployed.executionMode === "SIMULATION" &&
        deployed.error === null &&
        deployed.txHash === viem.keccak256(deployed.signedTransaction) &&
        deployed.args.registry === expected &&
        after.complianceRegistry === expected &&
        confirmed?.subjectHash === deployed.txHash,
      expected,
    );
    ok(
      "Módulo A: «ERC-3643 activo» con su modo (simulación firmada, no difundida) y la dirección del registro",
      active.status === "DEPLOYED" &&
        active.mode === "SIMULATION" &&
        active.text.includes("ERC-3643 activo · simulación firmada, no difundida") &&
        active.text.includes(expected.slice(0, 8)) &&
        /ERC-3643/.test(toast),
      `${active.text} · ${toast}`,
    );
    await shot(s, "registry-deferred-deployed");

    // ── 6 · The server applies the same rules to forged calls ──
    const declareId = Object.entries(actions).find(([body]) => body.includes(org.id) && body.includes(officerWallet))?.[1];
    const forged = (a, o) => (declareId ? replayAction(s, declareId, [org.id, a, o]) : Promise.resolve("sin id de acción"));
    const fSame = await forged(adminWallet, mixedCase(adminWallet));
    const fOperator = await forged(operator, officerWallet);
    const fInvalid = await forged("0x1234", officerWallet);
    const fAgain = await forged(randomWallet(), randomWallet());
    const still = await db.organization.findUniqueOrThrow({ where: { id: org.id }, include: { users: true } });
    ok(
      "acciones forjadas: iguales, del operador, inválida → rechazadas; con el registro desplegado → rechazada; nada cambia",
      /distintas/.test(fSame) &&
        /operador RWAXI/.test(fOperator) &&
        /inválida/.test(fInvalid) &&
        /ya tiene su registro de cumplimiento desplegado/.test(fAgain) &&
        still.users.find((u) => u.role === "TENANT_ADMIN").walletAddress === adminWallet &&
        (await db.chainTransaction.count({ where: { organizationId: org.id, kind: "TENANT_REGISTRY_DEPLOYED", status: { in: ["PENDING", "CONFIRMED"] } } })) === 1,
    );
    await s.browserContext().close();
  } catch (e) {
    fail(e);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})();
