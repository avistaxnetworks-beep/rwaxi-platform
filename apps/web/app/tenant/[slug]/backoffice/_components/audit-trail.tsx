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
  DISTRIBUTION_PAYOUT_INSTRUCTED: msg("Instrucción de pago de la distribución"),
  DISTRIBUTION_SUPPORT_DOWNLOADED: msg("Soporte de la distribución consultado"),
  PLATFORM_REPORT_EXPORTED: msg("Reporte exportado desde la consola RWAXI"),
  LOGIN_SUCCEEDED: msg("Inicio de sesión (contraseña + TOTP)"),
  LOGIN_FAILED: msg("Intento de acceso fallido"),
  MFA_FAILED: msg("Código TOTP incorrecto"),
  MFA_ENROLLED: msg("MFA (TOTP) enrolado"),
  ACCOUNT_LOCKED: msg("Cuenta bloqueada por intentos fallidos"),
  LOGOUT: msg("Cierre de sesión"),
  INVESTOR_SESSION_RECOVERED: msg("Sesión del inversionista recuperada con código"),
  INVESTOR_OTP_FAILED: msg("Código de recuperación agotado"),
  STAFF_INVITED: msg("Invitación de activación enviada"),
  STAFF_INVITATION_RESENT: msg("Invitación de activación reenviada"),
  ACCOUNT_ACTIVATED: msg("Cuenta activada (contraseña + TOTP)"),
  DATA_ROOM_DOCUMENT_ADDED: msg("Documento agregado al Data Room"),
  DATA_ROOM_DOCUMENT_DOWNLOADED: msg("Documento del Data Room descargado"),
  KYC_DOCUMENT_VIEWED: msg("Documento KYC consultado"),
  VAULT_INTEGRITY_FAILED: msg("Integridad de la bóveda comprometida"),
  KYC_REVOKED: msg("Inversionista revocado"),
  SUBSCRIPTION_CANCELLED: msg("Suscripción cancelada"),
  INVESTOR_FREEZE_REQUESTED: msg("Congelamiento de wallet solicitado"),
  MINTER_ROLE_REQUESTED: msg("MINTER_ROLE solicitado para el emisor"),
  OFFERING_STATUS_CHANGED: msg("Estado de captación de la oferta"),
  REGISTRY_WALLETS_DECLARED: msg("Gobierno RWAXI · wallets declaradas y registro en cola"),
  COMMERCIAL_TERMS_UPDATED: msg("Gobierno RWAXI · acuerdo comercial y comisión de plataforma"),
  COMMERCIAL_AGREEMENT_DOWNLOADED: msg("Gobierno RWAXI · acuerdo comercial consultado"),
  OFFERING_TOKEN_DEPLOYMENT_QUEUED: msg("Gobierno RWAXI · despliegue del token de la oferta"),
  SUBSCRIPTION_PAYMENT_OPENED: msg("Reserva abierta a pago"),
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
  DISTRIBUTION_PAYOUT_INSTRUCTED: "text-aquaInk",
  DISTRIBUTION_SUPPORT_DOWNLOADED: "text-muted",
  PLATFORM_REPORT_EXPORTED: "text-muted",
  LOGIN_SUCCEEDED: "text-aquaInk",
  LOGIN_FAILED: "text-[#B42318]",
  MFA_FAILED: "text-[#B42318]",
  MFA_ENROLLED: "text-rxBlue",
  ACCOUNT_LOCKED: "text-[#B42318]",
  LOGOUT: "text-muted",
  INVESTOR_SESSION_RECOVERED: "text-aquaInk",
  INVESTOR_OTP_FAILED: "text-[#B42318]",
  STAFF_INVITED: "text-rxPurple",
  STAFF_INVITATION_RESENT: "text-rxPurple",
  ACCOUNT_ACTIVATED: "text-aquaInk",
  DATA_ROOM_DOCUMENT_ADDED: "text-rxBlue",
  DATA_ROOM_DOCUMENT_DOWNLOADED: "text-muted",
  KYC_DOCUMENT_VIEWED: "text-muted",
  VAULT_INTEGRITY_FAILED: "text-[#B42318]",
  KYC_REVOKED: "text-[#B42318]",
  SUBSCRIPTION_CANCELLED: "text-goldInk",
  INVESTOR_FREEZE_REQUESTED: "text-goldInk",
  MINTER_ROLE_REQUESTED: "text-rxBlue",
  OFFERING_STATUS_CHANGED: "text-rxPurple",
  REGISTRY_WALLETS_DECLARED: "text-rxPurple",
  COMMERCIAL_TERMS_UPDATED: "text-rxPurple",
  COMMERCIAL_AGREEMENT_DOWNLOADED: "text-muted",
  OFFERING_TOKEN_DEPLOYMENT_QUEUED: "text-rxPurple",
  SUBSCRIPTION_PAYMENT_OPENED: "text-rxBlue",
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
  DISTRIBUTION_PAYOUT_INSTRUCTED: msg("SHA-256 instrucción de pago"),
  DISTRIBUTION_SUPPORT_DOWNLOADED: msg("SHA-256 documento"),
  PLATFORM_REPORT_EXPORTED: msg("SHA-256 archivo exportado"),
  LOGIN_SUCCEEDED: msg("SHA-256 evento"),
  LOGIN_FAILED: msg("SHA-256 evento"),
  MFA_FAILED: msg("SHA-256 evento"),
  MFA_ENROLLED: msg("SHA-256 evento"),
  ACCOUNT_LOCKED: msg("SHA-256 evento"),
  LOGOUT: msg("SHA-256 evento"),
  INVESTOR_SESSION_RECOVERED: msg("SHA-256 evento"),
  INVESTOR_OTP_FAILED: msg("SHA-256 evento"),
  STAFF_INVITED: msg("SHA-256 decisión"),
  STAFF_INVITATION_RESENT: msg("SHA-256 decisión"),
  ACCOUNT_ACTIVATED: msg("SHA-256 evento"),
  DATA_ROOM_DOCUMENT_ADDED: msg("SHA-256 documento"),
  DATA_ROOM_DOCUMENT_DOWNLOADED: msg("SHA-256 documento"),
  KYC_DOCUMENT_VIEWED: msg("SHA-256 documento"),
  VAULT_INTEGRITY_FAILED: msg("SHA-256 esperado"),
  KYC_REVOKED: msg("SHA-256 decisión"),
  SUBSCRIPTION_CANCELLED: msg("SHA-256 decisión"),
  INVESTOR_FREEZE_REQUESTED: msg("SHA-256 decisión"),
  MINTER_ROLE_REQUESTED: msg("SHA-256 solicitud"),
  OFFERING_STATUS_CHANGED: msg("SHA-256 decisión"),
  REGISTRY_WALLETS_DECLARED: msg("SHA-256 decisión"),
  COMMERCIAL_TERMS_UPDATED: msg("SHA-256 decisión"),
  COMMERCIAL_AGREEMENT_DOWNLOADED: msg("SHA-256 documento"),
  OFFERING_TOKEN_DEPLOYMENT_QUEUED: msg("SHA-256 decisión"),
  SUBSCRIPTION_PAYMENT_OPENED: msg("SHA-256 contrato de suscripción"),
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
