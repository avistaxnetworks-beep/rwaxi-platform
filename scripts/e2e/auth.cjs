// E2E · institutional authentication against Neon:
//   staff sign-in with password (scrypt) + TOTP (RFC 6238, computed here independently) in the developer
//   backoffice and the RWAXI console; sessions stored only as SHA-256 (user_sessions), bound to tenant and scope;
//   role segregation (KYC and the on-chain queue); cross-tenant and cross-scope cookies refused; TOTP replay;
//   MFA enrolment; lockout after 5 failures; logout (revocation); trilingual login; investor session recovery
//   by a one-time email code (mail_outbox, HMAC in investor_otps). Every outcome is checked in audit_events.
//   The demo session stays on for the other suites: these browsers opt out of it (cookie rwaxi_demo_auth=off).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const lib = require("./lib.cjs");
const { ROOT, launch, ownerDb, ok, fail, shot, url, canon, sha256, webEnv } = lib;
const { waitText, clickText, clickIn, fill, alertText, waitAlert, onboardInvestor } = lib;
const {
  DEMO_PASSWORD,
  demoTotpSecret,
  totpAt,
  totpStepNow,
  nextTotp,
  withoutDemo,
  cookieOf,
  submitLogin,
  staffLogin,
} = lib;

const db = ownerDb();
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const auditHash = (e) =>
  sha256(canon({ action: e.action, organizationId: e.organizationId, entityId: e.entityId, ...e.payload }));
const lastAudit = (where) => db.auditEvent.findFirst({ where, orderBy: { createdAt: "desc" } });
const pathOf = (page) => new URL(page.url()).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, timeout = 30000) => {
  for (const end = Date.now() + timeout; Date.now() < end; await sleep(300)) if (await fn()) return true;
  return false;
};

// The app's catalogues (apps/web/app/_i18n/messages/<lang>.ts): object literals keyed by the Spanish source.
const catalog = (lang) => {
  const src = fs.readFileSync(path.join(ROOT, "apps/web/app/_i18n/messages", `${lang}.ts`), "utf8");
  return new Function(`return ${src.slice(src.indexOf("= {") + 2, src.lastIndexOf("};") + 1)}`)();
};
const CAT = { en: catalog("en"), pt: catalog("pt") };

/** RFC 4648 base32 (the enrolment key an authenticator app reads), decoded independently. */
const fromBase32 = (s) => {
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
};
/** A 6-digit code no step of the ±1 window accepts. */
const wrongCode = (secret) => {
  const now = totpStepNow();
  const valid = new Set([now - 1, now, now + 1, now + 2].map((s) => totpAt(secret, s)));
  for (let n = 0; ; n++) if (!valid.has(String(n).padStart(6, "0"))) return String(n).padStart(6, "0");
};

/** Resolves with the answer of the Server Action that `trigger` posts. */
const act = (page, trigger) =>
  Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"], {
      timeout: 120000,
    }),
    trigger(),
  ]);
/**
 * Runs `trigger` but rewrites its Server Action request so that it targets nothing (`needle` → "0"): returns the
 * action id, to replay the real call from another session.
 */
async function grabAction(page, needle, trigger) {
  let id = null;
  await page.setRequestInterception(true);
  const handler = (req) => {
    const body = req.postData() || "";
    if (!id && req.method() === "POST" && req.headers()["next-action"] && body.includes(needle)) {
      id = req.headers()["next-action"];
      req.continue({ postData: body.split(needle).join("0") });
    } else req.continue();
  };
  page.on("request", handler);
  await trigger();
  await until(() => id !== null);
  await sleep(1500);
  page.off("request", handler);
  await page.setRequestInterception(false);
  return id;
}
/** POSTs a Server Action from `page`'s path; resolves with the RSC text. */
const replay = (page, actionId, args) =>
  page.evaluate(
    (actionId, args) =>
      fetch(location.pathname, {
        method: "POST",
        headers: {
          "Next-Action": actionId,
          "Content-Type": "text/plain;charset=UTF-8",
          Accept: "text/x-component",
        },
        body: JSON.stringify(args),
      }).then((r) => r.text()),
    actionId,
    args,
  );
const tab = async (page, label) => {
  await page.waitForFunction(
    (l) => [...document.querySelectorAll('[role="tab"]')].some((t) => t.textContent.includes(l)),
    { timeout: 180000 },
    label,
  );
  await page.evaluate(
    (l) => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes(l)).click(),
    label,
  );
};
const status = (page, p) => page.evaluate((p) => fetch(p, { cache: "no-store" }).then((r) => r.status), p);

async function freshPage(browser, label, hosts) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`PAGEERROR(${label})`, e.message));
  if (hosts) await withoutDemo(page, hosts);
  return page;
}

