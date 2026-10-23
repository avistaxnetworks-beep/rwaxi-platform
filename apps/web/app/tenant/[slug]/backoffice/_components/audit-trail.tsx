"use client";

import { shortHash } from "@/app/_lib/format";
import type { AuditEntry } from "../_lib/types";

export const utc = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;

const AUDIT_LABEL: Record<AuditEntry["action"], string> = {
  KYC_APPROVED: "KYC aprobado",
  KYC_REJECTED: "KYC rechazado",
  SUBSCRIPTION_CREATED: "Suscripción registrada",
  PAYMENT_CONFIRMED: "Pago fiduciario conciliado",
  CHAIN_TX_CONFIRMED: "Transacción on-chain confirmada",
  SUBSCRIPTION_MINTED: "Tokens emitidos",
};
const AUDIT_TONE: Record<AuditEntry["action"], string> = {
  KYC_APPROVED: "text-aquaInk",
  KYC_REJECTED: "text-[#B42318]",
  SUBSCRIPTION_CREATED: "text-goldInk",
  PAYMENT_CONFIRMED: "text-goldInk",
  CHAIN_TX_CONFIRMED: "text-rxBlue",
  SUBSCRIPTION_MINTED: "text-aquaInk",
};
const AUDIT_HASH_LABEL: Record<AuditEntry["action"], string> = {
  KYC_APPROVED: "SHA-256 expediente",
  KYC_REJECTED: "SHA-256 expediente",
  SUBSCRIPTION_CREATED: "SHA-256 contrato de suscripción",
  PAYMENT_CONFIRMED: "paymentEvidenceRef",
  CHAIN_TX_CONFIRMED: "tx hash",
  SUBSCRIPTION_MINTED: "tx hash mint",
};

export function AuditTrail({ entries, empty }: { entries: AuditEntry[]; empty?: string }) {
  return (
    <div className="bg-white border border-line">
      <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Registro de auditoría · append-only</p>
        <p className="text-[11.5px] text-muted">AuditEvent · sin edición ni borrado</p>
      </div>
      {entries.length === 0 ? (
        <p className="px-5 py-4 text-[12.5px] text-muted">{empty ?? "Aún no hay decisiones registradas para este tenant."}</p>
      ) : (
        <ul>
          {entries.map((e) => (
            <li key={e.id} data-audit={e.action} className="px-5 py-3 border-b border-line last:border-b-0 text-[12.5px]">
              <p className="font-mono text-[11px] text-muted">
                {utc(e.at)}
                {" · "}
                <span className={AUDIT_TONE[e.action]}>{AUDIT_LABEL[e.action]}</span>
              </p>
              <p className="text-inkBody mt-0.5">
                {e.investorName}
                <span className="text-muted">{` · por ${e.actorEmail}`}</span>
              </p>
              <p className="font-mono text-[10.5px] text-muted mt-0.5 break-words">
                {`${AUDIT_HASH_LABEL[e.action]} ${e.subjectHash ? shortHash(e.subjectHash, 14, 8) : "—"}`}
                {e.detail && ` · ${e.detail}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
