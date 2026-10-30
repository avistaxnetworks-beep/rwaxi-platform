/**
 * Emails of the vitrina's legal wall, composed here and sent by vitrina-notify.ts:
 *   - leadNotificationMail: internal notice to RWAXI (VITRINA_LEADS_INBOX) of each new acceptance of the wall.
 *   - welcomeMail: the investor's corporate welcome (access link + the three consents as accepted), ready for when
 *     the mail provider is configured (VITRINA_WELCOME_MAIL in vitrina-notify.ts).
 * Pure (no server-only import): vitrina-mail.test.ts runs it under Node.
 */
import type { ConsentKey } from "@/app/vitrina/_lib/access-terms";

/** RWAXI's inbox for new leads of the public vitrina. */
export const VITRINA_LEADS_INBOX = "admin@rwaxi.com";
export const VITRINA_LEAD_ORIGIN = "Vitrina Pública RWAXI - Muro Legal";

export interface ComposedMail {
  /** idempotency key of the delivery (the provider never sends the same id twice) */
  id: string;
  to: string;
  subject: string;
  text: string;
}

export interface VitrinaLead {
  /** vitrina_access_acceptances.id */
  acceptanceId: string;
  email: string;
  acceptedAt: Date;
  /** locale the visitor had selected in the modal (es, en, pt, …) */
  language: string;
  termsVersion: string;
}

const bogota = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  dateStyle: "long",
  timeStyle: "medium",
});

/** "inglés (en)": the language in Spanish for RWAXI's team, with its code. */
export function languageLabel(locale: string): string {
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames(["es"], { type: "language" }).of(locale);
  } catch {
    name = undefined;
  }
  return name && name !== locale ? `${name} (${locale})` : locale;
}

export function leadNotificationMail(lead: VitrinaLead): ComposedMail {
  const lines = [
    "Nuevo registro en el muro legal de la vitrina RWAXI.",
    "",
    `Correo del inversionista: ${lead.email}`,
    `Fecha y hora: ${bogota.format(lead.acceptedAt)} (hora de Colombia) · ${lead.acceptedAt.toISOString()}`,
    `Idioma de navegación: ${languageLabel(lead.language)}`,
    `Origen: ${VITRINA_LEAD_ORIGIN}`,
    "",
    `Aceptó las tres condiciones de ingreso (versión ${lead.termsVersion}): Términos y Condiciones y Exención de`,
    "Responsabilidad, Políticas de Tratamiento de Datos Personales y Política de Cookies.",
    `Registro: vitrina_access_acceptances · ${lead.acceptanceId}`,
    "",
    "El correo es el que declaró el visitante: aún no está verificado.",
  ];
  return {
    id: `vitrina-lead-${lead.acceptanceId}`,
    to: VITRINA_LEADS_INBOX,
    subject: `Nuevo lead en la vitrina: ${lead.email}`,
    text: lines.join("\n"),
  };
}

export interface WelcomeInput extends VitrinaLead {
  /** absolute URL of the vitrina */
  vitrinaUrl: string;
  /** each consent as the visitor read it (their language), its document and the SHA-256 recorded */
  consents: { key: ConsentKey; text: string; url: string; sha256: string }[];
}

/**
 * The investor's welcome. Base template in Spanish: before enabling it, the corporate copy is approved and its texts
 * go through the i18n markers (the consents already arrive in the visitor's language, exactly as accepted).
 */
export function welcomeMail(input: WelcomeInput): ComposedMail {
  const lines = [
    "Bienvenido a la comunidad privada de inversionistas de RWAXI Real Estate.",
    "",
    "Tu acceso a la vitrina quedó habilitado en este navegador:",
    input.vitrinaUrl,
    "",
    `Confirmamos los consentimientos que aceptaste el ${bogota.format(input.acceptedAt)} (hora de Colombia), versión ${input.termsVersion}:`,
    ...input.consents.flatMap((c) => [`  ✓ ${c.text}`, `    ${c.url}`, `    SHA-256: ${c.sha256}`]),
    "",
    "RWAXI actúa como canal de descubrimiento y proveedor tecnológico: no custodia recursos ni realiza ofertas",
    "públicas. Cada oferta es responsabilidad de su desarrollador.",
    "",
    "Si no solicitaste este acceso, ignora este mensaje.",
  ];
  return {
    id: `vitrina-welcome-${input.acceptanceId}`,
    to: input.email,
    subject: "Bienvenido a la comunidad privada RWAXI",
    text: lines.join("\n"),
  };
}
