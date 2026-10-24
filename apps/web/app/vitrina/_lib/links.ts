/**
 * RWAXI's site for developers and structurers (B2B): where the vitrina sends someone who wants to tokenize a
 * property. The vitrina itself is the investor's side.
 */
export const RWAXI_B2B_URL = "https://rwaxi.com";

/** The commercial sections of the vitrina, in page order (the header links to exactly these). */
export const VITRINA_SECTIONS = ["oportunidades", "como-funciona", "beneficios-tokenizacion"] as const;
export type VitrinaSection = (typeof VITRINA_SECTIONS)[number];
