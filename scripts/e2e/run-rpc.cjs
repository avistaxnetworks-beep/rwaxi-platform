// Runs the RPC suites: starts a local Hardhat node, deploys the tenant contracts (rpc-fixtures.cjs),
// starts `next dev` with CHAIN_EXECUTION=rpc and, before each suite, reseeds and redeploys the tenant's
// contracts on the same node (the factory stays: the server was started with its address). Stops
// everything and reseeds at the end. The regular dev server must be stopped first (this script owns the port).
//   pnpm e2e:rpc            rpc (server-assisted RPC + hashes registered by the tenant) and wallet (EIP-1193)
//   pnpm e2e:rpc wallet     only that one
const ORIGINAL_ENV = { ...process.env }; // before lib.cjs loads packages/database/.env
const { PORT, url, ownerDb } = require("./lib.cjs");
const { RPC_URL, deployRpcFixtures } = require("./rpc-fixtures.cjs");
const {
  seed,
  runSuite,
  waitForHttp,
  waitForRpc,
  portFree,
  startService,
  killTree,
  summary,
} = require("./runner.cjs");

const SUITES = ["rpc", "wallet"];
const services = [];
const stopAll = () => services.splice(0).reverse().forEach(killTree);
process.on("SIGINT", () => {
  stopAll();
  process.exit(130);
});

const fixtures = async (reuse) => {
  const db = ownerDb();
  try {
    return await deployRpcFixtures(db, reuse);
  } finally {
    await db.$disconnect();
  }
};

(async () => {
  const selected = process.argv.slice(2).length ? process.argv.slice(2) : SUITES;
  const unknown = selected.filter((s) => !SUITES.includes(s));
  if (unknown.length)
    throw new Error(`Suites desconocidas: ${unknown.join(", ")} (disponibles: ${SUITES.join(", ")})`);
  const rpcPort = Number(new URL(RPC_URL).port);
  if (!(await portFree(PORT)))
    throw new Error(
      `El puerto ${PORT} está en uso: detén pnpm dev (esta prueba levanta su propio servidor en modo RPC).`,
    );
  if (!(await portFree(rpcPort))) throw new Error(`El puerto ${rpcPort} está en uso (¿otro nodo Hardhat?).`);
  try {
    services.push(
      startService(
        `pnpm --filter @rwaxi/contracts exec hardhat node --hostname 127.0.0.1 --port ${rpcPort}`,
        ORIGINAL_ENV,
      ),
    );
    if (!(await waitForRpc(RPC_URL, 120000))) throw new Error("El nodo Hardhat no respondió.");

    seed();
    let setup = await fixtures();
    console.log(
      `contratos en Hardhat · registry ${setup.registry} · token ${setup.token} · factory ${setup.factory}`,
    );

    services.push(
      startService(`pnpm --filter @rwaxi/web exec next dev --port ${PORT}`, {
        ...ORIGINAL_ENV,
        CHAIN_EXECUTION: "rpc",
        RPC_URL_HARDHAT: RPC_URL,
        RWAXI_FACTORY_ADDRESS: setup.factory,
      }),
    );
    if (!(await waitForHttp(url(null, "/api/health"), 180000)))
      throw new Error("next dev (modo RPC) no arrancó.");

    const results = [];
    for (const [i, name] of selected.entries()) {
      if (i > 0) {
        seed();
        setup = await fixtures({ factory: setup.factory });
        console.log(`contratos en Hardhat · registry ${setup.registry} · token ${setup.token}`);
      }
      console.log(`\n── ${name} ──`);
      results.push(await runSuite(name, { E2E_RPC_SETUP: JSON.stringify(setup) }));
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
