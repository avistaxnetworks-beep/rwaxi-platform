// Shared helpers of the E2E suites: repo paths, workspace dependencies, env, browser and assertions.
// Secrets are read at run time from the untracked env files and never printed.
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const util = require("util");

const ROOT = path.resolve(__dirname, "../..");
const fromWorkspace = (pkg, dir) => require(require.resolve(pkg, { paths: [path.join(ROOT, dir)] }));

// DIRECT_URL (owner, to verify any tenant) and DATABASE_URL (rwaxi_app, RLS) for the database checks.
const DB_ENV = path.join(ROOT, "packages/database/.env");
if (fs.existsSync(DB_ENV)) process.loadEnvFile(DB_ENV);

const { PrismaClient } = fromWorkspace("@prisma/client", "packages/database");
const viem = fromWorkspace("viem", "apps/web");
const viemAccounts = fromWorkspace("viem/accounts", "apps/web");
const viemChains = fromWorkspace("viem/chains", "apps/web");
const puppeteer = require("puppeteer-core");

/** A value of apps/web/.env.local as the web app sees it. */
function webEnv(key) {
  const file = path.join(ROOT, "apps/web/.env.local");
  const parsed = fs.existsSync(file) ? util.parseEnv(fs.readFileSync(file, "utf8")) : {};
  const value = parsed[key] ?? process.env[key];
  if (!value) throw new Error(`${key} no está definido en apps/web/.env.local`);
  return value;
}

const PORT = Number(process.env.E2E_PORT || 3000);
/** url("avista", "/backoffice") → http://avista.localhost:3000/backoffice · url(null) → vitrina */
const url = (sub, p = "/") => `http://${sub ? `${sub}.` : ""}localhost:${PORT}${p}`;

const ARTIFACTS = process.env.E2E_ARTIFACTS || path.join(__dirname, ".artifacts");
fs.mkdirSync(ARTIFACTS, { recursive: true });
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`), ...opts });

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    ...(process.platform === "win32"
      ? [
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        ]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]),
  ].filter(Boolean);
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) throw new Error("No se encontró Chrome/Edge: define CHROME_PATH");
  return found;
}

const launch = () =>
  puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-first-run", "--disable-gpu"],
    defaultViewport: { width: 1360, height: 1000 },
  });

/** Owner connection (BYPASSRLS): the suites verify every tenant's rows independently of the app. */
const ownerDb = () => new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });

const ok = (label, pass, detail = "") => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? " · " + detail : ""}`);
  if (!pass) process.exitCode = 1;
};
const fail = (e) => {
  console.log("ERROR", e?.stack || e?.message || e);
  process.exitCode = 1;
};

