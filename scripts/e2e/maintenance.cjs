// E2E · GET|POST /api/internal/maintenance — the batch of `pnpm mail:dispatch` + `pnpm vault:gc` for a scheduler
// (Vercel Cron). Only with `Authorization: Bearer <CRON_SECRET>` (the value of apps/web/.env.local, compared in constant
// time); parameters validated before anything runs. The mail step attempts the due mails of every tenant under each
// tenant's RLS, fails those whose attempts all ran out and clears the bodies that expired; the vault step deletes only
// objects no row references once their grace window passed (local driver here; vault-s3.cjs runs it against S3). The
// summary is auditable: its digest is the evidenceHash of the rest, recomputed here.
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const lib = require("./lib.cjs");
const { ownerDb, ok, fail, PORT, canon, sha256, webEnv, VAULT_DIR, pdfBytes, MAIL_PROVIDER } = lib;

const db = ownerDb();
const SECRET = webEnv("CRON_SECRET");
const BEARER = `Bearer ${SECRET}`;
const hex = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

/**
 * One call to the endpoint, as a scheduler makes it. Node's fetch cannot resolve *.localhost here, so it goes to
 * 127.0.0.1 with the Host header of the environment (null: the vitrina, localhost; "avista": that tenant's host).
 */
const call = (query = "", { auth, method = "GET", host = null } = {}) =>
  new Promise((resolve, reject) => {
    const headers = { Host: `${host ? `${host}.` : ""}localhost:${PORT}`, ...(auth === undefined ? {} : { Authorization: auth }) };
    const req = http.request({ host: "127.0.0.1", port: PORT, path: `/api/internal/maintenance${query}`, method, headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (text += chunk));
      res.on("end", () => {
        let body = null;
        try {
          body = JSON.parse(text);
        } catch {
          /* not JSON */
        }
        resolve({ status: res.statusCode, auth: res.headers["www-authenticate"] ?? null, cache: res.headers["cache-control"] ?? null, body });
      });
    });
    req.on("error", reject);
    req.end();
  });
/** The summary's digest = evidenceHash of every other field (canonical JSON + SHA-256), recomputed independently. */
const digestOf = (summary) => {
  const { digest, ...rest } = summary;
  return sha256(canon(rest));
};
const keyPath = (key) => path.join(VAULT_DIR, ...key.split("/"));
const exists = (key) => fs.existsSync(keyPath(key));
/** An object as the local driver stores it: the bytes at `{key}` and their metadata at `{key}.json`. */
function writeObject(key, bytes, ageHours) {
  fs.mkdirSync(path.dirname(keyPath(key)), { recursive: true });
  fs.writeFileSync(`${keyPath(key)}.json`, JSON.stringify({ sizeBytes: bytes.length, mimeType: "application/pdf", sha256: hex(bytes) }));
  fs.writeFileSync(keyPath(key), bytes);
  if (ageHours) {
    const at = new Date(Date.now() - ageHours * 3600_000);
    fs.utimesSync(keyPath(key), at, at);
  }
}
const mailRow = (org, data) => {
  const body = data.body ?? `RWAXI E2E · mantenimiento ${crypto.randomBytes(6).toString("hex")}`;
  return db.mailOutbox.create({
    data: {
      organizationId: org.id,
      purpose: "INVESTOR_OTP",
      toEmail: `e2e-maint-${crypto.randomBytes(4).toString("hex")}@rwaxi.test`,
      subject: "RWAXI · código de prueba",
      body,
      bodySha256: hex(Buffer.from(body, "utf8")),
      expiresAt: new Date(Date.now() + 10 * 60_000),
      ...data,
    },
  });
};

