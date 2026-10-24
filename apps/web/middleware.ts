import { NextResponse, type NextRequest } from "next/server";
import { internalPath, resolveHost } from "@/app/_lib/hosts";
import { REF_COOKIE, REF_MAX_AGE_S, verifyReferral } from "@/app/_lib/referral";

/**
 * Edge Middleware — multi-tenant routing by host.
 * Rewrites every page request to the internal route of its environment and forwards the
 * resolved context as request headers (x-rwaxi-env, x-rwaxi-tenant) for server components
 * and route handlers. Internal prefixes (/vitrina, /superadmin, /tenant) are never reachable
 * directly because every request is prefixed again.
 */
export async function middleware(req: NextRequest) {
  // Next forwards a Server Action that reached a page which does not bundle it to the page that does, by its
  // internal path (x-action-forwarded). The host rewrite below would send that copy to yet another page, which
  // forwards it again: one crafted POST became an unbounded loop of self-requests. Every page here bundles the
  // actions it calls, so a forwarded action is refused at once (the original request answers an empty result).
  if (req.headers.has("x-action-forwarded")) return new NextResponse(null, { status: 404 });

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
  const res = NextResponse.rewrite(url, { request: { headers } });

  // Signed LeadReferral from the vitrina. Only a token valid for this tenant is kept (first touch
  // wins), so a tampered link cannot displace a genuine one; signNda() verifies it again.
  const ref = ctx.kind === "tenant" ? req.nextUrl.searchParams.get("ref") : null;
  const valid =
    ref && ctx.kind === "tenant" && !req.cookies.has(REF_COOKIE)
      ? (await verifyReferral(ref, { slug: ctx.slug, secret: process.env.REFERRAL_SECRET })).ok
      : false;
  if (ref && valid) {
    res.cookies.set(REF_COOKIE, ref, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: REF_MAX_AGE_S,
    });
  }
  return res;
}

export const config = {
  // Everything except Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico|robots.txt|sitemap.xml|.*\\.[a-zA-Z0-9]+$).*)"],
};
