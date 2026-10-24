// E2E · non-custodial signing in the browser (EIP-1193), CHAIN_EXECUTION=rpc against a local Hardhat node (run it
// through run-rpc.cjs). The backoffice page gets an injected provider (window.ethereum) bridged to Node, where a
// viem account of the Hardhat mnemonic signs and sends to the node — the private key never reaches the page or the
// server. The compliance officer signs approveInvestor, setFrozen (queued from the compliance inbox) and the
// revokeInvestor of a revocation decided there; the issuer's administrator grants its own wallet MINTER_ROLE from the
// subscriptions desk (signed by that wallet with DEFAULT_ADMIN_ROLE: RWAXI gains no role) and then signs its mint,
// updateDataRoomMerkleRoot and anchorDistributionRoot. The provider can misbehave (wrong chain or account, rejected
// signature, other calldata, other contract, another signer, a revert): the browser refuses before sending, or the
// server refuses to confirm and the queue is left as it was.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const lib = require("./lib.cjs");
const {
  launch,
  ownerDb,
  ok,
  fail,
  shot,
  viem,
  viemChains,
  abi,
  hardhatAccount,
  has,
  pdfBytes,
  fileSha256,
  merkleRoot,
  canon,
  sha256,
} = lib;
const { clickIn, clickText, fill, openBackofficeTab, openComplianceCase, replayAction, waitToast } = lib;
const { RPC_URL } = require("./rpc-fixtures.cjs");

const SETUP = JSON.parse(process.env.E2E_RPC_SETUP || "null");
if (!SETUP)
  throw new Error("Ejecuta esta suite con run-rpc.cjs (despliega los contratos y fija E2E_RPC_SETUP)");
const tokenAbi = abi("RwaxiPropertyToken");
const registryAbi = abi("RwaxiComplianceRegistry");
const db = ownerDb();
const transport = viem.http(RPC_URL);
const hardhat = viemChains.hardhat;
const chain = viem.createPublicClient({ chain: hardhat, transport });
const ACCOUNTS = {
  admin: hardhatAccount(0),
  officer: hardhatAccount(1),
  stranger: hardhatAccount(5),
  outsider: hardhatAccount(9),
};
const lower = (s) => (typeof s === "string" ? s.toLowerCase() : s);

/**
 * Installs window.ethereum on every document of `page`, answering through Node. `wallet` steers it like the
 * person holding the wallet would (selected account and chain, approve or reject) or like a compromised wallet
 * (`tamper`: sends something other than what the page asked for).
 */
async function injectWallet(page) {
  const wallet = {
    account: null,
    chainId: hardhat.id,
    allowSwitch: true,
    reject: false,
    tamper: null,
    tamperData: null,
    tamperTo: null,
    sent: [],
  };
  const rpcError = (code, message) => Object.assign(new Error(message), { code });
  const handle = async (method, params) => {
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        if (!wallet.account) throw rpcError(4100, "No account connected");
        return [wallet.account.address];
      case "eth_chainId":
        return `0x${wallet.chainId.toString(16)}`;
      case "wallet_switchEthereumChain":
        if (!wallet.allowSwitch) throw rpcError(4902, "Unrecognized chain ID");
        wallet.chainId = Number.parseInt(params[0].chainId, 16);
        return null;
      case "eth_call":
      case "eth_blockNumber":
      case "eth_getTransactionReceipt":
      case "eth_getTransactionByHash":
        return chain.request({ method, params });
      case "eth_sendTransaction": {
        const [req] = params;
        if (wallet.reject) throw rpcError(4001, "User rejected the request.");
        if (lower(req.from) !== lower(wallet.account?.address))
          throw rpcError(4100, "The requested account has not been authorized");
        if (Number(req.chainId) !== wallet.chainId)
          throw rpcError(-32602, "chainId does not match the wallet's network");
        let { to, data } = req;
        let account = wallet.account;
        let gas;
        if (wallet.tamper === "data") data = wallet.tamperData;
        if (wallet.tamper === "to") to = wallet.tamperTo;
        if (wallet.tamper === "from") [account, gas] = [ACCOUNTS.stranger, 200_000n];
        if (wallet.tamper === "revert") gas = 30_000n; // enough to be mined, not to run the call
        // Signed here, then broadcast raw: like a wallet, the hash is known even when the call later reverts
        // (the Hardhat node answers a failing transaction with an error, yet mines it).
        const client = viem.createWalletClient({ account, chain: hardhat, transport });
        const prepared = await client.prepareTransactionRequest({
          to,
          data,
          value: 0n,
          ...(gas ? { gas } : {}),
        });
        const raw = await account.signTransaction(prepared);
        const hash = viem.keccak256(raw);
        const broadcast = await chain
          .request({ method: "eth_sendRawTransaction", params: [raw] })
          .catch((e) => e);
        if (broadcast instanceof Error && !(await chain.getTransaction({ hash }).catch(() => null)))
          throw broadcast;
        wallet.sent.push(hash);
        return hash;
      }
      default:
        throw rpcError(4200, `Unsupported method ${method}`);
    }
  };
  await page.exposeFunction("__rwaxiWallet", async (method, params) => {
    try {
      return { result: await handle(method, params ?? []) };
    } catch (e) {
      return { error: { code: e.code ?? -32603, message: e.shortMessage ?? e.message } };
    }
  });
  await page.evaluateOnNewDocument(() => {
    window.ethereum = {
      isRwaxiE2E: true,
      async request({ method, params }) {
        const r = await window.__rwaxiWallet(method, params ?? []);
        if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code });
        return r.result;
      },
      on() {},
      removeListener() {},
    };
  });
  return wallet;
}

