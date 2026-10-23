import "server-only";
import { forTenant, type ResolvedTenant } from "@rwaxi/database";
import { msg } from "@/app/_i18n/marks";
import { TenantAccessError, demoAccessEnabled, requireHostTenant } from "@/app/_lib/server/tenant-context";

/** Backoffice roles: compliance decisions vs. treasury (payment reconciliation, minting). */
export type BackofficeRole = "COMPLIANCE_OFFICER" | "TENANT_ADMIN";

const ROLE_LABEL: Record<BackofficeRole, string> = {
  COMPLIANCE_OFFICER: msg("Oficial de Cumplimiento"),
  TENANT_ADMIN: msg("Administrador"),
};

export interface BackofficeSession {
  tenant: ResolvedTenant;
  role: BackofficeRole;
  reviewer: { id: string; email: string; fullName: string };
}

/**
 * Who is acting on which tenant. The tenant comes from the host (requireHostTenant); the user
 * is a demo session — the tenant's first active user with `role` — until real authentication exists.
 */
export async function requireBackofficeSession(role: BackofficeRole = "COMPLIANCE_OFFICER"): Promise<BackofficeSession> {
  const tenant = await requireHostTenant();
  if (!demoAccessEnabled()) {
    throw new TenantAccessError("Autenticación del backoffice no configurada: acceso deshabilitado en producción.");
  }
  // TODO(auth): replace with the signed-in user, required to hold `role` in this organization.
  const user = await forTenant(tenant.id).user.findFirst({
    where: { role, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, fullName: true },
  });
  if (!user) throw new TenantAccessError("El tenant no tiene un {role} activo.", { role: ROLE_LABEL[role] });
  return { tenant, role, reviewer: user };
}
