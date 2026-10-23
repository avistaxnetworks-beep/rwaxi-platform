// Consolidated platform metrics (Super-Admin), shared by the server loader and client components.
import type { PlatformAuditActionKey } from "@/app/_lib/server/platform-audit";

export type FeeKindKey = "ONBOARDING_SETUP" | "MONTHLY_SAAS" | "INFRASTRUCTURE_USAGE";
export type FeeStatusKey = "ACCRUED" | "INVOICED" | "PAID";
export type PortalStatusKey = "ACTIVE" | "REVIEW" | "SUSPENDED";
export type KycKey = "no_iniciado" | "pendiente" | "aprobado" | "rechazado";

export type FeeTotals = Record<FeeStatusKey, number> & { total: number };

export interface SubscribedVolume {
  count: number;
  units: number;
  /** all non-cancelled subscriptions, USD */
  capitalUsd: number;
  mintedUsd: number;
  /** payment reconciled, mintSubscription() queued (MINT_PENDING) */
  pendingUsd: number;
  /** agreement signed, fiduciary payment not reconciled yet (PAYMENT_PENDING) */
  paymentPendingUsd: number;
  reservedUsd: number;
}

export interface PlatformOfferingRow {
  id: string;
  code: string;
  assetName: string;
  published: boolean;
  /** platform pause of capital raising (ISO), null while open */
  capturePausedAt: string | null;
  tokenStatus: "NOT_DEPLOYED" | "DEPLOYING" | "DEPLOYED" | "PAUSED" | null;
  tokenSymbol: string | null;
}

export interface PlatformTenantRow {
  id: string;
  slug: string;
  displayName: string;
  legalName: string;
  taxId: string;
  regime: "SAGRILAFT_PTEE" | "SARLAFT";
  customDomain: string | null;
  portalStatus: PortalStatusKey;
  published: boolean;
  onboardedAt: string;
  offerings: PlatformOfferingRow[];
  /** RwaxiComplianceRegistry of the tenant: deployed, queued for RWAXI's operator, or none */
  registry: { address: string | null; status: "DEPLOYED" | "PENDING" | "NONE"; network: string | null };
  leads: { referral: number; direct: number };
  investors: number;
  ndas: number;
  kycApproved: number;
  kycPending: number;
  subscribed: SubscribedVolume;
  offering: { code: string; assetName: string; totalUnits: number; unitsSubscribed: number } | null;
  feeRules: { setupUsd: number; monthlyUsd: number; usagePct: number };
  feesUsd: number;
}

export interface ReferralRow {
  id: string;
  tenant: { slug: string; displayName: string };
  token: string;
  landedAt: string;
  investorName: string | null;
  nda: boolean;
  kyc: KycKey;
  subscribedUsd: number;
}

export interface LedgerRow {
  id: string;
  organizationId: string;
  tenant: { slug: string; displayName: string; legalName: string };
  kind: FeeKindKey;
  status: FeeStatusKey;
  amountUsd: number;
  baseUsd: number | null;
  period: string | null;
  accruedOn: string;
  evidence: string;
  invoice: { id: string; number: string; paid: boolean } | null;
}

export interface InvoiceRow {
  id: string;
  number: string;
  organizationId: string;
  tenant: { slug: string; displayName: string; legalName: string };
  /** YYYY-MM-DD */
  issuedOn: string;
  totalUsd: number;
  entries: number;
  paidOn: string | null;
  paymentReceipt: string | null;
}

export type PlatformAuditAction = PlatformAuditActionKey;

export interface PlatformAuditRow {
  id: string;
  at: string;
  action: PlatformAuditAction;
  tenant: string;
  actorEmail: string;
  summary: string;
  subjectHash: string | null;
}

export interface PlatformMetrics {
  generatedAt: string;
  totals: {
    organizations: number;
    activeOrganizations: number;
    published: number;
    leads: { referral: number; direct: number };
    investors: number;
    kycApproved: number;
    subscribed: SubscribedVolume;
    fees: Record<FeeKindKey, FeeTotals>;
    feesAll: FeeTotals;
    /** monthly SaaS fees of portals that are not suspended */
    mrrUsd: number;
  };
  tenants: PlatformTenantRow[];
  referrals: ReferralRow[];
  ledger: LedgerRow[];
  invoices: InvoiceRow[];
  audit: PlatformAuditRow[];
  /** RWAXI staff member acting in this console (demo session until MFA auth exists) */
  admin: { name: string; email: string } | null;
  /** defaults and limits of the onboarding wizard */
  onboarding: { networks: string[]; nextOfferingCode: string };
}

export type PlatformMetricsResult = { ok: true; data: PlatformMetrics } | { ok: false; error: string };

export type PlatformActionResult = { ok: true; message: string } | { ok: false; error: string };
