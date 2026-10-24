/**
 * Prisma clients for the RWAXI multi-tenant database.
 *
 *   forTenant(orgId)          extended client: every query runs in a transaction that first
 *                             sets `app.current_organization_id` → RLS scopes it to the tenant.
 *   withTenant(orgId, fn)     interactive transaction bound to one tenant (multi-step writes).
 *   platformPrisma()          BYPASSRLS role — Super-Admin console only.
 *
 * Both clients add the pool settings of pool.ts to their URL. Tenant reads are retried after a transient
 * connection failure, tenant writes only if they never reached the database, and withTenant() only if its
 * transaction never started — a write is never applied twice.
 *
 * Never use `prisma` directly for tenant data: without a tenant context RLS returns no rows.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { READ_OPERATIONS, poolUrl, retryTransient, transaction } from "./pool";

type GlobalWithPrisma = typeof globalThis & {
  __rwaxiPrisma?: PrismaClient;
  __rwaxiPlatformPrisma?: PrismaClient;
};
const g = globalThis as GlobalWithPrisma;

const log: Prisma.LogLevel[] = process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

/** Base client on DATABASE_URL (role `rwaxi_app`, subject to RLS). */
export const prisma: PrismaClient =
  g.__rwaxiPrisma ?? new PrismaClient({ log, datasourceUrl: poolUrl(process.env.DATABASE_URL) });
if (process.env.NODE_ENV !== "production") g.__rwaxiPrisma = prisma;

/** Client on PLATFORM_DATABASE_URL (role `rwaxi_platform`, BYPASSRLS). */
export function platformPrisma(): PrismaClient {
  if (!g.__rwaxiPlatformPrisma) {
    const url = process.env.PLATFORM_DATABASE_URL;
    if (!url) throw new Error("PLATFORM_DATABASE_URL is not set");
    g.__rwaxiPlatformPrisma = new PrismaClient({ log, datasourceUrl: poolUrl(url) });
  }
  return g.__rwaxiPlatformPrisma;
}

function assertOrgId(organizationId: string): void {
  if (typeof organizationId !== "string" || organizationId.trim() === "") {
    throw new Error("Tenant context required: organizationId is empty");
  }
}

const setTenant = (client: PrismaClient | Prisma.TransactionClient, organizationId: string) =>
  client.$executeRaw`SELECT set_config('app.current_organization_id', ${organizationId}, TRUE)`;

/**
 * Prisma Client extension that injects the tenant into every operation.
 * `set_config(..., TRUE)` is transaction-local, so pooled connections never leak a tenant.
 * Each operation is one batch transaction, repeated whole after a transient failure (reads always,
 * writes only when the batch never reached the database).
 */
export function tenantExtension(organizationId: string) {
  assertOrgId(organizationId);
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: "rwaxi-tenant",
      query: {
        $allModels: {
          async $allOperations({ operation, args, query }) {
            const [, result] = await retryTransient(
              () =>
                (client as unknown as PrismaClient).$transaction([
                  setTenant(client as unknown as PrismaClient, organizationId),
                  query(args),
                ]),
              { repeatable: READ_OPERATIONS.has(operation) },
            );
            return result;
          },
        },
      },
    }),
  );
}

export type TenantClient = ReturnType<typeof forTenant>;

/** Tenant-scoped client. Each call is an independent RLS-scoped transaction. */
export function forTenant(organizationId: string, base: PrismaClient = prisma) {
  return base.$extends(tenantExtension(organizationId));
}

/**
 * Runs `fn` in one interactive transaction scoped to the tenant. Use it for multi-step
 * writes (e.g. approve KYC → create access grant → record whitelist tx) so they commit
 * or roll back together. Retried only if the transaction could not start.
 */
export async function withTenant<T>(
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { maxWait?: number; timeout?: number; base?: PrismaClient },
): Promise<T> {
  assertOrgId(organizationId);
  const base = options?.base ?? prisma;
  return transaction(
    base,
    async (tx) => {
      await setTenant(tx, organizationId);
      return fn(tx);
    },
    options,
  );
}
