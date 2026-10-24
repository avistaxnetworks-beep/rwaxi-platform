// View models shared by the backoffice server code and its client components (no runtime imports).
import type { ChainQueueItem, WalletCall } from "@/app/_lib/chain-queue-types";

/** KYC status keys used by the prototype UI (KYC_LABEL). */
export type KycView = "no_iniciado" | "pendiente" | "aprobado" | "rechazado" | "revocado";
export type RegimeKey = "sagrilaft" | "sarlaft";
export type RiskKey = "conservador" | "moderado" | "dinamico";

export interface ComplianceRow {
  investorId: string;
  kycCaseId: string | null;
  name: string;
  doc: string;
  source: "RWAXI" | "DIRECT";
  token: string | null;
  /** YYYY-MM-DD of the lead landing */
  at: string;
  nda: boolean;
  kyc: KycView;
  lists: string;
  activity: string | null;
  incomeBracket: number | null;
  risk: RiskKey | null;
  isPep: boolean;
  ptee: boolean;
  wallet: string | null;
  dossierHash: string | null;
  /** From KycCase.evidence (portal submissions): files verified by the DocumentVault; `stored` = file in the vault */
  documents: { kind: string; name: string; sha256: string; stored: boolean }[];
  liveness: string | null;
  whitelist: { status: ChainQueueItem["status"]; txHash: string | null } | null;
  /** revocation of the approved case: backoffice only, never shown to the investor */
  revocation: { at: string; by: string | null; reason: string; note: string } | null;
  /** tokens minted to the investor's wallet */
  mintedUnits: number;
  /** what a revocation would cancel: subscriptions not minted yet (paid = payment already reconciled) */
  openSubscriptions: { count: number; units: number; paid: number };
  /** the wallet in the tenant's registry, from the confirmed on-chain history */
  registry: { approved: boolean; frozen: boolean };
  /** registry calls of the wallet still queued (inFlight: sent, receipt not seen yet) */
  pendingRegistry: { kind: string; inFlight: boolean }[];
  /** the latest freeze decision recorded for the investor */
  lastFreeze: { frozen: boolean; note: string; at: string } | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  action:
    | "KYC_APPROVED"
    | "KYC_REJECTED"
    | "SUBSCRIPTION_CREATED"
    | "PAYMENT_CONFIRMED"
    | "CHAIN_TX_CONFIRMED"
    | "SUBSCRIPTION_MINTED"
    // decisions of the RWAXI platform (admin.rwaxi.com) on this organization
    | "PORTAL_STATUS_CHANGED"
    | "ORGANIZATION_PUBLICATION_CHANGED"
    | "OFFERING_CAPTURE_PAUSED"
    | "OFFERING_CAPTURE_RESUMED"
    | "FEE_TERMS_UPDATED"
    | "FEE_INVOICED"
    | "FEE_PAYMENT_RECORDED"
    | "ORGANIZATION_ONBOARDED"
    | "DISTRIBUTION_DECLARED"
    // staff authentication of this tenant's backoffice, and investor session recovery
    | "LOGIN_SUCCEEDED"
    | "LOGIN_FAILED"
    | "MFA_FAILED"
    | "MFA_ENROLLED"
    | "ACCOUNT_LOCKED"
    | "LOGOUT"
    | "INVESTOR_SESSION_RECOVERED"
    | "INVESTOR_OTP_FAILED"
    // staff accounts invited by RWAXI and activated here
    | "STAFF_INVITED"
    | "STAFF_INVITATION_RESENT"
    | "ACCOUNT_ACTIVATED"
    // DocumentVault: verified uploads and audited access to files
    | "DATA_ROOM_DOCUMENT_ADDED"
    | "DATA_ROOM_DOCUMENT_DOWNLOADED"
    | "KYC_DOCUMENT_VIEWED"
    | "VAULT_INTEGRITY_FAILED"
    // compliance after approval and the issuer's own minting
    | "KYC_REVOKED"
    | "SUBSCRIPTION_CANCELLED"
    | "INVESTOR_FREEZE_REQUESTED"
    | "MINTER_ROLE_REQUESTED";
  actorEmail: string;
  investorName: string;
  subjectHash: string | null;
  detail: string | null;
}

