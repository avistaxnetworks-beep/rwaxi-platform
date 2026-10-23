// Runs the E2E suites against the running dev server (`pnpm dev`) and the database of
// packages/database/.env, reseeding the demo data before each suite and once at the end.
//   pnpm e2e                          all suites
//   pnpm e2e portal payments-queue    only those
//   E2E_NO_SEED=1 pnpm e2e …          keep the current data
const { url } = require("./lib.cjs");
const { seed, runSuite, waitForHttp, summary } = require("./runner.cjs");

const SUITES = ["backoffice", "portal", "referrals-subscriptions", "payments-queue"];

(async () => {
  const selected = process.argv.slice(2).length ? process.argv.slice(2) : SUITES;
  const unknown = selected.filter((s) => !SUITES.includes(s));
  if (unknown.length) throw new Error(`Suites desconocidas: ${unknown.join(", ")} (disponibles: ${SUITES.join(", ")})`);
  if (!(await waitForHttp(url(null, "/api/health"), 60000))) throw new Error(`No responde ${url(null)}: arranca pnpm dev`);

  const results = [];
  for (const name of selected) {
    seed();
    console.log(`\n── ${name} ──`);
    results.push(await runSuite(name));
  }
  seed();
  process.exitCode = summary(results) ? 0 : 1;
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
