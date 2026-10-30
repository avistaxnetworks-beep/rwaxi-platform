// Consolidated platform metrics (Super-Admin), shared by the server loader and client components.
import type { PlatformAuditActionKey } from "@/app/_lib/server/platform-audit";
import type { PlatformFinanceReport } from "./finance";
import type { PlatformHealthReport } from "./health";

export type FeeKindKey = "ONBOARDING_SETUP" | "MONTHLY_SAAS" | "INFRASTRUCTURE_USAGE";
export type FeeStatusKey = "ACCRUED" | "INVOICED" | "PAID" | "VOIDED";
export type PortalStatusKey = "ACTIVE" | "REVIEW" | "SUSPENDED";
export type KycKey = "no_iniciado" | "pendiente" | "aprobado" | "rechazado" | "revocado";

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
  /** platform fee fixed in the deployed token (immutable on-chain), in basis points; null if none was recorded */
  tokenFeeBps: number | null;
  tokenAddress: string | null;
  /** latest deployOfferingToken() of the offering (module A): queued, its last failure, or reverted */
  tokenTx: { status: "PENDING" | "CONFIRMED" | "REVERTED" | "CANCELLED"; error: string | null; awaitingReceipt: boolean } | null;
  /** pre-sale reservations the token's deployment will open to payment */
  reservations: number;
}

/** The latest commercial agreement signed with a developer (its PDF is served by /api/vault/agreement/{id}). */
export interface PlatformAgreementRow {
  id: string;
  reference: string;
  /** YYYY-MM-DD */
  signedOn: string;
  platformFeeBps: number;
  sha256: string;
  fileName: string;
  sizeBytes: number;
  recordedAt: string;
  recordedBy: string;
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
  /** the developer's administrator and compliance officer, with the activation state of their accounts */
  staff: PlatformStaffRow[];
  /** RwaxiComplianceRegistry (ERC-3643 identity/compliance registry) of the tenant */
  registry: PlatformRegistry;
  leads: { referral: number; direct: number };
  investors: number;
  ndas: number;
  kycApproved: number;
  kycPending: number;
  subscribed: SubscribedVolume;
  offering: { code: string; assetName: string; totalUnits: number; unitsSubscribed: number } | null;
  /** setup and SaaS in USD; the platform fee in basis points (25–500), set with a signed agreement (module A) */
  feeRules: { setupUsd: number; monthlyUsd: number; platformFeeBps: number };
  agreement: PlatformAgreementRow | null;
  /** what deploying a token (and opening a raise) still requires: registry, official wallets, compliance officer */
  tokenGaps: string[];
  feesUsd: number;
}

/** A staff account of a developer: ACTIVE (password + MFA set) or waiting on its invitation link. */
export interface PlatformStaffRow {
  id: string;
  email: string;
  fullName: string;
  role: "TENANT_ADMIN" | "COMPLIANCE_OFFICER";
  active: boolean;
  /** registered EVM wallet; null when the onboarding deferred it */
  wallet: string | null;
  status: "ACTIVE" | "PENDING" | "EXPIRED" | "NO_INVITATION";
  invitationExpiresAt: string | null;
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

/**
 * The tenant's RwaxiComplianceRegistry, from its latest deployTenantRegistry() row:
 *   DEPLOYED  the registry exists (address; `mode` says whether it is on the network or a signed simulation)
 *   PENDING   queued for RWAXI's operator: `lastError` is why the last attempt failed, `awaitingReceipt` a sent
 *             transaction whose receipt was not seen yet — «Desplegar registro» retries or reconciles it
 *   DEFERRED  onboarded without both staff wallets: deployTenantRegistry() was never queued
 *   REVERTED  the network reverted the deployment: the wallets are declared again to queue a new one
 */
export interface PlatformRegistry {
  address: string | null;
  status: "DEPLOYED" | "PENDING" | "DEFERRED" | "REVERTED";
  network: string | null;
  mode: "RPC" | "SIMULATION" | null;
  txHash: string | null;
  lastError: string | null;
  awaitingReceipt: boolean;
}

/** Module E · one AuditEvent of any developer (or of the console) as GET /api/platform/audit returns it. */
export interface AuditConsoleRow {
  id: string;
  at: string;
  /** "<ISO>|<id>": pages and live updates are keyed by it */
  cursor: string;
  action: string;
  label: string;
  /** CHAIN_TX_CONFIRMED: the kind of call it confirmed */
  chainKind: string | null;
  category: string;
  categoryLabel: string;
  critical: boolean;
  tenant: { id: string; name: string; slug: string } | null;
  actorEmail: string;
  entityType: string;
  entityId: string;
  subjectHash: string | null;
  subject: string | null;
  summary: string;
  integrity: { status: "verified" | "mismatch" | "external" | "none"; method: string };
  ipAddress: string | null;
  payload: unknown;
}

/** Module D · a yield distribution of a developer, as RWAXI supervises it (read-only). */
export interface PlatformDistributionRow {
  id: string;
  organizationId: string;
  tenant: string;
  slug: string;
  offeringCode: string;
  network: string;
  period: string;
  /** payment currency (v1 distributions: USD) */
  currency: string;
  leafVersion: number;
  /** total in the payment currency */
  amount: number;
  totalUsd: number;
  holders: number;
  totalUnits: number;
  recordDate: string | null;
  snapshotAt: string;
  snapshotMode: "SIMULATION" | "RPC" | null;
  merkleRoot: string;
  onchainId: string;
  status: "DECLARED" | "ANCHORED";
  anchor: { status: string | null; txHash: string | null; mode: "SIMULATION" | "RPC" | null };
  /** the supporting document in the developer's vault (GET /api/vault/distribution/{id} on the admin host) */
  support: { sha256: string; fileName: string; sizeBytes: number } | null;
  declaredAt: string;
  declaredBy: string | null;
  allocations: number;
  /** allocations already in a payment instruction */
  instructed: number;
  batches: {
    sequence: number;
    instructionHash: string;
    total: number;
    payees: number;
    withheld: number;
    registryMode: "SIMULATION" | "RPC";
    createdAt: string;
    createdBy: string | null;
  }[];
}

/** Module D · a distribution event of any developer (declaration, anchoring, payment instruction, support read). */
export interface PlatformDistributionEvent {
  id: string;
  at: string;
  action: string;
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
  /** module D: yield distributions of every developer and their latest events (supervision, read-only) */
  distributions: PlatformDistributionRow[];
  distributionEvents: PlatformDistributionEvent[];
  /** module F: B2B fees per developer at its agreed basis points, billing cycles and invoice tracking */
  finance: PlatformFinanceReport;
  /** module G: ERC-3643 contracts, census of issued tokens and the alerts of the chain and mail queues */
  health: PlatformHealthReport;
  /** RWAXI staff member acting in this console (demo session until MFA auth exists) */
  admin: { name: string; email: string } | null;
  /** address of RWAXI's operator key (null if not configured): never one of a tenant's registry wallets */
  operatorWallet: string | null;
  /** defaults and limits of the onboarding wizard */
  onboarding: { networks: string[]; nextOfferingCode: string };
}

export type PlatformMetricsResult = { ok: true; data: PlatformMetrics } | { ok: false; error: string };

/** `warning`: the action took effect but a later step did not (e.g. wallets declared, deployment failed). */
export type PlatformActionResult = { ok: true; message: string; warning?: true } | { ok: false; error: string };