/** Clicks "Firmar con mi wallet" (or "Verificar recibo") of a row and waits until its flow ends. */
async function walletClick(page, chainTxId, verify = false) {
  const sel = verify ? `[data-wallet-verify="${chainTxId}"]` : `[data-wallet-sign="${chainTxId}"]`;
  await page.waitForFunction(
    (s) => document.querySelector(s) && !document.querySelector(s).disabled,
    { timeout: 90000 },
    sel,
  );
  const before = await page.$eval(`[data-wallet="${chainTxId}"]`, (n) => Number(n.dataset.walletRuns));
  await page.click(sel);
  // Done when this attempt finished (the counter moved) or the row left the desk (confirmed).
  await page.waitForFunction(
    (id, runs) => {
      const box = document.querySelector(`[data-wallet="${id}"]`);
      return (
        !box ||
        (Number(box.dataset.walletRuns) > runs && ["idle", "pending"].includes(box.dataset.walletState))
      );
    },
    { timeout: 120000 },
    chainTxId,
    before,
  );
}
const walletError = (page, chainTxId) =>
  page.$eval(`[data-wallet="${chainTxId}"] [data-wallet-error]`, (n) => n.textContent.trim()).catch(() => "");
const untouched = async (id) => {
  const row = await db.chainTransaction.findUniqueOrThrow({ where: { id } });
  return (
    row.status === "PENDING" &&
    row.executionMode === null &&
    row.txHash === null &&
    row.signerAddress === null
  );
};
const role = (name) => viem.keccak256(viem.toHex(name));
const ZERO32 = `0x${"0".repeat(64)}`;
const calldata = (contractAbi, functionName, args) =>
  viem.encodeFunctionData({ abi: contractAbi, functionName, args });

/** Asserts a row was confirmed by exactly the last transaction the injected wallet sent, from `signer`. */
async function confirmedByWallet(label, id, wallet, signer, expectedData) {
  const row = await db.chainTransaction.findUniqueOrThrow({ where: { id } });
  const hash = wallet.sent.at(-1);
  const sent = await chain.getTransaction({ hash });
  const receipt = await chain.getTransactionReceipt({ hash });
  const audit = await db.auditEvent.findFirst({
    where: { action: "CHAIN_TX_CONFIRMED", entityId: id },
    orderBy: { createdAt: "desc" },
  });
  ok(
    label,
    row.status === "CONFIRMED" &&
      row.executionMode === "RPC" &&
      row.txHash === hash &&
      row.blockNumber === receipt.blockNumber &&
      lower(row.signerAddress) === lower(signer.address) &&
      row.nonce === sent.nonce &&
      row.signedTransaction === null &&
      receipt.status === "success" &&
      lower(sent.from) === lower(signer.address) &&
      lower(sent.to) === lower(row.contractAddress) &&
      sent.input === expectedData &&
      audit?.subjectHash === hash &&
      audit.payload.txHash === hash &&
      audit.payload.mode === "RPC" &&
      audit.payload.via === "wallet" &&
      lower(audit.payload.signer) === lower(signer.address),
    `tx ${hash.slice(0, 12)}… bloque ${receipt.blockNumber}`,
  );
  return { row, hash, receipt };
}

