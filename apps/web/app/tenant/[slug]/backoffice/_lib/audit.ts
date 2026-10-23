import "server-only";
import type { AuditEvent } from "@rwaxi/database";
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
}

const amount = (p: AuditPayload) => `${p.units ?? "?"} unidades · ${p.capitalUsd ?? "?"} USD`;

function detailOf(action: AuditEvent["action"], p: AuditPayload): string | null {
  if (isPlatformAction(action)) return platformAuditSummary(action, p);
  switch (action) {
    case "SUBSCRIPTION_CREATED": {
      const state =
        p.status === "PAYMENT_PENDING"
          ? `pago fiduciario pendiente${p.paymentCode ? ` · ref. ${p.paymentCode}` : ""}`
          : p.status === "RESERVED"
            ? "reserva (token no emitido)"
            : p.chainStatus
              ? `mintSubscription ${p.chainStatus}`
              : null;
      return [amount(p), state, p.feeUsd ? `fee RWAXI ${p.feeUsd} USD` : null].filter(Boolean).join(" · ");
    }
    case "PAYMENT_CONFIRMED":
      return [
        `comprobante ${p.paymentReference ?? "?"}`,
        amount(p),
        "mintSubscription en cola",
        p.feeUsd ? `fee RWAXI ${p.feeUsd} USD devengado` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "CHAIN_TX_CONFIRMED":
      return [
        p.method?.split("(")[0] ? `${p.method.split("(")[0]}()` : null,
        p.mode === "SIMULATION" ? "simulación firmada (sin difundir)" : p.mode === "RPC" ? "confirmada en red" : null,
        typeof p.nonce === "number" ? `nonce ${p.nonce}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "SUBSCRIPTION_MINTED":
      return `${amount(p)} · tokens en la wallet del inversionista`;
    default:
      return p.reason ?? (p.chainStatus ? `ChainTransaction ${p.chainStatus}` : null);
  }
}

export function toAuditEntry(e: AuditEvent): AuditEntry {
  const p = (e.payload ?? {}) as AuditPayload;
  return {
    id: e.id,
    at: e.createdAt.toISOString(),
    action: e.action,
    actorEmail: e.actorEmail,
    investorName: p.investorName ?? (isPlatformAction(e.action) ? `RWAXI · ${p.tenant ?? e.entityType}` : e.entityId),
    subjectHash: e.subjectHash,
    detail: detailOf(e.action, p),
  };
}
