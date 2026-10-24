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

/** RFC 4648 base32 (the enrolment key an authenticator app reads), decoded independently. */
function fromBase32(s) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of s.replace(/\s/g, "")) {
    value = (value << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ── DocumentVault (local driver of the dev server: <repo>/.vault, content-addressed per tenant) ──
const VAULT_DIR = process.env.DOCUMENT_VAULT_DIR || path.join(ROOT, ".vault");
const vaultPath = (organizationId, sha256) =>
  path.join(VAULT_DIR, ...(organizationId ? ["tenants", organizationId] : ["staging"]), "sha256", sha256.replace(/^0x/, "").toLowerCase());
const fileSha256 = (file) => "0x" + crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
/** A minimal PDF the vault accepts (magic bytes %PDF-), unique per call unless `seed` repeats. */
const pdfBytes = (seed = crypto.randomBytes(12).toString("hex")) => Buffer.from(`%PDF-1.4\n% RWAXI E2E ${seed}\n%%EOF\n`);
const sha256Of = (bytes) => "0x" + crypto.createHash("sha256").update(bytes).digest("hex");

/** POST /api/vault/upload from `page` (its host and cookies): returns { status, body }. */
const vaultUpload = (page, { purpose, bytes, type, name = "documento.pdf", sha256, fields = {} }) =>
  page.evaluate(
    async ({ purpose, b64, type, name, sha256, fields }) => {
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const form = new FormData();
      form.set("purpose", purpose);
      form.set("sha256", sha256);
      for (const [k, v] of Object.entries(fields)) form.set(k, v);
      form.set("file", new File([data], name, { type }));
      const r = await fetch("/api/vault/upload", { method: "POST", body: form });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { purpose, b64: Buffer.from(bytes).toString("base64"), type, name, sha256, fields },
  );

/** GET a vault file from `page`: status, headers and the SHA-256 of the body computed in the browser. */
const vaultGet = (page, target) =>
  page.evaluate(async (target) => {
    const r = await fetch(target, { cache: "no-store" });
    const buf = await r.arrayBuffer();
    const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
    let error = null;
    if (!r.ok) {
      try {
        error = JSON.parse(new TextDecoder().decode(buf)).error;
      } catch {
        /* not JSON */
      }
    }
    return {
      status: r.status,
      redirected: r.redirected,
      finalUrl: r.url,
      type: r.headers.get("content-type"),
      disposition: r.headers.get("content-disposition"),
      nosniff: r.headers.get("x-content-type-options"),
      header: r.headers.get("x-rwaxi-sha256"),
      sha256: `0x${hex}`,
      error,
    };
  }, target);

// ── mail_outbox (MailDispatcher) ───────────────────────────────────────────
/** The fake mail provider the server delivers through (pnpm e2e:strict), or null with the development sink. */
const MAIL_PROVIDER = process.env.E2E_MAIL_PROVIDER || null;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** The text a mail carried: its body while it has one; once redacted, the copy the provider received. */
async function mailText(db, row, timeout = 30000) {
  if (row.body !== null) return row.body;
  if (!MAIL_PROVIDER) return null;
  for (const end = Date.now() + timeout; ; await pause(300)) {
    const fresh = await db.mailOutbox.findUnique({ where: { id: row.id } });
    if (fresh?.providerMessageId) {
      const { messages } = await (await fetch(`${MAIL_PROVIDER}/__fake/messages`)).json();
      const message = messages.find((m) => m.id === fresh.providerMessageId);
      if (message) return message.text;
    }
    if (Date.now() > end) return null;
  }
}
/** mail_outbox rows matching `where` (oldest first), each with the `text` it carried. */
async function mailsWithText(db, where) {
  const rows = await db.mailOutbox.findMany({ where, orderBy: { createdAt: "asc" } });
  return Promise.all(rows.map(async (row) => ({ ...row, text: await mailText(db, row) })));
}
/** A mail_outbox row once `test(row)` holds (e.g. delivered, redacted), or its last state after `timeout`. */
async function waitMail(db, id, test, timeout = 30000) {
  for (const end = Date.now() + timeout; ; await pause(300)) {
    const row = await db.mailOutbox.findUnique({ where: { id } });
    if ((row && test(row)) || Date.now() > end) return row;
  }
}
/**
 * Whether a mail lost its body with its delivery trail intact: the SHA-256 of what it carried and why it was
 * cleared. Through the provider every mail is cleared when it is sent (SENT, with the provider's message id);
 * with the development sink, by `reason` (CONSUMED, SUPERSEDED, EXPIRED).
 */
function mailRedacted(row, text, reason) {
  const sha = crypto.createHash("sha256").update(text ?? "", "utf8").digest("hex");
  const trail = !!text && row?.body === null && !!row.redactedAt && row.bodySha256 === sha;
  if (MAIL_PROVIDER) {
    return trail && row.status === "SENT" && row.redactionReason === "SENT" && !!row.providerMessageId && !!row.sentAt;
  }
  // CANCELLED when the code was used before the sink took it (the sink then records it anyway)
  return trail && row.redactionReason === reason && ["CAPTURED", "CANCELLED"].includes(row.status);
}
/** Runs the mail job (pnpm mail:dispatch) as a cron would: { ok, report }. */
function mailDispatch() {
  const r = require("child_process").spawnSync("pnpm -s mail:dispatch -- --json", { cwd: ROOT, shell: true, encoding: "utf8" });
  const last = (r.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "";
  try {
    return { ok: r.status === 0, report: JSON.parse(last) };
  } catch {
    return { ok: false, report: null, error: (r.stderr ?? "").split("\n").slice(-3).join(" ") };
  }
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
  fromBase32,
  VAULT_DIR,
  vaultPath,
  fileSha256,
  pdfBytes,
  sha256Of,
  vaultUpload,
  vaultGet,
  MAIL_PROVIDER,
  mailText,
  mailsWithText,
  waitMail,
  mailRedacted,
  mailDispatch,
};
