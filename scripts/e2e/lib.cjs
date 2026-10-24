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

/**
 * Pool settings of packages/database/src/pool.ts: a suite's client idles while the browser works, and an idle
 * connection Neon or the network has dropped is closed by Prisma before it is reused.
 */
const POOL_DEFAULTS = { pool_timeout: "15", max_idle_connection_lifetime: "30" };
function poolUrl(raw) {
  if (!raw) return raw;
  const url = new URL(raw);
  for (const [key, value] of Object.entries(POOL_DEFAULTS)) if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  return url.toString();
}

const READS = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy"]);
const TRANSIENT =
  /P2024|P1001|P1002|P1017|Timed out fetching a new connection|Server has closed the connection|ConnectionReset|connection reset|ECONNRESET/i;

/**
 * The client with its model reads repeated after a transient connection failure (Neon pool or a dropped idle
 * connection). Writes, raw queries and batch transactions pass through untouched: they are never repeated.
 */
function resilientReads(client) {
  const retry = async (read) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await read();
      } catch (e) {
        if (attempt === 3 || !TRANSIENT.test(`${e?.code ?? ""} ${e?.message ?? ""}`)) throw e;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  };
  const models = new Map();
  return new Proxy(client, {
    get(target, prop) {
      const value = target[prop];
      if (typeof value === "function") return value.bind(target);
      if (typeof prop !== "string" || /^[$_]/.test(prop) || value === null || typeof value !== "object") return value;
      if (!models.has(prop)) {
        models.set(
          prop,
          new Proxy(value, {
            get(model, op) {
              const fn = model[op];
              if (typeof fn !== "function") return fn;
              return READS.has(op) ? (...args) => retry(() => fn.apply(model, args)) : fn.bind(model);
            },
          }),
        );
      }
      return models.get(prop);
    },
  });
}

/** Owner connection (BYPASSRLS): the suites verify every tenant's rows independently of the app. */
const ownerDb = () => resilientReads(new PrismaClient({ datasourceUrl: poolUrl(process.env.DIRECT_URL) }));

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
const sha256Hex = (hex) => "0x" + crypto.createHash("sha256").update(Buffer.from(hex.slice(2), "hex")).digest("hex");

// Independent re-implementation of the SDK Merkle tree (merkle.ts): sorted unique leaves,
// parent = SHA-256(min || max) over the raw 32-byte values, an odd node is promoted unchanged.
const hashPair = (a, b) => sha256Hex(a < b ? a + b.slice(2) : b + a.slice(2));
function merkleRoot(hashes) {
  let layer = [...new Set(hashes.map((h) => h.toLowerCase()))].sort();
  if (!layer.length) return "0x" + "0".repeat(64);
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) next.push(layer[i + 1] === undefined ? layer[i] : hashPair(layer[i], layer[i + 1]));
    layer = next;
  }
  return layer[0];
}
/** Folds a proof (sibling hashes, bottom-up) from a leaf: equals the root when the leaf is included. */
const foldProof = (leaf, proof) => proof.reduce((acc, sib) => hashPair(acc, sib.toLowerCase()), leaf.toLowerCase());

/** DIAN check digit of a 9-digit NIT base, re-implemented independently of the app. */
function nitDv(base9) {
  const w = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const r = [...base9].reverse().reduce((s, d, i) => s + Number(d) * w[i], 0) % 11;
  return r > 1 ? 11 - r : r;
}
const nitOf = (base9, dv = nitDv(base9)) => `${base9.slice(0, 3)}.${base9.slice(3, 6)}.${base9.slice(6, 9)}-${dv}`;
const randomNitBase = () => `9${crypto.randomInt(10_000_000, 99_999_999)}`;

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

/** Super-Admin console (admin.localhost) on module A, "Gobierno de Tenants". */
async function openGovernance(page) {
  await page.goto(url("admin"), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector("[data-platform-overview]", { timeout: 180000 });
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((x) => x.textContent.includes("Gobierno")).click());
  await page.waitForSelector("[data-platform-governance]", { timeout: 60000 });
}

