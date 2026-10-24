import "server-only";
import { requirePlatformAccess } from "@/app/_lib/server/staff-auth";

export interface PlatformSession {
  admin: { id: string; email: string; fullName: string };
  /** acting through the demo session (never in production), not a signed-in user */
  demo: boolean;
}

/**
 * RWAXI staff acting in admin.rwaxirealestate.com: the signed-in SUPER_ADMIN (password + TOTP), or the demo session
 * (first active SUPER_ADMIN) where it is enabled outside production. See staff-auth.ts.
 */
export async function requirePlatformSession(): Promise<PlatformSession> {
  const actor = await requirePlatformAccess();
  return { admin: actor.user, demo: actor.demo };
}
