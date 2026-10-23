// Source-keyed translation: the key of every message is its Spanish text, so Spanish output is the source
// itself (byte for byte what the server stores, hashes and compares) and a missing translation falls back to it.
import { BCP47, type Locale } from "./config";

export type Vars = Record<string, string | number>;
/** CLDR plural categories of a message (Intl.PluralRules on `vars.count`); `other` is always present. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
/** The translations of one language, keyed by the Spanish source text. */
export type Catalog = Record<string, string | PluralForms>;
export type Translate = (source: string, vars?: Vars) => string;

/** Replaces `{name}` placeholders present in `vars`; other braces are left untouched. */
export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

export function makeTranslate(locale: Locale, catalog: Catalog): Translate {
  if (locale === "es") return spanish;
  const plural = new Intl.PluralRules(BCP47[locale]);
  return (source, vars) => {
    const entry = catalog[source];
    const text =
      entry === undefined
        ? source
        : typeof entry === "string"
          ? entry
          : (entry[plural.select(Number(vars?.count ?? 0))] ?? entry.other);
    return interpolate(text, vars);
  };
}

/** The Spanish source with its values: what the server persists and what the tests compare. */
export const spanish: Translate = (source, vars) => interpolate(source, vars);
