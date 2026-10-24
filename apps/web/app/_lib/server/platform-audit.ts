// Platform (admin.rwaxi.com) audit events: their actions and a one-line summary of the payload,
// shown in the Super-Admin console (Spanish) and in the affected tenant's backoffice audit trail.
import { msg } from "@/app/_i18n/marks";
import { spanish, type Translate } from "@/app/_i18n/translate";

export const PLATFORM_AUDIT_ACTIONS = [
  "PORTAL_STATUS_CHANGED",
  "ORGANIZATION_PUBLICATION_CHANGED",
  "OFFERING_CAPTURE_PAUSED",
  "OFFERING_CAPTURE_RESUMED",
  "FEE_TERMS_UPDATED",
  "FEE_INVOICED",
  "FEE_PAYMENT_RECORDED",
  "ORGANIZATION_ONBOARDED",
  "STAFF_INVITED",
  "STAFF_INVITATION_RESENT",
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
  slug?: string;
  taxId?: string;
  users?: unknown[];
  documents?: number;
  email?: string;
  role?: string;
  expiresAt?: string;
}

const ROLE_LABEL: Record<string, string> = { TENANT_ADMIN: msg("Administrador"), COMPLIANCE_OFFICER: msg("Oficial de Cumplimiento") };
const utc = (iso: unknown) => `${String(iso).slice(0, 16).replace("T", " ")} UTC`;

const STATUS_LABEL: Record<string, string> = { ACTIVE: msg("ACTIVO"), REVIEW: msg("EN REVISIÓN"), SUSPENDED: msg("SUSPENDIDO") };
const TERMS: [key: string, label: string, unit: string][] = [
  ["setupUsd", msg("setup"), " USD"],
  ["monthlyUsd", msg("SaaS mensual"), " USD"],
  ["usagePct", msg("uso"), " %"],
];

export function platformAuditSummary(action: PlatformAuditActionKey, raw: unknown, tr: Translate = spanish): string {
  const p = (raw ?? {}) as PlatformPayload;
  const status = (v: unknown) => (STATUS_LABEL[String(v)] ? tr(STATUS_LABEL[String(v)]!) : String(v));
  const withReason = (text: string) => (p.reason ? tr("{text} · motivo: {reason}", { text, reason: p.reason }) : text);
  switch (action) {
    case "PORTAL_STATUS_CHANGED":
      return withReason(tr("Portal {from} → {to}", { from: status(p.from), to: status(p.to) }));
    case "ORGANIZATION_PUBLICATION_CHANGED":
      return withReason(p.published ? tr("Publicado en la vitrina RWAXI") : tr("Retirado de la vitrina RWAXI"));
    case "OFFERING_CAPTURE_PAUSED":
      return withReason(tr("Captación de {code} pausada (plataforma, off-chain)", { code: String(p.offeringCode) }));
    case "OFFERING_CAPTURE_RESUMED":
      return withReason(tr("Captación de {code} reanudada", { code: String(p.offeringCode) }));
    case "FEE_TERMS_UPDATED": {
      const from = (p.from ?? {}) as Record<string, string>;
      const to = (p.to ?? {}) as Record<string, string>;
      const changes = TERMS.filter(([k]) => from[k] !== to[k]).map(([k, label, unit]) => `${tr(label)} ${from[k]}${unit} → ${to[k]}${unit}`);
      return tr("Tarifas pactadas: {changes}", { changes: changes.join(" · ") || tr("sin cambios") });
    }
    case "FEE_INVOICED":
      return tr("Factura {number} · {entries} asiento(s) · {total} USD", {
        number: String(p.invoiceNumber),
        entries: p.entries?.length ?? 0,
        total: String(p.totalUsd),
        count: p.entries?.length ?? 0,
      });
    case "FEE_PAYMENT_RECORDED":
      return tr("Pago de la factura {number} · {date} · comprobante {receipt} · {total} USD", {
        number: String(p.invoiceNumber),
        date: String(p.paidOn),
        receipt: String(p.paymentReceipt),
        total: String(p.totalUsd),
      });
    case "ORGANIZATION_ONBOARDED":
      return tr("Alta B2B · {slug}.rwaxi.com · NIT {taxId} · {users} usuarios · oferta {code} · {documents} documentos", {
        slug: String(p.slug),
        taxId: String(p.taxId),
        users: p.users?.length ?? 0,
        code: String(p.offeringCode),
        documents: p.documents ?? 0,
      });
    case "STAFF_INVITED":
    case "STAFF_INVITATION_RESENT": {
      const vars = { email: String(p.email), role: tr(ROLE_LABEL[String(p.role)] ?? String(p.role)), expires: utc(p.expiresAt) };
      return action === "STAFF_INVITED"
        ? tr("Invitación de activación enviada a {email} ({role}) · vence {expires}", vars)
        : tr("Invitación de activación reenviada a {email} ({role}) · vence {expires}", vars);
    }
  }
}
