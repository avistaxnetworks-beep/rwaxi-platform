// View models shared by the backoffice server code and its client components (no runtime imports).
import type { ChainQueueItem } from "@/app/_lib/chain-queue-types";

/** KYC status keys used by the prototype UI (KYC_LABEL). */
export type KycView = "no_iniciado" | "pendiente" | "aprobado" | "rechazado";
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
  /** From KycCase.evidence (portal submissions): uploaded files, hashed in the browser. */
  documents: { kind: string; name: string; sha256: string }[];
  liveness: string | null;
  whitelist: { status: "PENDING" | "CONFIRMED" | "REVERTED"; txHash: string | null } | null;
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
    | "FEE_PAYMENT_RECORDED";
  actorEmail: string;
  investorName: string;
  subjectHash: string | null;
  detail: string | null;
}

export interface ComplianceInboxData {
  organization: { slug: string; legalName: string; brandColor: string; regime: RegimeKey };
  reviewer: { name: string; email: string };
  rows: ComplianceRow[];
  audit: AuditEntry[];
}

export type ComplianceInboxResult = { ok: true; data: ComplianceInboxData } | { ok: false; error: string };

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

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
  mint: { chainTxId: string; status: "PENDING" | "CONFIRMED" | "REVERTED"; blockedReason: string | null } | null;
  /** why the payment cannot be confirmed yet (token not deployed or paused) */
  paymentBlocker: string | null;
}

export interface SubscriptionsDeskData {
  organization: { slug: string; legalName: string; brandColor: string; feeUsagePct: number };
  admin: { name: string; email: string };
  execution: { mode: "SIMULATION" | "RPC"; operator: string | null };
  subscriptions: SubscriptionRow[];
  /** PENDING ChainTransaction rows in execution order (oldest first) */
  queue: ChainQueueItem[];
  /** latest confirmed rows, newest first */
  recent: ChainQueueItem[];
  fees: { accruedUsd: number; entries: number };
  audit: AuditEntry[];
}

export type SubscriptionsDeskResult = { ok: true; data: SubscriptionsDeskData } | { ok: false; error: string };
