import "server-only";
import { platformPrisma } from "@rwaxi/database";
import { TenantAccessError, requirePlatformAccess } from "@/app/_lib/server/tenant-context";

export interface PlatformSession {
  admin: { id: string; email: string; fullName: string };
}

/**
 * RWAXI staff acting in admin.rwaxi.com. Until the console has MFA authentication this is a demo
 * session: the first active SUPER_ADMIN (organization-less user), only where requirePlatformAccess allows.
 */
export async function requirePlatformSession(): Promise<PlatformSession> {
  await requirePlatformAccess();
  // TODO(auth): the signed-in RWAXI staff member (MFA), required to hold SUPER_ADMIN.
  const admin = await platformPrisma().user.findFirst({
    where: { role: "SUPER_ADMIN", active: true, organizationId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, fullName: true },
  });
  if (!admin) throw new TenantAccessError("No hay un usuario SUPER_ADMIN activo para la sesión de plataforma.");
  return { admin };
}
