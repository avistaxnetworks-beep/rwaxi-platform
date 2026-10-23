// Shapes exchanged between the portal page, its Server Actions and the ported prototype UI.
// Field names follow the prototype's `journey` so the existing panels render them unchanged.

export type KycStatusView = "pendiente" | "aprobado" | "rechazado";

export interface PersistedLead {
  token: string;
  at: string;
  source: "RWAXI" | "DIRECT";
}

export interface PersistedNda {
  id: string;
  signer: string;
  email: string;
  at: string;
  hash: string;
}

export interface PersistedKyc {
  kycCaseId: string;
  status: KycStatusView;
  reason: string | null;
  dossierHash: string | null;
  wallet: string | null;
  whitelistTx: string | null;
  whitelistQueued: boolean;
}

/** A Subscription as the prototype's portfolio table renders it ("holdings"). */
export interface PersistedHolding {
  id: string;
  units: number;
  /** USD */
  capital: number;
  /** distributions paid — not tracked in the database yet */
  accrued: number;
  /** YYYY-MM-DD */
  since: string;
  status: "en_wallet" | "mint_pendiente" | "pago_pendiente" | "reservado";
  /** mint transaction hash, once confirmed on-chain */
  tx: string | null;
  /** SHA-256 of the signed subscription agreement */
  evidenceHash: string | null;
  /** reference to quote in the fiduciary transfer (SUB-XXXXXXXX) */
  paymentCode: string | null;
}

/** Offering availability as stored in PostgreSQL. */
export interface PortalOfferingState {
  code: string;
  totalUnits: number;
  unitsSubscribed: number;
  unitPriceUsd: number;
  minTicketUsd: number;
  tokenDeployed: boolean;
  tokenPaused: boolean;
}

export interface PersistedJourney {
  /** null for an anonymous visitor (no investor session on this host) */
  investor: { name: string; email: string | null } | null;
  /** persisted Lead, or the verified pending referral of an anonymous visitor */
  lead: PersistedLead | null;
  nda: PersistedNda | null;
  kyc: PersistedKyc | null;
  grant: { id: string; at: string; ttlH: number } | null;
  holdings: PersistedHolding[];
  offering: PortalOfferingState | null;
}

export type PersistedJourneyResult = { ok: true; data: PersistedJourney } | { ok: false; error: string };

export interface NdaSubmission {
  signerName: string;
  signerEmail: string;
  /** signing time used in the client-side hash (ISO 8601) */
  at: string;
  /** SHA-256 of {tenant, nit, signer, email, at, filled NDA text}, computed in the browser */
  documentHash: string;
}

export type NdaResult = { ok: true; nda: PersistedNda; lead: PersistedLead } | { ok: false; error: string };

export interface KycDocument {
  name: string;
  size: number;
  type: string;
  /** SHA-256 of the file bytes, computed in the browser (files are not uploaded yet) */
  sha256: string;
}

export interface KycSubmission {
  fullName: string;
  docType: string;
  docNumber: string;
  country: string;
  wallet: string;
  activity: string;
  activityOther: string;
  income: number | null;
  risk: string;
  docFront: KycDocument | null;
  docBack: KycDocument | null;
  liveness: string;
  noPep: boolean;
  dataPolicy: boolean;
  terms: boolean;
  sarlaft: boolean;
  ptee: boolean;
  listas: boolean;
}

export type KycResult = { ok: true; kyc: PersistedKyc } | { ok: false; error: string };

export interface SubscriptionSubmission {
  units: number;
  /** the three acknowledgements of the subscription contract modal */
  acknowledgments: { contract: boolean; risk: boolean; layers: boolean };
}

export type SubscriptionResult =
  | { ok: true; message: string; holding: PersistedHolding; holdings: PersistedHolding[]; offering: PortalOfferingState }
  | { ok: false; error: string };
