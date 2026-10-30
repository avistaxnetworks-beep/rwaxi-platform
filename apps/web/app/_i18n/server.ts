import "server-only";
import { cookies, headers } from "next/headers";
import { loadCatalog } from "./catalogs";
import { BACKOFFICE_LOCALES, LOCALE_COOKIE, SURFACE_HEADER, isLocaleOf, localeFrom, type I18nScope, type Locale } from "./config";
import type { Reason } from "./marks";
import { makeTranslate, type Catalog, type Translate } from "./translate";

/**
 * A scope, or "tenant": the surface of the tenant host this request belongs to — the portal or the backoffice
 * (x-rwaxi-surface, set by the middleware from the path, or for /api/* from the page that called it). Server
 * actions and route handlers shared by both answer in the language of whoever called them.
 */
export type ScopeRef = I18nScope | "tenant";

/** Scope of the request (x-rwaxi-env + x-rwaxi-surface, set by the middleware); null for the Spanish-only console. */
export async function hostScope(): Promise<I18nScope | null> {
  const h = await headers();
  const env = h.get("x-rwaxi-env");
  if (env === "www") return "vitrina";
  if (env === "tenant") return h.get(SURFACE_HEADER) === "backoffice" ? "backoffice" : "portal";
  return null;
}

async function resolve(scope: ScopeRef): Promise<I18nScope> {
  if (scope !== "tenant") return scope;
  const host = await hostScope();
  return host === "backoffice" ? "backoffice" : "portal";
}

/**
 * Language the visitor chose for `scope` (cookie of the host); Spanish by default. The backoffice, without a choice
 * of its own, follows the portal of the same host when that is one of its three languages.
 */
export async function requestLocale(scope: ScopeRef): Promise<Locale> {
  const resolved = await resolve(scope);
  const jar = await cookies();
  const own = jar.get(LOCALE_COOKIE[resolved])?.value;
  if (resolved === "backoffice" && !isLocaleOf(own, "backoffice")) {
    return localeFrom(jar.get(LOCALE_COOKIE.portal)?.value, "backoffice");
  }
  return localeFrom(own, resolved);
}

/** Locale and catalogue for a layout to hand to the client provider. */
export async function requestI18n(scope: ScopeRef): Promise<{ locale: Locale; catalog: Catalog }> {
  const locale = await requestLocale(scope);
  return { locale, catalog: await loadCatalog(locale) };
}

/**
 * Translator of the request's language, for messages built on the server (actions, loaders, route handlers). In
 * the portal languages beyond es · en · pt, a message only the internal panels translate (e.g. an on-chain queue
 * blocker) reads in English rather than in the Spanish source.
 */
export async function requestTranslate(scope: ScopeRef): Promise<Translate> {
  const { locale, catalog } = await requestI18n(scope);
  if ((BACKOFFICE_LOCALES as readonly string[]).includes(locale)) return makeTranslate(locale, catalog);
  return makeTranslate(locale, { ...(await loadCatalog("en")), ...catalog });
}

/**
 * A server message in the language of `tr`. String values that are themselves source texts (a status or a
 * role label passed as a placeholder) are translated too; names, codes and figures fall through unchanged.
 */
export const render = (tr: Translate, r: Reason | string): string => {
  if (typeof r === "string") return tr(r);
  const vars =
    r.vars &&
    Object.fromEntries(Object.entries(r.vars).map(([k, v]) => [k, typeof v === "string" ? tr(v) : v]));
  return tr(r.source, vars);
};
