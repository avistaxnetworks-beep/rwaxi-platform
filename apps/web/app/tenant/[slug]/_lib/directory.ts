import { DEVELOPERS } from "@/app/_lib/data/tenants";

export interface TenantDirectoryEntry {
  slug: string;
  displayName: string;
  legalName: string;
}

/**
 * Tenant lookup for the routing layer. Reads the prototype seed for now.
 * TODO(tenancy): replace with a cached Prisma query (Organization by slug, portalStatus ACTIVE).
 */
export function findTenant(slug: string): TenantDirectoryEntry | undefined {
  return (Object.values(DEVELOPERS) as TenantDirectoryEntry[]).find((d) => d.slug === slug);
}
