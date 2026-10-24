// Runs the suites whose browsers sign in for real (auth, activation, vault) and the cron endpoint (maintenance)
// against `next dev` started with RWAXI_DEMO_AUTH=0: no request can fall back on the demo session. Mail goes out
// through an HTTP provider (a Resend-compatible fake, fake-mail.cjs): every mail is SENT and its body redacted at
// once, so the suites read codes and links from what the provider received. Reseeds before each suite and at the end.
// The regular dev server must be stopped first (this script owns the port).
//   pnpm e2e:strict                 the four suites
//   pnpm e2e:strict activation      only those
const crypto = require("crypto");
const path = require("path");
const ORIGINAL_ENV = { ...process.env }; // before lib.cjs loads packages/database/.env
const { PORT, url } = require("./lib.cjs");
const { seed, runSuite, waitForHttp, portFree, startService, killTree, summary } = require("./runner.cjs");

const SUITES = ["auth", "activation", "vault", "maintenance"];
const MAIL_PORT = Number(process.env.E2E_MAIL_PORT || 4010);
const services = [];
const stopAll = () => services.splice(0).reverse().forEach(killTree);
process.on("SIGINT", () => {
  stopAll();
  process.exit(130);
});

(async () => {
  const selected = process.argv.slice(2).length ? process.argv.slice(2) : SUITES;
  const unknown = selected.filter((s) => !SUITES.includes(s));
  if (unknown.length)
    throw new Error(
      `Suites desconocidas en modo estricto: ${unknown.join(", ")} (disponibles: ${SUITES.join(", ")})`,
    );
  if (!(await portFree(PORT)))
    throw new Error(
      `El puerto ${PORT} está en uso: detén pnpm dev (esta prueba levanta su propio servidor con RWAXI_DEMO_AUTH=0).`,
    );
  if (!(await portFree(MAIL_PORT)))
    throw new Error(`El puerto ${MAIL_PORT} (proveedor de correo de prueba) está en uso.`);
  try {
    const apiKey = `re_e2e_${crypto.randomBytes(12).toString("hex")}`;
    const mail = { url: `http://127.0.0.1:${MAIL_PORT}` };
    // Its own process: the runner's reseeds are synchronous and would block a server living here.
    services.push(
      startService(`node "${path.join(__dirname, "fake-mail.cjs")}"`, {
        ...ORIGINAL_ENV,
        E2E_MAIL_PORT: String(MAIL_PORT),
        E2E_MAIL_API_KEY: apiKey,
      }),
    );
    if (!(await waitForHttp(`${mail.url}/__fake/messages`, 30000)))
      throw new Error("El proveedor de correo de prueba no arrancó.");
    // The web server and the suites (they run pnpm mail:dispatch) deliver through the same provider.
    const mailEnv = {
      RESEND_API_KEY: apiKey,
      RESEND_API_URL: mail.url,
      MAIL_FROM: "RWAXI E2E <no-reply@rwaxi.test>",
    };
    seed();
    services.push(
      startService(`pnpm --filter @rwaxi/web exec next dev --port ${PORT}`, {
        ...ORIGINAL_ENV,
        ...mailEnv,
        RWAXI_DEMO_AUTH: "0",
      }),
    );
    if (!(await waitForHttp(url(null, "/api/health"), 180000)))
      throw new Error("next dev (RWAXI_DEMO_AUTH=0) no arrancó.");
    const health = await (await fetch(url(null, "/api/health"))).json();
    if (health.demoAuth !== false)
      throw new Error("El servidor sigue con la sesión demo activa: RWAXI_DEMO_AUTH=0 no se aplicó.");
    console.log(
      `next dev con RWAXI_DEMO_AUTH=0 · demoAuth=false · correo por proveedor HTTP de prueba (${mail.url})`,
    );

    const results = [];
    for (const name of selected) {
      seed();
      console.log(`\n── ${name} (estricto) ──`);
      results.push(await runSuite(name, { ...mailEnv, E2E_MAIL_PROVIDER: mail.url }));
    }
    process.exitCode = summary(results) ? 0 : 1;
  } finally {
    stopAll();
    seed();
  }
})().catch((e) => {
  console.error(e.message);
  stopAll();
  process.exitCode = 1;
});
