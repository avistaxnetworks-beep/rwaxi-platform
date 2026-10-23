import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { VITRINA_LOCALES, type Locale } from "./config";
import { extractMessages, placeholders } from "./extract";
import ar from "./messages/ar";
import de from "./messages/de";
import en from "./messages/en";
import fr from "./messages/fr";
import ja from "./messages/ja";
import ko from "./messages/ko";
import pt from "./messages/pt";
import ru from "./messages/ru";
import zh from "./messages/zh";
import { makeTranslate, type Catalog } from "./translate";

const CATALOGS: Record<Exclude<Locale, "es">, Catalog> = { en, pt, fr, de, ru, ar, zh, ja, ko };
const sources = extractMessages(path.join(process.cwd(), "app"));
const forms = (entry: Catalog[string]) => (typeof entry === "string" ? [entry] : Object.values(entry));

test("every language has every message it shows (portal and backoffice: en, pt; vitrina: all 10)", () => {
  for (const locale of VITRINA_LOCALES.filter((l) => l !== "es")) {
    const catalog = CATALOGS[locale as Exclude<Locale, "es">];
    const missing = [...sources.values()]
      .filter((m) => (m.scope === "vitrina" || locale === "en" || locale === "pt") && !(m.source in catalog))
      .map((m) => `${m.source.slice(0, 70)} (${m.files[0]})`);
    assert.deepEqual(missing, [], `${locale}: ${missing.length} message(s) without translation`);
  }
});

test("catalogues only translate messages that exist, with non-empty texts", () => {
  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    const stale = Object.keys(catalog).filter((k) => !sources.has(k));
    assert.deepEqual(stale, [], `${locale}: keys not found in the source`);
    const empty = Object.entries(catalog).filter(([, v]) => forms(v).some((f) => !f.trim()));
    assert.deepEqual(
      empty.map(([k]) => k),
      [],
      `${locale}: empty translations`,
    );
  }
});

test("translations keep the placeholders of their source ({count} may be implied by a plural form)", () => {
  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    for (const [source, entry] of Object.entries(catalog)) {
      const expected = placeholders(source).filter((p) => p !== "count");
      for (const form of forms(entry)) {
        assert.deepEqual(
          placeholders(form).filter((p) => p !== "count"),
          expected,
          `${locale}: «${source.slice(0, 60)}» → «${form.slice(0, 60)}»`,
        );
      }
    }
  }
});

test("Spanish is the source itself, a missing message falls back to it, plural forms follow CLDR", () => {
  const es = makeTranslate("es", {});
  assert.equal(es("{n} unidades disponibles", { n: "1.200" }), "1.200 unidades disponibles");
  const ru = makeTranslate("ru", {
    "{n} unidades": { one: "{n} единица", few: "{n} единицы", many: "{n} единиц", other: "{n} единицы" },
  });
  assert.equal(ru("{n} unidades", { n: 1, count: 1 }), "1 единица");
  assert.equal(ru("{n} unidades", { n: 3, count: 3 }), "3 единицы");
  assert.equal(ru("{n} unidades", { n: 25, count: 25 }), "25 единиц");
  assert.equal(ru("Sin traducción"), "Sin traducción");
});
