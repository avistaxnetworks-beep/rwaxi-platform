// The console's map of the audit trail (pure: the audit API and the client panel share it): a Spanish label for every
// AuditAction, the category it belongs to and which categories are critical — fee and commercial-terms changes,
// contract deployments, vault documents with their SHA-256 and the compliance wallets. An on-chain confirmation
// (CHAIN_TX_CONFIRMED) takes the category of the call it confirms.
import type { AuditAction } from "@rwaxi/database";

export type AuditCategory =
  | "fees"
  | "deployments"
  | "vault"
  | "wallets"
  | "governance"
  | "compliance"
  | "subscriptions"
  | "distributions"
  | "access"
  | "onchain";

export const CATEGORY: Record<AuditCategory, { label: string; critical: boolean }> = {
  fees: { label: "Comisiones y facturación", critical: true },
  deployments: { label: "Despliegues de contratos", critical: true },
  vault: { label: "Bóveda documental (SHA-256)", critical: true },
  wallets: { label: "Wallets y whitelist de cumplimiento", critical: true },
  governance: { label: "Gobierno de plataforma", critical: false },
  compliance: { label: "KYC y cumplimiento", critical: false },
  subscriptions: { label: "Suscripciones, pagos y emisión", critical: false },
  distributions: { label: "Distribuciones", critical: false },
  access: { label: "Accesos y seguridad", critical: false },
  onchain: { label: "Confirmaciones on-chain (todas)", critical: false },
};
export const CATEGORY_KEYS = Object.keys(CATEGORY) as AuditCategory[];

export const ACTION_LABEL: Record<AuditAction, string> = {
  KYC_APPROVED: "KYC aprobado",
  KYC_REJECTED: "KYC rechazado",
  SUBSCRIPTION_CREATED: "Suscripción firmada",
  PAYMENT_CONFIRMED: "Pago fiduciario conciliado",
  CHAIN_TX_CONFIRMED: "Transacción on-chain confirmada",
  SUBSCRIPTION_MINTED: "Tokens emitidos (mint)",
  PORTAL_STATUS_CHANGED: "Estado del portal cambiado",
  ORGANIZATION_PUBLICATION_CHANGED: "Publicación en la vitrina cambiada",
  OFFERING_CAPTURE_PAUSED: "Captación pausada",
  OFFERING_CAPTURE_RESUMED: "Captación reanudada",
  FEE_TERMS_UPDATED: "Tarifas fijas actualizadas",
  FEE_INVOICED: "Factura B2B emitida",
  FEE_PAYMENT_RECORDED: "Pago de factura registrado",
  ORGANIZATION_ONBOARDED: "Desarrollador dado de alta",
  DISTRIBUTION_DECLARED: "Distribución declarada",
  LOGIN_SUCCEEDED: "Inicio de sesión",
  LOGIN_FAILED: "Inicio de sesión fallido",
  MFA_FAILED: "Código MFA fallido",
  MFA_ENROLLED: "MFA enrolado",
  ACCOUNT_LOCKED: "Cuenta bloqueada",
  LOGOUT: "Cierre de sesión",
  INVESTOR_SESSION_RECOVERED: "Sesión de inversionista recuperada",
  INVESTOR_OTP_FAILED: "Código de recuperación agotado",
  STAFF_INVITED: "Personal invitado",
  STAFF_INVITATION_RESENT: "Invitación reenviada",
  ACCOUNT_ACTIVATED: "Cuenta activada",
  DATA_ROOM_DOCUMENT_ADDED: "Documento subido al Data Room",
  DATA_ROOM_DOCUMENT_DOWNLOADED: "Documento del Data Room descargado",
  KYC_DOCUMENT_VIEWED: "Documento KYC consultado",
  VAULT_INTEGRITY_FAILED: "Falla de integridad en la bóveda",
  KYC_REVOKED: "Inversionista revocado",
  SUBSCRIPTION_CANCELLED: "Suscripción cancelada",
  INVESTOR_FREEZE_REQUESTED: "Congelamiento de wallet solicitado",
  MINTER_ROLE_REQUESTED: "MINTER_ROLE solicitado para el emisor",
  OFFERING_STATUS_CHANGED: "Estado de la oferta cambiado",
  REGISTRY_WALLETS_DECLARED: "Wallets oficiales declaradas",
  COMMERCIAL_TERMS_UPDATED: "Comisión y acuerdo comercial registrados",
  COMMERCIAL_AGREEMENT_DOWNLOADED: "Acuerdo comercial consultado",
  OFFERING_TOKEN_DEPLOYMENT_QUEUED: "Despliegue de token en cola",
  SUBSCRIPTION_PAYMENT_OPENED: "Reserva abierta a pago",
  DISTRIBUTION_PAYOUT_INSTRUCTED: "Instrucción de pago de distribución",
  DISTRIBUTION_SUPPORT_DOWNLOADED: "Soporte de distribución consultado",
  PLATFORM_REPORT_EXPORTED: "Reporte exportado desde la consola",
};

