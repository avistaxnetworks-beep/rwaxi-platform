import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEligibility, validateEligibility } from "./eligibility";

const valid = { is_eligible: true, tax_residence: "Colombia", investor_status: "REG_S", lawful_funds: true, attested_at: "2026-10-31T12:00:00Z" };

test("a complete attestation passes: country of the closed list, known status, lawful funds", () => {
  assert.deepEqual(parseEligibility(valid), { ok: true, taxResidence: "Colombia", investorStatus: "REG_S" });
  assert.deepEqual(parseEligibility({ ...valid, tax_residence: "Estados Unidos", investor_status: "REG_D" }), {
    ok: true,
    taxResidence: "Estados Unidos",
    investorStatus: "REG_D",
  });
});

test("missing, not an object or is_eligible other than true: rejected", () => {
  for (const input of [undefined, null, "yes", [], 1, { ...valid, is_eligible: false }, { ...valid, is_eligible: "true" }]) {
    const r = parseEligibility(input);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.reason, "Completa la declaración de elegibilidad antes de suscribir.");
  }
});

test("a U.S. tax resident cannot attest Regulation S", () => {
  const r = parseEligibility({ ...valid, tax_residence: "Estados Unidos", investor_status: "REG_S" });
  assert.equal(!r.ok && r.reason, "Un residente fiscal de Estados Unidos no puede declararse inversionista internacional (Reg S).");
});

test("unknown country or status, or funds not confirmed: rejected with the field's reason", () => {
  assert.equal(parseEligibility({ ...valid, tax_residence: "Atlantis" }).ok, false);
  assert.equal(parseEligibility({ ...valid, tax_residence: "colombia" }).ok, false);
  assert.equal(parseEligibility({ ...valid, investor_status: "REG_A" }).ok, false);
  assert.equal(parseEligibility({ ...valid, lawful_funds: "true" }).ok, false);
  const r = parseEligibility({ ...valid, lawful_funds: false });
  assert.equal(!r.ok && r.reason, "Debes confirmar el origen lícito de tus fondos.");
  assert.deepEqual(Object.keys(validateEligibility("", null, false)).sort(), ["country", "funds", "status"]);
});
