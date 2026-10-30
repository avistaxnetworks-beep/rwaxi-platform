// Pure: whether an AuditEvent's subjectHash still matches what it seals, recomputed from the event itself (or from the
// signed transaction it confirms). The audit table is append-only for the app roles; this check detects a row altered
// by anyone with more privileges than the app (e.g. the database owner).
import { toOnchainId } from "@rwaxi/blockchain-sdk";
import { evidenceHash } from "@rwaxi/blockchain-sdk/canonical";
import { buildMerkleTree } from "@rwaxi/blockchain-sdk/merkle";
import type { AuditAction } from "@rwaxi/database";
import { keccak256 } from "viem";

export type IntegrityStatus = "verified" | "mismatch" | "external" | "none";
export interface Integrity {
  status: IntegrityStatus;
  /** how the seal was recomputed, or what it refers to */
  method: string;
}

/** Decisions of the Super-Admin console: sealed as evidenceHash({ action, organizationId, entityId, ...payload }). */
export const CONSOLE_SEALED: ReadonlySet<AuditAction> = new Set<AuditAction>([
  "PORTAL_STATUS_CHANGED",
  "ORGANIZATION_PUBLICATION_CHANGED",
  "OFFERING_CAPTURE_PAUSED",
  "OFFERING_CAPTURE_RESUMED",
  "FEE_TERMS_UPDATED",
  "FEE_INVOICED",
  "FEE_PAYMENT_RECORDED",
  "ORGANIZATION_ONBOARDED",
  "STAFF_INVITED",
  "STAFF_INVITATION_RESENT",
  "REGISTRY_WALLETS_DECLARED",
  "COMMERCIAL_TERMS_UPDATED",
  "OFFERING_TOKEN_DEPLOYMENT_QUEUED",
]);

export interface SealedEvent {
  action: AuditAction;
  organizationId: string | null;
  entityId: string;
  subjectHash: string | null;
  payload: unknown;
}

const objectOf = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const verdict = (expected: string, actual: string, method: string): Integrity => ({
  status: expected.toLowerCase() === actual.toLowerCase() ? "verified" : "mismatch",
  method,
});

/**
 * Recomputes the seal of an event where the event carries what it seals:
 *   console decisions                 evidenceHash({ action, organizationId, entityId, ...payload })
 *   SUBSCRIPTION_CREATED              evidenceHash(payload.agreement) — the agreement the investor signed
 *   PAYMENT_CONFIRMED                 the paymentEvidenceRef: evidenceHash({ version, kind, subscriptionId, agreementHash,
 *                                     paymentReference })
 *   DISTRIBUTION_DECLARED             the Merkle root of payload.allocations[].leaf
 *   DISTRIBUTION_PAYOUT_INSTRUCTED    evidenceHash(payload.instruction)
 *   CHAIN_TX_CONFIRMED (SIMULATION)   keccak256 of the signed transaction it confirmed
 * Anything else seals evidence kept elsewhere (a document's bytes, a KYC dossier, a receipt on a network): "external".
 */
export function integrityOf(e: SealedEvent, chainTx?: { signedTransaction: string | null; executionMode: string | null } | null): Integrity {
  if (!e.subjectHash) return { status: "none", method: "sin sello" };
  const p = objectOf(e.payload) ?? {};
  if (CONSOLE_SEALED.has(e.action)) {
    return verdict(
      evidenceHash({ action: e.action, organizationId: e.organizationId, entityId: e.entityId, ...p }),
      e.subjectHash,
      "evidenceHash(acción, organización, entidad y payload)",
    );
  }
  switch (e.action) {
    case "SUBSCRIPTION_CREATED":
      if (objectOf(p.agreement)) return verdict(evidenceHash(p.agreement), e.subjectHash, "evidenceHash del acuerdo de suscripción firmado");
      break;
    case "PAYMENT_CONFIRMED":
      if (typeof p.agreementHash === "string" && typeof p.paymentReference === "string") {
        const ref = evidenceHash({
          version: 1,
          kind: "rwaxi.subscription.payment",
          subscriptionId: toOnchainId(e.entityId),
          agreementHash: p.agreementHash,
          paymentReference: p.paymentReference,
        });
        return verdict(ref, e.subjectHash, "paymentEvidenceRef (suscripción, acuerdo y comprobante)");
      }
      break;
    case "DISTRIBUTION_DECLARED": {
      const leaves = Array.isArray(p.allocations) ? p.allocations.map((a) => objectOf(a)?.leaf).filter((l): l is string => typeof l === "string") : [];
      if (leaves.length && leaves.length === (p.allocations as unknown[]).length) {
        return verdict(buildMerkleTree(leaves).root, e.subjectHash, "raíz de Merkle de las hojas de las asignaciones");
      }
      break;
    }
    case "DISTRIBUTION_PAYOUT_INSTRUCTED":
      if (objectOf(p.instruction)) return verdict(evidenceHash(p.instruction), e.subjectHash, "evidenceHash de la instrucción de pago");
      break;
    case "CHAIN_TX_CONFIRMED":
      if (chainTx?.executionMode === "SIMULATION" && chainTx.signedTransaction) {
        return verdict(keccak256(chainTx.signedTransaction as `0x${string}`), e.subjectHash, "keccak256 de la transacción firmada");
      }
      return { status: "external", method: chainTx?.executionMode === "RPC" ? "recibo en la red" : "transacción on-chain" };
  }
  return { status: "external", method: "SHA-256 de evidencia externa (documento, expediente o transacción)" };
}
