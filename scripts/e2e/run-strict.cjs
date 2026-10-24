// Runs the suites whose browsers sign in for real (auth, activation, vault) against `next dev` started with
// RWAXI_DEMO_AUTH=0: no request can fall back on the demo session. Reseeds before each suite and at the end.
// The regular dev server must be stopped first (this script owns the port).
//   pnpm e2e:strict                 the three suites
//   pnpm e2e:strict activation      only those
const ORIGINAL_ENV = { ...process.env }; // before lib.cjs loads packages/database/.env
const { PORT, url } = require("./lib.cjs");
const { seed, runSuite, waitForHttp, portFree, startService, killTree, summary } = require("./runner.cjs");

const SUITES = ["auth", "activation", "vault"];
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
  try {
    seed();
    services.push(
      startService(`pnpm --filter @rwaxi/web exec next dev --port ${PORT}`, {
        ...ORIGINAL_ENV,
        RWAXI_DEMO_AUTH: "0",
      }),
    );
    if (!(await waitForHttp(url(null, "/api/health"), 180000)))
      throw new Error("next dev (RWAXI_DEMO_AUTH=0) no arrancó.");
    const health = await (await fetch(url(null, "/api/health"))).json();
    if (health.demoAuth !== false)
      throw new Error("El servidor sigue con la sesión demo activa: RWAXI_DEMO_AUTH=0 no se aplicó.");
    console.log("next dev con RWAXI_DEMO_AUTH=0 · demoAuth=false");

    const results = [];
    for (const name of selected) {
      seed();
      console.log(`\n── ${name} (estricto) ──`);
      results.push(await runSuite(name));
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
