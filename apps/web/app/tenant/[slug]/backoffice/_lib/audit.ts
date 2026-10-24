import "server-only";
import type { AuditEvent } from "@rwaxi/database";
import { msg } from "@/app/_i18n/marks";
import { spanish, type Translate } from "@/app/_i18n/translate";
import { isPlatformAction, platformAuditSummary } from "@/app/_lib/server/platform-audit";
import type { AuditEntry } from "./types";

interface AuditPayload {
  investorName?: string;
  tenant?: string;
  reason?: string;
  chainStatus?: string | null;
  units?: number;
  capitalUsd?: string;
  feeUsd?: string | null;
  status?: string;
  paymentCode?: string | null;
  paymentReference?: string;
  method?: string;
  mode?: string;
  nonce?: number;
  period?: string;
  totalUsd?: string;
  holders?: number;
  offeringCode?: string;
  // staff authentication / investor session recovery
  email?: string;
  factor?: "password" | "totp";
  locked?: boolean;
  minutes?: number;
  role?: string;
  attempts?: number;
  // document vault
  name?: string;
  folder?: string;
  kind?: string;
  by?: "investor" | "staff";
  dataRoomRoot?: string;
  anchorChainTransactionId?: string | null;
  // chain confirmations: who sent the transaction
  via?: "operator" | "wallet" | "registered";
  signer?: string;
}

const AUTH_ACTIONS = new Set<AuditEvent["action"]>([
  "LOGIN_SUCCEEDED",
  "LOGIN_FAILED",
  "MFA_FAILED",
  "MFA_ENROLLED",
  "ACCOUNT_LOCKED",
  "LOGOUT",
  "INVESTOR_SESSION_RECOVERED",
  "INVESTOR_OTP_FAILED",
  "ACCOUNT_ACTIVATED",
]);
const ROLE_LABEL: Record<string, string> = {
  COMPLIANCE_OFFICER: msg("Oficial de Cumplimiento"),
  TENANT_ADMIN: msg("Administrador"),
  TENANT_ANALYST: msg("Analista"),
};