/** Who looks at a desk: the demo session or a signed-in staff member, and whether their role may act there. */
export interface DeskSession {
  demo: boolean;
  canAct: boolean;
  role: "COMPLIANCE_OFFICER" | "TENANT_ADMIN" | "TENANT_ANALYST";
}

export interface ComplianceInboxData {
  organization: { slug: string; legalName: string; brandColor: string; regime: RegimeKey };
  reviewer: { name: string; email: string };
  session: DeskSession;
  rows: ComplianceRow[];
  audit: AuditEntry[];
}

export type ComplianceInboxResult = { ok: true; data: ComplianceInboxData } | { ok: false; error: string };

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/** EIP-1193: the call the browser wallet must sign (prepareWalletTransaction). */
export type WalletPrepareResult = { ok: true; call: WalletCall } | { ok: false; error: string };
/** EIP-1193: the outcome of the hash the wallet returned; `pending` = sent, no receipt yet. */
export type WalletConfirmResult = { ok: true; message: string; pending: boolean; txHash: string } | { ok: false; error: string };

export type QueueRunResult =
  | { ok: true; message: string; executed: number; skipped: { id: string; kind: string; reason: string }[] }
  | { ok: false; error: string };

export type SubscriptionView = "RESERVED" | "PAYMENT_PENDING" | "MINT_PENDING" | "MINTED" | "CANCELLED";

export interface SubscriptionRow {
  id: string;
  investorName: string;
  doc: string;
  wallet: string | null;
  offeringCode: string;
  assetName: string;
  units: number;
  capitalUsd: number;
  status: SubscriptionView;
  createdAt: string;
  /** reference the investor was asked to put on the fiduciary transfer (SUB-XXXXXXXX) */
  paymentCode: string | null;
  /** SHA-256 of the canonical subscription agreement signed in the portal */
  agreementHash: string | null;
  paymentReference: string | null;
  paymentConfirmedAt: string | null;
  paymentConfirmedBy: string | null;
  paymentEvidenceRef: string | null;
  mintTxHash: string | null;
  /** the queued mintSubscription() of this subscription, when there is one */
  mint: { chainTxId: string; status: ChainQueueItem["status"]; blockedReason: string | null } | null;
  /** why the payment cannot be confirmed yet (token not deployed or paused) */
  paymentBlocker: string | null;
  /** a cancelled subscription (its units went back to the offering); refundDue = its payment had been reconciled */
  cancellation: { at: string; reason: string | null; refundDue: boolean } | null;
}

/** What the token says about the administrator's own wallet: may it sign this token's mints itself? */
export type IssuerMinterState =
  /** the wallet holds MINTER_ROLE: it can sign its mints with EIP-1193 */
  | "minter"
  /** it holds DEFAULT_ADMIN_ROLE and may grant itself MINTER_ROLE */
  | "grantable"
  /** grantRole(MINTER_ROLE) for it waits in the queue */
  | "pending"
  /** it is not the token's DEFAULT_ADMIN_ROLE */
  | "not-admin"
  /** the token could not be read on the network */
  | "unreadable";

export interface IssuerMinterToken {
  offeringId: string;
  offeringCode: string;
  token: string;
  network: string;
  state: IssuerMinterState;
  /** the queued grantRole(MINTER_ROLE) of this wallet, while it is pending */
  chainTxId: string | null;
  /** why the token could not be read */
  detail: string | null;
}

/** RPC mode only: the optional MINTER_ROLE of the administrator's registered wallet, token by token. */
export interface IssuerMintPanel {
  /** the registered wallet of the administrator looking at the desk (null: none registered) */
  wallet: string | null;
  tokens: IssuerMinterToken[];
}

