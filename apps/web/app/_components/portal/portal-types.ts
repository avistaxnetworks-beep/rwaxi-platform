// What the typed panels of the investor portal read: the prototype's developer and project (app/_lib/data) and the
// journey, which merges the prototype's shape with what the server persisted (tenant/[slug]/_lib/journey-types.ts).
// Only the fields these panels use; the untyped prototype objects satisfy them as they are.
import type {
  KycStatusView,
  PersistedDistribution,
  PersistedHolding,
  PersistedLead,
  PortalOfferingState,
} from "@/app/tenant/[slug]/_lib/journey-types";

export type RegimeKey = "sagrilaft" | "sarlaft";
export type Currency = "COP" | "USD";

/** The developer of the portal (prototype tenant object, or a tenant onboarded in PostgreSQL). */
export interface PortalTenant {
  slug: string;
  displayName: string;
  legalName: string;
  nit: string;
  color: string;
  logo?: string | null;
  regime: RegimeKey;
  portalStatus?: string;
  /** compliance templates per regime: the binding Spanish text of the developer */
  complianceTpl: Record<RegimeKey, string>;
  tokenPaused: boolean;
  mint: { status: string; symbol: string; network: string };
}

/** The offering as the portal shows it (prototype project, localized commercial copy). */
export interface PortalProject {
  id: string;
  code: string;
  asset: string;
  /** minimum ticket (USD) and unit price (USD) */
  ticket: number;
  unit: number;
  /** legal wrapper, a catalogue message */
  wrapper: string;
  /** the issuing vehicle (legal entity) */
  vehicle: string;
}

/** A signed NDA: the prototype's ConsentRecord or the persisted NdaAcceptance. */
export interface PortalNda {
  id?: string;
  signer?: string;
  email: string;
  at: string;
  hash: string;
}

export interface PortalKyc {
  /** the wizard while it is filled in, then the status of the case */
  stage: "form" | "status";
  step: number;
  /** the wizard's fields (EMPTY_KYC) */
  data: Record<string, unknown>;
  status: KycStatusView | null;
  /** rejection reason (catalogue message); a revocation's ground never reaches the portal */
  reason: string | null;
  dossierHash?: string | null;
  kycCaseId?: string;
  wallet?: string | null;
  whitelistTx: string | null;
  whitelistQueued?: boolean;
}

export interface PortalJourney {
  lead: PersistedLead | null;
  nda: PortalNda | null;
  kyc: PortalKyc;
  /** eligibility to subscribe issued with the KYC approval (the Data Room opens with the NDA alone) */
  grant: { id: string; at: string; ttlH: number } | null;
  holdings: PersistedHolding[];
  distributions?: PersistedDistribution[];
  /** availability and token state from PostgreSQL (null in the prototype's demo) */
  offering?: PortalOfferingState | null;
  /** the investor's wallet is frozen (or being frozen) by the compliance officer: no new subscription */
  frozen?: boolean;
}

/** The four steps of the funnel, in order: NDA → Data Room → KYC → subscription. */
export const STEP = { nda: 0, dataRoom: 1, kyc: 2, subscription: 3 } as const;
export type StepIndex = (typeof STEP)[keyof typeof STEP];
