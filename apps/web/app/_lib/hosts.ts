/**
 * Host → environment resolution for the 4 RWAXI environments.
 * Pure and Edge-safe: shared by middleware.ts (routing) and client navigation.
 *
 *   www.rwaxirealestate.com | rwaxirealestate.com → vitrina     (/vitrina/*)
 *   admin.rwaxirealestate.com                     → superadmin  (/superadmin/*)
 *   {slug}.rwaxirealestate.com                    → portal      (/tenant/{slug}/*)
 *   {slug}.rwaxirealestate.com/backoffice         → backoffice  (/tenant/{slug}/backoffice/*)
 *   verified custom domain                        → portal of the tenant that owns it
 *
 * rwaxi.com is RWAXI's corporate B2B site, a separate website: this app never serves it.
 */

export type EnvId = "vitrina" | "portal" | "backoffice" | "superadmin";

export type HostContext =
  | { kind: "www" }
  | { kind: "admin" }
  | { kind: "tenant"; slug: string; via: "subdomain" | "custom-domain" }
  | { kind: "unknown"; host: string };

/** Production domain of the platform (vitrina, portals, backoffices and console). */
export const PLATFORM_DOMAIN = "rwaxirealestate.com";

/** Production root used in user-facing copy (legal texts, address bar mock-ups). */
export const DISPLAY_ROOT_DOMAIN = PLATFORM_DOMAIN;

/**
 * Root the app is served from: NEXT_PUBLIC_PLATFORM_DOMAIN ("rwaxirealestate.com" in production), else the older
 * NEXT_PUBLIC_ROOT_DOMAIN, else "localhost:3000" (development).
 */
export const ROOT_DOMAIN = (
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ||
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ||
  "localhost:3000"
).toLowerCase();

export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "admin",
  "api",
  "app",
  "static",
  "cdn",
  "assets",
  "mail",
  "status",
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Verified custom domains of the demo tenants (prototype DEVELOPERS.domain).
 * TODO(tenancy): back this with Edge Config / KV fed from Organization.customDomain.
 */
const DEFAULT_CUSTOM_DOMAINS: Record<string, string> = {
  "inversiones.andesurbano.co": "santabarbara",
  "invest.avistaresort.co": "avista",
};

function customDomains(): Record<string, string> {
  const raw = process.env.RWAXI_CUSTOM_DOMAINS;
  if (!raw) return DEFAULT_CUSTOM_DOMAINS;
  try {
    return { ...DEFAULT_CUSTOM_DOMAINS, ...(JSON.parse(raw) as Record<string, string>) };
  } catch {
    return DEFAULT_CUSTOM_DOMAINS;
  }
}

const stripPort = (h: string) => h.replace(/:\d+$/, "");

export function resolveHost(rawHost: string | null | undefined, root: string = ROOT_DOMAIN): HostContext {
  const host = stripPort((rawHost || "").trim().toLowerCase().replace(/\.$/, ""));
  const rootHost = stripPort(root);

  if (host === rootHost || host === `www.${rootHost}`) return { kind: "www" };
  if (host === `admin.${rootHost}`) return { kind: "admin" };

  if (host.endsWith(`.${rootHost}`)) {
    const sub = host.slice(0, -(rootHost.length + 1));
    if (!sub.includes(".") && SLUG_RE.test(sub) && !RESERVED_SUBDOMAINS.has(sub)) {
      return { kind: "tenant", slug: sub, via: "subdomain" };
    }
    return { kind: "unknown", host };
  }

  const owner = customDomains()[host];
  if (owner) return { kind: "tenant", slug: owner, via: "custom-domain" };

  return { kind: "unknown", host };
}

/** Internal (rewritten) path for a public request. */
export function internalPath(ctx: HostContext, pathname: string): string | null {
  const path = pathname === "/" ? "" : pathname;
  switch (ctx.kind) {
    case "www":
      return `/vitrina${path}`;
    case "admin":
      return `/superadmin${path}`;
    case "tenant":
      return `/tenant/${ctx.slug}${path}`;
    default:
      return null;
  }
}

/** Display host used by the prototype UI (e.g. "avista.rwaxirealestate.com"). */
export const portalHost = (tenant: { slug: string }) => `${tenant.slug}.${DISPLAY_ROOT_DOMAIN}`;

/** Absolute URL of an environment in the current deployment (dev: *.localhost). */
export function envHref(env: EnvId, slug: string, search = ""): string {
  const protocol = typeof window !== "undefined" ? window.location.protocol : "https:";
  const host =
    env === "vitrina"
      ? ROOT_DOMAIN
      : env === "superadmin"
        ? `admin.${ROOT_DOMAIN}`
        : `${slug}.${ROOT_DOMAIN}`;
  const path = env === "backoffice" ? "/backoffice" : "/";
  return `${protocol}//${host}${path}${search}`;
}