(async () => {
  fs.mkdirSync(lib.ARTIFACTS, { recursive: true });
  const browser = await launch();
  try {
    const org = await db.organization.findUniqueOrThrow({
      where: { slug: "avista" },
      include: { users: true },
    });
    const adminUser = org.users.find((u) => u.role === "TENANT_ADMIN");
    const officerUser = org.users.find((u) => u.role === "COMPLIANCE_OFFICER");
    ok(
      "fixtures: la wallet registrada del Administrador y la del Oficial son las cuentas con sus roles en Hardhat",
      adminUser.walletAddress === lower(SETUP.issuer) && officerUser.walletAddress === lower(SETUP.officer),
    );
    const operatorNonce = await chain.getTransactionCount({ address: SETUP.operator });

    // ── Investor: NDA → KYC → approval (approveInvestor queued) ─────────────
    const { page: a, investor } = await lib.onboardInvestor(browser, db, "avista");
    const w = await (await browser.createBrowserContext()).newPage();
    w.on("pageerror", (e) => console.log("PAGEERROR(W)", e.message));
    const wallet = await injectWallet(w);
    const actions = {};
    w.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (req.method() === "POST" && id) actions[req.postData() ?? ""] = id;
    });
    await lib.approveInvestor(w, "avista", investor.id);
    const approveTx = await db.chainTransaction.findFirstOrThrow({
      where: { organizationId: org.id, kind: "INVESTOR_WHITELISTED", status: "PENDING" },
    });
    await openBackofficeTab(w, "avista", "Suscripciones y Pagos");
    await w.waitForSelector(`[data-wallet-sign="${approveTx.id}"]`, { timeout: 90000 });
    ok(
      "modo RPC: approveInvestor() ofrece «Firmar con mi wallet» (y conserva el registro de hash para multisig)",
      !!(await w.$(`[data-officer-form="${approveTx.id}"]`)),
    );

    // ── The browser refuses before anything is signed ──────────────────────
    const bare = await (await browser.createBrowserContext()).newPage();
    await openBackofficeTab(bare, "avista", "Suscripciones y Pagos");
    await walletClick(bare, approveTx.id);
    const noWallet = await walletError(bare, approveTx.id);
    ok(
      "sin proveedor EIP-1193 en el navegador → aviso, nada enviado",
      /No se detectó una wallet EIP-1193/.test(noWallet) && (await untouched(approveTx.id)),
      noWallet,
    );
    await bare.browserContext().close();

    wallet.account = ACCOUNTS.stranger;
    await walletClick(w, approveTx.id);
    const wrongAccount = await walletError(w, approveTx.id);
    ok(
      "cuenta conectada distinta de la wallet registrada del Oficial → el navegador no pide la firma",
      /Tu wallet tiene seleccionada la cuenta/.test(wrongAccount) &&
        wallet.sent.length === 0 &&
        (await untouched(approveTx.id)),
      wrongAccount,
    );

    wallet.account = ACCOUNTS.officer;
    wallet.chainId = 1;
    wallet.allowSwitch = false;
    await walletClick(w, approveTx.id);
    const wrongChain = await walletError(w, approveTx.id);
    ok(
      "wallet en otra red (chainId 1) que no puede cambiar a Hardhat (31337) → nada enviado",
      /Tu wallet no tiene la red Hardhat \(chainId 31337\)/.test(wrongChain) &&
        wallet.sent.length === 0 &&
        (await untouched(approveTx.id)),
      wrongChain,
    );

    wallet.chainId = hardhat.id;
    wallet.reject = true;
    await walletClick(w, approveTx.id);
    const rejected = await walletError(w, approveTx.id);
    ok(
      "el Oficial rechaza la firma en su wallet (4001) → nada enviado",
      /Rechazaste la firma en tu wallet/.test(rejected) &&
        wallet.sent.length === 0 &&
        (await untouched(approveTx.id)),
      rejected,
    );
    wallet.reject = false;

    // ── A compromised wallet sends something else: the server refuses it ───
    const approveData = calldata(registryAbi, "approveInvestor", [
      investor.walletAddress,
      approveTx.args.countryCode,
      approveTx.args.kycDossierHash,
    ]);
    wallet.tamper = "data";
    wallet.tamperData = calldata(registryAbi, "approveInvestor", [
      `0x${"7".repeat(40)}`,
      170,
      approveTx.args.kycDossierHash,
    ]);
    await walletClick(w, approveTx.id);
    const otherData = await walletError(w, approveTx.id);
    ok(
      "la wallet envía approveInvestor para otra wallet (tx exitosa) → el servidor no la confirma: calldata distinto",
      /El calldata firmado no coincide con la operación en cola \(approveInvestor\)/.test(otherData) &&
        (await chain.getTransactionReceipt({ hash: wallet.sent.at(-1) })).status === "success" &&
        (await untouched(approveTx.id)),
      otherData,
    );

    wallet.tamper = "to";
    wallet.tamperTo = ACCOUNTS.outsider.address;
    await walletClick(w, approveTx.id);
    const otherTarget = await walletError(w, approveTx.id);
    ok(
      "el calldata exacto dirigido a otra dirección → rechazado: no es el contrato del tenant",
      /se dirigió a .* no al contrato del tenant/.test(otherTarget) && (await untouched(approveTx.id)),
      otherTarget,
    );

    wallet.tamper = "from";
    await walletClick(w, approveTx.id);
    const otherSigner = await walletError(w, approveTx.id);
    ok(
      "la llamada exacta firmada por otra cuenta → rechazada: no es la wallet autorizada",
      /no tu wallet autorizada/.test(otherSigner) && (await untouched(approveTx.id)),
      otherSigner,
    );

    wallet.tamper = "revert";
    await walletClick(w, approveTx.id);
    const reverted = await walletError(w, approveTx.id);
    const afterRevert = await db.chainTransaction.findUniqueOrThrow({ where: { id: approveTx.id } });
    ok(
      "la llamada exacta, minada pero revertida (sin gas) → no se confirma; la fila vuelve a la cola para firmarla de nuevo",
      /revirtió en la red/.test(reverted) &&
        (await chain.getTransactionReceipt({ hash: wallet.sent.at(-1) })).status === "reverted" &&
        (await untouched(approveTx.id)) &&
        /reverted on-chain/.test(afterRevert.error ?? ""),
      reverted,
    );
    wallet.tamper = null;

    // ── The officer signs for real (the page first switches the wallet to Hardhat) ──
    wallet.chainId = 1;
    wallet.allowSwitch = true;
    await walletClick(w, approveTx.id);
    await w.waitForFunction(
      (id) => !document.querySelector(`[data-queue-item="${id}"]`),
      { timeout: 90000 },
      approveTx.id,
    );
    ok(
      "el navegador pidió cambiar la red de la wallet a Hardhat (31337) antes de firmar",
      wallet.chainId === hardhat.id,
    );
    const { hash: approveHash } = await confirmedByWallet(
      "approveInvestor CONFIRMED con el hash, bloque, nonce y firmante reales de la wallet del Oficial; AuditEvent con ese txHash (via wallet)",
      approveTx.id,
      wallet,
      ACCOUNTS.officer,
      approveData,
    );
    const kyc = await db.kycCase.findFirstOrThrow({ where: { investorId: investor.id } });
    ok(
      "KycCase.whitelistTxHash = tx de la wallet; on-chain isEligible(wallet) = true",
      kyc.whitelistTxHash === approveHash &&
        (await chain.readContract({
          address: SETUP.registry,
          abi: registryAbi,
          functionName: "isEligible",
          args: [investor.walletAddress],
        })),
    );

    // ── Mint: the administrator's wallet needs MINTER_ROLE on the token ─────
    await lib.subscribe(a, "avista");
    const sub = await db.subscription.findFirstOrThrow({ where: { investorId: investor.id } });
    await openBackofficeTab(w, "avista", "Suscripciones y Pagos");
    await lib.confirmPayment(w, sub.id, "FID-WALLET-000001");
    const mintTx = await db.chainTransaction.findFirstOrThrow({
      where: { organizationId: org.id, kind: "SUBSCRIPTION_MINTED", status: "PENDING" },
    });
    wallet.account = ACCOUNTS.admin;
    const sentBefore = wallet.sent.length;
    await walletClick(w, mintTx.id);
    const noMinter = await walletError(w, mintTx.id);
    ok(
      "mint desde la wallet del Administrador sin MINTER_ROLE → el servidor lo verifica on-chain y no ofrece la firma",
      /no tiene MINTER_ROLE en el token/.test(noMinter) &&
        wallet.sent.length === sentBefore &&
        (await untouched(mintTx.id)),
      noMinter,
    );
    // ── The issuer grants its own wallet MINTER_ROLE from the desk; that same wallet signs it ──
    const offeringRow = await db.offering.findFirstOrThrow({ where: { organizationId: org.id } });
    const tokenRole = (name, who) =>
      chain.readContract({ address: SETUP.token, abi: tokenAbi, functionName: "hasRole", args: [name === "DEFAULT_ADMIN_ROLE" ? ZERO32 : role(name), who] });
    const minterPanel = (state) => `[data-issuer-token="${offeringRow.code}"][data-minter-state="${state}"]`;
    await openBackofficeTab(w, "avista", "Suscripciones y Pagos");
    await w.waitForSelector(minterPanel("grantable"), { timeout: 90000 });
    ok(
      "panel «Firma de mint del emisor» (lectura on-chain): la wallet del Administrador tiene DEFAULT_ADMIN_ROLE y aún no MINTER_ROLE",
      (await tokenRole("DEFAULT_ADMIN_ROLE", ACCOUNTS.admin.address)) && !(await tokenRole("MINTER_ROLE", ACCOUNTS.admin.address)),
    );
    await clickIn(w, `[data-issuer-token="${offeringRow.code}"]`, "Habilitar MINTER_ROLE para mi wallet");
    await w.waitForFunction(
      (pending) => document.querySelector(pending) || document.querySelector('[data-subscriptions-desk] > [role="alert"]'),
      { timeout: 90000 },
      minterPanel("pending"),
    );
    const grantRefused = await w.$eval('[data-subscriptions-desk] > [role="alert"]', (n) => n.textContent).catch(() => null);
    if (grantRefused) throw new Error(`«Habilitar MINTER_ROLE» rechazado: ${grantRefused}`);
    const grantTx = await db.chainTransaction.findFirstOrThrow({
      where: { organizationId: org.id, kind: "MINTER_ROLE_GRANTED", status: "PENDING" },
    });
    const grantAudit = await db.auditEvent.findFirst({ where: { action: "MINTER_ROLE_REQUESTED", entityId: grantTx.id } });
    ok(
      "grantRole(MINTER_ROLE, wallet registrada del Administrador) PENDING en el token, con MINTER_ROLE_REQUESTED auditado (subjectHash recalculado)",
      grantTx.method === "grantRole(bytes32,address)" &&
        grantTx.args.role === role("MINTER_ROLE") &&
        grantTx.args.account === lower(ACCOUNTS.admin.address) &&
        lower(grantTx.contractAddress) === lower(SETUP.token) &&
        grantAudit?.payload.account === lower(ACCOUNTS.admin.address) &&
        grantAudit.payload.signerRole === "DEFAULT_ADMIN_ROLE" &&
        grantAudit.subjectHash ===
          sha256(canon({ action: "MINTER_ROLE_REQUESTED", organizationId: org.id, entityId: grantTx.id, ...grantAudit.payload })),
    );
    const [grantBody, grantId] = Object.entries(actions).find(([body]) => body === JSON.stringify([offeringRow.id])) ?? [];
    const twice = grantId ? await replayAction(w, grantId, JSON.parse(grantBody)) : "";
    ok(
      "pedirlo otra vez (acción reenviada) → rechazado: ya hay un grantRole pendiente para esa wallet",
      /ya hay un grantRole\(MINTER_ROLE\) pendiente/.test(twice) &&
        (await db.chainTransaction.count({ where: { organizationId: org.id, kind: "MINTER_ROLE_GRANTED" } })) === 1,
    );
    // A grant queued for any other account — here RWAXI's operator — is never offered for signature.
    const forged = await db.chainTransaction.create({
      data: {
        organizationId: org.id,
        offeringId: offeringRow.id,
        network: "HARDHAT",
        kind: "MINTER_ROLE_GRANTED",
        contractAddress: SETUP.token,
        method: "grantRole(bytes32,address)",
        args: { role: role("MINTER_ROLE"), account: lower(SETUP.operator) },
        status: "PENDING",
      },
    });
    await openBackofficeTab(w, "avista", "Suscripciones y Pagos");
    await walletClick(w, forged.id);
    const forgedError = await walletError(w, forged.id);
    ok(
      "una fila grantRole(MINTER_ROLE) a favor del operador RWAXI → el servidor no pide la firma (sólo la wallet del Administrador que firma)",
      /sólo se otorga a la wallet registrada del Administrador/.test(forgedError) &&
        wallet.sent.length === sentBefore &&
        (await untouched(forged.id)),
      forgedError,
    );
    await db.chainTransaction.update({ where: { id: forged.id }, data: { status: "CANCELLED", error: "e2e: forged grant withdrawn" } });
    await walletClick(w, grantTx.id);
    await w.waitForFunction((id) => !document.querySelector(`[data-queue-item="${id}"]`), { timeout: 90000 }, grantTx.id);
    await confirmedByWallet(
      "grantRole(MINTER_ROLE) CONFIRMED con la tx de la wallet del Administrador (DEFAULT_ADMIN_ROLE del token)",
      grantTx.id,
      wallet,
      ACCOUNTS.admin,
      calldata(tokenAbi, "grantRole", [role("MINTER_ROLE"), ACCOUNTS.admin.address]),
    );
    const operatorRoles = await Promise.all(
      ["DEFAULT_ADMIN_ROLE", "ISSUER_ADMIN_ROLE", "DATA_ROOM_ROLE", "DISTRIBUTION_ROLE", "LEGAL_ENFORCEMENT_ROLE", "COMPLIANCE_OFFICER_ROLE"].map((r) =>
        tokenRole(r, SETUP.operator),
      ),
    );
    ok(
      "on-chain: el Administrador tiene MINTER_ROLE; RWAXI conserva sólo su MINTER_ROLE (ningún rol del emisor) y su operador no envió nada",
      (await tokenRole("MINTER_ROLE", ACCOUNTS.admin.address)) &&
        (await tokenRole("MINTER_ROLE", SETUP.operator)) &&
        operatorRoles.every((held) => held === false) &&
        (await chain.getTransactionCount({ address: SETUP.operator })) === operatorNonce,
    );
    await openBackofficeTab(w, "avista", "Suscripciones y Pagos");
    await w.waitForSelector(minterPanel("minter"), { timeout: 90000 });
    const again = grantId ? await replayAction(w, grantId, JSON.parse(grantBody)) : "";
    ok(
      "el panel ya muestra MINTER_ROLE en la wallet; una nueva concesión se rechaza leyendo el token",
      /ya tiene MINTER_ROLE en el token/.test(again),
    );
    await w.waitForSelector(`[data-wallet-sign="${mintTx.id}"]`, { timeout: 90000 });
    await walletClick(w, mintTx.id);
    await w.waitForSelector(`tr[data-subscription="${sub.id}"][data-sub-status="MINTED"]`, {
      timeout: 90000,
    });
    const s1 = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    const mintData = calldata(tokenAbi, "mintSubscription", [
      s1.onchainId,
      investor.walletAddress,
      BigInt(mintTx.args.amount),
      s1.paymentEvidenceRef,
    ]);
    const { hash: mintHash, receipt: mintReceipt } = await confirmedByWallet(
      "con MINTER_ROLE otorgado desde la mesa, mintSubscription CONFIRMED desde la wallet del Administrador",
      mintTx.id,
      wallet,
      ACCOUNTS.admin,
      mintData,
    );
    const [minted] = viem.parseEventLogs({
      abi: tokenAbi,
      logs: mintReceipt.logs,
      eventName: "SubscriptionTokensMinted",
    });
    const mintAudit = await db.auditEvent.findFirst({
      where: { action: "SUBSCRIPTION_MINTED", entityId: sub.id },
    });
    ok(
      "Subscription MINTED (mintTxHash = tx de la wallet), evento y balanceOf on-chain = BD; el operador RWAXI no envió nada",
      s1.status === "MINTED" &&
        s1.mintTxHash === mintHash &&
        mintAudit?.subjectHash === mintHash &&
        minted.args.subscriptionId === s1.onchainId &&
        minted.args.amount === BigInt(mintTx.args.amount) &&
        (await chain.readContract({
          address: SETUP.token,
          abi: tokenAbi,
          functionName: "balanceOf",
          args: [investor.walletAddress],
        })) === BigInt(mintTx.args.amount) &&
        (await chain.getTransactionCount({ address: SETUP.operator })) === operatorNonce,
    );

    // ── Data Room: the issuer uploads a document; its wallet anchors the new root ──
    const offering = await db.offering.findFirstOrThrow({ where: { organizationId: org.id } });
    const previousRoot = await chain.readContract({
      address: SETUP.token,
      abi: tokenAbi,
      functionName: "dataRoomMerkleRoot",
    });
    await openBackofficeTab(w, "avista", "Data Room");
    await w.waitForSelector(`[data-dr-offering="${offering.code}"]`, { timeout: 90000 });
    const file = path.join(lib.ARTIFACTS, `wallet-${crypto.randomBytes(3).toString("hex")}.pdf`);
    fs.writeFileSync(file, pdfBytes());
    await (await w.$(`#drv-file-${offering.code}`)).uploadFile(file);
    await w.waitForSelector(`[data-dr-offering="${offering.code}"] [data-dr-anchor="pending"]`, {
      timeout: 90000,
    });
    const anchorDr = await db.chainTransaction.findFirstOrThrow({
      where: { offeringId: offering.id, kind: "DATA_ROOM_ROOT_ANCHORED", status: "PENDING" },
    });
    const docs = await db.dataRoomDocument.findMany({ where: { offeringId: offering.id } });
    const newRoot = merkleRoot(docs.map((d) => d.sha256));
    ok(
      "documento verificado → updateDataRoomMerkleRoot(nueva raíz) en cola; la raíz recalculada aquí = la encolada",
      anchorDr.args.newRoot === newRoot && docs.some((d) => d.sha256 === fileSha256(file)),
    );
    await openBackofficeTab(w, "avista", "Suscripciones y Pagos");
    await walletClick(w, anchorDr.id);
    await w.waitForFunction(
      (id) => !document.querySelector(`[data-queue-item="${id}"]`),
      { timeout: 90000 },
      anchorDr.id,
    );
    const { receipt: drReceipt } = await confirmedByWallet(
      "updateDataRoomMerkleRoot CONFIRMED desde la wallet del emisor (DATA_ROOM_ROLE)",
      anchorDr.id,
      wallet,
      ACCOUNTS.admin,
      calldata(tokenAbi, "updateDataRoomMerkleRoot", [newRoot]),
    );
    const [drEvent] = viem.parseEventLogs({
      abi: tokenAbi,
      logs: drReceipt.logs,
      eventName: "DataRoomMerkleRootAnchored",
    });
    ok(
      "on-chain: dataRoomMerkleRoot() = Offering.dataRoomRoot; el evento enlaza la raíz anterior con la nueva",
      (await chain.readContract({
        address: SETUP.token,
        abi: tokenAbi,
        functionName: "dataRoomMerkleRoot",
      })) === newRoot &&
        (await db.offering.findUniqueOrThrow({ where: { id: offering.id } })).dataRoomRoot === newRoot &&
        drEvent.args.previousRoot === previousRoot &&
        drEvent.args.newRoot === newRoot,
    );
    await openBackofficeTab(w, "avista", "Data Room");
    await w.waitForSelector(`[data-dr-offering="${offering.code}"] [data-dr-anchor="idle"]`, {
      timeout: 90000,
    });
    ok("la mesa del Data Room muestra la raíz anclada", await has(w, "Merkle Root anclado"));

    // ── Distribution: the issuer's wallet anchors its Merkle root ───────────
    await openBackofficeTab(w, "avista", "Distribuciones y Rendimientos");
    await w.waitForSelector(`[data-distribution-offering="${offering.code}"]`, { timeout: 90000 });
    await fill(w, `#dist-period-${offering.id}`, "2026-Q3");
    await fill(w, `#dist-amount-${offering.id}`, "10000");
    await w.waitForFunction(
      (id) => !document.querySelector(`[data-declare-distribution="${id}"]`)?.disabled,
      { timeout: 10000 },
      offering.id,
    );
    await clickIn(w, `[data-distribution-offering="${offering.code}"]`, "Declarar y encolar raíz de Merkle");
    await w.waitForSelector('[data-distribution="2026-Q3"]', { timeout: 60000 });
    const dist = await db.distribution.findFirstOrThrow({
      where: { offeringId: offering.id, period: "2026-Q3" },
    });
    const anchorDist = await db.chainTransaction.findFirstOrThrow({
      where: { organizationId: org.id, kind: "DISTRIBUTION_ROOT_ANCHORED", status: "PENDING" },
    });
    await walletClick(w, anchorDist.id);
    await w.waitForSelector('[data-distribution="2026-Q3"][data-distribution-status="ANCHORED"]', {
      timeout: 90000,
    });
    const { hash: distHash } = await confirmedByWallet(
      "anchorDistributionRoot CONFIRMED desde la wallet del emisor en la mesa de distribuciones (DISTRIBUTION_ROLE)",
      anchorDist.id,
      wallet,
      ACCOUNTS.admin,
      calldata(tokenAbi, "anchorDistributionRoot", [
        dist.onchainId,
        dist.merkleRoot,
        BigInt(anchorDist.args.totalAmountCents),
        BigInt(anchorDist.args.snapshotSupply),
      ]),
    );
    const distAfter = await db.distribution.findUniqueOrThrow({ where: { id: dist.id } });
    ok(
      "Distribution ANCHORED con anchorTxHash = tx de la wallet; on-chain distributionRoots(id) = raíz de Neon",
      distAfter.status === "ANCHORED" &&
        distAfter.anchorTxHash === distHash &&
        (await chain.readContract({
          address: SETUP.token,
          abi: tokenAbi,
          functionName: "distributionRoots",
          args: [dist.onchainId],
        })) === dist.merkleRoot,
    );

    // ── setFrozen(true/false) decided in the compliance inbox, signed by the officer's wallet ──
    const isFrozen = () => chain.readContract({ address: SETUP.registry, abi: registryAbi, functionName: "isFrozen", args: [investor.walletAddress] });
    wallet.account = ACCOUNTS.officer;
    for (const [frozen, note, button] of [
      [true, "Embargo judicial notificado por el juzgado: oficio 2026-0457.", "Congelar wallet (setFrozen)"],
      [false, "Levantamiento del embargo: oficio 2026-0521 del mismo juzgado.", "Descongelar wallet (setFrozen)"],
    ]) {
      await openComplianceCase(w, "avista", investor.id);
      await w.waitForSelector(`[data-freeze-form][data-frozen="${!frozen}"]`, { timeout: 30000 });
      await fill(w, "#freeze-note", note);
      await clickText(w, button, "[data-freeze-form]");
      await waitToast(w, frozen ? "Congelamiento de la wallet" : "Descongelamiento de la wallet");
      const freezeTx = await db.chainTransaction.findFirstOrThrow({
        where: { organizationId: org.id, kind: "INVESTOR_FREEZE_UPDATED", status: "PENDING" },
      });
      await openBackofficeTab(w, "avista", "Suscripciones y Pagos");
      await walletClick(w, freezeTx.id);
      await w.waitForFunction((id) => !document.querySelector(`[data-queue-item="${id}"]`), { timeout: 90000 }, freezeTx.id);
      await confirmedByWallet(
        `setFrozen(wallet, ${frozen}) desde la bandeja, CONFIRMED con la tx de la wallet del Oficial`,
        freezeTx.id,
        wallet,
        ACCOUNTS.officer,
        calldata(registryAbi, "setFrozen", [investor.walletAddress, frozen]),
      );
      ok(`on-chain: isFrozen(wallet) = ${frozen}`, (await isFrozen()) === frozen && freezeTx.args.frozen === frozen);
    }

    // ── Revocation from the inbox; revokeInvestor sent while the node does not mine: claimed by its hash ──
    await openComplianceCase(w, "avista", investor.id);
    await w.waitForSelector("[data-revoke-form]", { timeout: 30000 });
    await w.select("#revoke-reason", "2");
    await fill(w, "#revoke-note", "Origen de fondos sin soporte tras el requerimiento del Oficial de Cumplimiento.");
    await clickText(w, "Revocar inversionista", "[data-revoke-form]");
    await waitToast(w, "revokeInvestor en cola");
    const revokeTx = await db.chainTransaction.findFirstOrThrow({
      where: { organizationId: org.id, kind: "INVESTOR_REVOKED", status: "PENDING" },
    });
    ok(
      "revocación desde la bandeja (KYC REVOKED) → revokeInvestor(wallet) PENDING en el registro del tenant",
      revokeTx.args.wallet === investor.walletAddress &&
        lower(revokeTx.contractAddress) === lower(SETUP.registry) &&
        (await db.kycCase.findFirstOrThrow({ where: { investorId: investor.id }, orderBy: { createdAt: "desc" } })).status === "REVOKED",
    );
    await openBackofficeTab(w, "avista", "Suscripciones y Pagos");
    await chain.request({ method: "evm_setAutomine", params: [false] });
    try {
      await walletClick(w, revokeTx.id);
      await w.waitForSelector(`[data-wallet-verify="${revokeTx.id}"]`, { timeout: 90000 });
      const claimed = await db.chainTransaction.findUniqueOrThrow({ where: { id: revokeTx.id } });
      ok(
        "revokeInvestor enviada sin recibo todavía → la fila queda reclamada por ese hash (PENDING, RPC, wallet del Oficial) y la mesa ofrece «Verificar recibo»",
        claimed.status === "PENDING" &&
          claimed.executionMode === "RPC" &&
          claimed.txHash === wallet.sent.at(-1) &&
          lower(claimed.signerAddress) === lower(ACCOUNTS.officer.address),
      );
      await lib.clickText(w, "Procesar cola en orden");
      await w.waitForFunction(
        () => /Nada ejecutable/.test(document.querySelector(".toast-wrap")?.textContent ?? ""),
        { timeout: 90000 },
      );
      ok(
        "«Procesar cola en orden» no reenvía una operación ya firmada por la wallet (sigue reclamada, el operador no envió nada)",
        (await db.chainTransaction.findUniqueOrThrow({ where: { id: revokeTx.id } })).txHash ===
          wallet.sent.at(-1) &&
          (await chain.getTransactionCount({ address: SETUP.operator })) === operatorNonce,
      );
    } finally {
      await chain.request({ method: "evm_setAutomine", params: [true] });
      await chain.request({ method: "evm_mine", params: [] });
    }
    await walletClick(w, revokeTx.id, true);
    await w.waitForFunction(
      (id) => !document.querySelector(`[data-queue-item="${id}"]`),
      { timeout: 90000 },
      revokeTx.id,
    );
    await confirmedByWallet(
      "«Verificar recibo» tras minarse: revokeInvestor CONFIRMED con la tx de la wallet del Oficial",
      revokeTx.id,
      wallet,
      ACCOUNTS.officer,
      calldata(registryAbi, "revokeInvestor", [investor.walletAddress]),
    );
    ok(
      "on-chain: isEligible(wallet) = false tras la revocación",
      !(await chain.readContract({
        address: SETUP.registry,
        abi: registryAbi,
        functionName: "isEligible",
        args: [investor.walletAddress],
      })),
    );
    ok(
      "la bitácora de la mesa muestra las confirmaciones firmadas en el navegador",
      await has(w, "firmada en el navegador por"),
    );
    await shot(w, "wallet-desk", { fullPage: true });
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})().catch(fail);
