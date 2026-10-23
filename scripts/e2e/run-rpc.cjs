// Runs the rpc suite: starts a local Hardhat node, deploys the tenant contracts (rpc-fixtures.cjs),
// starts `next dev` with CHAIN_EXECUTION=rpc, runs the suite and stops everything, reseeding at the end.
// The regular dev server must be stopped first (this script owns the port).
//   pnpm e2e:rpc
const ORIGINAL_ENV = { ...process.env }; // before lib.cjs loads packages/database/.env
const { PORT, url, ownerDb } = require("./lib.cjs");
const { RPC_URL, deployRpcFixtures } = require("./rpc-fixtures.cjs");
const { seed, runSuite, waitForHttp, waitForRpc, portFree, startService, killTree, summary } = require("./runner.cjs");

const services = [];
const stopAll = () => services.splice(0).reverse().forEach(killTree);
process.on("SIGINT", () => {
  stopAll();
  process.exit(130);
});

(async () => {
  const rpcPort = Number(new URL(RPC_URL).port);
  if (!(await portFree(PORT))) throw new Error(`El puerto ${PORT} está en uso: detén pnpm dev (esta prueba levanta su propio servidor en modo RPC).`);
  if (!(await portFree(rpcPort))) throw new Error(`El puerto ${rpcPort} está en uso (¿otro nodo Hardhat?).`);
  try {
    services.push(startService(`pnpm --filter @rwaxi/contracts exec hardhat node --hostname 127.0.0.1 --port ${rpcPort}`, ORIGINAL_ENV));
    if (!(await waitForRpc(RPC_URL, 120000))) throw new Error("El nodo Hardhat no respondió.");

    seed();
    const db = ownerDb();
    const setup = await deployRpcFixtures(db).finally(() => db.$disconnect());
    console.log(`contratos en Hardhat · registry ${setup.registry} · token ${setup.token}`);

    services.push(
      startService(`pnpm --filter @rwaxi/web exec next dev --port ${PORT}`, { ...ORIGINAL_ENV, CHAIN_EXECUTION: "rpc", RPC_URL_HARDHAT: RPC_URL }),
    );
    if (!(await waitForHttp(url(null, "/api/health"), 180000))) throw new Error("next dev (modo RPC) no arrancó.");

    const result = await runSuite("rpc", { E2E_RPC_SETUP: JSON.stringify(setup) });
    process.exitCode = summary([result]) ? 0 : 1;
  } finally {
    stopAll();
    seed();
  }
})().catch((e) => {
  console.error(e.message);
  stopAll();
  process.exitCode = 1;
});