(async () => {
  try {
    const [avista, santabarbara] = await Promise.all(
      ["avista", "santabarbara"].map((slug) => db.organization.findUniqueOrThrow({ where: { slug } })),
    );
    ok("CRON_SECRET definido en apps/web/.env.local (≥ 32 caracteres)", SECRET.trim().length >= 32);

    // ── 1 · Without the secret nothing runs ─────────────────────────────────
    const due = await mailRow(avista, {});
    const refused = {
      none: await call(),
      wrong: await call("", { auth: `Bearer ${crypto.randomBytes(24).toString("hex")}` }),
      basic: await call("", { auth: `Basic ${SECRET}` }),
      prefix: await call("", { auth: `Bearer ${SECRET.slice(0, -1)}` }),
      longer: await call("", { auth: `Bearer ${SECRET}x` }),
      post: await call("", { auth: "Bearer ", method: "POST" }),
    };
    ok(
      "sin el secreto exacto → 401 (sin cabecera, otro secreto, Basic, un prefijo, con un carácter de más, POST vacío), con WWW-Authenticate y sin caché",
      Object.values(refused).every((r) => r.status === 401 && /^Bearer/.test(r.auth ?? "") && r.body?.ok === false && /no-store/.test(r.cache ?? "")),
      Object.entries(refused).map(([k, r]) => `${k} ${r.status}`).join(" · "),
    );
    const badParams = {
      grace: await call("?graceHours=1", { auth: BEARER }),
      limitLow: await call("?limit=0", { auth: BEARER }),
      limitHigh: await call("?limit=501", { auth: BEARER }),
      only: await call("?only=everything", { auth: `bearer ${SECRET}` }), // the scheme is case-insensitive
      dryRun: await call("?dryRun=maybe", { auth: BEARER }),
    };
    const untouched = await db.mailOutbox.findUniqueOrThrow({ where: { id: due.id } });
    ok(
      "con el secreto, parámetros inválidos → 400 antes de ejecutar nada (ventana < 6 h, lote fuera de 1…500, paso desconocido, dryRun)",
      Object.values(badParams).every((r) => r.status === 400 && r.body?.ok === false) &&
        /graceHours/.test(badParams.grace.body?.error ?? "") &&
        untouched.status === "PENDING" &&
        untouched.attempts === 0,
      Object.entries(badParams).map(([k, r]) => `${k} ${r.status}`).join(" · "),
    );

    // ── 2 · Mail: every tenant, under its own RLS ──────────────────────────
    const otherTenant = await mailRow(santabarbara, {});
    const exhausted = await mailRow(avista, { attempts: 5, lastAttemptAt: new Date(Date.now() - 10 * 60_000), lastError: "provider timeout" });
    const expired = await mailRow(avista, {
      status: "CAPTURED",
      provider: "dev",
      sentAt: new Date(Date.now() - 20 * 60_000),
      expiresAt: new Date(Date.now() - 60_000),
    });
    const mailRun = await call("?only=mail", { auth: BEARER, host: "avista" });
    const m = mailRun.body?.mail;
    const [dueAfter, otherAfter, exhaustedAfter, expiredAfter] = await Promise.all(
      [due, otherTenant, exhausted, expired].map((r) => db.mailOutbox.findUniqueOrThrow({ where: { id: r.id } })),
    );
    const delivered = (row) =>
      MAIL_PROVIDER
        ? row.status === "SENT" && row.body === null && row.redactionReason === "SENT" && !!row.providerMessageId
        : row.status === "CAPTURED" && row.body !== null && !!row.sentAt;
    ok(
      `?only=mail → 200: los correos pendientes de cada tenant se entregan (${MAIL_PROVIDER ? "proveedor HTTP: SENT y cuerpo borrado" : "sumidero de desarrollo: CAPTURED"}), también el de otro tenant aunque la llamada llegue por el host de avista`,
      mailRun.status === 200 && m?.ok && m.due >= 2 && delivered(dueAfter) && delivered(otherAfter) && dueAfter.attempts === 1 && mailRun.body.vault === null,
      m ? `${m.driver} · due ${m.due} · sent ${m.sent} · captured ${m.captured}` : JSON.stringify(mailRun.body),
    );
    ok(
      "el que agotó sus intentos sin respuesta queda FAILED con el cuerpo borrado; el vencido, sin cuerpo (EXPIRED); ninguno se envía",
      exhaustedAfter.status === "FAILED" &&
        exhaustedAfter.body === null &&
        exhaustedAfter.redactionReason === "FAILED" &&
        exhaustedAfter.attempts === 5 &&
        expiredAfter.body === null &&
        expiredAfter.redactionReason === "EXPIRED" &&
        m.exhaustedFailed >= 1 &&
        m.expiredRedacted >= 1,
      m ? `exhausted ${m.exhaustedFailed} · expired ${m.expiredRedacted}` : "",
    );
    ok(
      "resumen auditable: runId, tiempos, opciones, disparador y digest = evidenceHash del resto (recalculado aquí)",
      /^[0-9a-f-]{36}$/.test(mailRun.body.runId) &&
        mailRun.body.job === "rwaxi.maintenance" &&
        mailRun.body.options.only === "mail" &&
        mailRun.body.trigger.method === "GET" &&
        new Date(mailRun.body.finishedAt) >= new Date(mailRun.body.startedAt) &&
        mailRun.body.digest === digestOf(mailRun.body),
      mailRun.body.digest?.slice(0, 18),
    );

    // ── 3 · Vault GC: only unreferenced objects past their grace window ─────
    // Every key a row of any tenant references (a Data Room file is in both tables: counted once).
    const refs = [
      ...new Set([
        ...(await db.vaultObject.findMany({ select: { storageKey: true } })).map((o) => o.storageKey),
        ...(await db.dataRoomDocument.findMany({ where: { storageKey: { not: null } }, select: { storageKey: true } })).map((d) => d.storageKey),
      ]),
    ];
    const present = refs.filter(exists);
    // Referenced objects aged past the window too: only the reference set (every tenant's) can keep them.
    const old = new Date(Date.now() - 72 * 3600_000);
    for (const key of present) fs.utimesSync(keyPath(key), old, old);
    const [tenantBytes, stagingBytes, freshBytes] = [pdfBytes(), pdfBytes(), pdfBytes()];
    const orphanTenant = `tenants/${avista.id}/sha256/${hex(tenantBytes)}`; // a receipt never submitted
    const orphanStaging = `staging/sha256/${hex(stagingBytes)}`; // an onboarding file never used
    const fresh = `tenants/${avista.id}/sha256/${hex(freshBytes)}`; // unreferenced, but just uploaded
    writeObject(orphanTenant, tenantBytes, 48);
    writeObject(orphanStaging, stagingBytes, 30);
    writeObject(fresh, freshBytes, 0);
    const dry = await call("?only=vault&dryRun=1", { auth: BEARER });
    const dv = dry.body?.vault;
    ok(
      "?only=vault&dryRun=1 → informa los dos huérfanos vencidos sin borrar nada; el recién subido queda en la ventana de gracia",
      dry.status === 200 &&
        dv?.ok &&
        dv.dryRun === true &&
        dv.driver === "local" &&
        [orphanTenant, orphanStaging].every((k) => dv.purged.some((p) => p.key === k) && exists(k)) &&
        !dv.purged.some((p) => p.key === fresh) &&
        dv.kept.recent >= 1 &&
        dry.body.mail === null,
      dv ? `${dv.scanned} revisados · ${dv.purgedCount} a borrar · ${dv.kept.referenced} referenciados` : JSON.stringify(dry.body),
    );
    const run = await call("?only=vault", { auth: BEARER, method: "POST" });
    const rv = run.body?.vault;
    ok(
      "?only=vault (POST) → borra justo esos huérfanos; lo referenciado por cualquier tenant (aunque sea antiguo) y lo reciente sigue en la bóveda",
      run.status === 200 &&
        rv?.ok &&
        rv.dryRun === false &&
        [orphanTenant, orphanStaging].every((k) => rv.purged.some((p) => p.key === k) && !exists(k) && !exists(`${k}.json`)) &&
        exists(fresh) &&
        present.every(exists) &&
        rv.kept.referenced >= present.length &&
        rv.purgedBytes === rv.purged.reduce((s, p) => s + p.sizeBytes, 0) &&
        run.body.digest === digestOf(run.body),
      rv ? `${rv.purgedCount} borrados (${rv.purgedBytes} B) · ${rv.kept.referenced} referenciados · ${rv.kept.recent} recientes` : JSON.stringify(run.body),
    );

    // ── 4 · The whole batch, as Vercel Cron calls it ─────────────────────────
    const full = await call("", { auth: BEARER });
    ok(
      "GET sin parámetros (Vercel Cron) → 200 con ambos pasos; nada nuevo que borrar",
      full.status === 200 && full.body?.ok === true && full.body.mail?.ok && full.body.vault?.ok && full.body.vault.purgedCount === 0 && full.body.digest === digestOf(full.body),
    );
    for (const file of [keyPath(fresh), `${keyPath(fresh)}.json`]) fs.rmSync(file, { force: true });
  } catch (e) {
    fail(e);
  } finally {
    await db.$disconnect();
  }
})();
