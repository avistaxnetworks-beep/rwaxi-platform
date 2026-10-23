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
  /** capital raising paused by the platform (off-chain): no new subscriptions */
  capturePaused: boolean;
}

/**
 * A yield distribution allocated to this investor, with the Merkle proof that binds the allocation
 * (leaf = SHA-256 of its canonical JSON, see @rwaxi/blockchain-sdk/distribution) to the anchored root.
 */
export interface PersistedDistribution {
  /** DistributionAllocation id */
  id: string;
  /** bytes32 distributionId of anchorDistributionRoot() */
  distributionId: string;
  period: string;
  offeringCode: string;
  wallet: string;
  units: number;
  /** USD */
  amount: number;
  amountCents: number;
  /** whole distribution: USD, holders and token supply of the snapshot */
  totalUsd: number;
  totalUnits: number;
  holders: number;
  currency: "USD" | "COP";
  amountDeclared: number;
  fxRate: number | null;
  merkleRoot: string;
  leafHash: string;
  proof: string[];
  status: "DECLARED" | "ANCHORED";
  anchorTxHash: string | null;
  /** how the anchoring was executed (every view that shows a hash shows its mode) */
  anchorMode: "SIMULATION" | "RPC" | null;
  token: { address: string | null; network: string };
  declaredAt: string;
}

export interface PersistedJourney {
  /** governance status of this portal (Super-Admin): SUSPENDED blocks new NDA, KYC and subscriptions */
  portalStatus: "ACTIVE" | "REVIEW" | "SUSPENDED";
  /** null for an anonymous visitor (no investor session on this host) */
  investor: { name: string; email: string | null } | null;
  /** persisted Lead, or the verified pending referral of an anonymous visitor */
  lead: PersistedLead | null;
  nda: PersistedNda | null;
  kyc: PersistedKyc | null;
  grant: { id: string; at: string; ttlH: number } | null;
  holdings: PersistedHolding[];
  /** yield distributions allocated to the investor in this offering (newest first) */
  distributions: PersistedDistribution[];
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
