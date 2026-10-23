import { test } from "node:test";
import assert from "node:assert/strict";
import { DOCUMENT_SLOTS, RESERVED_SLUGS, SLUG_RULE, brandContrast, nitCheckDigit, nitIsValid, slugFrom } from "./onboarding-shared";

test("NIT check digit (DIAN): published NITs verify, an altered digit does not", () => {
  assert.equal(nitCheckDigit("800197268"), 4); // DIAN
  assert.equal(nitCheckDigit("890903938"), 8); // Bancolombia
  assert.ok(nitIsValid("800.197.268-4"));
  assert.ok(!nitIsValid("800.197.268-5"));
  assert.ok(!nitIsValid("800197268-4"));
  assert.ok(!nitIsValid("800.197.268"));
});

test("subdomains: the prototype's derivation, format and reserved names", () => {
  assert.equal(slugFrom("Costa Azul"), "costaazul");
  assert.equal(slugFrom("Andes Urbano S.A.S."), "andesurbano");
  assert.equal(slugFrom("Construcciones Ñandú & Cía"), "construccionesnand");
  for (const ok of ["costaazul", "costa-azul-2", "abc"]) assert.ok(SLUG_RULE.test(ok), ok);
  for (const bad of ["ab", "-costa", "costa-", "Costa", "costa_azul", "c".repeat(33)]) assert.ok(!SLUG_RULE.test(bad), bad);
  for (const reserved of ["www", "admin", "api", "avista", "santabarbara", "poblado"]) assert.ok(RESERVED_SLUGS.has(reserved), reserved);
});

test("brand colours need AA contrast (4.5:1) with white or Morado Noche text", () => {
  assert.ok(brandContrast("#1F4E79") >= 4.5);
  assert.ok(brandContrast("#2F145F") >= 4.5);
  assert.ok(brandContrast("#FFD700") >= 4.5); // light colour: dark text passes
  assert.ok(brandContrast("#777777") < 4.5); // mid grey: neither passes
});

test("the base Data Room follows the approved prototype: 4 folders, 13 documents", () => {
  assert.equal(DOCUMENT_SLOTS.length, 13);
  assert.equal(new Set(DOCUMENT_SLOTS.map((d) => d.folder)).size, 4);
  assert.equal(DOCUMENT_SLOTS.filter((d) => !d.restricted).length, 4);
});
