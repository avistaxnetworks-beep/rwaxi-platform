/**
 * Unique-constraint violation (Prisma P2002). Checked by code, not with `instanceof`: when the app
 * bundles this package (Next.js transpilePackages), the shared client in globalThis and the
 * `Prisma` namespace a module imports can come from different copies, so the class check fails.
 */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}
