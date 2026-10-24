import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";

/**
 * Investor session for the White Label portal (no investor login yet).
 *
 * Issued when the visitor signs the NDA and bound to one organization: an HttpOnly cookie
 * `v1.<investorId>.<organizationId>.<issuedAtMs>.<hmac>` signed with INVESTOR_SESSION_SECRET.
 * Cookies are per host, and the organization in the payload must also match the host tenant,
 * so a session never carries over to another developer's portal.
 * TODO(auth): replace with verified email (OTP / magic link) before production.
 */
const COOKIE = "rwaxi_inv";
const MAX_AGE_S = 30 * 24 * 3600;

let ephemeralSecret: Buffer | null = null;

function secret(): Buffer {
  const configured = process.env.INVESTOR_SESSION_SECRET;
  if (configured && configured.length >= 32) return Buffer.from(configured, "utf8");
  if (process.env.NODE_ENV === "production") throw new Error("INVESTOR_SESSION_SECRET must be set (>= 32 chars)");
  if (!ephemeralSecret) {
    ephemeralSecret = crypto.randomBytes(32);
    console.warn("[investor-session] INVESTOR_SESSION_SECRET not set: sessions last until the dev server restarts");
  }
  return ephemeralSecret;
}

const sign = (payload: string) => crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

/** Key of the investor recovery codes' HMAC (investor-recovery.ts), derived from the same secret. */
export const recoveryCodeKey = (): Buffer => crypto.createHmac("sha256", secret()).update("rwaxi.investor-otp.v1").digest();

/** Key of the DocumentVault upload receipts (vault.ts), derived from the same secret. */
export const vaultReceiptKey = (): Buffer => crypto.createHmac("sha256", secret()).update("rwaxi.vault-receipt.v1").digest();

export interface InvestorSession {
  investorId: string;
  organizationId: string;
  issuedAt: number;
}

function decode(value: string): InvestorSession | null {
  const parts = value.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return null;
  const [, investorId, organizationId, issued, signature] = parts as [string, string, string, string, string];
  const expected = Buffer.from(sign(parts.slice(0, 4).join(".")));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  const issuedAt = Number(issued);
  if (!Number.isSafeInteger(issuedAt) || Date.now() - issuedAt > MAX_AGE_S * 1000) return null;
  return { investorId, organizationId, issuedAt };
}

/** Session of this tenant, or null when missing, forged, expired or issued by another tenant. */
export async function readInvestorSession(organizationId: string): Promise<InvestorSession | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  const session = raw ? decode(raw) : null;
  return session && session.organizationId === organizationId ? session : null;
}

/** Server Actions / Route Handlers only (cookies are read-only while rendering). */
export async function startInvestorSession(investorId: string, organizationId: string): Promise<void> {
  if (/[.]/.test(investorId) || /[.]/.test(organizationId)) throw new Error("Ids must not contain dots");
  const issuedAt = Date.now();
  const payload = `v1.${investorId}.${organizationId}.${issuedAt}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}
