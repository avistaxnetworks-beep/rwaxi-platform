"use client";

import { useId, useState, type FormEvent } from "react";
import { CheckRow, Field, fieldCls } from "@/app/_components/ui/form";
import { Modal } from "@/app/_components/ui/modal";
import { useI18n } from "@/app/_i18n/provider";
import { COUNTRIES } from "@/app/_lib/data/kyc";
import {
  STATUS_OPTIONS,
  validateEligibility,
  type EligibilityAttestation,
  type EligibilityErrors,
  type InvestorStatus,
} from "@/app/_lib/eligibility";

export type { EligibilityAttestation, InvestorStatus } from "@/app/_lib/eligibility";

/**
 * Investor self-attestation (eligibility): tax residence, investor status (Reg S or Reg D) and the lawful origin of
 * funds. It is a declaration, not a verification: it does not replace KYC/AML or the suitability check at subscription.
 * The rules live in app/_lib/eligibility.ts, which subscribe() applies again on the server. Countries come from the
 * KYC's closed list (Spanish source values; shown with tr()).
 */
export function EligibilityModal({
  onSuccess,
  onClose,
}: {
  onSuccess: (data: EligibilityAttestation) => void;
  onClose: () => void;
}) {
  const { tr } = useI18n();
  const id = useId();
  const [country, setCountry] = useState("");
  const [status, setStatus] = useState<InvestorStatus | null>(null);
  const [funds, setFunds] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const errors = validateEligibility(country, status, funds);
  const shown: EligibilityErrors = submitted ? errors : {};

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || !status) return;
    onSuccess({
      is_eligible: true,
      tax_residence: country,
      investor_status: status,
      lawful_funds: true,
      attested_at: new Date().toISOString(),
    });
  };

  return (
    <Modal title={tr("Declaración de elegibilidad")} onClose={onClose} wide={false}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-5" data-eligibility-form>
        <p className="text-[13px] text-inkBody leading-relaxed">
          {tr(
            "Declara bajo tu responsabilidad tu residencia fiscal y tu condición de inversionista. Esta autodeclaración no sustituye la verificación KYC/AML ni la validación de idoneidad que se hará al suscribir una inversión.",
          )}
        </p>

        <Field id={`${id}-country`} label={tr("País de residencia fiscal")} error={shown.country && tr(shown.country)}>
          <select
            id={`${id}-country`}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-invalid={!!shown.country}
            data-eligibility-country
            className={fieldCls(shown.country)}
          >
            <option value="" disabled>
              {tr("Selecciona un país")}
            </option>
            {COUNTRIES.map((c: string) => (
              <option key={c} value={c}>
                {tr(c)}
              </option>
            ))}
          </select>
        </Field>

        <fieldset className="flex flex-col gap-2 min-w-0" aria-invalid={!!shown.status}>
          <legend className="text-[12px] font-semibold text-inkBody mb-1.5">{tr("Condición de inversionista")}</legend>
          {STATUS_OPTIONS.map((s) => (
            <label
              key={s.value}
              className={`flex gap-3 p-4 cursor-pointer border bg-white ${
                shown.status ? "border-[#B42318]" : status === s.value ? "border-rxPurple" : "border-line"
              }`}
            >
              <input
                type="radio"
                name={`${id}-status`}
                value={s.value}
                checked={status === s.value}
                onChange={() => setStatus(s.value)}
                data-eligibility-status={s.value}
                className="mt-1 w-4 h-4 accent-[#2F145F] shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-rxPurple">{tr(s.label)}</span>
                <span className="block text-[12.5px] text-inkBody leading-[1.6] mt-1">{tr(s.hint)}</span>
              </span>
            </label>
          ))}
          {shown.status && (
            <p className="text-[12px] text-[#B42318]" role="alert">
              {tr(shown.status)}
            </p>
          )}
        </fieldset>

        <CheckRow
          id={`${id}-funds`}
          checked={funds}
          onChange={setFunds}
          error={shown.funds && tr(shown.funds)}
          title={tr("Origen lícito de los fondos")}
        >
          {tr(
            "Declaro que los recursos que destinaré a cualquier inversión provienen de actividades lícitas y no están vinculados con lavado de activos, financiación del terrorismo ni otras actividades ilícitas.",
          )}
        </CheckRow>

        <div className="flex flex-wrap justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-[13px] font-semibold text-rxBlue border border-line bg-white focus-ring"
          >
            {tr("Cancelar")}
          </button>
          <button type="submit" className="px-5 py-2.5 text-[13px] font-semibold text-white bg-rxPurple hover:bg-rxDeep focus-ring">
            {tr("Confirmar declaración")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
