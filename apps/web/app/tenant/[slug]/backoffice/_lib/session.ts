import "server-only";
import { headers } from "next/headers";
import { forTenant, resolveTenant, type ResolvedTenant } from "@rwaxi/database";

/** Expected access failures: shown to the user as-is. */
export class BackofficeAccessError extends Error {}

export interface BackofficeSession {
  tenant: ResolvedTenant;
  reviewer: { id: string; email: string; fullName: string };
}

/**
 * Demo session until real authentication exists: acts as the tenant's compliance officer.
 * Enabled by default only outside production; RWAXI_DEMO_AUTH=1 / 0 overrides.
 */
function demoAuthEnabled(): boolean {
  const flag = process.env.RWAXI_DEMO_AUTH;
  return flag ? flag === "1" : process.env.NODE_ENV !== "production";
}

/**
 * Resolves who is acting on which tenant. The tenant always comes from the host, via the
 * x-rwaxi-tenant header set by middleware.ts (client-supplied copies are stripped there),
 * never from arguments sent by the browser.
 */
export async function requireBackofficeSession(): Promise<BackofficeSession> {
  const slug = (await headers()).get("x-rwaxi-tenant");
  if (!slug) throw new BackofficeAccessError("Esta dirección no corresponde a un tenant.");
  const tenant = await resolveTenant(slug);
  if (!tenant) throw new BackofficeAccessError(`El tenant "${slug}" no existe en la base de datos.`);
  if (!demoAuthEnabled()) {
    throw new BackofficeAccessError("Autenticación del backoffice no configurada: acceso deshabilitado en producción.");
  }
  // TODO(auth): replace with the signed-in user, required to hold COMPLIANCE_OFFICER in this organization.
  const officer = await forTenant(tenant.id).user.findFirst({
    where: { role: "COMPLIANCE_OFFICER", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, fullName: true },
  });
  if (!officer) throw new BackofficeAccessError("El tenant no tiene un Oficial de Cumplimiento activo.");
  return { tenant, reviewer: officer };
}
