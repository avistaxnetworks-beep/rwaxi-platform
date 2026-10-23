// Platform (admin.rwaxi.com) audit events: their actions and a one-line summary of the payload,
// shown in the Super-Admin console and in the affected tenant's backoffice audit trail.

export const PLATFORM_AUDIT_ACTIONS = [
  "PORTAL_STATUS_CHANGED",
  "ORGANIZATION_PUBLICATION_CHANGED",
  "OFFERING_CAPTURE_PAUSED",
  "OFFERING_CAPTURE_RESUMED",
  "FEE_TERMS_UPDATED",
  "FEE_INVOICED",
  "FEE_PAYMENT_RECORDED",
] as const;
export type PlatformAuditActionKey = (typeof PLATFORM_AUDIT_ACTIONS)[number];

export const isPlatformAction = (action: string): action is PlatformAuditActionKey =>
  (PLATFORM_AUDIT_ACTIONS as readonly string[]).includes(action);

interface PlatformPayload {
  from?: unknown;
  to?: unknown;
  reason?: string | null;
  published?: boolean;
  offeringCode?: string;
  invoiceNumber?: string;
  entries?: unknown[];
  totalUsd?: string;
  paidOn?: string;
  paymentReceipt?: string;
}

const STATUS_LABEL: Record<string, string> = { ACTIVE: "ACTIVO", REVIEW: "EN REVISIÓN", SUSPENDED: "SUSPENDIDO" };
const TERMS: [key: string, label: string, unit: string][] = [
  ["setupUsd", "setup", " USD"],
  ["monthlyUsd", "SaaS mensual", " USD"],
  ["usagePct", "uso", " %"],
];
const withReason = (text: string, reason?: string | null) => (reason ? `${text} · motivo: ${reason}` : text);

export function platformAuditSummary(action: PlatformAuditActionKey, raw: unknown): string {
  const p = (raw ?? {}) as PlatformPayload;
  switch (action) {
    case "PORTAL_STATUS_CHANGED":
      return withReason(`Portal ${STATUS_LABEL[String(p.from)] ?? p.from} → ${STATUS_LABEL[String(p.to)] ?? p.to}`, p.reason);
    case "ORGANIZATION_PUBLICATION_CHANGED":
      return withReason(p.published ? "Publicado en la vitrina RWAXI" : "Retirado de la vitrina RWAXI", p.reason);
    case "OFFERING_CAPTURE_PAUSED":
      return withReason(`Captación de ${p.offeringCode} pausada (plataforma, off-chain)`, p.reason);
    case "OFFERING_CAPTURE_RESUMED":
      return withReason(`Captación de ${p.offeringCode} reanudada`, p.reason);
    case "FEE_TERMS_UPDATED": {
      const from = (p.from ?? {}) as Record<string, string>;
      const to = (p.to ?? {}) as Record<string, string>;
      const changes = TERMS.filter(([k]) => from[k] !== to[k]).map(([k, label, unit]) => `${label} ${from[k]}${unit} → ${to[k]}${unit}`);
      return `Tarifas pactadas: ${changes.join(" · ") || "sin cambios"}`;
    }
    case "FEE_INVOICED":
      return `Factura ${p.invoiceNumber} · ${p.entries?.length ?? 0} asiento(s) · ${p.totalUsd} USD`;
    case "FEE_PAYMENT_RECORDED":
      return `Pago de la factura ${p.invoiceNumber} · ${p.paidOn} · comprobante ${p.paymentReceipt} · ${p.totalUsd} USD`;
  }
}
