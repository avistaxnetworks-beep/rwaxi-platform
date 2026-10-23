"use client";

import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setNumberLocale } from "@/app/_lib/format";
import { loadCatalog } from "./catalogs";
import {
  BCP47,
  LOCALE_COOKIE,
  NUMBER_LOCALE,
  SCOPE_LOCALES,
  dirOf,
  type I18nScope,
  type Locale,
} from "./config";
import { makeTranslate, spanish, type Catalog, type Translate } from "./translate";

export interface I18n {
  scope: I18nScope;
  locale: Locale;
  /** BCP 47 tag for `lang` attributes */
  lang: string;
  dir: "ltr" | "rtl";
  /** languages offered in this scope */
  locales: readonly Locale[];
  tr: Translate;
  /** A message whose `{placeholders}` are elements (e.g. <Num> figures); `count` selects the plural form. */
  rich: (source: string, nodes: Record<string, ReactNode>, count?: number) => ReactNode[];
  setLocale: (next: Locale) => Promise<void>;
}

function richWith(tr: Translate): I18n["rich"] {
  return (source, nodes, count) =>
    tr(source, count === undefined ? undefined : { count })
      .split(/(\{\w+\})/g)
      .map((part, i) => {
        const key = /^\{(\w+)\}$/.exec(part)?.[1];
        return <Fragment key={i}>{key && key in nodes ? nodes[key] : part}</Fragment>;
      });
}

// Without a provider (Super-Admin console) everything renders in Spanish, the source language.
const SPANISH: I18n = {
  scope: "tenant",
  locale: "es",
  lang: BCP47.es,
  dir: "ltr",
  locales: ["es"],
  tr: spanish,
  rich: richWith(spanish),
  setLocale: async () => {},
};

const Ctx = createContext<I18n>(SPANISH);

export const useI18n = (): I18n => useContext(Ctx);

/**
 * Language of one environment. The layout reads the cookie and hands over the catalogue, so the first
 * render is already in the chosen language; switching loads the other catalogue and re-renders in place
 * (forms and navigation keep their state).
 */
export function I18nProvider({
  scope,
  locale: initialLocale,
  catalog: initialCatalog,
  children,
}: {
  scope: I18nScope;
  locale: Locale;
  catalog: Catalog;
  children: ReactNode;
}) {
  const [state, setState] = useState({ locale: initialLocale, catalog: initialCatalog });
  // Figures follow the language (format.ts). Only in the browser: on the server the module is shared by requests.
  if (typeof window !== "undefined") setNumberLocale(NUMBER_LOCALE[state.locale]);

  const setLocale = useCallback(
    async (next: Locale) => {
      if (!SCOPE_LOCALES[scope].includes(next)) return;
      const catalog = await loadCatalog(next);
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${LOCALE_COOKIE[scope]}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
      setState({ locale: next, catalog });
    },
    [scope],
  );

  const value = useMemo<I18n>(() => {
    const tr = makeTranslate(state.locale, state.catalog);
    return {
      scope,
      locale: state.locale,
      lang: BCP47[state.locale],
      dir: dirOf(state.locale),
      locales: SCOPE_LOCALES[scope],
      tr,
      rich: richWith(tr),
      setLocale,
    };
  }, [scope, state, setLocale]);

  useEffect(() => {
    document.documentElement.lang = value.lang;
  }, [value.lang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Subtree translated only to the tenant languages (es · en · pt): the On-Chain Inspector, which the
 * architecture bar also opens from the vitrina. In the other vitrina languages it reads in English;
 * the English catalogue loads the first time the subtree becomes `active`.
 */
export function TenantLanguages({ active, children }: { active: boolean; children: ReactNode }) {
  const outer = useI18n();
  const fallback = !SCOPE_LOCALES.tenant.includes(outer.locale);
  const [english, setEnglish] = useState<Catalog | null>(null);
  useEffect(() => {
    if (active && fallback && !english) void loadCatalog("en").then(setEnglish);
  }, [active, fallback, english]);
  const value = useMemo<I18n>(() => {
    if (!fallback || !english) return outer;
    const tr = makeTranslate("en", english);
    return { ...outer, lang: BCP47.en, dir: "ltr", tr, rich: richWith(tr) };
  }, [outer, fallback, english]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
