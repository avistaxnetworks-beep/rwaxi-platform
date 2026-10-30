import { test } from "node:test";
import assert from "node:assert/strict";
import { VITRINA_LEADS_INBOX, VITRINA_LEAD_ORIGIN, languageLabel, leadNotificationMail, welcomeMail } from "./vitrina-mail";

const lead = {
  acceptanceId: "41461f71-0000-4000-8000-000000000001",
  email: "inversionista@example.com",
  acceptedAt: new Date("2026-10-29T21:05:09.000Z"),
  language: "en",
  termsVersion: "2026-10-29",
};

test("the lead notice goes to RWAXI's inbox with email, timestamp, language and origin", () => {
  const mail = leadNotificationMail(lead);
  assert.equal(mail.to, VITRINA_LEADS_INBOX);
  assert.equal(mail.to, "admin@rwaxi.com");
  assert.equal(mail.id, `vitrina-lead-${lead.acceptanceId}`);
  assert.match(mail.subject, /inversionista@example\.com/);
  assert.match(mail.text, /Correo del inversionista: inversionista@example\.com/);
  assert.match(mail.text, /Fecha y hora: .*2026.*\(hora de Colombia\) · 2026-10-29T21:05:09\.000Z/);
  assert.match(mail.text, /Idioma de navegación: inglés \(en\)/);
  assert.ok(mail.text.includes(`Origen: ${VITRINA_LEAD_ORIGIN}`));
  assert.equal(VITRINA_LEAD_ORIGIN, "Vitrina Pública RWAXI - Muro Legal");
});

test("language labels fall back to the code", () => {
  assert.equal(languageLabel("es"), "español (es)");
  assert.equal(languageLabel("zz"), "zz");
});

test("the welcome goes to the investor and lists each consent as accepted, with its document and hash", () => {
  const mail = welcomeMail({
    ...lead,
    vitrinaUrl: "https://www.rwaxirealestate.com",
    consents: [
      { key: "terms", text: "I accept the Terms", url: "https://www.rwaxirealestate.com/legal/terms", sha256: "a".repeat(64) },
      { key: "cookies", text: "I accept the Cookie Policy", url: "https://www.rwaxirealestate.com/legal/cookies", sha256: "b".repeat(64) },
    ],
  });
  assert.equal(mail.to, lead.email);
  assert.equal(mail.id, `vitrina-welcome-${lead.acceptanceId}`);
  assert.ok(mail.text.includes("https://www.rwaxirealestate.com\n"));
  assert.ok(mail.text.includes("✓ I accept the Terms\n    https://www.rwaxirealestate.com/legal/terms\n    SHA-256: " + "a".repeat(64)));
  assert.ok(mail.text.includes("✓ I accept the Cookie Policy"));
});
