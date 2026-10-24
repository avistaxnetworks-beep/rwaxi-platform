import "server-only";
import { headers } from "next/headers";
import { resolveTenant, type ResolvedTenant } from "@rwaxi/database";
import { LocalizedError } from "@/app/_i18n/marks";

/** Expected access failures: the message is safe to show to the user (in the visitor's language). */
export class TenantAccessError extends LocalizedError {}

/**
 * Tenant of the current request. It always comes from the host, via the x-rwaxi-tenant header
 * set by middleware.ts (client-supplied copies are stripped there), never from the browser.
 */
export async function requireHostTenant(): Promise<ResolvedTenant> {
  const slug = (await headers()).get("x-rwaxi-tenant");
  if (!slug) throw new TenantAccessError("Esta dirección no corresponde a un tenant.");
  const tenant = await resolveTenant(slug);
  if (!tenant) throw new TenantAccessError('El tenant "{slug}" no existe en la base de datos.', { slug });
  return tenant;
}

/** Request metadata recorded as evidence (consent records, audit events). */
export async function requestMeta(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const h = await headers();
  return {
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}