/** The onboarding wizard with its sample data for `slug` (optionally on `network`); resolves once persisted. */
async function onboardTenant(page, { slug, legalName, displayName, nit, network }) {
  await openGovernance(page);
  await clickText(page, "Dar de Alta Nuevo Desarrollador");
  await page.waitForSelector('[data-onboarding-step="0"]', { timeout: 30000 });
  await clickText(page, "Completar con datos de ejemplo");
  await fill(page, "#ob-legal", legalName);
  await fill(page, "#ob-display", displayName);
  await fill(page, "#ob-nit", nit);
  await fill(page, "#ob-slug", slug);
  await page.waitForFunction(() => document.querySelector("[data-slug-state]")?.dataset.slugState === "available", { timeout: 30000 });
  for (const step of [1, 2, 3, 4]) {
    await clickText(page, "Continuar");
    await page.waitForSelector(`[data-onboarding-step="${step}"]`, { timeout: 30000 });
    if (step === 1 || step === 2) await clickText(page, "Completar con datos de ejemplo");
    if (step === 2 && network) await page.select("#ob-network", network);
    if (step === 3) {
      await clickText(page, "Adjuntar documentos de ejemplo");
      await page.waitForFunction(() => document.querySelectorAll('[data-doc-loaded="true"]').length === 13, { timeout: 30000 });
    }
  }
  await clickText(page, "Crear tenant y causar Setup Fee");
  await page.waitForSelector(`[data-onboarded-slug="${slug}"]`, { timeout: 90000 });
}

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

// ── staff sign-in (password + TOTP) ───────────────────────────────────────
// Demo credentials of the seed (packages/database/prisma/seed-data/credentials.ts), never seeded in production.
const DEMO_PASSWORD = "RwaxiDemo-2026!";
const demoTotpSecret = (email) =>
  crypto.createHash("sha256").update(`rwaxi-demo-totp:${email.toLowerCase()}`).digest().subarray(0, 20);
/** RFC 6238 (HMAC-SHA1, 30 s steps, 6 digits), re-implemented independently of the app. */
function totpAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac("sha1", secret).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
const totpStepNow = () => Math.floor(Date.now() / 30_000);
const lastTotpStep = new Map();
/**
 * A code the server accepts now for a seeded staff member: a step later than the last one used (it refuses a
 * replay) and within its ±1 window, waiting for the next 30 s step when both are spent.
 */
async function nextTotp(email) {
  const step = Math.max(totpStepNow(), (lastTotpStep.get(email) ?? -Infinity) + 1);
  while (step > totpStepNow() + 1) await new Promise((r) => setTimeout(r, 1000));
  lastTotpStep.set(email, step);
  return { step, code: totpAt(demoTotpSecret(email), step) };
}

/** Opts the browser context out of the demo staff session on `hosts` (null = vitrina): only real sign-in opens. */
const withoutDemo = (page, hosts) =>
  page.setCookie(...hosts.map((h) => ({ name: "rwaxi_demo_auth", value: "off", url: url(h) })));
const cookieOf = async (page, host, name) => (await page.cookies(url(host))).find((c) => c.name === name);

/** Submits the step of the staff login form on screen (password or code); resolves with the server's answer. */
const submitLogin = (page) =>
  Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"], { timeout: 120000 }),
    page.$eval("[data-login-step] form", (f) => f.requestSubmit()),
  ]);

/** Signs a seeded staff member in on the login page open in `page`: password, then the current TOTP code. */
async function staffLogin(page, email, password = DEMO_PASSWORD) {
  await page.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
  await fill(page, "#login-email", email);
  await fill(page, "#login-password", password);
  await submitLogin(page);
  await page.waitForSelector('[data-login-step="mfa"]', { timeout: 60000 });
  const totp = await nextTotp(email);
  await fill(page, "#login-code", totp.code);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 180000 }),
    page.$eval("[data-login-step] form", (f) => f.requestSubmit()),
  ]);
  return totp;
}

module.exports = {
  ROOT,
  PORT,
  url,
  ARTIFACTS,
  shot,
  launch,
  ownerDb,
  poolUrl,
  PrismaClient,
  viem,
  viemAccounts,
  viemChains,
  webEnv,
  ok,
  fail,
  canon,
  sha256,
  merkleRoot,
  foldProof,
  nitDv,
  nitOf,
  randomNitBase,
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
  openGovernance,
  onboardTenant,
  openBackofficeTab,
  replayAction,
  tryAction,
  onboardInvestor,
  approveInvestor,
  subscribe,
  confirmPayment,
  DEMO_PASSWORD,
  demoTotpSecret,
  totpAt,
  totpStepNow,
  nextTotp,
  withoutDemo,
  cookieOf,
  submitLogin,
  staffLogin,
};
