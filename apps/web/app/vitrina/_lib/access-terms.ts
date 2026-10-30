// Granular consent of the vitrina's legal wall (client-safe): three independent, mandatory checkboxes, each linking
// to its RWAXI document (/legal/*, outside the wall). The visitor accepts them in their language; the server records
// the SHA-256 of each text exactly as shown (app/vitrina/actions.ts → rwaxi_record_vitrina_access).
import { vmsg } from "@/app/_i18n/marks";
import type { Translate } from "@/app/_i18n/translate";

export type ConsentKey = "terms" | "privacy" | "cookies";

export interface Consent {
  key: ConsentKey;
  /** text of the checkbox; {link} is the linked document title */
  text: string;
  link: string;
  href: `/legal/${ConsentKey}`;
}

export const VITRINA_CONSENTS: readonly Consent[] = [
  {
    key: "terms",
    text: vmsg("Solicito el ingreso a la comunidad privada y acepto los {link} y la Exención de Responsabilidad (Powered by RWAXI)."),
    link: vmsg("Términos y Condiciones"),
    href: "/legal/terms",
  },
  {
    key: "privacy",
    text: vmsg("Autorizo y acepto las {link}."),
    link: vmsg("Políticas de Tratamiento de Datos Personales"),
    href: "/legal/privacy",
  },
  {
    key: "cookies",
    text: vmsg("Acepto la {link}."),
    link: vmsg("Política de Cookies"),
    href: "/legal/cookies",
  },
];

/** The checkbox's text as the visitor read it (the link as its plain title): what the server hashes. */
export const consentText = (tr: Translate, c: Consent): string => tr(c.text, { link: tr(c.link) });
