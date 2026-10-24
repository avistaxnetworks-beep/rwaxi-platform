/**
 * Signed RWAXI LeadReferral tokens (vitrina → tenant portal). Pure Web Crypto: runs in the
 * Edge middleware and in Node Server Actions alike.
 *
 *   token = ref_rwx_<nonce>.<slug>.<issuedAtMs>.<sig>
 *   sig   = base64url(HMAC-SHA256(REFERRAL_SECRET, "v1|ref_rwx_<nonce>.<slug>.<issuedAtMs>"))
 *
 * The vitrina issues tokens server-side (app/vitrina/actions.ts); the middleware keeps a valid
 * one in a first-touch HttpOnly cookie on the tenant host; signNda() verifies it again and
 * persists the Lead as REFERRAL — or DIRECT when the signature is invalid, the token targets
 * another tenant, it expired, or its id (ref_rwx_<nonce>) was already used.
 */
export const REF_COOKIE = "rwaxi_ref";
export const REF_MAX_AGE_S = 30 * 24 * 3600;
/** Allowed clock skew for tokens issued "in the future". */
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export const REF_TOKEN_RE =
  /^(ref_rwx_[0-9a-f]{24})\.([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.(\d{13})\.([A-Za-z0-9_-]{43})$/;

export interface ReferralClaims {
  /** single-use id stored in Lead.referralToken */
  referralId: string;
  slug: string;
  issuedAt: Date;
}

export type ReferralCheck =
  | { ok: true; claims: ReferralClaims }
  | { ok: false; reason: "secret" | "format" | "signature" | "tenant" | "expired" | "future" };

const enc = new TextEncoder();

const toB64url = (buf: ArrayBuffer) => {
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const usableSecret = (secret: string | undefined): secret is string => typeof secret === "string" && secret.length >= 32;

const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

const signingInput = (body: string) => enc.encode(`v1|${body}`);

function randomNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Issues a token for one tenant portal. Server-side only: needs REFERRAL_SECRET. */
export async function signReferral(slug: string, secret: string | undefined, now = Date.now()): Promise<string> {
  if (!usableSecret(secret)) throw new Error("REFERRAL_SECRET must be set (>= 32 chars)");
  const body = `ref_rwx_${randomNonce()}.${slug}.${now}`;
  if (!REF_TOKEN_RE.test(`${body}.${"A".repeat(43)}`)) throw new Error(`Invalid tenant slug for a referral: ${slug}`);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), signingInput(body));
  return `${body}.${toB64url(sig)}`;
}

/** Verifies signature (constant time), target tenant and age. Does not check single use. */
export async function verifyReferral(
  token: string | null | undefined,
  opts: { slug: string; secret: string | undefined; now?: number; maxAgeMs?: number },
): Promise<ReferralCheck> {
  if (!usableSecret(opts.secret)) return { ok: false, reason: "secret" };
  const m = REF_TOKEN_RE.exec(token ?? "");
  if (!m) return { ok: false, reason: "format" };
  const [, referralId, slug, issued, sig] = m as unknown as [string, string, string, string, string];
  const body = `${referralId}.${slug}.${issued}`;
  // Canonical encoding only: atob() ignores the 2 spare bits of the signature's last character, so up to 4
  // spellings of one token would otherwise verify.
  const mac = fromB64url(sig);
  if (toB64url(mac.buffer) !== sig) return { ok: false, reason: "signature" };
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(opts.secret), mac, signingInput(body));
  if (!valid) return { ok: false, reason: "signature" };
  if (slug !== opts.slug) return { ok: false, reason: "tenant" };
  const now = opts.now ?? Date.now();
  const issuedAt = Number(issued);
  if (issuedAt > now + MAX_FUTURE_SKEW_MS) return { ok: false, reason: "future" };
  if (now - issuedAt > (opts.maxAgeMs ?? REF_MAX_AGE_S * 1000)) return { ok: false, reason: "expired" };
  return { ok: true, claims: { referralId, slug, issuedAt: new Date(issuedAt) } };
}