export interface SubscriptionsDeskData {
  organization: { slug: string; legalName: string; brandColor: string; feeUsagePct: number };
  admin: { name: string; email: string };
  session: DeskSession;
  execution: { mode: "SIMULATION" | "RPC"; operator: string | null };
  subscriptions: SubscriptionRow[];
  /** PENDING ChainTransaction rows in execution order (oldest first) */
  queue: ChainQueueItem[];
  /** latest confirmed rows, newest first */
  recent: ChainQueueItem[];
  fees: { accruedUsd: number; entries: number };
  audit: AuditEntry[];
  /** RPC mode: may the issuer sign its own mints? (null in simulation, where RWAXI's demo key signs the queue) */
  issuerMint: IssuerMintPanel | null;
}

export type SubscriptionsDeskResult = { ok: true; data: SubscriptionsDeskData } | { ok: false; error: string };

/** "Distribuciones y Rendimientos": declaration of a yield distribution (amount as typed, e.g. "10000.50"). */
export interface DistributionInput {
  offeringId: string;
  /** 2026-09 or 2026-Q3 */
  period: string;
  currency: "USD" | "COP";
  amount: string;
  /** COP per USD, only for COP declarations */
  fxRate?: string;
}

export interface DistributionHolderRow {
  investorId: string;
  name: string;
  wallet: string;
  units: number;
}

export interface DistributionAllocationRow {
  investorName: string;
  wallet: string;
  units: number;
  amountUsd: number;
  leafHash: string;
  proofLength: number;
}

export interface DistributionRow {
  id: string;
  onchainId: string;
  period: string;
  currency: "USD" | "COP";
  amountDeclared: number;
  fxRate: number | null;
  totalUsd: number;
  holders: number;
  totalUnits: number;
  merkleRoot: string;
  status: "DECLARED" | "ANCHORED";
  anchorTxHash: string | null;
  declaredAt: string;
  declaredBy: string | null;
  /** the queued anchorDistributionRoot() and how it was (or can be) executed */
  anchor: {
    chainTxId: string;
    status: ChainQueueItem["status"];
    mode: "SIMULATION" | "RPC" | null;
    blockedReason: string | null;
    /** sent and awaiting its receipt (RPC): the hash and the wallet that sent it */
    txHash: string | null;
    signer: string | null;
  } | null;
  allocations: DistributionAllocationRow[];
}

export interface DistributionOfferingRow {
  id: string;
  code: string;
  assetName: string;
  network: string;
  token: { symbol: string; address: string; status: string };
  /** current snapshot: MINTED units per investor */
  holders: DistributionHolderRow[];
  mintedUnits: number;
  distributions: DistributionRow[];
}

export interface DistributionsDeskData {
  organization: { slug: string; legalName: string; brandColor: string };
  admin: { name: string; email: string };
  session: DeskSession;
  execution: { mode: "SIMULATION" | "RPC"; operator: string | null };
  /** default COP per USD for COP declarations (demo TRM) */
  fxRate: number;
  offerings: DistributionOfferingRow[];
  audit: AuditEntry[];
}

export type DistributionsDeskResult = { ok: true; data: DistributionsDeskData } | { ok: false; error: string };

/** A Data Room document as the backoffice lists it, with whether its file is in the DocumentVault. */
export interface DataRoomDocumentRow {
  id: string;
  folder: string;
  name: string;
  restricted: boolean;
  /** 0x + SHA-256 (Merkle leaf) */
  sha256: string;
  sizeBytes: number;
  mimeType: string | null;
  stored: boolean;
  uploadedAt: string;
}

export interface DataRoomOfferingRow {
  id: string;
  code: string;
  assetName: string;
  /** Merkle root of the documents (Offering.dataRoomRoot) */
  root: string | null;
  tokenDeployed: boolean;
  /** last root confirmed on the token (updateDataRoomMerkleRoot) */
  anchoredRoot: string | null;
  /** an updateDataRoomMerkleRoot() waits in the queue (signed by the issuer) */
  anchorPending: boolean;
  documents: DataRoomDocumentRow[];
}

export interface DataRoomDeskData {
  session: DeskSession;
  folders: string[];
  offerings: DataRoomOfferingRow[];
}

export type DataRoomDeskResult = { ok: true; data: DataRoomDeskData } | { ok: false; error: string };
