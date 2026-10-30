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
  // the platform fee linked to a subscription (B2B, paid by the developer) and the one its mint declared on-chain
  platformFeeBps?: number | null;
  platformFeeUsd?: string | null;
  platformFee?: { platformFeeBps?: number | null; estimatedUsd?: string | null } | null;
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
  // yield distributions: payment currency, record date, payment instructions
  currency?: string;
  amountDeclared?: string;
  recordDate?: string;
  withheldAtDeclaration?: number;
  sequence?: number;
  total?: string;
  payees?: number;
  withheld?: number;
  registryMode?: string;
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
  by?: "investor" | "staff" | "backoffice" | "platform";
  dataRoomRoot?: string;
  anchorChainTransactionId?: string | null;
  // revocation, freeze and the issuer's MINTER_ROLE
  note?: string;
  frozen?: boolean;
  unitsReleased?: number;
  cancelledSubscriptions?: unknown[];
  refundDue?: boolean;
  revokeChainTransactionId?: string | null;
  voidedFeeIds?: string[];
  wallet?: string;
  // offering lifecycle
  from?: string;
  to?: string;
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
      const fee =
        p.platformFee?.platformFeeBps != null
          ? tr("comisión de plataforma estimada {bps} pb · {fee} USD (la paga el desarrollador)", {
              bps: p.platformFee.platformFeeBps,
              fee: p.platformFee.estimatedUsd ?? "?",
            })
          : p.feeUsd
            ? tr("fee RWAXI {fee} USD", { fee: p.feeUsd })
            : null;
      return [amount, state, fee].filter(Boolean).join(" · ");
    }
    case "SUBSCRIPTION_PAYMENT_OPENED":
      return [
        amount,
        tr("pago fiduciario pendiente · ref. {code}", { code: p.paymentCode ?? "?" }),
        p.platformFeeBps != null
          ? tr("comisión de plataforma estimada {bps} pb · {fee} USD (la paga el desarrollador)", {
              bps: p.platformFeeBps,
              fee: p.platformFeeUsd ?? "?",
            })
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
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
      return [
        tr("{amount} · tokens en la wallet del inversionista", { amount }),
        p.platformFee?.platformFeeBps != null ? tr("PlatformFeeAccrued {bps} pb", { bps: p.platformFee.platformFeeBps }) : null,
      ]
        .filter(Boolean)
        .join(" · ");
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
    case "KYC_REVOKED":
      return [
        p.reason ? tr(p.reason) : null,
        tr("{n} suscripción(es) cancelada(s) · {units} unidades liberadas", {
          n: p.cancelledSubscriptions?.length ?? 0,
          units: p.unitsReleased ?? 0,
          count: p.cancelledSubscriptions?.length ?? 0,
        }),
        p.revokeChainTransactionId ? tr("revokeInvestor en cola") : tr("whitelist retirada antes de enviarse"),
      ]
        .filter(Boolean)
        .join(" · ");
    case "SUBSCRIPTION_CANCELLED":
      return [
        amount,
        tr("por revocación del KYC"),
        p.refundDue ? tr("reembolso del pago fiduciario pendiente") : null,
        p.voidedFeeIds?.length ? tr("fee RWAXI anulado") : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "INVESTOR_FREEZE_REQUESTED":
      return [p.frozen ? tr("setFrozen(true) en cola") : tr("setFrozen(false) en cola"), p.note ?? null].filter(Boolean).join(" · ");
    case "MINTER_ROLE_REQUESTED":
      return tr("grantRole(MINTER_ROLE) a la wallet del emisor {wallet} en cola", {
        wallet: p.wallet ? `${p.wallet.slice(0, 8)}…${p.wallet.slice(-6)}` : "",
      });
    case "OFFERING_STATUS_CHANGED":
      return [tr("{from} → {to}", { from: String(p.from), to: String(p.to) }), p.reason ?? null].filter(Boolean).join(" · ");
    case "DISTRIBUTION_DECLARED":
      // version 2: payment currency, record date and supporting document; version 1: USD
      return p.recordDate
        ? [
            tr("Distribución {period} · {amount} {currency} entre {holders} tenedor(es) a la fecha de corte {date}", {
              period: String(p.period),
              amount: String(p.amountDeclared),
              currency: String(p.currency),
              holders: p.holders ?? 0,
              count: p.holders ?? 0,
              date: p.recordDate,
            }),
            p.withheldAtDeclaration ? tr("{n} retenida(s) hoy por la whitelist", { n: p.withheldAtDeclaration, count: p.withheldAtDeclaration }) : null,
            tr("anchorDistributionRoot en cola"),
          ]
            .filter(Boolean)
            .join(" · ")
        : tr("Distribución {period} · {total} USD entre {holders} tenedor(es) · anchorDistributionRoot en cola", {
            period: String(p.period),
            total: String(p.totalUsd),
            holders: p.holders ?? 0,
            count: p.holders ?? 0,
          });
    case "DISTRIBUTION_PAYOUT_INSTRUCTED":
      return [
        tr("Instrucción de pago #{sequence} de {period} · {total} {currency} a {payees} wallet(s)", {
          sequence: p.sequence ?? 0,
          period: String(p.period),
          total: String(p.total),
          currency: String(p.currency),
          payees: p.payees ?? 0,
          count: p.payees ?? 0,
        }),
        p.withheld ? tr("{n} retenida(s) por la whitelist", { n: p.withheld, count: p.withheld }) : null,
        p.registryMode === "RPC" ? tr("whitelist leída del registro on-chain") : tr("whitelist según la cola confirmada (simulación)"),
      ]
        .filter(Boolean)
        .join(" · ");
    case "DISTRIBUTION_SUPPORT_DOWNLOADED":
      return tr("Soporte de la distribución {period} · SHA-256 verificado al servirlo · {by}", {
        period: String(p.period),
        by: p.by === "platform" ? tr("consola RWAXI (supervisión)") : tr("personal del backoffice"),
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
        : e.action === "DISTRIBUTION_DECLARED" || e.action === "DISTRIBUTION_PAYOUT_INSTRUCTED" || e.action === "DISTRIBUTION_SUPPORT_DOWNLOADED"
          ? p.offeringCode
            ? tr("Tenedores de {code}", { code: p.offeringCode })
            : tr("Tenedores de la oferta")
          : e.action === "DATA_ROOM_DOCUMENT_ADDED" || e.action === "DATA_ROOM_DOCUMENT_DOWNLOADED" || e.action === "VAULT_INTEGRITY_FAILED"
            ? tr("Data Room {code}", { code: p.offeringCode ?? "" })
            : e.action === "OFFERING_STATUS_CHANGED"
              ? tr("Oferta {code}", { code: p.offeringCode ?? "" })
              : e.entityId),
    subjectHash: e.subjectHash,
    detail: detailOf(e.action, p, tr),
  };
}
