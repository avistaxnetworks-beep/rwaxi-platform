import type { PortalStatus, PrismaClient } from "@prisma/client";
import { prisma } from "./client";
import { retryTransient } from "./pool";

export interface ResolvedTenant {
  id: string;
  slug: string;
  displayName: string;
  portalStatus: PortalStatus;
}

/**
 * Maps a tenant slug (or verified custom domain) to its organization id without a tenant
 * context, through the SECURITY DEFINER function `rwaxi_resolve_tenant` (routing fields only).
 * Use the returned id with forTenant() / withTenant() for everything else.
 */
export async function resolveTenant(
  slugOrDomain: string,
  base: PrismaClient = prisma,
): Promise<ResolvedTenant | null> {
  const rows = await retryTransient(
    () =>
      base.$queryRaw<{ id: string; slug: string; display_name: string; portal_status: PortalStatus }[]>`
        SELECT id, slug, display_name, portal_status FROM rwaxi_resolve_tenant(${slugOrDomain})`,
    { repeatable: true },
  );
  const row = rows[0];
  return row ? { id: row.id, slug: row.slug, displayName: row.display_name, portalStatus: row.portal_status } : null;
}
