import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base32,
  hashPassword,
  newNumericCode,
  newToken,
  openSecret,
  otpauthUri,
  sealSecret,
  tokenHash,
  totpCode,
  totpStep,
  verifyPassword,
  verifyTotp,
} from "./credentials";

test("passwords: scrypt with a fresh salt, verified in constant time", async () => {
  const stored = await hashPassword("RwaxiDemo-2026!");
  assert.match(stored, /^scrypt\$32768\$8\$1\$[\w-]{22}\$[\w-]{86}$/);
  assert.notEqual(stored, await hashPassword("RwaxiDemo-2026!"));
  assert.equal(await verifyPassword("RwaxiDemo-2026!", stored), true);
  assert.equal(await verifyPassword("RwaxiDemo-2026?", stored), false);
  assert.equal(await verifyPassword("anything", null), false); // no account: same work, never true
  assert.equal(await verifyPassword("anything", "scrypt$x$8$1$AA$AA"), false);
});

test("TOTP matches the RFC 6238 SHA-1 test vectors (last 6 digits)", () => {
  const secret = Buffer.from("12345678901234567890");
  const vectors: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ];
  for (const [t, code] of vectors) assert.equal(totpCode(secret, totpStep(t * 1000)), code, `T=${t}`);
});

test("verifyTotp accepts ±1 step of drift, never a step already used, never a malformed code", () => {
  const secret = Buffer.from("12345678901234567890");
  const at = 1111111111 * 1000;
  const step = totpStep(at);
  assert.equal(verifyTotp(secret, totpCode(secret, step), { at }), step);
  assert.equal(verifyTotp(secret, totpCode(secret, step - 1), { at }), step - 1);
  assert.equal(verifyTotp(secret, totpCode(secret, step + 1), { at }), step + 1);
  assert.equal(verifyTotp(secret, totpCode(secret, step + 2), { at }), null);
  assert.equal(verifyTotp(secret, totpCode(secret, step), { at, after: step }), null); // replay
  assert.equal(verifyTotp(secret, "12345", { at }), null);
  assert.equal(verifyTotp(secret, "abcdef", { at }), null);
});

test("base32 follows RFC 4648 and the otpauth URI carries it", () => {
  assert.equal(base32(Buffer.from("foobar")), "MZXW6YTBOI");
  assert.equal(base32(Buffer.from("f")), "MY");
  const uri = otpauthUri(Buffer.from("foobar"), "admin@avistaresort.co");
  assert.equal(
    uri,
    "otpauth://totp/RWAXI%3Aadmin%40avistaresort.co?secret=MZXW6YTBOI&issuer=RWAXI&algorithm=SHA1&digits=6&period=30",
  );
});

test("sealed secrets open only with their key and their owner", () => {
  const previous = process.env.AUTH_ENCRYPTION_KEY;
  process.env.AUTH_ENCRYPTION_KEY = "00".repeat(32);
  try {
    const secret = Buffer.from("12345678901234567890");
    const sealed = sealSecret(secret, "user_1");
    assert.match(sealed, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    assert.deepEqual(openSecret(sealed, "user_1"), secret);
    assert.throws(() => openSecret(sealed, "user_2")); // bound to the user id (AAD)
    process.env.AUTH_ENCRYPTION_KEY = "11".repeat(32);
    assert.throws(() => openSecret(sealed, "user_1"));
    process.env.AUTH_ENCRYPTION_KEY = "short";
    assert.throws(() => sealSecret(secret, "user_1"), /AUTH_ENCRYPTION_KEY/);
  } finally {
    process.env.AUTH_ENCRYPTION_KEY = previous;
  }
});

test("tokens are random and only their SHA-256 is kept; numeric codes keep their leading zeros", () => {
  const token = newToken();
  assert.match(token, /^[\w-]{43}$/);
  assert.notEqual(token, newToken());
  assert.match(tokenHash(token), /^[0-9a-f]{64}$/);
  for (let i = 0; i < 50; i++) assert.match(newNumericCode(), /^\d{6}$/);
});
