// Runs the DocumentVault suite against an S3-compatible bucket (fake-s3.cjs, which verifies SigV4 on its own):
// `next dev` with DOCUMENT_VAULT_DRIVER=s3, so browsers upload straight to the bucket through presigned PUTs
// and large files download through presigned GETs. The seed writes the demo Data Room into that bucket; at the
// end everything stops and the database is reseeded with the local vault again.
// The regular dev server must be stopped first (this script owns the port).
//   pnpm e2e:s3
const crypto = require("crypto");
const path = require("path");
const ORIGINAL_ENV = { ...process.env }; // before lib.cjs loads packages/database/.env
const { PORT, url } = require("./lib.cjs");
const { seed, runSuite, waitForHttp, portFree, startService, killTree, summary } = require("./runner.cjs");

const S3_PORT = Number(process.env.E2E_S3_PORT || 9000);
const services = [];
const stopAll = () => services.splice(0).reverse().forEach(killTree);
process.on("SIGINT", () => {
  stopAll();
  process.exit(130);
});

(async () => {
  if (!(await portFree(PORT)))
    throw new Error(
      `El puerto ${PORT} está en uso: detén pnpm dev (esta prueba levanta su propio servidor con la bóveda en S3).`,
    );
  if (!(await portFree(S3_PORT))) throw new Error(`El puerto ${S3_PORT} (bucket S3 de prueba) está en uso.`);
  const vaultEnv = {
    DOCUMENT_VAULT_DRIVER: "s3",
    S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
    S3_REGION: "auto",
    S3_BUCKET: "rwaxi-e2e",
    S3_ACCESS_KEY_ID: `AKE2E${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
    S3_SECRET_ACCESS_KEY: crypto.randomBytes(24).toString("base64url"),
  };
  try {
    // Its own process: the runner's reseeds are synchronous and would block a server living here.
    services.push(
      startService(`node "${path.join(__dirname, "fake-s3.cjs")}"`, {
        ...ORIGINAL_ENV,
        E2E_S3_PORT: String(S3_PORT),
        E2E_S3_BUCKET: vaultEnv.S3_BUCKET,
        E2E_S3_ACCESS_KEY_ID: vaultEnv.S3_ACCESS_KEY_ID,
        E2E_S3_SECRET_ACCESS_KEY: vaultEnv.S3_SECRET_ACCESS_KEY,
        E2E_S3_REGION: vaultEnv.S3_REGION,
      }),
    );
    if (!(await waitForHttp(`${vaultEnv.S3_ENDPOINT}/__fake/objects`, 30000)))
      throw new Error("El bucket S3 de prueba no arrancó.");
    Object.assign(process.env, vaultEnv); // the seed (a child of this process) writes to the bucket
    seed();
    services.push(
      startService(`pnpm --filter @rwaxi/web exec next dev --port ${PORT}`, { ...ORIGINAL_ENV, ...vaultEnv }),
    );
    if (!(await waitForHttp(url(null, "/api/health"), 180000)))
      throw new Error("next dev (bóveda S3) no arrancó.");
    console.log(
      `next dev con DOCUMENT_VAULT_DRIVER=s3 · bucket ${vaultEnv.S3_BUCKET} en ${vaultEnv.S3_ENDPOINT}`,
    );
    console.log("\n── vault-s3 ──");
    const result = await runSuite("vault-s3", { ...vaultEnv, E2E_S3: vaultEnv.S3_ENDPOINT });
    process.exitCode = summary([result]) ? 0 : 1;
  } finally {
    stopAll();
    for (const k of Object.keys(vaultEnv)) delete process.env[k];
    seed(); // back to the local vault
  }
})().catch((e) => {
  console.error(e.message);
  stopAll();
  process.exitCode = 1;
});
