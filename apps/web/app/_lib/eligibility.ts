// Investor self-attestation of eligibility (pure: the portal's modal and subscribe() share it). Tax residence (the
// KYC's closed list of countries, Spanish source values), investor status — Regulation S (non-U.S. person investing
// from outside the U.S.) or Regulation D (accredited investor) — and the lawful origin of funds. It is a declaration,
// not a verification: it does not replace KYC/AML or the suitability check at subscription.
import { vmsg } from "@/app/_i18n/marks";
import { COUNTRIES } from "@/app/_lib/data/kyc";

export const INVESTOR_STATUSES = ["REG_S", "REG_D"] as const;
export type InvestorStatus = (typeof INVESTOR_STATUSES)[number];

/** What the modal hands to subscribe() (`attested_at` is the browser's clock: the server records its own). */
export interface EligibilityAttestation {
  is_eligible: true;
  /** Spanish source value of COUNTRIES */
  tax_residence: string;
  investor_status: InvestorStatus;
  lawful_funds: true;
  /** ISO 8601 */
  attested_at: string;
}

/** Regulation S only covers non-U.S. persons: a U.S. tax resident cannot attest it. */
export const US_TAX_RESIDENCE = "Estados Unidos";

export const STATUS_OPTIONS: readonly { value: InvestorStatus; label: string; hint: string }[] = [
  {
    value: "REG_S",
    label: vmsg("Inversionista internacional (Reg S)"),
    hint: vmsg("Persona no estadounidense que invierte desde fuera de EE. UU. (Regulation S)."),
  },
  {
    value: "REG_D",
    label: vmsg("Inversionista acreditado (Reg D)"),
    hint: vmsg("Cumple los criterios de inversionista acreditado de la SEC (Regulation D, Regla 501)."),
  },
];

export interface EligibilityErrors {
  country?: string;
  status?: string;
  funds?: string;
}

const isCountry = (v: unknown): v is string => typeof v === "string" && (COUNTRIES as readonly string[]).includes(v);
const isStatus = (v: unknown): v is InvestorStatus => typeof v === "string" && (INVESTOR_STATUSES as readonly string[]).includes(v);

/** The form's rules, field by field (Spanish source texts of the errors, shown with tr()). */
export function validateEligibility(country: unknown, status: unknown, funds: unknown): EligibilityErrors {
  const errors: EligibilityErrors = {};
  if (!isCountry(country)) errors.country = vmsg("Selecciona tu país de residencia fiscal.");
  if (!isStatus(status)) errors.status = vmsg("Selecciona tu condición de inversionista.");
  else if (status === "REG_S" && country === US_TAX_RESIDENCE)
    errors.status = vmsg("Un residente fiscal de Estados Unidos no puede declararse inversionista internacional (Reg S).");
  if (funds !== true) errors.funds = vmsg("Debes confirmar el origen lícito de tus fondos.");
  return errors;
}

export type ParsedEligibility =
  | { ok: true; taxResidence: string; investorStatus: InvestorStatus }
  | { ok: false; reason: string };

/**
 * The server's check of what the client sent (never trusted): an object with `is_eligible === true`, a country of
 * the closed list, a known status consistent with it and `lawful_funds === true`. Anything else is rejected.
 */
export function parseEligibility(input: unknown): ParsedEligibility {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: vmsg("Completa la declaración de elegibilidad antes de suscribir.") };
  }
  const a = input as Record<string, unknown>;
  if (a.is_eligible !== true) return { ok: false, reason: vmsg("Completa la declaración de elegibilidad antes de suscribir.") };
  const errors = validateEligibility(a.tax_residence, a.investor_status, a.lawful_funds);
  const first = errors.country ?? errors.status ?? errors.funds;
  if (first) return { ok: false, reason: first };
  return { ok: true, taxResidence: a.tax_residence as string, investorStatus: a.investor_status as InvestorStatus };
}
