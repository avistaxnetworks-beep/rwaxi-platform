import "server-only";
import { forTenant, type ResolvedTenant } from "@rwaxi/database";
import { TenantAccessError, demoAccessEnabled, requireHostTenant } from "@/app/_lib/server/tenant-context";

export interface BackofficeSession {
  tenant: ResolvedTenant;
  reviewer: { id: string; email: string; fullName: string };
}

/**
 * Who is acting on which tenant. The tenant comes from the host (requireHostTenant); the reviewer
 * is a demo session — the tenant's compliance officer — until real authentication exists.
 */
export async function requireBackofficeSession(): Promise<BackofficeSession> {
  const tenant = await requireHostTenant();
  if (!demoAccessEnabled()) {
    throw new TenantAccessError("Autenticación del backoffice no configurada: acceso deshabilitado en producción.");
  }
  // TODO(auth): replace with the signed-in user, required to hold COMPLIANCE_OFFICER in this organization.
  const officer = await forTenant(tenant.id).user.findFirst({
    where: { role: "COMPLIANCE_OFFICER", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, fullName: true },
  });
  if (!officer) throw new TenantAccessError("El tenant no tiene un Oficial de Cumplimiento activo.");
  return { tenant, reviewer: officer };
}
