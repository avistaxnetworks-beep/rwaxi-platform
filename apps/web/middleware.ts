import { NextResponse, type NextRequest } from "next/server";
import { internalPath, resolveHost } from "@/app/_lib/hosts";

/**
 * Edge Middleware — multi-tenant routing by host.
 * Rewrites every page request to the internal route of its environment and forwards the
 * resolved context as request headers (x-rwaxi-env, x-rwaxi-tenant) for server components
 * and route handlers. Internal prefixes (/vitrina, /superadmin, /tenant) are never reachable
 * directly because every request is prefixed again.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let ctx = resolveHost(host);

  // Local convenience: 127.0.0.1 / LAN IPs behave as the vitrina outside production.
  if (ctx.kind === "unknown" && process.env.NODE_ENV !== "production") ctx = { kind: "www" };

  const headers = new Headers(req.headers);
  headers.delete("x-rwaxi-env");
  headers.delete("x-rwaxi-tenant");
  headers.set("x-rwaxi-env", ctx.kind);
  if (ctx.kind === "tenant") headers.set("x-rwaxi-tenant", ctx.slug);

  const { pathname, search } = req.nextUrl;

  // Route handlers stay at /api/* on every host; they read the tenant from the headers.
  if (pathname.startsWith("/api/")) return NextResponse.next({ request: { headers } });

  const target = internalPath(ctx, pathname);
  if (!target) return new NextResponse("Unknown host", { status: 404 });

  const url = req.nextUrl.clone();
  url.pathname = target;
  url.search = search;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Everything except Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico|robots.txt|sitemap.xml|.*\\.[a-zA-Z0-9]+$).*)"],
};
