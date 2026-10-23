export * from "@prisma/client";
export { prisma, platformPrisma, forTenant, withTenant, tenantExtension, type TenantClient } from "./client";
export { resolveTenant, type ResolvedTenant } from "./tenant";
