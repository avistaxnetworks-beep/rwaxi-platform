import "server-only";
import { forTenant, type ResolvedTenant } from "@rwaxi/database";
import { msg } from "@/app/_i18n/marks";
import { currentStaff, demoAuthActive } from "@/app/_lib/server/staff-auth";
import { TenantAccessError, requireHostTenant } from "@/app/_lib/server/tenant-context";

/** Backoffice roles that act: compliance decisions vs. treasury (payment reconciliation, minting). */
export type BackofficeRole = "COMPLIANCE_OFFICER" | "TENANT_ADMIN";
/** Every staff role of a tenant; TENANT_ANALYST only reads. */
export type StaffRole = BackofficeRole | "TENANT_ANALYST";

export const ROLE_LABEL: Record<StaffRole, string> = {
  COMPLIANCE_OFFICER: msg("Oficial de Cumplimiento"),
  TENANT_ADMIN: msg("Administrador"),
  TENANT_ANALYST: msg("Analista"),
};

export interface BackofficeSession {
  tenant: ResolvedTenant;
  role: StaffRole;
  reviewer: { id: string; email: string; fullName: string };
  /** the demo session acts (no signed-in user): it holds every role */
  demo: boolean;
}

/**
 * Who is acting on which tenant. The tenant comes from the host (requireHostTenant); the user is the
 * signed-in staff member of that tenant (password + TOTP, staff-auth.ts), who must hold `role` — or, for
 * `view`, any staff role. Without a session, the demo session (the tenant's first active user with `role`)
 * acts only where it is enabled.
 */
export async function requireBackofficeSession(
  role: BackofficeRole = "COMPLIANCE_OFFICER",
  { view = false }: { view?: boolean } = {},
): Promise<BackofficeSession> {
  const tenant = await requireHostTenant();
  const staff = await currentStaff("TENANT", tenant.id);
  if (staff) {
    const actual = staff.user.role as StaffRole;
    if (!view && actual !== role) {
      throw new TenantAccessError("Esta acción requiere el rol {role}.", { role: ROLE_LABEL[role] });
    }
    const { id, email, fullName } = staff.user;
    return { tenant, role: actual, reviewer: { id, email, fullName }, demo: false };
  }
  if (!(await demoAuthActive())) throw new TenantAccessError("Inicia sesión en el backoffice para continuar.");
  const user = await forTenant(tenant.id).user.findFirst({
    where: { role, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, fullName: true },
  });
  if (!user) throw new TenantAccessError("El tenant no tiene un {role} activo.", { role: ROLE_LABEL[role] });
  return { tenant, role, reviewer: user, demo: true };
}

/** May this session act as `role`? The demo session holds every role. */
export const canActAs = (session: Pick<BackofficeSession, "role" | "demo">, role: BackofficeRole) =>
  session.demo || session.role === role;

/** The viewer of a desk whose actions need `role`. */
export const deskSession = (session: BackofficeSession, role: BackofficeRole) => ({
  demo: session.demo,
  canAct: canActAs(session, role),
  role: session.role,
});

/** The account shown in the backoffice header: the signed-in user, the demo session, or nobody (→ login). */
export async function backofficeIdentity(): Promise<{ name: string; email: string; role: StaffRole | null; demo: boolean } | null> {
  const tenant = await requireHostTenant();
  const staff = await currentStaff("TENANT", tenant.id);
  if (staff) return { name: staff.user.fullName, email: staff.user.email, role: staff.user.role as StaffRole, demo: false };
  return (await demoAuthActive()) ? { name: "", email: "", role: null, demo: true } : null;
}
