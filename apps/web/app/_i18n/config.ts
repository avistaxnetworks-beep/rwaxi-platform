// Languages of the RWAXI environments. Isomorphic (Edge, Node and browser): no runtime dependencies.

/** Vitrina (www.rwaxirealestate.com): the languages of the global capital markets it addresses. Spanish is the source. */
export const VITRINA_LOCALES = ["es", "en", "pt", "fr", "de", "ru", "ar", "zh", "ja", "ko"] as const;
/** White Label portal and developer backoffice ({slug}.rwaxirealestate.com): Spanish, English and Brazilian Portuguese. */
export const TENANT_LOCALES = ["es", "en", "pt"] as const;

export type Locale = (typeof VITRINA_LOCALES)[number];
export type I18nScope = "vitrina" | "tenant";

export const DEFAULT_LOCALE: Locale = "es";

/** One cookie per scope: the vitrina (www) and each tenant host (portal + backoffice) remember their own choice. */
export const LOCALE_COOKIE: Record<I18nScope, string> = {
  vitrina: "rwaxi_vitrina_lang",
  tenant: "rwaxi_portal_lang",
};
export const SCOPE_LOCALES: Record<I18nScope, readonly Locale[]> = {
  vitrina: VITRINA_LOCALES,
  tenant: TENANT_LOCALES,
};

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

/** The language of `scope` named by a cookie value; anything else (missing, tampered, other scope) is Spanish. */
export function localeFrom(raw: string | null | undefined, scope: I18nScope): Locale {
  const allowed = SCOPE_LOCALES[scope] as readonly string[];
  return raw && allowed.includes(raw) ? (raw as Locale) : DEFAULT_LOCALE;
}
