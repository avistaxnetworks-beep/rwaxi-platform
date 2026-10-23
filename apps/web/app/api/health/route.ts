import { NextResponse, type NextRequest } from "next/server";
import { forTenant, prisma, resolveTenant } from "@rwaxi/database";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness plus the tenancy context resolved by the middleware.
 * On a tenant host it also proves RLS: the tenant client must see exactly one organization.
 */
export async function GET(req: NextRequest) {
  const env = req.headers.get("x-rwaxi-env");
  const slug = req.headers.get("x-rwaxi-tenant");
  const body: Record<string, unknown> = { ok: true, env, tenant: slug };

  try {
    await prisma.$queryRaw`SELECT 1`;
    body.database = "up";
    if (slug) {
      const tenant = await resolveTenant(slug);
      body.visibleOrganizations = tenant ? await forTenant(tenant.id).organization.count() : null;
    }
  } catch (err) {
    body.database = "down";
    body.error = err instanceof Error ? err.message.split("\n").slice(-1)[0] : String(err);
  }
  return NextResponse.json(body);
}
