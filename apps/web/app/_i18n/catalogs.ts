// Catalogue of each language, loaded on demand (one chunk per language in the browser).
import type { Locale } from "./config";
import type { Catalog } from "./translate";

const LOADERS: Record<Exclude<Locale, "es">, () => Promise<{ default: Catalog }>> = {
  en: () => import("./messages/en"),
  pt: () => import("./messages/pt"),
  fr: () => import("./messages/fr"),
  de: () => import("./messages/de"),
  ru: () => import("./messages/ru"),
  ar: () => import("./messages/ar"),
  zh: () => import("./messages/zh"),
  ja: () => import("./messages/ja"),
  ko: () => import("./messages/ko"),
};

/** Translations of `locale`; Spanish is the source language, so its catalogue is empty. */
export async function loadCatalog(locale: Locale): Promise<Catalog> {
  return locale === "es" ? {} : (await LOADERS[locale]()).default;
}
