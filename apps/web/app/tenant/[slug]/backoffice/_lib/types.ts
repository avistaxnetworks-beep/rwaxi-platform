// View models shared by the backoffice server code and its client components (no runtime imports).
import type { PayoutCurrency } from "@rwaxi/blockchain-sdk/distribution";
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
    // decisions of the RWAXI platform (admin.rwaxirealestate.com) on this organization
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
    | "MINTER_ROLE_REQUESTED"
    // offering lifecycle (backoffice) and the registry the console queued once the team's wallets were declared
    | "OFFERING_STATUS_CHANGED"
    | "REGISTRY_WALLETS_DECLARED"
    // the commercial agreement signed with RWAXI and the platform fee it sets (console, module A)
    | "COMMERCIAL_TERMS_UPDATED"
    | "COMMERCIAL_AGREEMENT_DOWNLOADED"
    // the offering's token queued from the console, and the reservations its deployment opened to payment
    | "OFFERING_TOKEN_DEPLOYMENT_QUEUED"
    | "SUBSCRIPTION_PAYMENT_OPENED"
    // yield distributions: the payment instruction (whitelist re-checked) and the audited reads of the support
    | "DISTRIBUTION_PAYOUT_INSTRUCTED"
    | "DISTRIBUTION_SUPPORT_DOWNLOADED"
    // organization-less (console exports): never under a tenant's RLS, listed for exhaustiveness
    | "PLATFORM_REPORT_EXPORTED";
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
  /** platform fee its reconciliation accrues, in basis points: the one fixed in its offering's token on-chain (or,
   * for a token deployed before the fee existed, the agreed one) */
  platformFeeBps: number;
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
  /** platformFeeBps: the platform fee agreed with RWAXI (basis points), the one tokens deployed from now on carry */
  organization: { slug: string; legalName: string; brandColor: string; platformFeeBps: number };
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
  /** capital raising of each offering (Offering.status): only ACTIVE takes subscriptions */
  /** gaps: what opening the raise still requires (registry, official wallets, compliance officer), translated */
  raising: { registryDeployed: boolean; gaps: string[]; offerings: OfferingRaisingRow[] };
}

/** An offering in the "Estado de captación" panel. */
export interface OfferingRaisingRow {
  id: string;
  code: string;
  assetName: string;
  status: "STRUCTURING" | "ACTIVE" | "FUNDED";
  unitsSubscribed: number;
  totalUnits: number;
}

export type SubscriptionsDeskResult = { ok: true; data: SubscriptionsDeskData } | { ok: false; error: string };

/** "Distribuciones y Rendimientos": declaration of a yield distribution (amount as typed, e.g. "10000.50"). */
export interface DistributionInput {
  offeringId: string;
  /** 2026-09 or 2026-Q3 */
  period: string;
  /** cut-off date (YYYY-MM-DD, Bogotá): the holders of record are the token balances at its end (today: now) */
  recordDate: string;
  /** payment currency: COP | USD through the fiduciary, USDC | USDT from the issuer's treasury */
  currency: PayoutCurrency;
  amount: string;
  /** COP per USD, only for COP (its USD equivalent) */
  fxRate?: string;
  /** the supporting document, verified by the vault (upload purpose "distribution"): its receipt */
  support: { receipt: string; sha256: string; sizeBytes: number; fileName: string };
}

/** Why the whitelist withholds a payment today (staff only), with its label in the desk's language. */
export interface WithholdView {
  code: string;
  label: string;
}

export interface DistributionHolderRow {
  investorId: string;
  name: string;
  wallet: string;
  units: number;
  /** the whitelist today (confirmed outbox): null when it clears the wallet */
  withhold: WithholdView | null;
}

/** A confirmed mint of the offering's token: the desk replays them up to the record date the issuer picks. */
export interface DistributionMovementRow {
  investorId: string;
  name: string;
  wallet: string;
  units: number;
  /** unix seconds it took effect */
  at: number;
}

export interface DistributionAllocationRow {
  id: string;
  investorName: string;
  wallet: string;
  units: number;
  /** in the payment currency (v1: USD) */
  amount: number;
  amountUsd: number;
  leafHash: string;
  proofLength: number;
  /** the payment instruction that carries it */
  payout: { sequence: number; at: string } | null;
  /** not instructed yet: why the whitelist withholds it today (null: payable) */
  withhold: WithholdView | null;
}

export interface DistributionPayoutBatchRow {
  id: string;
  sequence: number;
  /** SHA-256 of the canonical JSON of `instruction` */
  instructionHash: string;
  /** the instruction as issued: the backoffice downloads it and anyone can re-hash it */
  instruction: unknown;
  total: number;
  payees: number;
  withheld: number;
  registryMode: "SIMULATION" | "RPC";
  createdAt: string;
  createdBy: string | null;
}

export interface DistributionRow {
  id: string;
  onchainId: string;
  period: string;
  /** payment currency (v1: the declared one, with every amount in USD) */
  currency: PayoutCurrency;
  /** 1: amounts in USD cents (declared before the payment currency); 2: in the payment currency */
  leafVersion: number;
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
  /** the cut-off date and its instant (v1: no date; the instant of the declaration) */
  recordDate: string | null;
  snapshotAt: string;
  snapshotMode: "SIMULATION" | "RPC" | null;
  /** the supporting document in the tenant's vault (GET /api/vault/distribution/{id}) */
  support: { sha256: string; fileName: string; mimeType: string; sizeBytes: number } | null;
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
  payoutBatches: DistributionPayoutBatchRow[];
  /** allocations still to instruct (with an amount), and how many the whitelist clears today */
  pendingPayouts: { allocations: number; payable: number };
}

export interface DistributionOfferingRow {
  id: string;
  code: string;
  assetName: string;
  network: string;
  token: { symbol: string; address: string; status: string };
  /** holders today: the confirmed mints of the token, one row per investor, with the whitelist today */
  holders: DistributionHolderRow[];
  mintedUnits: number;
  /** every confirmed mint of the token: the preview replays them at the record date */
  movements: DistributionMovementRow[];
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
