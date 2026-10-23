// Consolidated platform metrics (Super-Admin), shared by the server loader and client components.

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

export interface PlatformTenantRow {
  slug: string;
  displayName: string;
  legalName: string;
  portalStatus: PortalStatusKey;
  published: boolean;
  onboardedAt: string;
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
  tenant: { slug: string; displayName: string; legalName: string };
  kind: FeeKindKey;
  status: FeeStatusKey;
  amountUsd: number;
  baseUsd: number | null;
  period: string | null;
  accruedOn: string;
  evidence: string;
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
  };
  tenants: PlatformTenantRow[];
  referrals: ReferralRow[];
  ledger: LedgerRow[];
}

export type PlatformMetricsResult = { ok: true; data: PlatformMetrics } | { ok: false; error: string };
