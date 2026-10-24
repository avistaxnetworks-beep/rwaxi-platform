import { test } from "node:test";
import assert from "node:assert/strict";
import { check, rows, verdict } from "./audit-licenses.mjs";

test("permissive and weak copyleft licences pass", () => {
  for (const expr of [
    "MIT",
    "Apache-2.0",
    "ISC",
    "BSD-3-Clause",
    "0BSD",
    "CC-BY-4.0",
    "MPL-2.0",
    "LGPL-3.0-or-later",
  ]) {
    assert.equal(verdict(expr), "allowed", expr);
  }
  assert.equal(verdict("Apache-2.0 AND LGPL-3.0-or-later"), "allowed"); // sharp's libvips binary
  assert.equal(verdict("(MIT OR CC0-1.0)"), "allowed");
});

test("strong copyleft fails, also inside AND, as a legacy name or with an exception", () => {
  for (const expr of [
    "GPL-3.0",
    "GPL-2.0-only",
    "GPL-3.0-or-later",
    "GPL-2.0+",
    "AGPL-3.0",
    "AGPL-3.0-only",
    "GPLv2",
    "GPL",
    "SSPL-1.0",
  ]) {
    assert.equal(verdict(expr), "denied", expr);
  }
  assert.equal(verdict("MIT AND GPL-3.0"), "denied");
  assert.equal(verdict("(GPL-2.0 OR AGPL-3.0)"), "denied");
  assert.equal(verdict("GPL-2.0 WITH Classpath-exception-2.0"), "denied");
});

test("a permissive alternative clears a dual licence", () => {
  assert.equal(verdict("MIT OR GPL-3.0"), "allowed");
  assert.equal(verdict("(GPL-2.0 OR Apache-2.0)"), "allowed");
  assert.equal(verdict("GPL-3.0 or MIT"), "allowed");
  assert.equal(verdict("(MIT AND GPL-3.0) OR ISC"), "allowed");
});

test("unknown, proprietary or malformed licences need review, never pass silently", () => {
  for (const expr of [
    "Unknown",
    "UNLICENSED",
    "SEE LICENSE IN LICENSE.md",
    "",
    undefined,
    "Custom: https://example.com",
    "(MIT",
    "MIT AND",
  ]) {
    assert.equal(verdict(expr), "review", String(expr));
  }
  assert.equal(verdict("Unknown OR MIT"), "allowed");
});

test("the audit exits 1 on a strong copyleft dependency and with --strict on one to review", () => {
  const quiet = { log: () => {}, error: () => {} };
  const clean = { MIT: [{ name: "react", versions: ["19.0.0"], license: "MIT" }] };
  assert.equal(check(clean, quiet), 0);
  assert.equal(
    check({ ...clean, "AGPL-3.0": [{ name: "agpl-lib", versions: ["2.1.0"], license: "AGPL-3.0" }] }, quiet),
    1,
  );
  const unknown = { ...clean, Unknown: [{ name: "mystery", versions: ["0.0.1"], license: "Unknown" }] };
  assert.equal(check(unknown, quiet), 0);
  assert.equal(check(unknown, { ...quiet, strict: true }), 1);
});

test("the report skips RWAXI's own workspace packages", () => {
  const list = rows({
    MIT: [{ name: "react", versions: ["19.0.0"], license: "MIT" }],
    UNLICENSED: [{ name: "@rwaxi/database", versions: ["0.1.0"], license: "UNLICENSED" }],
    "GPL-3.0": [{ name: "some-gpl-lib", versions: ["1.0.0"], license: "GPL-3.0" }],
  });
  assert.deepEqual(
    list.map((p) => [p.name, p.verdict]),
    [
      ["react", "allowed"],
      ["some-gpl-lib", "denied"],
    ],
  );
});
