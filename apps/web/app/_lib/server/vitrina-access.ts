import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { vitrinaAccessKey } from "./investor-session";

/**
 * Legal wall of the vitrina (www): before seeing the projects, a visitor identifies with an email and accepts
 * RWAXI's terms, privacy policy and liability disclaimer (VITRINA_ACCESS_TEXT). Each acceptance is recorded in
 * PostgreSQL (rwaxi_record_vitrina_access, app/vitrina/actions.ts) and unlocks the vitrina with an HttpOnly cookie
 * `v1.<acceptanceId>.<termsVersion>.<issuedAtMs>.<hmac>` (key derived from INVESTOR_SESSION_SECRET). A new terms
 * version invalidates every earlier cookie: the wall comes back.
 */
export const VITRINA_ACCESS_COOKIE = "rwaxi_vitrina_access";
/** Version of the accepted text: bump it when the text or the documents it cites change. */
export const VITRINA_ACCESS_TERMS_VERSION = "2026-11-01";
const MAX_AGE_S = 365 * 24 * 3600;
const ID = /^[0-9a-f-]{36}$/;

const sign = (payload: string) => crypto.createHmac("sha256", vitrinaAccessKey()).update(payload).digest("base64url");

/** Whether this request carries a valid acceptance of the current terms. Rendering only reads cookies. */
export async function hasVitrinaAccess(): Promise<boolean> {
  const raw = (await cookies()).get(VITRINA_ACCESS_COOKIE)?.value;
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return false;
  const [, id, version, issued, signature] = parts as [string, string, string, string, string];
  const expected = Buffer.from(sign(parts.slice(0, 4).join(".")));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return false;
  const issuedAt = Number(issued);
  return (
    ID.test(id) &&
    version === VITRINA_ACCESS_TERMS_VERSION &&
    Number.isSafeInteger(issuedAt) &&
    Date.now() - issuedAt <= MAX_AGE_S * 1000
  );
}

/** Server Actions only (cookies are read-only while rendering). */
export async function grantVitrinaAccess(acceptanceId: string): Promise<void> {
  if (!ID.test(acceptanceId)) throw new Error("Invalid acceptance id");
  const payload = `v1.${acceptanceId}.${VITRINA_ACCESS_TERMS_VERSION}.${Date.now()}`;
  (await cookies()).set(VITRINA_ACCESS_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}
