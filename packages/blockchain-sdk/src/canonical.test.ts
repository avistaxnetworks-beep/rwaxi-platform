import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, evidenceHash } from "./canonical";

test("key order does not change the serialisation or the hash", () => {
  const a = { investor: { name: "Ana", doc: "123" }, docs: [{ kind: "front", sha: "0x1" }], v: 1 };
  const b = { v: 1, docs: [{ sha: "0x1", kind: "front" }], investor: { doc: "123", name: "Ana" } };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(evidenceHash(a), evidenceHash(b));
  assert.equal(canonicalJson(a), '{"docs":[{"kind":"front","sha":"0x1"}],"investor":{"doc":"123","name":"Ana"},"v":1}');
});

test("survives a jsonb-like round trip (reordered keys, same values)", () => {
  const original = { submittedAt: "2026-10-23T14:28:00.000Z", declarations: { terms: true, noPep: true }, income: 1 };
  const roundTrip = JSON.parse(JSON.stringify({ income: 1, declarations: { noPep: true, terms: true }, submittedAt: original.submittedAt }));
  assert.equal(evidenceHash(roundTrip), evidenceHash(original));
});

test("array order is significant and any value change changes the hash", () => {
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
  assert.notEqual(evidenceHash({ wallet: "0xabc" }), evidenceHash({ wallet: "0xabd" }));
});

test("rejects values that JSON cannot represent faithfully", () => {
  assert.throws(() => canonicalJson({ n: Number.NaN }));
  assert.throws(() => canonicalJson({ n: 1n }));
  assert.equal(canonicalJson({ a: undefined, b: null }), '{"b":null}');
});
