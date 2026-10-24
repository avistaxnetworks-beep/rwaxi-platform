// E2E · activation of the staff accounts the B2B onboarding creates without a password, and the DocumentVault
// staging of their base Data Room. Every browser here signs in for real (the demo session is opted out), so the
// suite behaves the same under RWAXI_DEMO_AUTH=0 (pnpm e2e:strict).
//   console sign-in (password + TOTP) → staging uploads verified by the server (forged hash, type and session
//   refused) → onboarding: files copied into the new tenant's vault (VaultObject + bytes re-hashed here),
//   invitations in mail_outbox (only the token's SHA-256 in user_invitations) → activation: password policy,
//   TOTP enrolment from the shown key, session; link single-use and bound to its tenant → the new admin operates
//   the backoffice (Data Room upload) and signs in again → an expired invitation is resent from Module A.
const crypto = require("crypto");
const fs = require("fs");
const lib = require("./lib.cjs");
const { launch, ownerDb, ok, fail, shot, url, canon, sha256, merkleRoot, randomNitBase, nitOf } = lib;
const { waitText, clickText, fill, alertText, waitAlert, onboardTenant, openGovernance, toastText } = lib;
const { DEMO_PASSWORD, totpAt, totpStepNow, withoutDemo, cookieOf, submitLogin, staffLogin, fromBase32 } =
  lib;
const { vaultPath, fileSha256, pdfBytes, sha256Of, vaultUpload, vaultGet } = lib;

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
const STRONG = "Fiducia-Bocagrande#2026";
const linkOf = (mail) => /(https?:\/\/\S+\/backoffice\/activate#token=([\w-]+))/.exec(mail?.text ?? "");
// Each row with the text it carried (its body, or once redacted the provider's copy).
const mailsTo = (email) => lib.mailsWithText(db, { toEmail: email, purpose: "STAFF_INVITATION" });

async function freshPage(browser, label, hosts) {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on("pageerror", (e) => console.log(`PAGEERROR(${label})`, e.message));
  if (hosts) await withoutDemo(page, hosts);
  return page;
}

/** Submits the activation step on screen (password or code); resolves with the server's answer. */
const submitActivation = (page) =>
  Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"], {
      timeout: 120000,
    }),
    page.$eval("[data-activation-step] form", (f) => f.requestSubmit()),
  ]);

/** Opens an activation link and completes it: password, then the code of the enrolled key. Returns the page. */
async function activate(page, link, password = STRONG) {
  await page.goto(link, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector('[data-activation-step="password"]', { timeout: 120000 });
  await fill(page, "#activation-password", password);
  await fill(page, "#activation-confirm", password);
  await submitActivation(page);
  await page.waitForSelector('[data-activation-step="enroll"] [data-totp-secret]', { timeout: 60000 });
  const key = (await page.$eval("[data-totp-secret]", (n) => n.textContent)).replace(/\s/g, "");
  await fill(page, "#activation-code", totpAt(fromBase32(key), totpStepNow()));
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 180000 }),
    page.$eval("[data-activation-step] form", (f) => f.requestSubmit()),
  ]);
  await page.waitForSelector('[data-account="user"]', { timeout: 180000 });
  return key;
}