function detailOf(action: AuditEvent["action"], p: AuditPayload, tr: Translate): string | null {
  if (isPlatformAction(action)) return platformAuditSummary(action, p, tr);
  const amount = tr("{units} unidades · {capital} USD", { units: p.units ?? "?", capital: p.capitalUsd ?? "?", count: p.units ?? 0 });
  switch (action) {
    case "SUBSCRIPTION_CREATED": {
      const state =
        p.status === "PAYMENT_PENDING"
          ? p.paymentCode
            ? tr("pago fiduciario pendiente · ref. {code}", { code: p.paymentCode })
            : tr("pago fiduciario pendiente")
          : p.status === "RESERVED"
            ? tr("reserva (token no emitido)")
            : p.chainStatus
              ? `mintSubscription ${p.chainStatus}`
              : null;
      return [amount, state, p.feeUsd ? tr("fee RWAXI {fee} USD", { fee: p.feeUsd }) : null].filter(Boolean).join(" · ");
    }
    case "PAYMENT_CONFIRMED":
      return [
        tr("comprobante {reference}", { reference: p.paymentReference ?? "?" }),
        amount,
        tr("mintSubscription en cola"),
        p.feeUsd ? tr("fee RWAXI {fee} USD devengado", { fee: p.feeUsd }) : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "CHAIN_TX_CONFIRMED":
      return [
        p.method?.split("(")[0] ? `${p.method.split("(")[0]}()` : null,
        p.mode === "SIMULATION" ? tr("simulación firmada (sin difundir)") : p.mode === "RPC" ? tr("confirmada en red") : null,
        p.via === "wallet" && p.signer ? tr("firmada en el navegador por {wallet}", { wallet: `${p.signer.slice(0, 8)}…${p.signer.slice(-6)}` }) : null,
        typeof p.nonce === "number" ? `nonce ${p.nonce}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "SUBSCRIPTION_MINTED":
      return tr("{amount} · tokens en la wallet del inversionista", { amount });
    case "LOGIN_FAILED":
    case "MFA_FAILED":
      return [p.factor === "totp" ? tr("código TOTP") : tr("contraseña"), p.locked ? tr("cuenta bloqueada") : null]
        .filter(Boolean)
        .join(" · ");
    case "ACCOUNT_LOCKED":
      return tr("bloqueada {minutes} min", { minutes: p.minutes ?? 0 });
    case "LOGIN_SUCCEEDED":
      return p.role && ROLE_LABEL[p.role] ? tr(ROLE_LABEL[p.role]!) : null;
    case "INVESTOR_OTP_FAILED":
      return tr("{n} intentos fallidos", { n: p.attempts ?? 0 });
    case "MFA_ENROLLED":
    case "LOGOUT":
    case "INVESTOR_SESSION_RECOVERED":
      return null;
    case "ACCOUNT_ACTIVATED":
      return tr("{role} · contraseña y TOTP definidos desde la invitación", {
        role: p.role && ROLE_LABEL[p.role] ? tr(ROLE_LABEL[p.role]!) : String(p.role ?? ""),
      });
    case "DATA_ROOM_DOCUMENT_ADDED":
      return [
        tr("{name} · {folder}", { name: String(p.name), folder: String(p.folder) }),
        p.dataRoomRoot ? tr("nueva raíz {root}", { root: `${p.dataRoomRoot.slice(0, 10)}…` }) : null,
        p.anchorChainTransactionId ? tr("updateDataRoomMerkleRoot en cola") : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "DATA_ROOM_DOCUMENT_DOWNLOADED":
      return tr("{name} · SHA-256 verificado al servirlo · {by}", {
        name: String(p.name),
        by: p.by === "staff" ? tr("personal del backoffice") : tr("inversionista con NDA"),
      });
    case "KYC_DOCUMENT_VIEWED":
      return tr("{side} del documento de identidad · SHA-256 verificado al servirlo", {
        side: p.kind === "back" ? tr("Reverso") : tr("Frente"),
      });
    case "VAULT_INTEGRITY_FAILED":
      return tr("{name}: el archivo no coincide con su SHA-256 · acceso bloqueado", { name: String(p.name ?? "") });
    case "DISTRIBUTION_DECLARED":
      return tr("Distribución {period} · {total} USD entre {holders} tenedor(es) · anchorDistributionRoot en cola", {
        period: String(p.period),
        total: String(p.totalUsd),
        holders: p.holders ?? 0,
        count: p.holders ?? 0,
      });
    default:
      return p.reason ? tr(p.reason) : p.chainStatus ? `ChainTransaction ${p.chainStatus}` : null;
  }
}

/** An AuditEvent as the backoffice trail shows it, in the language of `tr`. */
export function toAuditEntry(e: AuditEvent, tr: Translate = spanish): AuditEntry {
  const p = (e.payload ?? {}) as AuditPayload;
  return {
    id: e.id,
    at: e.createdAt.toISOString(),
    action: e.action,
    actorEmail: e.actorEmail,
    investorName:
      p.investorName ??
      (AUTH_ACTIONS.has(e.action) ? (p.email ?? e.actorEmail) : null) ??
      (isPlatformAction(e.action)
        ? `RWAXI · ${p.tenant ?? e.entityType}`
        : e.action === "DISTRIBUTION_DECLARED"
          ? p.offeringCode
            ? tr("Tenedores de {code}", { code: p.offeringCode })
            : tr("Tenedores de la oferta")
          : e.action === "DATA_ROOM_DOCUMENT_ADDED" || e.action === "DATA_ROOM_DOCUMENT_DOWNLOADED" || e.action === "VAULT_INTEGRITY_FAILED"
            ? tr("Data Room {code}", { code: p.offeringCode ?? "" })
            : e.entityId),
    subjectHash: e.subjectHash,
    detail: detailOf(e.action, p, tr),
  };
}
