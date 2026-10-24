import { test } from "node:test";
import assert from "node:assert/strict";
import { REF_TOKEN_RE, signReferral, verifyReferral } from "./referral";

const SECRET = "test-secret-with-at-least-32-characters!";
const NOW = Date.UTC(2026, 9, 23, 15, 0, 0);

test("a token signed for a tenant verifies for that tenant", async () => {
  const token = await signReferral("avista", SECRET, NOW);
  assert.match(token, REF_TOKEN_RE);
  const check = await verifyReferral(token, { slug: "avista", secret: SECRET, now: NOW + 60_000 });
  assert.equal(check.ok, true);
  if (check.ok) {
    assert.match(check.claims.referralId, /^ref_rwx_[0-9a-f]{24}$/);
    assert.equal(check.claims.issuedAt.getTime(), NOW);
  }
});

test("each token gets a distinct single-use id", async () => {
  const [a, b] = await Promise.all([signReferral("avista", SECRET, NOW), signReferral("avista", SECRET, NOW)]);
  assert.notEqual(a.split(".")[0], b.split(".")[0]);
});

test("any manipulation breaks the signature", async () => {
  const token = await signReferral("avista", SECRET, NOW);
  const [id, slug, iat, sig] = token.split(".") as [string, string, string, string];
  const flip = (s: string) => s.slice(0, -1) + (s.at(-1) === "a" ? "b" : "a");
  const tampered = [
    [flip(id), slug, iat, sig],
    [id, "elpoblado", iat, sig],
    [id, slug, String(Number(iat) + 1), sig],
    [id, slug, iat, flip(sig)],
  ].map((parts) => parts.join("."));
  for (const t of tampered) {
    const check = await verifyReferral(t, { slug: t.split(".")[1]!, secret: SECRET, now: NOW });
    assert.deepEqual(check, { ok: false, reason: "signature" }, t);
  }
});

test("only the canonical spelling of a signature verifies", async () => {
  const token = await signReferral("avista", SECRET, NOW);
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  // Same 4 data bits with a spare bit set: atob() decodes it to the same MAC.
  const twin = token.slice(0, -1) + ALPHABET[ALPHABET.indexOf(token.at(-1)!) | 1];
  assert.deepEqual(await verifyReferral(twin, { slug: "avista", secret: SECRET, now: NOW }), {
    ok: false,
    reason: "signature",
  });
});

test("wrong tenant, wrong secret, expiry, future and bad format are rejected", async () => {
  const token = await signReferral("avista", SECRET, NOW);
  assert.deepEqual(await verifyReferral(token, { slug: "elpoblado", secret: SECRET, now: NOW }), { ok: false, reason: "tenant" });
  assert.deepEqual(await verifyReferral(token, { slug: "avista", secret: SECRET.replace("!", "?"), now: NOW }), {
    ok: false,
    reason: "signature",
  });
  assert.deepEqual(await verifyReferral(token, { slug: "avista", secret: SECRET, now: NOW + 31 * 24 * 3600 * 1000 }), {
    ok: false,
    reason: "expired",
  });
  assert.deepEqual(await verifyReferral(token, { slug: "avista", secret: SECRET, now: NOW - 10 * 60 * 1000 }), {
    ok: false,
    reason: "future",
  });
  assert.deepEqual(await verifyReferral("ref_rwx_0123", { slug: "avista", secret: SECRET, now: NOW }), { ok: false, reason: "format" });
  assert.deepEqual(await verifyReferral(token, { slug: "avista", secret: "short", now: NOW }), { ok: false, reason: "secret" });
});

test("legacy unsigned tokens are not accepted", async () => {
  assert.deepEqual(await verifyReferral("ref_rwx_0123456789abcdef01234567", { slug: "avista", secret: SECRET }), {
    ok: false,
    reason: "format",
  });
});