(async () => {
  const browser = await launch();
  try {
    const suffix = crypto.randomBytes(3).toString("hex");
    const slug = `costaazul${suffix}`;
    const legalName = `Constructora Costa Azul ${suffix.toUpperCase()} S.A.S.`;
    const displayName = `Costa Azul ${suffix.toUpperCase()}`;
    const nit = nitOf(randomNitBase());

    // ── 1 · The console signs in for real; staging uploads are verified before anything is written ──
    const s = await freshPage(browser, "console", ["admin"]);
    await s.goto(url("admin"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await staffLogin(s, "direccion@rwaxi.com");
    await s.waitForSelector("[data-platform-overview]", { timeout: 180000 });
    const direction = await db.user.findUniqueOrThrow({ where: { email: "direccion@rwaxi.com" } });

    const forged = pdfBytes();
    const badHash = sha256Of(pdfBytes());
    const refused = await vaultUpload(s, {
      purpose: "onboarding",
      bytes: forged,
      type: "application/pdf",
      sha256: badHash,
    });
    const asText = Buffer.from("no soy un PDF, soy texto plano");
    const wrongType = await vaultUpload(s, {
      purpose: "onboarding",
      bytes: asText,
      type: "application/pdf",
      sha256: sha256Of(asText),
    });
    ok(
      "staging: bytes que no coinciden con el SHA-256 declarado → 422 y nada escrito; texto declarado como PDF → 415",
      refused.status === 422 &&
        /no coincide/.test(refused.body?.error ?? "") &&
        !fs.existsSync(vaultPath(null, sha256Of(forged))) &&
        wrongType.status === 415,
      `${refused.body?.error} · ${wrongType.body?.error}`,
    );
    const anon = await freshPage(browser, "anon-console", ["admin"]);
    await anon.goto(url("admin", "/login"), { waitUntil: "domcontentloaded", timeout: 180000 });
    const noSession = await vaultUpload(anon, {
      purpose: "onboarding",
      bytes: forged,
      type: "application/pdf",
      sha256: sha256Of(forged),
    });
    ok("staging sin sesión de la consola → 403", noSession.status === 403, noSession.body?.error);
    await anon.browserContext().close();

    // ── 2 · Onboarding: the verified files land in the new tenant's vault, the team gets invitations ──
    await onboardTenant(s, { slug, legalName, displayName, nit });
    const org = await db.organization.findUniqueOrThrow({
      where: { slug },
      include: {
        users: true,
        offerings: { include: { documents: true } },
        vaultObjects: true,
        invitations: true,
      },
    });
    const docs = org.offerings[0].documents;
    const onDisk = docs.map(
      (d) =>
        fs.existsSync(vaultPath(org.id, d.sha256)) && fileSha256(vaultPath(org.id, d.sha256)) === d.sha256,
    );
    ok(
      "Data Room base en la bóveda del tenant: 13 documentos con storageKey, 13 VaultObject PDF y bytes en disco que re-hashean a su SHA-256",
      docs.length === 13 &&
        docs.every((d) => d.storageKey === `tenants/${org.id}/sha256/${d.sha256.slice(2)}`) &&
        org.vaultObjects.length === 13 &&
        org.vaultObjects.every((v) => v.mimeType === "application/pdf") &&
        onDisk.every(Boolean) &&
        merkleRoot(docs.map((d) => d.sha256)) === org.offerings[0].dataRoomRoot,
    );
    const admin = org.users.find((u) => u.role === "TENANT_ADMIN");
    const officer = org.users.find((u) => u.role === "COMPLIANCE_OFFICER");
    const [adminMail] = await mailsTo(admin.email);
    const [officerMail] = await mailsTo(officer.email);
    const adminLink = linkOf(adminMail);
    const officerLink = linkOf(officerMail);
    const invAdmin = org.invitations.find((i) => i.userId === admin.id);
    const invited = await db.auditEvent.findMany({
      where: { organizationId: org.id, action: "STAFF_INVITED" },
    });
    ok(
      "usuarios sin contraseña; invitación de 72 h por persona en mail_outbox y en BD sólo el SHA-256 del token",
      !admin.passwordHash &&
        !officer.passwordHash &&
        !!adminLink &&
        !!officerLink &&
        adminLink[1].startsWith(`http://${slug}.localhost:`) &&
        org.invitations.length === 2 &&
        invAdmin.tokenHash === sha(adminLink[2]) &&
        !JSON.stringify(org.invitations).includes(adminLink[2]) &&
        Math.abs(invAdmin.expiresAt.getTime() - invAdmin.createdAt.getTime() - 72 * 3600_000) < 60_000 &&
        invited.length === 2 &&
        invited.every((e) => e.actorUserId === direction.id && e.subjectHash === auditHash(e)),
      adminMail?.subject,
    );
    await openGovernance(s);
    await s.waitForSelector(`[data-staff="${admin.email}"]`, { timeout: 60000 });
    ok(
      "Módulo A: el equipo del nuevo desarrollador aparece pendiente de activación",
      (await s.$eval(`[data-staff="${admin.email}"]`, (n) => n.dataset.staffStatus)) === "PENDING" &&
        (await s.$eval(`[data-staff="${officer.email}"]`, (n) => n.dataset.staffStatus)) === "PENDING",
    );

    // ── 3 · Activation of the administrator: password policy, TOTP enrolment, session ──
    const a = await freshPage(browser, "admin", [slug]);
    await a.goto(adminLink[1], { waitUntil: "domcontentloaded", timeout: 180000 });
    await a.waitForSelector('[data-activation-step="password"]', { timeout: 120000 });
    ok(
      "el enlace muestra la cuenta invitada y retira el token de la barra de direcciones",
      (await a.$eval("[data-activation-account]", (n) => n.textContent)).includes(admin.email) &&
        !a.url().includes(adminLink[2]),
    );
    await fill(a, "#activation-password", "Salazar-Fuerte#2026");
    await fill(a, "#activation-confirm", "Salazar-Fuerte#2026");
    const personalLive = await a.$eval('[data-password-rule="personal"]', (n) => n.dataset.ok);
    await submitActivation(a);
    await waitAlert(a, /no cumple la política de seguridad/);
    await fill(a, "#activation-password", "corta");
    await fill(a, "#activation-confirm", "corta");
    await submitActivation(a);
    await waitAlert(a, /no cumple la política de seguridad/);
    const untouched = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
    ok(
      "política de contraseñas: con el apellido de la persona o demasiado corta → rechazada en el servidor (y en vivo en pantalla)",
      personalLive === "false" &&
        !untouched.passwordHash &&
        !(await db.userInvitation.findUniqueOrThrow({ where: { id: invAdmin.id } })).pendingPasswordHash,
    );

    await fill(a, "#activation-password", STRONG);
    await fill(a, "#activation-confirm", STRONG);
    await submitActivation(a);
    await a.waitForSelector('[data-activation-step="enroll"] [data-totp-secret]', { timeout: 60000 });
    const parked = await db.userInvitation.findUniqueOrThrow({ where: { id: invAdmin.id } });
    ok(
      "paso 1: la contraseña (scrypt) y el secreto TOTP (cifrado) esperan en la invitación; la cuenta aún no tiene ninguno",
      /^scrypt\$/.test(parked.pendingPasswordHash ?? "") &&
        /^v1\./.test(parked.pendingTotpSecretEnc ?? "") &&
        !(await db.user.findUniqueOrThrow({ where: { id: admin.id } })).passwordHash,
    );
    const key = (await a.$eval("[data-totp-secret]", (n) => n.textContent)).replace(/\s/g, "");
    await fill(
      a,
      "#activation-code",
      "000000" === totpAt(fromBase32(key), totpStepNow()) ? "111111" : "000000",
    );
    await submitActivation(a);
    await waitAlert(a, /Código incorrecto/);
    await fill(a, "#activation-code", totpAt(fromBase32(key), totpStepNow()));
    await Promise.all([
      a.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 180000 }),
      a.$eval("[data-activation-step] form", (f) => f.requestSubmit()),
    ]);
    await a.waitForSelector('[data-account="user"]', { timeout: 180000 });
    const activated = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
    const usedInvitation = await db.userInvitation.findUniqueOrThrow({ where: { id: invAdmin.id } });
    const session = await cookieOf(a, slug, "rwaxi_session");
    const opened = await db.userSession.findUnique({ where: { tokenHash: sha(session?.value ?? "") } });
    const activatedAudit = await lastAudit({ organizationId: org.id, action: "ACCOUNT_ACTIVATED" });
    ok(
      "primer código TOTP válido → cuenta activa (contraseña + MFA), invitación consumida y sesión verificada en el backoffice",
      pathOf(a) === "/backoffice" &&
        activated.passwordHash === parked.pendingPasswordHash &&
        activated.totpSecretEnc === parked.pendingTotpSecretEnc &&
        !!activated.mfaEnrolledAt &&
        !!usedInvitation.consumedAt &&
        !usedInvitation.pendingPasswordHash &&
        opened?.userId === admin.id &&
        opened.organizationId === org.id &&
        !!opened.mfaVerifiedAt &&
        session.httpOnly,
    );
    ok(
      "auditado: ACCOUNT_ACTIVATED, MFA_ENROLLED y LOGIN_SUCCEEDED con el usuario (subjectHash recalculado)",
      activatedAudit?.actorUserId === admin.id &&
        activatedAudit.payload.invitationId === invAdmin.id &&
        activatedAudit.subjectHash === auditHash(activatedAudit) &&
        !!(await lastAudit({ organizationId: org.id, action: "MFA_ENROLLED", actorUserId: admin.id })) &&
        !!(await lastAudit({ organizationId: org.id, action: "LOGIN_SUCCEEDED", actorUserId: admin.id })),
    );
    const spent = await lib.waitMail(db, adminMail.id, (m) => m.body === null);
    ok(
      "el enlace usado: su correo queda sin cuerpo en mail_outbox (CONSUMED; con proveedor, ya al enviarse: SENT), con SHA-256, destinatario y fechas",
      spent?.relatedId === invAdmin.id && lib.mailRedacted(spent, adminMail.text, "CONSUMED"),
      `${spent?.status} · ${spent?.redactionReason}`,
    );

    const again = await freshPage(browser, "reuse", [slug]);
    await again.goto(adminLink[1], { waitUntil: "domcontentloaded", timeout: 180000 });
    await again.waitForSelector('[data-activation-step="invalid"]', { timeout: 120000 });
    ok(
      "el mismo enlace por segunda vez → «no es válido, ya se usó o venció»",
      /ya se usó o venció/.test(await alertText(again)),
    );
    await again.browserContext().close();

    // ── 4 · The new administrator operates the backoffice with a real session ──
    await a.evaluate(() =>
      [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes("Data Room")).click(),
    );
    const code = org.offerings[0].code;
    await a.waitForSelector(`[data-dr-offering="${code}"]`, { timeout: 60000 });
    const listed = await a.$$eval(`[data-dr-offering="${code}"] [data-dr-document]`, (rows) =>
      rows.map((r) => r.dataset.stored),
    );
    const file = require("path").join(lib.ARTIFACTS, `activation-${suffix}.pdf`);
    fs.writeFileSync(file, pdfBytes(`activation-${suffix}`));
    const input = await a.$(`#drv-file-${code}`);
    await input.uploadFile(file);
    const added = await until(
      async () => (await db.dataRoomDocument.count({ where: { offeringId: org.offerings[0].id } })) === 14,
      60000,
    );
    const addedAudit = await lastAudit({ organizationId: org.id, action: "DATA_ROOM_DOCUMENT_ADDED" });
    ok(
      "el administrador recién activado sube un documento al Data Room: verificado, en su bóveda y auditado con su usuario",
      listed.length === 13 &&
        listed.every((s) => s === "true") &&
        added &&
        addedAudit?.actorUserId === admin.id &&
        addedAudit.subjectHash === fileSha256(file) &&
        fs.existsSync(vaultPath(org.id, fileSha256(file))),
      await toastText(a),
    );
    const download = await vaultGet(a, `/api/vault/data-room/${docs[0].id}?as=backoffice`);
    ok(
      "abre un documento del Data Room del backoffice: 200, PDF, SHA-256 idéntico",
      download.status === 200 && download.type === "application/pdf" && download.sha256 === docs[0].sha256,
    );

    await Promise.all([
      a.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 180000 }),
      a.click("[data-logout]"),
    ]);
    await a.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
    await fill(a, "#login-email", admin.email);
    await fill(a, "#login-password", STRONG);
    await submitLogin(a);
    await a.waitForSelector('[data-login-step="mfa"]', { timeout: 60000 });
    // The activation spent the current step's code (never accepted twice): the next step is inside the ±1 window.
    await fill(a, "#login-code", totpAt(fromBase32(key), totpStepNow() + 1));
    await Promise.all([
      a.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 180000 }),
      a.$eval("[data-login-step] form", (f) => f.requestSubmit()),
    ]);
    await a.waitForSelector('[data-account="user"]', { timeout: 180000 });
    ok("cierra sesión y vuelve a entrar con su contraseña y su app TOTP", pathOf(a) === "/backoffice");
    const demoPassword = await freshPage(browser, "demo-pass", [slug]);
    await demoPassword.goto(url(slug, "/backoffice/login"), {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
    await demoPassword.waitForSelector('[data-login-step="password"]', { timeout: 180000 });
    await fill(demoPassword, "#login-email", officer.email);
    await fill(demoPassword, "#login-password", DEMO_PASSWORD);
    await submitLogin(demoPassword);
    await waitAlert(demoPassword, /Correo o contraseña incorrectos/);
    ok(
      "una cuenta aún sin activar no entra con ninguna contraseña (tampoco la demo)",
      pathOf(demoPassword) === "/backoffice/login",
    );
    await demoPassword.browserContext().close();

    // ── 5 · An invitation that expired unused is resent from Module A; the old link stops working ──
    const invOfficer = org.invitations.find((i) => i.userId === officer.id);
    await db.userInvitation.update({
      where: { id: invOfficer.id },
      data: { expiresAt: new Date(invOfficer.createdAt.getTime() + 1000) },
    });
    const actions = {};
    s.on("request", (req) => {
      const id = req.headers()["next-action"];
      if (req.method() === "POST" && id) actions[req.postData() ?? ""] = id;
    });
    await openGovernance(s);
    await s.waitForSelector(`[data-staff="${officer.email}"][data-staff-status="EXPIRED"]`, {
      timeout: 60000,
    });
    await s.click(`[data-resend-invitation="${officer.id}"]`);
    await s.waitForSelector("[data-governance-dialog]", { timeout: 30000 });
    await clickText(s, "Confirmar decisión", '[role="dialog"]');
    await s.waitForSelector(`[data-staff="${officer.email}"][data-staff-status="PENDING"]`, {
      timeout: 60000,
    });
    const officerMails = await mailsTo(officer.email);
    const newLink = linkOf(officerMails.at(-1));
    const officerInvs = await db.userInvitation.findMany({
      where: { userId: officer.id },
      orderBy: { createdAt: "asc" },
    });
    const resent = await lastAudit({ organizationId: org.id, action: "STAFF_INVITATION_RESENT" });
    ok(
      "invitación vencida → «Reenviar invitación»: nuevo enlace en mail_outbox, el anterior revocado, STAFF_INVITATION_RESENT auditado",
      officerMails.length === 2 &&
        !!newLink &&
        newLink[2] !== officerLink[2] &&
        officerInvs.length === 2 &&
        !!officerInvs[0].revokedAt &&
        officerInvs[1].tokenHash === sha(newLink[2]) &&
        resent?.payload.previousInvitationId === invOfficer.id &&
        resent.actorUserId === direction.id &&
        resent.subjectHash === auditHash(resent),
      await toastText(s),
    );
    const replaced = await lib.waitMail(db, officerMail.id, (m) => m.body === null);
    ok(
      "el correo del enlace reemplazado queda sin cuerpo (SUPERSEDED; con proveedor, ya SENT); el nuevo apunta a la nueva invitación",
      lib.mailRedacted(replaced, officerMail.text, "SUPERSEDED") && officerMails.at(-1).relatedId === officerInvs[1].id,
      `${replaced?.status} · ${replaced?.redactionReason}`,
    );
    const resendId = Object.entries(actions).find(([body]) => body.includes(officer.id))?.[1];
    const twice = resendId ? await lib.replayAction(s, resendId, [officer.id]) : "";
    ok("reenviar mientras la invitación sigue vigente → rechazado", /sigue vigente/.test(twice));

    const old = await freshPage(browser, "old-link", [slug]);
    await old.goto(officerLink[1], { waitUntil: "domcontentloaded", timeout: 180000 });
    await old.waitForSelector('[data-activation-step="invalid"]', { timeout: 120000 });
    ok(
      "el enlace anterior (revocado) ya no activa la cuenta",
      /ya se usó o venció/.test(await alertText(old)),
    );
    const foreign = await old.browserContext().newPage();
    await withoutDemo(foreign, ["avista"]);
    await foreign.goto(newLink[1].replace(`//${slug}.`, "//avista."), {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
    await foreign.waitForSelector('[data-activation-step="invalid"]', { timeout: 120000 });
    ok(
      "el enlace vigente abierto en el host de otro tenant → no existe bajo su RLS",
      (await db.user.findUniqueOrThrow({ where: { id: officer.id } })).passwordHash === null,
    );
    await old.browserContext().close();

    const o = await freshPage(browser, "officer", [slug]);
    await activate(o, newLink[1]);
    const badge = await o.$eval('[data-account="user"]', (n) => n.textContent);
    await o.evaluate(() =>
      [...document.querySelectorAll('[role="tab"]')]
        .find((t) => t.textContent.includes("Cumplimiento y Leads"))
        .click(),
    );
    await o.waitForFunction(() => document.body.innerText.includes("sesión:"), { timeout: 60000 });
    const spentNew = await lib.waitMail(db, officerMails.at(-1).id, (m) => m.body === null);
    ok(
      "activado con el enlace reenviado: su correo también queda sin cuerpo (CONSUMED; con proveedor, ya SENT)",
      lib.mailRedacted(spentNew, officerMails.at(-1).text, "CONSUMED"),
      `${spentNew?.status} · ${spentNew?.redactionReason}`,
    );
    ok(
      "el oficial activa su cuenta con el enlace reenviado y opera su bandeja con su rol real",
      badge.includes("Oficial de Cumplimiento") &&
        !(await o.$("[data-read-only]")) &&
        !!(await db.user.findUniqueOrThrow({ where: { id: officer.id } })).mfaEnrolledAt,
    );
    await openGovernance(s);
    await s.waitForSelector(`[data-staff="${officer.email}"][data-staff-status="ACTIVE"]`, {
      timeout: 60000,
    });
    ok(
      "Módulo A: ambas cuentas activas",
      (await s.$eval(`[data-staff="${admin.email}"]`, (n) => n.dataset.staffStatus)) === "ACTIVE",
    );
    await shot(o, "activation-officer");
    await o.browserContext().close();
    await a.browserContext().close();
    await s.browserContext().close();
  } catch (e) {
    fail(e);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})();
