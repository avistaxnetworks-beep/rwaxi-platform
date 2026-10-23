import { NextResponse, type NextRequest } from "next/server";
import { forTenant, prisma } from "@rwaxi/database";

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
      // Slug → id lookup needs a platform-level read; here we reuse the seed's deterministic ids.
      const orgId = { santabarbara: "org_andes_urbano", elpoblado: "org_valle_alto", avista: "org_avista" }[slug];
      if (orgId) body.visibleOrganizations = await forTenant(orgId).organization.count();
    }
  } catch (err) {
    body.database = "down";
    body.error = err instanceof Error ? err.message.split("\n").slice(-1)[0] : String(err);
  }
  return NextResponse.json(body);
}