/** Where each action belongs (CHAIN_TX_CONFIRMED: by the kind it confirms, see CHAIN_KIND_CATEGORY). */
export const ACTION_CATEGORY: Record<AuditAction, AuditCategory> = {
  FEE_TERMS_UPDATED: "fees",
  COMMERCIAL_TERMS_UPDATED: "fees",
  FEE_INVOICED: "fees",
  FEE_PAYMENT_RECORDED: "fees",
  OFFERING_TOKEN_DEPLOYMENT_QUEUED: "deployments",
  DATA_ROOM_DOCUMENT_ADDED: "vault",
  DATA_ROOM_DOCUMENT_DOWNLOADED: "vault",
  KYC_DOCUMENT_VIEWED: "vault",
  VAULT_INTEGRITY_FAILED: "vault",
  COMMERCIAL_AGREEMENT_DOWNLOADED: "vault",
  DISTRIBUTION_SUPPORT_DOWNLOADED: "vault",
  REGISTRY_WALLETS_DECLARED: "wallets",
  INVESTOR_FREEZE_REQUESTED: "wallets",
  MINTER_ROLE_REQUESTED: "wallets",
  PORTAL_STATUS_CHANGED: "governance",
  ORGANIZATION_PUBLICATION_CHANGED: "governance",
  OFFERING_CAPTURE_PAUSED: "governance",
  OFFERING_CAPTURE_RESUMED: "governance",
  ORGANIZATION_ONBOARDED: "governance",
  OFFERING_STATUS_CHANGED: "governance",
  STAFF_INVITED: "governance",
  STAFF_INVITATION_RESENT: "governance",
  KYC_APPROVED: "compliance",
  KYC_REJECTED: "compliance",
  KYC_REVOKED: "compliance",
  SUBSCRIPTION_CREATED: "subscriptions",
  PAYMENT_CONFIRMED: "subscriptions",
  SUBSCRIPTION_MINTED: "subscriptions",
  SUBSCRIPTION_CANCELLED: "subscriptions",
  SUBSCRIPTION_PAYMENT_OPENED: "subscriptions",
  DISTRIBUTION_DECLARED: "distributions",
  DISTRIBUTION_PAYOUT_INSTRUCTED: "distributions",
  LOGIN_SUCCEEDED: "access",
  LOGIN_FAILED: "access",
  MFA_FAILED: "access",
  MFA_ENROLLED: "access",
  ACCOUNT_LOCKED: "access",
  LOGOUT: "access",
  ACCOUNT_ACTIVATED: "access",
  INVESTOR_SESSION_RECOVERED: "access",
  INVESTOR_OTP_FAILED: "access",
  PLATFORM_REPORT_EXPORTED: "access",
  CHAIN_TX_CONFIRMED: "onchain",
};

/** The category of a confirmed on-chain call, by its ChainTxKind; other kinds stay "onchain". */
export const CHAIN_KIND_CATEGORY: Record<string, AuditCategory> = {
  TENANT_REGISTRY_DEPLOYED: "deployments",
  OFFERING_TOKEN_DEPLOYED: "deployments",
  INVESTOR_WHITELISTED: "wallets",
  INVESTOR_REVOKED: "wallets",
  INVESTOR_FREEZE_UPDATED: "wallets",
  MINTER_ROLE_GRANTED: "wallets",
  SUBSCRIPTION_MINTED: "subscriptions",
  DATA_ROOM_ROOT_ANCHORED: "vault",
  DISTRIBUTION_ROOT_ANCHORED: "distributions",
};

/** Severe in themselves, whatever their category: integrity failures, lockouts, revocations, portal status. */
export const ALERT_ACTIONS: ReadonlySet<AuditAction> = new Set<AuditAction>([
  "VAULT_INTEGRITY_FAILED",
  "ACCOUNT_LOCKED",
  "KYC_REVOKED",
  "PORTAL_STATUS_CHANGED",
]);

export function categoryOf(action: AuditAction, chainKind?: unknown): AuditCategory {
  if (action === "CHAIN_TX_CONFIRMED") return CHAIN_KIND_CATEGORY[String(chainKind)] ?? "onchain";
  return ACTION_CATEGORY[action];
}

export const isCritical = (action: AuditAction, chainKind?: unknown) =>
  CATEGORY[categoryOf(action, chainKind)].critical || ALERT_ACTIONS.has(action);

/** What a category filter matches: its actions and, for confirmations, the chain kinds it groups ("onchain": all). */
export function membersOf(category: AuditCategory): { actions: AuditAction[]; chainKinds: string[]; allConfirmations: boolean } {
  const actions = (Object.keys(ACTION_CATEGORY) as AuditAction[]).filter((a) => a !== "CHAIN_TX_CONFIRMED" && ACTION_CATEGORY[a] === category);
  const chainKinds = Object.keys(CHAIN_KIND_CATEGORY).filter((k) => CHAIN_KIND_CATEGORY[k] === category);
  return { actions, chainKinds, allConfirmations: category === "onchain" };
}

export const AUDIT_ACTIONS = Object.keys(ACTION_LABEL) as AuditAction[];
export const isAuditAction = (v: unknown): v is AuditAction => typeof v === "string" && v in ACTION_LABEL;
export const isAuditCategory = (v: unknown): v is AuditCategory => typeof v === "string" && v in CATEGORY;
