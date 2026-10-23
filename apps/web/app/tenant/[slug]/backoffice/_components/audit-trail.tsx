"use client";

import { shortHash } from "@/app/_lib/format";
import { msg } from "@/app/_i18n/marks";
import { useI18n } from "@/app/_i18n/provider";
import type { AuditEntry } from "../_lib/types";

export const utc = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;

const AUDIT_LABEL: Record<AuditEntry["action"], string> = {
  KYC_APPROVED: msg("KYC aprobado"),
  KYC_REJECTED: msg("KYC rechazado"),
  SUBSCRIPTION_CREATED: msg("Suscripción registrada"),
  PAYMENT_CONFIRMED: msg("Pago fiduciario conciliado"),
  CHAIN_TX_CONFIRMED: msg("Transacción on-chain confirmada"),
  SUBSCRIPTION_MINTED: msg("Tokens emitidos"),
  PORTAL_STATUS_CHANGED: msg("Gobierno RWAXI · estado del portal"),
  ORGANIZATION_PUBLICATION_CHANGED: msg("Gobierno RWAXI · publicación en vitrina"),
  OFFERING_CAPTURE_PAUSED: msg("Gobierno RWAXI · captación pausada"),
  OFFERING_CAPTURE_RESUMED: msg("Gobierno RWAXI · captación reanudada"),
  FEE_TERMS_UPDATED: msg("Tarifas RWAXI actualizadas"),
  FEE_INVOICED: msg("Factura RWAXI emitida"),
  FEE_PAYMENT_RECORDED: msg("Pago a RWAXI registrado"),
  ORGANIZATION_ONBOARDED: msg("Alta en la red RWAXI"),
  DISTRIBUTION_DECLARED: msg("Distribución declarada"),
};
const AUDIT_TONE: Record<AuditEntry["action"], string> = {
  KYC_APPROVED: "text-aquaInk",
  KYC_REJECTED: "text-[#B42318]",
  SUBSCRIPTION_CREATED: "text-goldInk",
  PAYMENT_CONFIRMED: "text-goldInk",
  CHAIN_TX_CONFIRMED: "text-rxBlue",
  SUBSCRIPTION_MINTED: "text-aquaInk",
  PORTAL_STATUS_CHANGED: "text-[#B42318]",
  ORGANIZATION_PUBLICATION_CHANGED: "text-rxPurple",
  OFFERING_CAPTURE_PAUSED: "text-[#B42318]",
  OFFERING_CAPTURE_RESUMED: "text-aquaInk",
  FEE_TERMS_UPDATED: "text-goldInk",
  FEE_INVOICED: "text-goldInk",
  FEE_PAYMENT_RECORDED: "text-aquaInk",
  ORGANIZATION_ONBOARDED: "text-rxPurple",
  DISTRIBUTION_DECLARED: "text-goldInk",
};
const AUDIT_HASH_LABEL: Record<AuditEntry["action"], string> = {
  KYC_APPROVED: msg("SHA-256 expediente"),
  KYC_REJECTED: msg("SHA-256 expediente"),
  SUBSCRIPTION_CREATED: msg("SHA-256 contrato de suscripción"),
  PAYMENT_CONFIRMED: "paymentEvidenceRef",
  CHAIN_TX_CONFIRMED: "tx hash",
  SUBSCRIPTION_MINTED: msg("tx hash mint"),
  PORTAL_STATUS_CHANGED: msg("SHA-256 decisión"),
  ORGANIZATION_PUBLICATION_CHANGED: msg("SHA-256 decisión"),
  OFFERING_CAPTURE_PAUSED: msg("SHA-256 decisión"),
  OFFERING_CAPTURE_RESUMED: msg("SHA-256 decisión"),
  FEE_TERMS_UPDATED: msg("SHA-256 decisión"),
  FEE_INVOICED: msg("SHA-256 factura"),
  FEE_PAYMENT_RECORDED: msg("SHA-256 pago"),
  ORGANIZATION_ONBOARDED: msg("SHA-256 alta"),
  DISTRIBUTION_DECLARED: "Merkle root",
};

export function AuditTrail({ entries, empty }: { entries: AuditEntry[]; empty?: string }) {
  const { tr } = useI18n();
  return (
    <div className="bg-white border border-line">
      <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{tr("Registro de auditoría · append-only")}</p>
        <p className="text-[11.5px] text-muted">{tr("AuditEvent · sin edición ni borrado")}</p>
      </div>
      {entries.length === 0 ? (
        <p className="px-5 py-4 text-[12.5px] text-muted">{empty ?? tr("Aún no hay decisiones registradas para este tenant.")}</p>
      ) : (
        <ul>
          {entries.map((e) => (
            <li key={e.id} data-audit={e.action} className="px-5 py-3 border-b border-line last:border-b-0 text-[12.5px]">
              <p className="font-mono text-[11px] text-muted">
                {utc(e.at)}
                {" · "}
                <span className={AUDIT_TONE[e.action]}>{tr(AUDIT_LABEL[e.action])}</span>
              </p>
              <p className="text-inkBody mt-0.5">
                {e.investorName}
                <span className="text-muted">{` · ${tr("por {email}", { email: e.actorEmail })}`}</span>
              </p>
              <p className="font-mono text-[10.5px] text-muted mt-0.5 break-words">
                {`${tr(AUDIT_HASH_LABEL[e.action])} ${e.subjectHash ? shortHash(e.subjectHash, 14, 8) : "—"}`}
                {e.detail && ` · ${e.detail}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
