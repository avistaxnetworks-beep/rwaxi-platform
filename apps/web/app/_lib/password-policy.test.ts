import { test } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD_RULES, passwordFailures } from "./password-policy";

const PERSON = ["Laura Salazar Mejía", "admin@costaazul.co", "Costa Azul", "costaazul"];

test("a long password with upper and lower case, digits and a symbol passes", () => {
  assert.deepEqual(passwordFailures("Fiducia-Bocagrande#2026", PERSON), []);
  assert.deepEqual(passwordFailures("Ñandú_Bajo-Lluvia9", PERSON), []);
});

test("each rule is reported on its own", () => {
  assert.deepEqual(passwordFailures("Ab1!short", PERSON), ["length"]);
  assert.deepEqual(passwordFailures("sinmayusculas-2026!", PERSON), ["case"]);
  assert.deepEqual(passwordFailures("Sin-Numeros-Aqui!", PERSON), ["digit"]);
  assert.deepEqual(passwordFailures("SinSimbolos2026Bien", PERSON), ["symbol"]);
  assert.deepEqual(passwordFailures("x".repeat(129), PERSON), ["length", "case", "digit", "symbol"]);
});

test("the person's name and email, the developer's names and rwaxi never appear in it (accents ignored)", () => {
  assert.deepEqual(passwordFailures("RwaxiDemo-2026!", PERSON), ["personal"]);
  assert.deepEqual(passwordFailures("Salazar-Fuerte#2026", PERSON), ["personal"]);
  assert.deepEqual(passwordFailures("MEJIA-sin-tilde#2026", PERSON), ["personal"]);
  assert.deepEqual(passwordFailures("Costaazul-Muelle#2026", PERSON), ["personal"]);
  // Words shorter than 4 letters are not checked ("co" of the email domain).
  assert.deepEqual(passwordFailures("Coral-Bonito#2026", PERSON), []);
});

test("every rule has its message", () => {
  assert.deepEqual(
    PASSWORD_RULES.map((r) => r.id),
    ["length", "case", "digit", "symbol", "personal"],
  );
});
