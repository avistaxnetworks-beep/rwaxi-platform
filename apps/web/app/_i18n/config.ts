// Languages of the RWAXI environments. Isomorphic (Edge, Node and browser): no runtime dependencies.

/** The platform's public languages: those of the global capital markets it addresses. Spanish is the source. */
export const VITRINA_LOCALES = ["es", "en", "pt", "fr", "de", "ru", "ar", "zh", "ja", "ko"] as const;
/**
 * The internal panels (developer backoffice, On-Chain Inspector): Spanish, English and Brazilian Portuguese only,
 * for technical and legal precision. The Super-Admin console is Spanish.
 */
export const BACKOFFICE_LOCALES = ["es", "en", "pt"] as const;

export type Locale = (typeof VITRINA_LOCALES)[number];
/**
 * vitrina   www.rwaxirealestate.com                         10 languages
 * portal    {slug}.rwaxirealestate.com (investor-facing)    10 languages, inherited from the vitrina (?lang=)
 * backoffice {slug}.rwaxirealestate.com/backoffice          es · en · pt
 */
export type I18nScope = "vitrina" | "portal" | "backoffice";

export const DEFAULT_LOCALE: Locale = "es";

/** One cookie per scope: the vitrina (www), each portal and each backoffice remember their own choice. */
export const LOCALE_COOKIE: Record<I18nScope, string> = {
  vitrina: "rwaxi_vitrina_lang",
  portal: "rwaxi_portal_lang",
  backoffice: "rwaxi_backoffice_lang",
};
export const SCOPE_LOCALES: Record<I18nScope, readonly Locale[]> = {
  vitrina: VITRINA_LOCALES,
  portal: VITRINA_LOCALES,
  backoffice: BACKOFFICE_LOCALES,
};

/** Query parameter with which the vitrina hands its language to a portal (the middleware stores it and drops it). */
export const LANG_PARAM = "lang";
/** Request header (set by the middleware, never trusted from the client) naming the surface of a tenant host. */
export const SURFACE_HEADER = "x-rwaxi-surface";

/** Each language as its speakers write it (the selector never translates these). */
export const LANGUAGE_NAME: Record<Locale, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
  fr: "Français",
  de: "Deutsch",
  ru: "Русский",
  ar: "العربية",
  zh: "简体中文",
  ja: "日本語",
  ko: "한국어",
};

/** BCP 47 tag of the `lang` attribute (hyphenation, line breaking, screen readers) and of the plural rules. */
export const BCP47: Record<Locale, string> = {
  es: "es-CO",
  en: "en",
  pt: "pt-BR",
  fr: "fr",
  de: "de",
  ru: "ru",
  ar: "ar",
  zh: "zh-Hans",
  ja: "ja",
  ko: "ko",
};

/** Locale of the figures. Latin digits in every language (also Arabic), so amounts stay comparable. */
export const NUMBER_LOCALE: Record<Locale, string> = {
  es: "es-CO",
  en: "en-US",
  pt: "pt-BR",
  fr: "fr-FR",
  de: "de-DE",
  ru: "ru-RU",
  ar: "ar-u-nu-latn",
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
};

export const dirOf = (locale: Locale): "ltr" | "rtl" => (locale === "ar" ? "rtl" : "ltr");

/** Whether `raw` names one of the languages of `scope`. */
export const isLocaleOf = (raw: string | null | undefined, scope: I18nScope): raw is Locale =>
  !!raw && (SCOPE_LOCALES[scope] as readonly string[]).includes(raw);

/** The language of `scope` named by a cookie value; anything else (missing, tampered, other scope) is Spanish. */
export function localeFrom(raw: string | null | undefined, scope: I18nScope): Locale {
  return isLocaleOf(raw, scope) ? raw : DEFAULT_LOCALE;
}
