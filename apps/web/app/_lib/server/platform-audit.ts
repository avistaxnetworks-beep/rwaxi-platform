// Platform (admin.rwaxirealestate.com) audit events: their actions and a one-line summary of the payload,
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
  "REGISTRY_WALLETS_DECLARED",
  "COMMERCIAL_TERMS_UPDATED",
  "COMMERCIAL_AGREEMENT_DOWNLOADED",
  "OFFERING_TOKEN_DEPLOYMENT_QUEUED",
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
  tenantAdmin?: string;
  complianceOfficer?: string;
  network?: string;
  /** COMMERCIAL_TERMS_UPDATED: the signed agreement it registers */
  agreement?: { reference?: string; signedOn?: string; sha256?: string };
  /** COMMERCIAL_AGREEMENT_DOWNLOADED */
  reference?: string;
  /** OFFERING_TOKEN_DEPLOYMENT_QUEUED: the fee written into the token and the reservations it will open to payment */
  platformFeeBps?: number;
  reservations?: number;
}

const ROLE_LABEL: Record<string, string> = { TENANT_ADMIN: msg("Administrador"), COMPLIANCE_OFFICER: msg("Oficial de Cumplimiento") };
const utc = (iso: unknown) => `${String(iso).slice(0, 16).replace("T", " ")} UTC`;
const short = (w: unknown) => (typeof w === "string" ? `${w.slice(0, 8)}…${w.slice(-6)}` : "—");

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
      return tr("Alta B2B · {slug}.rwaxirealestate.com · NIT {taxId} · {users} usuarios · oferta {code} · {documents} documentos", {
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
    case "REGISTRY_WALLETS_DECLARED":
      return tr("Wallets declaradas · administrador {admin} · oficial {officer} · deployTenantRegistry() en cola ({network})", {
        admin: short(p.tenantAdmin),
        officer: short(p.complianceOfficer),
        network: String(p.network),
      });
    case "COMMERCIAL_TERMS_UPDATED": {
      const bps = (v: unknown) => String((v as { platformFeeBps?: unknown } | undefined)?.platformFeeBps ?? "—");
      return tr("Acuerdo comercial {reference} ({date}) · comisión de plataforma {from} → {to} pb · SHA-256 {hash}", {
        reference: String(p.agreement?.reference),
        date: String(p.agreement?.signedOn),
        from: bps(p.from),
        to: bps(p.to),
        hash: short(p.agreement?.sha256),
      });
    }
    case "OFFERING_TOKEN_DEPLOYMENT_QUEUED":
      return tr("Token de {code} en cola · deployOfferingToken() con comisión de plataforma {bps} pb · reservas por abrir a pago: {n} ({network})", {
        code: String(p.offeringCode),
        bps: String(p.platformFeeBps),
        n: p.reservations ?? 0,
        network: String(p.network),
      });
    case "COMMERCIAL_AGREEMENT_DOWNLOADED":
      return tr("Acuerdo comercial {reference} consultado · re-hasheado contra su SHA-256", { reference: String(p.reference) });
  }
}