(async () => {
  const browser = await launch();
  try {
    const health = await (await fetch(url(null, "/api/health"))).json();
    const [avista, elpoblado, santabarbara] = await Promise.all(
      ["avista", "elpoblado", "santabarbara"].map((slug) =>
        db.organization.findUniqueOrThrow({ where: { slug } }),
      ),
    );
    const ADMIN = "admin@avistaresort.co";
    const OFFICER = "compliance@avistaresort.co";
    const DIRECTION = "direccion@rwaxi.com";
    const [admin, officer, direction] = await Promise.all(
      [ADMIN, OFFICER, DIRECTION].map((email) => db.user.findUniqueOrThrow({ where: { email } })),
    );

    // ── 0 · The other suites keep the demo session; RWAXI_DEMO_AUTH=0 demands a real one ──────────────
    const d = await freshPage(browser, "demo");
    await d.goto(url("avista", "/backoffice"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await d.waitForSelector(health.demoAuth ? '[data-account="demo"]' : '[data-login-step="password"]', {
      timeout: 180000,
    });
    ok(
      health.demoAuth
        ? "RWAXI_DEMO_AUTH activo (local): sin sesión real el backoffice usa la sesión demo de las otras suites"
        : "RWAXI_DEMO_AUTH desactivado: sin sesión real el backoffice exige login",
      health.demoAuth ? pathOf(d) === "/backoffice" : pathOf(d) === "/backoffice/login",
      `demoAuth=${health.demoAuth}`,
    );
    await d.browserContext().close();

    // ── 1 · Without a session nothing of the backoffice opens ────────────────────────────────────────
    const a = await freshPage(browser, "admin", ["avista", "elpoblado", "admin"]);
    await a.goto(url("avista", "/backoffice"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await a.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
    ok("sin sesión: /backoffice redirige a /backoffice/login", pathOf(a) === "/backoffice/login");
    ok(
      "sin sesión: la cola on-chain (API) y el código .sol del inspector responden 403",
      (await status(a, "/api/chain/transactions?scope=pending")) === 403 &&
        (await status(a, "/api/inspector/sources?as=backoffice")) === 403,
    );
    await shot(a, "auth-login-backoffice");

    // ── 2 · Wrong password: generic answer, counted and audited ──────────────────────────────────────
    await fill(a, "#login-email", ADMIN);
    await fill(a, "#login-password", "no-es-la-clave-2026");
    await submitLogin(a);
    await waitAlert(a, /Correo o contraseña incorrectos/);
    const badPassword = await lastAudit({
      organizationId: avista.id,
      action: "LOGIN_FAILED",
      actorEmail: ADMIN,
    });
    ok(
      "contraseña incorrecta → «Correo o contraseña incorrectos», 1 fallo en la cuenta y LOGIN_FAILED (subjectHash recalculado)",
      badPassword?.payload.factor === "password" &&
        badPassword.payload.scope === "TENANT" &&
        badPassword.subjectHash === auditHash(badPassword) &&
        (await db.user.findUniqueOrThrow({ where: { id: admin.id } })).failedLoginCount === 1 &&
        (await db.userSession.count({ where: { userId: admin.id } })) === 0,
    );

    // ── 3 · Password → pending session → TOTP ────────────────────────────────────────────────────────
    await fill(a, "#login-password", DEMO_PASSWORD);
    await submitLogin(a);
    await a.waitForSelector('[data-login-step="mfa"]', { timeout: 60000 });
    const pendingCookie = await cookieOf(a, "avista", "rwaxi_session");
    const pending = await db.userSession.findUnique({
      where: { tokenHash: sha(pendingCookie?.value ?? "") },
    });
    ok(
      "contraseña correcta → sesión pendiente de MFA (5 min); la BD guarda sólo el SHA-256 del token; cookie HttpOnly",
      !!pending &&
        pending.userId === admin.id &&
        pending.organizationId === avista.id &&
        pending.scope === "TENANT" &&
        !pending.mfaVerifiedAt &&
        Math.abs(pending.expiresAt.getTime() - pending.createdAt.getTime() - 5 * 60_000) < 60_000 &&
        pendingCookie.httpOnly &&
        pendingCookie.sameSite === "Lax" &&
        !JSON.stringify(pending).includes(pendingCookie.value),
    );
    const a2 = await a.browserContext().newPage();
    await a2.goto(url("avista", "/backoffice"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await a2.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
    ok("con el MFA pendiente el backoffice sigue cerrado", pathOf(a2) === "/backoffice/login");
    await a2.close();

    await fill(a, "#login-code", wrongCode(demoTotpSecret(ADMIN)));
    await submitLogin(a);
    await waitAlert(a, /Código incorrecto/);
    const mfaFailed = await lastAudit({ organizationId: avista.id, action: "MFA_FAILED", actorEmail: ADMIN });
    ok(
      "código TOTP incorrecto → MFA_FAILED y un intento consumido de la sesión pendiente",
      mfaFailed?.payload.factor === "totp" &&
        mfaFailed.subjectHash === auditHash(mfaFailed) &&
        (await db.userSession.findUniqueOrThrow({ where: { id: pending.id } })).mfaAttempts === 1,
    );

    const t1 = await nextTotp(ADMIN);
    await fill(a, "#login-code", t1.code);
    await Promise.all([
      a.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 180000 }),
      a.$eval("[data-login-step] form", (f) => f.requestSubmit()),
    ]);
    await a.waitForSelector('[data-account="user"]', { timeout: 180000 });
    const session = await cookieOf(a, "avista", "rwaxi_session");
    const opened = await db.userSession.findUniqueOrThrow({ where: { id: pending.id } });
    const adminAfter = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
    const loginOk = await lastAudit({
      organizationId: avista.id,
      action: "LOGIN_SUCCEEDED",
      actorEmail: ADMIN,
    });
    ok(
      "TOTP RFC 6238 válido → sesión abierta (8 h); el token rota y el pendiente deja de valer",
      pathOf(a) === "/backoffice" &&
        session.value !== pendingCookie.value &&
        session.httpOnly &&
        opened.tokenHash === sha(session.value) &&
        !!opened.mfaVerifiedAt &&
        Math.abs(opened.expiresAt.getTime() - opened.mfaVerifiedAt.getTime() - 8 * 3600_000) < 5000 &&
        (await db.userSession.count({ where: { tokenHash: sha(pendingCookie.value) } })) === 0,
    );
    ok(
      "cuenta: paso TOTP usado guardado (anti-replay), fallos a 0 y LOGIN_SUCCEEDED auditado (subjectHash recalculado)",
      adminAfter.totpLastStep === t1.step &&
        adminAfter.failedLoginCount === 0 &&
        !!adminAfter.lastLoginAt &&
        loginOk?.actorUserId === admin.id &&
        loginOk.payload.sessionId === pending.id &&
        loginOk.payload.role === "TENANT_ADMIN" &&
        loginOk.subjectHash === auditHash(loginOk),
    );

    // The same code again, from another browser, still inside its 30 s window: refused.
    const r = await freshPage(browser, "replay", ["avista"]);
    await r.goto(url("avista", "/backoffice/login"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await r.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
    await fill(r, "#login-email", ADMIN);
    await fill(r, "#login-password", DEMO_PASSWORD);
    await submitLogin(r);
    await r.waitForSelector('[data-login-step="mfa"]', { timeout: 60000 });
    const inWindow = totpStepNow() <= t1.step + 1;
    await fill(r, "#login-code", t1.code);
    await submitLogin(r);
    await waitAlert(r, /Código incorrecto/);
    ok(
      "el mismo código TOTP reutilizado dentro de su ventana desde otro navegador → rechazado (anti-replay)",
      inWindow && pathOf(r) === "/backoffice/login" && !(await r.$('[data-account="user"]')),
      `paso ${t1.step}, ahora ${totpStepNow()}`,
    );
    await r.browserContext().close();

    // ── 4 · Who is acting: header, desks by role, inspector source ───────────────────────────────────
    const badge = await a.$eval('[data-account="user"]', (n) => n.textContent);
    ok(
      "cabecera: usuario real, rol, «MFA activo» y «Cerrar sesión»",
      badge.includes(admin.fullName) &&
        badge.includes("Administrador") &&
        badge.includes("MFA activo") &&
        !!(await a.$("[data-logout]")),
    );
    await tab(a, "Cumplimiento y Leads");
    await a.waitForSelector("[data-read-only]", { timeout: 60000 });
    const readOnly = await a.$eval("[data-read-only]", (n) => n.textContent);
    ok(
      "Administrador en «Cumplimiento y Leads»: solo lectura (las decisiones KYC son del Oficial)",
      /requieren el rol Oficial de Cumplimiento/.test(readOnly) &&
        (await a.$$eval("button", (bs) =>
          bs.filter((b) => b.textContent.includes("Aprobar Inversionista")).every((b) => b.disabled),
        )),
      readOnly,
    );
    await tab(a, "Suscripciones y Pagos");
    await a.waitForSelector("[data-subscriptions-desk]", { timeout: 60000 });
    ok(
      "Administrador en «Suscripciones y Pagos»: puede actuar; la mesa muestra su sesión real",
      !(await a.$("[data-read-only]")) &&
        (await waitText(a, `sesión: ${ADMIN} (Administrador)`, 30000).then(
          () => true,
          () => false,
        )),
    );
    const sources = await a.evaluate(() =>
      fetch("/api/inspector/sources?as=backoffice", { cache: "no-store" }).then(async (res) => ({
        status: res.status,
        body: await res.json(),
      })),
    );
    ok(
      "inspector: el código fuente .sol sólo con sesión autenticada del backoffice",
      sources.status === 200 && sources.body.ok && Object.keys(sources.body.sources ?? {}).length >= 3,
    );

    // ── 5 · Role segregation, enforced by the server: KYC is the officer's, the registry call too ─────
    const inv = await onboardInvestor(browser, db, "avista");
    const kyc = await db.kycCase.findFirstOrThrow({
      where: { investorId: inv.investor.id, status: "PENDING" },
    });
    const o = await freshPage(browser, "officer", ["avista"]);
    await o.goto(url("avista", "/backoffice"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await staffLogin(o, OFFICER);
    await tab(o, "Cumplimiento y Leads");
    await o.waitForSelector(`tr[data-investor="${inv.investor.id}"]`, { timeout: 90000 });
    ok(
      "Oficial de Cumplimiento: la bandeja permite decidir (sin aviso de solo lectura)",
      !(await o.$("[data-read-only]")),
    );
    const approveId = await grabAction(o, kyc.id, () =>
      clickIn(o, `tr[data-investor="${inv.investor.id}"]`, "Aprobar Inversionista"),
    );
    const forgedApprove = await replay(a, approveId, [kyc.id]);
    ok(
      "aprobar KYC con la sesión del Administrador (acción replicada) → «requiere el rol Oficial de Cumplimiento», expediente intacto",
      !!approveId &&
        /requiere el rol Oficial de Cumplimiento/.test(forgedApprove) &&
        (await db.kycCase.findUniqueOrThrow({ where: { id: kyc.id } })).status === "PENDING",
    );
    await o.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
    await tab(o, "Cumplimiento y Leads");
    await o.waitForSelector(`tr[data-investor="${inv.investor.id}"]`, { timeout: 90000 });
    await clickIn(o, `tr[data-investor="${inv.investor.id}"]`, "Aprobar Inversionista");
    await o.waitForFunction(
      (id) => document.querySelector(`tr[data-investor="${id}"] [data-kyc]`)?.dataset.kyc === "aprobado",
      { timeout: 90000 },
      inv.investor.id,
    );
    const approved = await lastAudit({ organizationId: avista.id, action: "KYC_APPROVED", entityId: kyc.id });
    ok(
      "el Oficial con sesión real aprueba el KYC; el AuditEvent lleva su usuario",
      approved?.actorUserId === officer.id && approved.actorEmail === OFFICER,
    );

    const whitelist = await db.chainTransaction.findFirstOrThrow({
      where: { organizationId: avista.id, kind: "INVESTOR_WHITELISTED", status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    await a.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
    await tab(a, "Suscripciones y Pagos");
    const row = `[data-queue-item="${whitelist.id}"]`;
    await a.waitForSelector(row, { timeout: 90000 });
    const adminRow = await a.$eval(row, (n) => ({
      text: n.textContent,
      disabled: [...n.querySelectorAll("button")].every((b) => b.disabled),
    }));
    await tab(o, "Suscripciones y Pagos");
    await o.waitForSelector(row, { timeout: 90000 });
    const officerRow = await o.$eval(row, (n) =>
      [...n.querySelectorAll("button")].some(
        (b) => !b.disabled && b.textContent.includes("Firmar y ejecutar"),
      ),
    );
    ok(
      "cola on-chain: el approveInvestor lo ejecuta el Oficial (habilitado para él); para el Administrador, deshabilitado y explicado",
      adminRow.disabled && /La firma el rol Oficial de Cumplimiento/.test(adminRow.text) && officerRow,
    );
    const executeId = await grabAction(o, whitelist.id, () => clickIn(o, row, "Firmar y ejecutar"));
    const forgedExecute = await replay(a, executeId, [whitelist.id]);
    ok(
      "ejecutar el approveInvestor con la sesión del Administrador (acción replicada) → rechazado, sigue PENDING",
      !!executeId &&
        /requiere el rol Oficial de Cumplimiento/.test(forgedExecute) &&
        (await db.chainTransaction.findUniqueOrThrow({ where: { id: whitelist.id } })).status === "PENDING",
    );
    await o.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
    await tab(o, "Suscripciones y Pagos");
    await o.waitForSelector(row, { timeout: 90000 });
    await clickIn(o, row, "Firmar y ejecutar");
    const confirmed = await until(
      async () =>
        (await db.chainTransaction.findUniqueOrThrow({ where: { id: whitelist.id } })).status === "CONFIRMED",
      90000,
    );
    const chainAudit = await lastAudit({
      organizationId: avista.id,
      action: "CHAIN_TX_CONFIRMED",
      entityId: whitelist.id,
    });
    ok(
      "el Oficial ejecuta su approveInvestor desde la cola: CONFIRMED y CHAIN_TX_CONFIRMED con su usuario",
      confirmed &&
        chainAudit?.actorUserId === officer.id &&
        !!(await db.kycCase.findUniqueOrThrow({ where: { id: kyc.id } })).whitelistTxHash,
    );
    await o.browserContext().close();

    // ── 6 · A session is bound to its tenant and its scope ───────────────────────────────────────────
    const x = await freshPage(browser, "cross", ["avista", "elpoblado", "admin"]);
    await x.setCookie({ name: "rwaxi_session", value: session.value, url: url("elpoblado"), httpOnly: true });
    await x.goto(url("elpoblado", "/backoffice"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await x.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
    ok(
      "la cookie de sesión de avista en elpoblado.localhost → no existe bajo el RLS de elpoblado: login (y la API responde 403)",
      pathOf(x) === "/backoffice/login" && (await status(x, "/api/chain/transactions?scope=pending")) === 403,
    );
    await x.setCookie({ name: "rwaxi_session", value: session.value, url: url("admin"), httpOnly: true });
    await x.goto(url("admin"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await x.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
    ok(
      "la misma cookie (alcance TENANT) en admin.localhost → la consola pide su propio login",
      pathOf(x) === "/login",
    );
    const valle = await db.user.findUniqueOrThrow({ where: { email: "admin@vallealto.co" } });
    await x.goto(url("avista", "/backoffice/login"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await x.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
    await fill(x, "#login-email", valle.email);
    await fill(x, "#login-password", DEMO_PASSWORD);
    await submitLogin(x);
    await waitAlert(x, /Correo o contraseña incorrectos/);
    const crossLogin = await lastAudit({
      organizationId: avista.id,
      action: "LOGIN_FAILED",
      actorEmail: valle.email,
    });
    ok(
      "credenciales válidas de Valle Alto en el backoffice de avista → rechazadas (el usuario no existe bajo su RLS)",
      crossLogin?.entityId === "unknown" &&
        crossLogin.actorUserId === null &&
        (await db.user.findUniqueOrThrow({ where: { id: valle.id } })).failedLoginCount === 0 &&
        (await db.userSession.count({ where: { userId: valle.id } })) === 0,
    );
    await x.browserContext().close();

    // ── 7 · Logout revokes the session ───────────────────────────────────────────────────────────────
    await Promise.all([
      a.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 180000 }),
      a.click("[data-logout]"),
    ]);
    await a.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
    const revoked = await db.userSession.findUniqueOrThrow({ where: { id: pending.id } });
    const logout = await lastAudit({ organizationId: avista.id, action: "LOGOUT", actorEmail: ADMIN });
    ok(
      "«Cerrar sesión» → sesión revocada en BD, cookie borrada y LOGOUT auditado",
      pathOf(a) === "/backoffice/login" &&
        !!revoked.revokedAt &&
        logout?.payload.sessionId === pending.id &&
        logout.subjectHash === auditHash(logout) &&
        !(await cookieOf(a, "avista", "rwaxi_session")),
    );
    await a.setCookie({ name: "rwaxi_session", value: session.value, url: url("avista"), httpOnly: true });
    await a.goto(url("avista", "/backoffice"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await a.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
    ok("el token revocado, reinyectado, no vuelve a abrir el backoffice", pathOf(a) === "/backoffice/login");
    await a.browserContext().close();

    // ── 8 · MFA enrolment and lockout (santabarbara) ─────────────────────────────────────────────────
    const ENROL = "cumplimiento@andesurbano.co";
    const enrolUser = await db.user.update({
      where: { email: ENROL },
      data: { mfaEnrolledAt: null, totpSecretEnc: null },
    });
    const e = await freshPage(browser, "enrol", ["santabarbara"]);
    await e.goto(url("santabarbara", "/backoffice/login"), {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
    await e.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
    await fill(e, "#login-email", ENROL);
    await fill(e, "#login-password", DEMO_PASSWORD);
    await submitLogin(e);
    await e.waitForSelector('[data-login-step="enroll"] [data-totp-secret]', { timeout: 60000 });
    const shownKey = (await e.$eval("[data-totp-secret]", (n) => n.textContent)).replace(/\s/g, "");
    const uri = await e.$eval("[data-mfa-enrolment] a", (n) => n.getAttribute("href"));
    const sealed = (await db.user.findUniqueOrThrow({ where: { id: enrolUser.id } })).totpSecretEnc;
    ok(
      "cuenta sin MFA: el login muestra la clave a enrolar (otpauth SHA1 · 6 dígitos · 30 s); en BD queda cifrada (AES-256-GCM)",
      /^[A-Z2-7]{32}$/.test(shownKey) &&
        uri.startsWith("otpauth://totp/") &&
        uri.includes(`secret=${shownKey}`) &&
        /algorithm=SHA1&digits=6&period=30/.test(uri) &&
        /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/.test(sealed ?? "") &&
        !sealed.includes(shownKey),
    );
    await fill(e, "#login-code", totpAt(fromBase32(shownKey), totpStepNow()));
    await Promise.all([
      e.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 180000 }),
      e.$eval("[data-login-step] form", (f) => f.requestSubmit()),
    ]);
    await e.waitForSelector('[data-account="user"]', { timeout: 180000 });
    const enrolled = await db.user.findUniqueOrThrow({ where: { id: enrolUser.id } });
    const enrolAudit = await lastAudit({
      organizationId: santabarbara.id,
      action: "MFA_ENROLLED",
      actorEmail: ENROL,
    });
    ok(
      "el primer código de la app confirma el enrolamiento: MFA_ENROLLED + LOGIN_SUCCEEDED y sesión abierta",
      !!enrolled.mfaEnrolledAt &&
        enrolled.totpSecretEnc === sealed &&
        enrolAudit?.subjectHash === auditHash(enrolAudit) &&
        !!(await lastAudit({
          organizationId: santabarbara.id,
          action: "LOGIN_SUCCEEDED",
          actorEmail: ENROL,
        })),
    );
    await e.browserContext().close();

    const LOCKED = "admin@andesurbano.co";
    const l = await freshPage(browser, "lockout", ["santabarbara"]);
    await l.goto(url("santabarbara", "/backoffice/login"), {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
    await l.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
    await fill(l, "#login-email", LOCKED);
    for (let i = 1; i <= 5; i++) {
      await fill(l, "#login-password", `clave-equivocada-${i}`);
      await submitLogin(l);
    }
    await waitAlert(l, /Cuenta bloqueada temporalmente/);
    const lockedUser = await db.user.findUniqueOrThrow({ where: { email: LOCKED } });
    const lockAudit = await lastAudit({
      organizationId: santabarbara.id,
      action: "ACCOUNT_LOCKED",
      actorEmail: LOCKED,
    });
    const fifth = await lastAudit({
      organizationId: santabarbara.id,
      action: "LOGIN_FAILED",
      actorEmail: LOCKED,
    });
    ok(
      "5 contraseñas incorrectas → cuenta bloqueada 15 min (ACCOUNT_LOCKED; el 5.º LOGIN_FAILED registra los 5 fallos)",
      Math.abs(lockedUser.lockedUntil?.getTime() - Date.now() - 15 * 60_000) < 60_000 &&
        lockedUser.failedLoginCount === 0 &&
        lockAudit?.payload.minutes === 15 &&
        lockAudit.subjectHash === auditHash(lockAudit) &&
        fifth?.payload.failures === 5 &&
        (await db.auditEvent.count({
          where: { organizationId: santabarbara.id, action: "LOGIN_FAILED", actorEmail: LOCKED },
        })) === 5,
    );
    await fill(l, "#login-password", DEMO_PASSWORD);
    await submitLogin(l);
    await waitAlert(l, /Cuenta bloqueada temporalmente/);
    const afterLock = await lastAudit({
      organizationId: santabarbara.id,
      action: "LOGIN_FAILED",
      actorEmail: LOCKED,
    });
    ok(
      "bloqueada, ni la contraseña correcta abre sesión (LOGIN_FAILED locked; sin sesiones)",
      afterLock?.payload.locked === true &&
        (await l.$('[data-login-step="password"]')) !== null &&
        (await db.userSession.count({ where: { userId: lockedUser.id } })) === 0,
    );

    // ── 9 · The backoffice login in English and Portuguese ───────────────────────────────────────────
    const GHOST = `nadie.${Date.now()}@ejemplo.co`;
    for (const lang of ["en", "pt"]) {
      await l.click(`[data-lang-toggle] [data-lang-option="${lang}"]`);
      await l.waitForSelector(`[data-lang-toggle="${lang}"]`, { timeout: 60000 });
      await l.waitForFunction(
        (t) => document.querySelector("h1")?.textContent.includes(t),
        { timeout: 60000 },
        CAT[lang]["Acceso al backoffice"],
      );
      await fill(l, "#login-email", GHOST);
      await fill(l, "#login-password", "cualquier-clave");
      await submitLogin(l);
      const expected = CAT[lang]["Correo o contraseña incorrectos."];
      await l.waitForFunction(
        (t) => [...document.querySelectorAll('[role="alert"]')].some((n) => n.textContent.includes(t)),
        { timeout: 60000 },
        expected,
      );
      const labels = await l.$$eval("[data-login-step] label", (ns) =>
        ns.map((n) => n.textContent).join(" | "),
      );
      ok(
        `login del backoffice en ${lang}: título, campos y error del servidor traducidos`,
        labels.includes(CAT[lang]["Correo corporativo"]) && labels.includes(CAT[lang]["Contraseña"]),
        `${CAT[lang]["Acceso al backoffice"]} · ${expected}`,
      );
    }
    await shot(l, "auth-login-pt");
    await l.browserContext().close();

    // ── 10 · RWAXI console: its own scope, SUPER_ADMIN only ──────────────────────────────────────────
    const s = await freshPage(browser, "console", ["admin", "avista"]);
    await s.goto(url("admin"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await s.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
    ok(
      "consola sin sesión → /login, y su código .sol del inspector responde 403",
      pathOf(s) === "/login" && (await status(s, "/api/inspector/sources?as=platform")) === 403,
    );
    for (const email of [ADMIN, "operador@rwaxi.com"]) {
      await fill(s, "#login-email", email);
      await fill(s, "#login-password", DEMO_PASSWORD);
      await submitLogin(s);
      await waitAlert(s, /Correo o contraseña incorrectos/);
    }
    const tenantOnConsole = await lastAudit({
      organizationId: null,
      action: "LOGIN_FAILED",
      actorEmail: ADMIN,
    });
    const operatorOnConsole = await lastAudit({
      organizationId: null,
      action: "LOGIN_FAILED",
      actorEmail: "operador@rwaxi.com",
    });
    ok(
      "en la consola, credenciales de un tenant o del operador técnico → rechazadas (sólo SUPER_ADMIN), auditadas sin organización",
      tenantOnConsole?.payload.scope === "PLATFORM" &&
        tenantOnConsole.entityId === "unknown" &&
        tenantOnConsole.subjectHash === auditHash(tenantOnConsole) &&
        operatorOnConsole?.entityId === "unknown",
    );
    await fill(s, "#login-email", DIRECTION);
    await fill(s, "#login-password", DEMO_PASSWORD);
    await submitLogin(s);
    await s.waitForSelector('[data-login-step="mfa"]', { timeout: 60000 });
    const t2 = await nextTotp(DIRECTION);
    await fill(s, "#login-code", t2.code);
    await Promise.all([
      s.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 180000 }),
      s.$eval("[data-login-step] form", (f) => f.requestSubmit()),
    ]);
    await s.waitForSelector("[data-platform-overview]", { timeout: 180000 });
    const platformCookie = await cookieOf(s, "admin", "rwaxi_session");
    const platformSession = await db.userSession.findUnique({
      where: { tokenHash: sha(platformCookie?.value ?? "") },
    });
    const consoleOk = await lastAudit({
      organizationId: null,
      action: "LOGIN_SUCCEEDED",
      actorEmail: DIRECTION,
    });
    ok(
      "direccion@rwaxi.com con contraseña + TOTP → consola; sesión PLATFORM sin organización (4 h) y LOGIN_SUCCEEDED sin organización",
      (await s.$eval('[data-account="user"]', (n) => n.textContent)).includes(direction.fullName) &&
        platformSession?.scope === "PLATFORM" &&
        platformSession.organizationId === null &&
        platformSession.userId === direction.id &&
        Math.abs(
          platformSession.expiresAt.getTime() - platformSession.mfaVerifiedAt.getTime() - 4 * 3600_000,
        ) < 5000 &&
        consoleOk?.subjectHash === auditHash(consoleOk),
    );
    ok(
      "con la sesión de la consola, el inspector entrega el código fuente .sol",
      (await status(s, "/api/inspector/sources?as=platform")) === 200,
    );
    await s.setCookie({
      name: "rwaxi_session",
      value: platformCookie.value,
      url: url("avista"),
      httpOnly: true,
    });
    const sp = await s.browserContext().newPage();
    await sp.goto(url("avista", "/backoffice"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await sp.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
    ok(
      "la cookie de la consola (alcance PLATFORM) en el backoffice de avista → login",
      pathOf(sp) === "/backoffice/login",
    );
    await sp.close();
    await Promise.all([
      s.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 180000 }),
      s.click("[data-logout]"),
    ]);
    await s.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
    const consoleLogout = await lastAudit({ organizationId: null, action: "LOGOUT", actorEmail: DIRECTION });
    ok(
      "«Cerrar sesión» en la consola → revocada y LOGOUT sin organización",
      pathOf(s) === "/login" &&
        !!(await db.userSession.findUniqueOrThrow({ where: { id: platformSession.id } })).revokedAt &&
        consoleLogout?.payload.sessionId === platformSession.id,
    );
    await s.browserContext().close();

    // ── 11 · Investor session recovery by a one-time email code ──────────────────────────────────────
    const otpKey = crypto
      .createHmac("sha256", webEnv("INVESTOR_SESSION_SECRET"))
      .update("rwaxi.investor-otp.v1")
      .digest();
    const otpHash = (code) =>
      crypto.createHmac("sha256", otpKey).update(`${avista.id}:${inv.investor.id}:${code}`).digest("hex");
    const mails = () =>
      db.mailOutbox.findMany({
        where: { toEmail: inv.email, purpose: "INVESTOR_OTP" },
        orderBy: { createdAt: "asc" },
      });
    const codeOf = (mail) => /\b(\d{6})\b/.exec(mail.body)?.[1];
    const latestOtp = () =>
      db.investorOtp.findFirstOrThrow({
        where: { investorId: inv.investor.id },
        orderBy: { createdAt: "desc" },
      });

    const b = await freshPage(browser, "recovery");
    const actions = {};
    b.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (req.method() === "POST" && id) actions[req.postData() ?? ""] = id;
    });
    await b.goto(url("avista"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitText(b, "Firmar NDA con un clic", 180000);
    await b.type("#nda-name", "Otra Persona Distinta");
    await b.type("#nda-email", inv.email);
    await b.click("#nda-ok");
    await clickText(b, "Firmar NDA con un clic");
    await waitAlert(b, /Recuperar mi sesión/);
    ok(
      "NDA con el correo de un inversionista existente → rechazado; remite a «Recuperar mi sesión» sin tocar su proceso",
      (await db.investor.count({ where: { email: inv.email, organizationId: avista.id } })) === 1 &&
        !!(await b.$("[data-recovery-open]")),
    );

    await b.click("[data-recovery-open]");
    await b.waitForSelector('[data-recovery-step="email"] #recovery-email', { timeout: 30000 });
    await fill(b, "#recovery-email", GHOST);
    await act(b, () => b.$eval('[data-recovery-step="email"] form', (f) => f.requestSubmit()));
    await b.waitForSelector("[data-recovery-notice]", { timeout: 30000 });
    const ghostNotice = await b.$eval("[data-recovery-notice]", (n) => n.textContent);
    ok(
      "correo sin proceso en el portal → respuesta genérica, sin código ni correo en la bandeja (no revela quién invierte)",
      /Si ese correo tiene un proceso/.test(ghostNotice) &&
        (await db.mailOutbox.count({ where: { toEmail: GHOST } })) === 0 &&
        (await db.investorOtp.count({ where: { organizationId: avista.id } })) === 0,
    );

    await clickText(b, "Cambiar correo", '[role="dialog"]');
    await b.waitForSelector('[data-recovery-step="email"] #recovery-email', { timeout: 30000 });
    await fill(b, "#recovery-email", inv.email.toUpperCase());
    await act(b, () => b.$eval('[data-recovery-step="email"] form', (f) => f.requestSubmit()));
    await b.waitForSelector("[data-recovery-notice]", { timeout: 30000 });
    const [mail1] = await mails();
    const code1 = mail1 && codeOf(mail1);
    const otp1 = await latestOtp();
    ok(
      "su correo → la misma respuesta; código de 6 dígitos en mail_outbox y en BD sólo su HMAC, vence en 10 min, sin intentos",
      (await b.$eval("[data-recovery-notice]", (n) => n.textContent)) === ghostNotice &&
        !!code1 &&
        mail1.organizationId === avista.id &&
        mail1.subject.includes(avista.displayName) &&
        otp1.codeHash === otpHash(code1) &&
        !otp1.codeHash.includes(code1) &&
        Math.abs(otp1.expiresAt.getTime() - otp1.createdAt.getTime() - 10 * 60_000) < 60_000 &&
        otp1.attempts === 0 &&
        !otp1.consumedAt,
    );

    await fill(b, "#recovery-code", String((Number(code1) + 1) % 1e6).padStart(6, "0"));
    await act(b, () => b.$eval('[data-recovery-step="code"] form', (f) => f.requestSubmit()));
    await waitAlert(b, /Código incorrecto o vencido/);
    ok(
      "código incorrecto → rechazado y descontado (1 de 5 intentos)",
      (await db.investorOtp.findUniqueOrThrow({ where: { id: otp1.id } })).attempts === 1,
    );

    await fill(b, "#recovery-code", code1);
    await Promise.all([
      b.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 180000 }),
      b.$eval('[data-recovery-step="code"] form', (f) => f.requestSubmit()),
    ]);
    await b.waitForFunction(() => !document.querySelector(".boot") && !!document.querySelector("#funnel"), {
      timeout: 180000,
    });
    await waitText(b, "AccessGrant vigente", 60000);
    const inv1 = await cookieOf(b, "avista", "rwaxi_inv");
    const [, invId, invOrg, issued, sig] = (inv1?.value ?? "").split(".");
    const expectedSig = crypto
      .createHmac("sha256", webEnv("INVESTOR_SESSION_SECRET"))
      .update(`v1.${invId}.${invOrg}.${issued}`)
      .digest("base64url");
    const recovered = await lastAudit({
      organizationId: avista.id,
      action: "INVESTOR_SESSION_RECOVERED",
      entityId: inv.investor.id,
    });
    const otp1After = await db.investorOtp.findUniqueOrThrow({ where: { id: otp1.id } });
    ok(
      "código correcto → sesión firmada del inversionista en el otro navegador (rwaxi_inv HttpOnly, HMAC verificado) con su proceso",
      inv1?.httpOnly &&
        invId === inv.investor.id &&
        invOrg === avista.id &&
        sig === expectedSig &&
        !(await b.$("[data-recovery-open]")),
    );
    ok(
      "código consumido (un solo uso) e INVESTOR_SESSION_RECOVERED auditado (subjectHash recalculado)",
      !!otp1After.consumedAt &&
        otp1After.attempts === 2 &&
        recovered?.actorEmail === inv.email &&
        recovered.subjectHash === auditHash(recovered),
    );

    const verifyId = Object.entries(actions).find(([body]) => body.includes(code1))?.[1];
    const c = await freshPage(browser, "recovery-2");
    c.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (req.method() === "POST" && id) actions[req.postData() ?? ""] = id;
    });
    await c.goto(url("avista"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitText(c, "Firmar NDA con un clic", 180000);
    const reuse = await replay(c, verifyId, [inv.email, code1]);
    ok(
      "el mismo código desde un tercer navegador → rechazado (ya usado)",
      !!verifyId && /Código incorrecto o vencido/.test(reuse) && !(await cookieOf(c, "avista", "rwaxi_inv")),
    );

    await c.click("[data-recovery-open]");
    await c.waitForSelector("#recovery-email", { timeout: 30000 });
    await fill(c, "#recovery-email", inv.email);
    await act(c, () => c.$eval('[data-recovery-step="email"] form', (f) => f.requestSubmit()));
    await c.waitForSelector("[data-recovery-notice]", { timeout: 30000 });
    const mail2 = (await mails())[1];
    const code2 = mail2 && codeOf(mail2);
    const otp2 = await latestOtp();
    for (let i = 0; i < 5; i++) {
      await fill(c, "#recovery-code", String((Number(code2) + 1 + i) % 1e6).padStart(6, "0"));
      await act(c, () => c.$eval('[data-recovery-step="code"] form', (f) => f.requestSubmit()));
    }
    await waitAlert(c, /Código incorrecto o vencido/);
    const burnt = await db.investorOtp.findUniqueOrThrow({ where: { id: otp2.id } });
    await fill(c, "#recovery-code", code2);
    await act(c, () => c.$eval('[data-recovery-step="code"] form', (f) => f.requestSubmit()));
    await waitAlert(c, /Código incorrecto o vencido/);
    const burntAudit = await lastAudit({
      organizationId: avista.id,
      action: "INVESTOR_OTP_FAILED",
      entityId: inv.investor.id,
    });
    ok(
      "5 códigos incorrectos agotan el código: después ni el correcto abre la sesión (INVESTOR_OTP_FAILED)",
      !!code2 &&
        burnt.attempts === 5 &&
        burnt.expiresAt.getTime() <= Date.now() &&
        !(await cookieOf(c, "avista", "rwaxi_inv")) &&
        burntAudit?.payload.attempts === 5 &&
        burntAudit.subjectHash === auditHash(burntAudit),
    );

    await act(c, () => clickText(c, "Enviar otro código", '[role="dialog"]'));
    const mail3 = (await mails())[2];
    const otp3 = await latestOtp();
    await db.investorOtp.update({ where: { id: otp3.id }, data: { expiresAt: new Date(Date.now() - 10 * 60_000) } });
    await fill(c, "#recovery-code", codeOf(mail3) ?? "000000");
    await act(c, () => c.$eval('[data-recovery-step="code"] form', (f) => f.requestSubmit()));
    await waitAlert(c, /Código incorrecto o vencido/);
    ok(
      "código vencido (más de 10 min) → rechazado sin abrir sesión",
      !!mail3 &&
        otp3.id !== otp2.id &&
        !(await cookieOf(c, "avista", "rwaxi_inv")) &&
        !(await db.investorOtp.findUniqueOrThrow({ where: { id: otp3.id } })).consumedAt,
    );

    await act(c, () => clickText(c, "Enviar otro código", '[role="dialog"]'));
    await sleep(1000);
    ok(
      "límite por inversionista: un 4.º código en 15 min no se emite (misma respuesta, nada en la bandeja)",
      (await mails()).length === 3 &&
        (await db.investorOtp.count({ where: { investorId: inv.investor.id } })) === 3,
      await alertText(c),
    );
    await shot(c, "auth-recovery");
    await c.browserContext().close();
    await b.browserContext().close();
    await inv.page.browserContext().close();
  } catch (e) {
    fail(e);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})();
