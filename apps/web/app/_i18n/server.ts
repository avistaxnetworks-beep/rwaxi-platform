import "server-only";
import { cookies, headers } from "next/headers";
import { loadCatalog } from "./catalogs";
import { LOCALE_COOKIE, localeFrom, type I18nScope, type Locale } from "./config";
import type { Reason } from "./marks";
import { makeTranslate, type Catalog, type Translate } from "./translate";

/** Scope of the request's host (x-rwaxi-env, set by the middleware); null for the Spanish-only Super-Admin console. */
export async function hostScope(): Promise<I18nScope | null> {
  const env = (await headers()).get("x-rwaxi-env");
  return env === "www" ? "vitrina" : env === "tenant" ? "tenant" : null;
}

/** Language the visitor chose for `scope` (cookie of the host); Spanish by default. */
export async function requestLocale(scope: I18nScope): Promise<Locale> {
  return localeFrom((await cookies()).get(LOCALE_COOKIE[scope])?.value, scope);
}

/** Locale and catalogue for a layout to hand to the client provider. */
export async function requestI18n(scope: I18nScope): Promise<{ locale: Locale; catalog: Catalog }> {
  const locale = await requestLocale(scope);
  return { locale, catalog: await loadCatalog(locale) };
}

/** Translator of the request's language, for messages built on the server (actions, loaders). */
export async function requestTranslate(scope: I18nScope): Promise<Translate> {
  const { locale, catalog } = await requestI18n(scope);
  return makeTranslate(locale, catalog);
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
