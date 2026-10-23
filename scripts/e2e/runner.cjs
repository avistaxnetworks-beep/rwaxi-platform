// Process helpers of the E2E orchestrators (run.cjs, run-rpc.cjs).
const { spawn, spawnSync } = require("child_process");
const net = require("net");
const path = require("path");
const { ROOT } = require("./lib.cjs");

const mask = (s) => s.replace(/postgres(ql)?:\/\/\S+/g, "<url>");

/** Resets the demo data (`prisma db seed`). The first TRUNCATE against Neon sometimes fails transiently. */
function seed() {
  if (process.env.E2E_NO_SEED === "1") return;
  for (let attempt = 1; ; attempt++) {
    const r = spawnSync("pnpm --filter @rwaxi/database exec prisma db seed", { cwd: ROOT, shell: true, encoding: "utf8" });
    if (r.status === 0) return;
    if (attempt === 3) throw new Error(`prisma db seed falló:\n${mask(`${r.stdout}${r.stderr}`).split("\n").slice(-8).join("\n")}`);
  }
}

/** Runs one suite in its own process, streaming its output; resolves with its PASS/FAIL counts. */
function runSuite(name, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, `${name}.cjs`)], { cwd: ROOT, env: { ...process.env, ...env } });
    let out = "";
    const onData = (chunk) => {
      const s = mask(chunk.toString());
      out += s;
      process.stdout.write(s);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code) => {
      const lines = out.split("\n");
      resolve({
        name,
        code,
        pass: lines.filter((l) => l.startsWith("PASS")).length,
        fail: lines.filter((l) => l.startsWith("FAIL") || l.startsWith("ERROR")).length,
      });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** true once `target` answers any HTTP status (the server compiled the route), false on timeout. */
async function waitForHttp(target, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      await fetch(target, { signal: AbortSignal.timeout(30000) });
      return true;
    } catch {
      await sleep(1000);
    }
  }
  return false;
}

/** true once the JSON-RPC endpoint answers eth_chainId. */
async function waitForRpc(rpcUrl, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (r.ok) return true;
    } catch {
      /* not listening yet */
    }
    await sleep(1000);
  }
  return false;
}

const portFree = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
  });

/** Starts a long-running command (shell) whose whole process tree killTree() can stop. */
const startService = (command, env) =>
  spawn(command, { cwd: ROOT, shell: true, stdio: "ignore", env, detached: process.platform !== "win32" });

function killTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
}

function summary(results) {
  console.log("\n── Resumen E2E ─────────────────────────────");
  for (const r of results) console.log(`${r.code === 0 && r.fail === 0 ? "✔" : "✖"} ${r.name.padEnd(26)} ${r.pass} PASS · ${r.fail} FAIL`);
  return results.every((r) => r.code === 0 && r.fail === 0);
}

module.exports = { seed, runSuite, waitForHttp, waitForRpc, portFree, startService, killTree, summary };
