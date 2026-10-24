/**
 * Staff credentials of the developer backoffice and the RWAXI console.
 *
 *   hashPassword / verifyPassword   scrypt (N = 2^15, r = 8, p = 1), salted, constant-time comparison
 *   totpCode / verifyTotp           RFC 6238: HMAC-SHA1, 30-second steps, 6 digits, ±1 step of clock drift,
 *                                   never the same step twice (replay)
 *   sealSecret / openSecret         TOTP secrets at rest: AES-256-GCM with AUTH_ENCRYPTION_KEY, bound to the user
 *   newToken / tokenHash            opaque session tokens; the database keeps only their SHA-256
 */
import crypto from "node:crypto";

// ── passwords ─────────────────────────────────────────────────────────────────
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };
const MAXMEM = 128 * SCRYPT.N * SCRYPT.r * 2;

function scrypt(password: string, salt: Buffer, p = SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(
      password.normalize("NFKC"),
      salt,
      p.keylen,
      { N: p.N, r: p.r, p: p.p, maxmem: MAXMEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
}

/** `scrypt$N$r$p$salt$hash` (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

// Verifying against this when the account does not exist keeps both answers equally slow (no user enumeration).
const DUMMY = `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`;

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = (stored ?? DUMMY).split("$");
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (
    scheme !== "scrypt" ||
    !salt ||
    !hash ||
    !Object.values(params).every((v) => Number.isSafeInteger(v) && v > 0)
  ) {
    return false;
  }
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), {
    ...params,
    keylen: expected.length,
  });
  return crypto.timingSafeEqual(actual, expected) && stored != null;
}

// ── TOTP (RFC 6238) ────────────────────────────────────────────────────────────
export const TOTP_PERIOD_S = 30;
export const totpStep = (at = Date.now()) => Math.floor(at / 1000 / TOTP_PERIOD_S);

export function totpCode(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac("sha1", secret).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary =
    ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(binary % 1_000_000).padStart(6, "0");
}

/**
 * Time step of `code` within ±`window` steps of now and later than `after` (the last step this user already
 * used), or null. Every candidate is computed, so the answer takes the same time whatever matches.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  { after = -1, window = 1, at = Date.now() } = {},
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = totpStep(at);
  let match: number | null = null;
  for (let step = now - window; step <= now + window; step++) {
    const same = crypto.timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code));
    if (same && step > after && match === null) match = step;
  }
  return match;
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** RFC 4648 base32 without padding (what authenticator apps read). */
export function base32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export const newTotpSecret = () => crypto.randomBytes(20);

/** otpauth:// URI an authenticator app scans to enrol the secret. */
export const otpauthUri = (secret: Buffer, account: string, issuer = "RWAXI") =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${base32(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_PERIOD_S}`;

// ── secrets at rest ────────────────────────────────────────────────────────────
function encryptionKey(): Buffer {
  const raw = process.env.AUTH_ENCRYPTION_KEY ?? "";
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64url");
  if (key.length !== 32)
    throw new Error("AUTH_ENCRYPTION_KEY must be 32 bytes (64 hex or 43 base64url characters)");
  return key;
}

/** `v1.iv.tag.ciphertext` (base64url); `aad` (the user id) binds the ciphertext to its owner. */
export function sealSecret(plain: Buffer, aad: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), ct]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function openSecret(sealed: string, aad: string): Buffer {
  const [v, iv, tag, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unknown secret format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]);
}

// ── tokens and one-time codes ──────────────────────────────────────────────────
export const newToken = () => crypto.randomBytes(32).toString("base64url");
export const tokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
export const newNumericCode = (digits = 6) =>
  crypto
    .randomInt(0, 10 ** digits)
    .toString()
    .padStart(digits, "0");
