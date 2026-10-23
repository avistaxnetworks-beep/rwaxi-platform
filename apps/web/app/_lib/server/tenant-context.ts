import "server-only";
import { headers } from "next/headers";
import { resolveTenant, type ResolvedTenant } from "@rwaxi/database";

/** Expected access failures: the message is safe to show to the user. */
export class TenantAccessError extends Error {}

/**
 * Demo access until real authentication exists (backoffice demo session, inspector data).
 * On by default only outside production; RWAXI_DEMO_AUTH=1 / 0 overrides.
 */
export function demoAccessEnabled(): boolean {
  const flag = process.env.RWAXI_DEMO_AUTH;
  return flag ? flag === "1" : process.env.NODE_ENV !== "production";
}

/**
 * Tenant of the current request. It always comes from the host, via the x-rwaxi-tenant header
 * set by middleware.ts (client-supplied copies are stripped there), never from the browser.
 */
export async function requireHostTenant(): Promise<ResolvedTenant> {
  const slug = (await headers()).get("x-rwaxi-tenant");
  if (!slug) throw new TenantAccessError("Esta dirección no corresponde a un tenant.");
  const tenant = await resolveTenant(slug);
  if (!tenant) throw new TenantAccessError(`El tenant "${slug}" no existe en la base de datos.`);
  return tenant;
}

/** Request metadata recorded as evidence (consent records, audit events). */
export async function requestMeta(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const h = await headers();
  return {
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}
