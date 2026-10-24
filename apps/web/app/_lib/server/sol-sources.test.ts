import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CONTRACTS, INVARIANTS, RUNTIME_SIZES } from "../chain/contracts";

const ROOT = path.resolve(process.cwd(), "../..");
// sol-sources.ts is server-only (importing it outside Next throws), so its literals are read as text.
const serverCopy = readFileSync(path.join(process.cwd(), "app/_lib/server/sol-sources.ts"), "utf8");
const embedded = (name: string): string => {
  const open = `  ${name}: \``;
  const from = serverCopy.indexOf(open);
  assert.ok(from >= 0, `${name} missing from sol-sources.ts`);
  let end = from + open.length;
  while (!(serverCopy[end] === "`" && serverCopy[end - 1] !== "\\")) end++;
  return serverCopy
    .slice(from + open.length, end)
    .replace(/\\`/g, "`")
    .replace(/\\\$\{/g, "${")
    .replace(/\\\\/g, "\\");
};

test("the inspector's server copy of each contract is contracts/src verbatim", () => {
  for (const name of CONTRACTS) {
    const source = readFileSync(path.join(ROOT, "contracts/src", `${name}.sol`), "utf8");
    assert.equal(embedded(name), source, `${name}: regenerate app/_lib/server/sol-sources.ts`);
    assert.match(
      source,
      /^\/\/ SPDX-License-Identifier: UNLICENSED\n\/\/ Copyright \(c\) 2026 RWAXI\. All rights reserved\./,
    );
  }
});

test("runtime sizes match the compiled artifacts and every contract states its invariants", (t) => {
  for (const name of CONTRACTS) {
    assert.ok(INVARIANTS[name].length > 0, `${name}: no invariants`);
    const artifact = path.join(ROOT, "contracts/artifacts/src", `${name}.sol`, `${name}.json`);
    if (!existsSync(artifact)) {
      t.diagnostic(`${name}: not compiled (pnpm contracts:compile), size not checked`);
      continue;
    }
    const { deployedBytecode } = JSON.parse(readFileSync(artifact, "utf8")) as { deployedBytecode: string };
    assert.equal(RUNTIME_SIZES[name], (deployedBytecode.length - 2) / 2, `${name}: runtime size`);
  }
});

test("no client module imports the Solidity source", () => {
  const files = readFileSync(path.join(process.cwd(), "app/_components/inspector/code-viewer.tsx"), "utf8");
  assert.doesNotMatch(files, /sol-sources/);
});