// Independent re-implementation of canonical JSON (sorted keys) + SHA-256 (evidenceHash of the SDK).
const canon = (v) =>
  v === null || typeof v !== "object"
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? `[${v.map(canon).join(",")}]`
      : `{${Object.keys(v)
          .filter((k) => v[k] !== undefined)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`)
          .join(",")}}`;
const sha256 = (s) => "0x" + crypto.createHash("sha256").update(s).digest("hex");

const abi = (name) => {
  const file = path.join(ROOT, `contracts/artifacts/src/${name}.sol/${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Falta ${name}: ejecuta pnpm contracts:compile`);
  return JSON.parse(fs.readFileSync(file, "utf8")).abi;
};

// Hardhat's public development mnemonic: account 0 = issuer admin, 1 = compliance officer.
const HARDHAT_MNEMONIC = "test test test test test test test test test test test junk";
const hardhatAccount = (index) => viemAccounts.mnemonicToAccount(HARDHAT_MNEMONIC, { addressIndex: index });

// ── page helpers ──────────────────────────────────────────────────────────
const text = (page) => page.evaluate(() => document.body.innerText.toLowerCase());
const has = async (page, needle) => (await text(page)).includes(needle.toLowerCase());
const waitText = (page, needle, timeout = 90000) =>
  page.waitForFunction((n) => document.body.innerText.toLowerCase().includes(n), { timeout }, needle.toLowerCase());

/** Clicks the first enabled button whose text includes `label`, inside `scope` (CSS selector). */
async function clickText(page, label, scope = "body") {
  const done = await page.evaluate(
    (label, scope) => {
      const root = document.querySelector(scope) ?? document.body;
      const b = [...root.querySelectorAll("button")].find((x) => x.textContent.includes(label) && !x.disabled);
      if (b) b.click();
      return !!b;
    },
    label,
    scope,
  );
  if (!done) throw new Error(`button not found: ${label}`);
}
/** Clicks a button whose text includes `label` inside the element matching `selector`. */
async function clickIn(page, selector, label) {
  const done = await page.evaluate(
    (selector, label) => {
      const b = [...(document.querySelector(selector)?.querySelectorAll("button") ?? [])].find((x) => x.textContent.includes(label));
      if (b) b.click();
      return !!b;
    },
    selector,
    label,
  );
  if (!done) throw new Error(`button "${label}" not found in ${selector}`);
}
/** Sets a React-controlled input/textarea (native setter + input event), e.g. a date the keyboard can't type. */
const fill = (page, selector, value) =>
  page.$eval(
    selector,
    (el, v) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    value,
  );
const toastText = (page) => page.$eval(".toast-wrap", (n) => n.textContent.trim()).catch(() => "");
const alertText = (page) => page.$$eval('[role="alert"]', (n) => n.map((x) => x.textContent.trim()).join(" | "));
const waitAlert = (page, re, timeout = 90000) =>
  page.waitForFunction(
    (src) => [...document.querySelectorAll('[role="alert"]')].some((n) => new RegExp(src, "i").test(n.textContent)),
    { timeout },
    re.source,
  );

/** Opens {slug}.localhost/backoffice on the tab whose label includes `label`. */
async function openBackofficeTab(page, slug, label) {
  await page.goto(url(slug, "/backoffice"), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction((l) => [...document.querySelectorAll('[role="tab"]')].some((t) => t.textContent.includes(l)), { timeout: 180000 }, label);
  await page.evaluate((l) => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes(l)).click(), label);
}

/** POSTs a captured Server Action id from `page` (to replay it from another host). Returns the RSC text. */
const replayAction = (page, actionId, args) =>
  page.evaluate(
    async (actionId, args) => {
      const r = await fetch(location.pathname, {
        method: "POST",
        headers: { "Next-Action": actionId, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
        body: JSON.stringify(args),
      });
      return r.text();
    },
    actionId,
    args,
  );

/**
 * Like replayAction, for requests the server may never answer (an action id posted to a route of
 * another host is not routed by Next): "timeout" | "<status> <body>".
 */
const tryAction = (page, actionId, args, timeoutMs = 20000) =>
  page.evaluate(
    async (actionId, args, timeoutMs) => {
      try {
        const r = await fetch(location.pathname, {
          method: "POST",
          headers: { "Next-Action": actionId, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
          body: JSON.stringify(args),
          signal: AbortSignal.timeout(timeoutMs),
        });
        return `${r.status} ${await r.text()}`;
      } catch {
        return "timeout";
      }
    },
    actionId,
    args,
    timeoutMs,
  );

// ── investor journey (portal + backoffice), shared by the payment suites ──
/** Fresh browser context: signs the NDA and submits the 4 KYC steps on the tenant's portal. */
async function onboardInvestor(browser, db, slug = "avista") {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR(portal)", e.message));
  await page.goto(url(slug), { waitUntil: "domcontentloaded", timeout: 180000 });
  await waitText(page, "Firmar NDA con un clic", 180000);
  await clickText(page, "Completar con datos de ejemplo");
  const email = await page.$eval("#nda-email", (i) => i.value);
  await clickText(page, "Firmar NDA con un clic");
  await waitText(page, "Paso 2 · Verificación KYC");
  for (let step = 0; step < 4; step++) {
    await waitText(page, `Paso 0${step + 1}`);
    await clickText(page, "Completar con datos de ejemplo");
    if (step === 2) {
      await clickText(page, "Iniciar prueba de vida");
      await waitText(page, "Verificación de vida completada", 30000);
    }
    await clickText(page, step < 3 ? "Continuar" : "Enviar a revisión de cumplimiento");
  }
  await waitText(page, "Tus datos se encuentran en revisión");
  const investor = await db.investor.findFirstOrThrow({ where: { email, organization: { slug } } });
  return { page, email, investor };
}

/** Approves the investor's KYC from the backoffice compliance inbox (queues approveInvestor). */
async function approveInvestor(page, slug, investorId) {
  await openBackofficeTab(page, slug, "Cumplimiento y Leads");
  await page.waitForSelector(`tr[data-investor="${investorId}"]`, { timeout: 90000 });
  await clickIn(page, `tr[data-investor="${investorId}"]`, "Aprobar Inversionista");
  await page.waitForFunction((id) => document.querySelector(`tr[data-investor="${id}"] [data-kyc]`)?.dataset.kyc === "aprobado", { timeout: 90000 }, investorId);
}

/** Signs a subscription for the default amount (25.000 USD) from the investor's portal page. */
async function subscribe(page, slug = "avista") {
  await page.goto(url(slug), { waitUntil: "domcontentloaded", timeout: 180000 });
  await waitText(page, "Firmar contrato del vehículo y suscribir");
  await clickText(page, "Firmar contrato del vehículo y suscribir");
  await page.waitForSelector("#ack1", { timeout: 30000 });
  for (const id of ["#ack1", "#ack2", "#ack3"]) await page.click(id);
  await clickText(page, "Firmar y confirmar");
  await waitText(page, "Ver mi portafolio", 60000);
}

/** "Confirmar Pago Fiduciario" on the Suscripciones y Pagos tab (already open); waits for MINT_PENDING. */
async function confirmPayment(page, subscriptionId, reference) {
  await page.waitForSelector(`tr[data-subscription="${subscriptionId}"][data-sub-status="PAYMENT_PENDING"]`, { timeout: 90000 });
  await clickIn(page, `tr[data-subscription="${subscriptionId}"]`, "Confirmar Pago Fiduciario");
  await page.waitForSelector("#pay-ref", { timeout: 30000 });
  await page.$eval("#pay-ref", (i) => (i.value = ""));
  await page.type("#pay-ref", reference);
  await clickText(page, "Confirmar Pago Fiduciario", '[role="dialog"]');
  await page.waitForSelector(`tr[data-subscription="${subscriptionId}"][data-sub-status="MINT_PENDING"]`, { timeout: 60000 });
}

module.exports = {
  ROOT,
  PORT,
  url,
  ARTIFACTS,
  shot,
  launch,
  ownerDb,
  PrismaClient,
  viem,
  viemAccounts,
  viemChains,
  webEnv,
  ok,
  fail,
  canon,
  sha256,
  abi,
  hardhatAccount,
  text,
  has,
  waitText,
  clickText,
  clickIn,
  fill,
  toastText,
  alertText,
  waitAlert,
  openBackofficeTab,
  replayAction,
  tryAction,
  onboardInvestor,
  approveInvestor,
  subscribe,
  confirmPayment,
};
