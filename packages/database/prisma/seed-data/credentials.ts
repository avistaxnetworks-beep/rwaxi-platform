// Known credentials of the demo staff, for local development and the E2E suites only: every seeded user
// signs in with DEMO_PASSWORD and a TOTP whose secret derives from their email, so an authenticator app (or
// scripts/e2e/lib.cjs) computes the same codes. Never seed them into a production database.
import crypto from "node:crypto";

export const DEMO_PASSWORD = "RwaxiDemo-2026!";

export const demoTotpSecret = (email: string): Buffer =>
  crypto.createHash("sha256").update(`rwaxi-demo-totp:${email.toLowerCase()}`).digest().subarray(0, 20);
