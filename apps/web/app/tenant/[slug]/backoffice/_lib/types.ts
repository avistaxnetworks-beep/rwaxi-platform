// View models shared by the backoffice server code and its client components (no runtime imports).

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
  action: "KYC_APPROVED" | "KYC_REJECTED" | "SUBSCRIPTION_CREATED";
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
