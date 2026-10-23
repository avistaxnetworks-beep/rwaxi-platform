"use server";

/**
 * Compliance decisions of the developer's backoffice.
 *
 * Each decision is one transaction bound to the tenant resolved from the host (withTenant →
 * RLS): the KYC status change, its on-chain follow-up and the audit event commit together or
 * not at all. The browser only sends the KycCase id (and a reason index); a case of another
 * tenant is invisible under RLS and reported as not found.
 */
import { revalidatePath } from "next/cache";
import { withTenant, type KycStatus } from "@rwaxi/database";
import { LocalizedError, msg } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import type { Translate } from "@/app/_i18n/translate";
import { REJECT_REASONS } from "@/app/_lib/data/kyc";
import { requestMeta } from "@/app/_lib/server/tenant-context";
import { requireBackofficeSession } from "./_lib/session";
import type { ActionResult } from "./_lib/types";

const CUID = /^[a-z0-9]{20,40}$/i;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** Data Room access window after approval (prototype AccessGrant.ttlH). */
const GRANT_TTL_MS = 24 * 3600 * 1000;
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

const STATUS_LABEL: Record<KycStatus, string> = {
  NOT_STARTED: msg("sin iniciar"),
  PENDING: msg("pendiente"),
  APPROVED: msg("aprobado"),
  REJECTED: msg("rechazado"),
};

class DecisionError extends LocalizedError {}

function failure(e: unknown, tr: Translate): ActionResult {
  if (e instanceof LocalizedError) return { ok: false, error: render(tr, e.reason) };
  console.error("[backoffice] compliance decision failed", e);
  return { ok: false, error: tr("No se pudo registrar la decisión. Inténtalo de nuevo.") };
}

// The investor portal reflects compliance decisions too (status, Data Room grant).
const refresh = () => {
  revalidatePath("/tenant/[slug]/backoffice", "page");
  revalidatePath("/tenant/[slug]", "page");
};

/** Approve a pending KYC case: APPROVED + whitelist queued on-chain + Data Room grant + audit event. */
export async function approveInvestor(kycCaseId: string): Promise<ActionResult> {
  const tr = await requestTranslate("tenant");
  try {
    if (typeof kycCaseId !== "string" || !CUID.test(kycCaseId)) throw new DecisionError("Expediente inválido.");
    const session = await requireBackofficeSession();
    const meta = await requestMeta();
    const orgId = session.tenant.id;

    const message = await withTenant(
      orgId,
      async (tx) => {
        const kyc = await tx.kycCase.findUnique({
          where: { id: kycCaseId },
          include: { investor: true, offering: { select: { id: true, network: true } } },
        });
        if (!kyc) throw new DecisionError("Expediente no encontrado en este tenant.");
        if (kyc.status !== "PENDING") {
          throw new DecisionError("El expediente ya está {status}; recarga la bandeja.", { status: STATUS_LABEL[kyc.status] });
        }
        if (!kyc.dossierHash || !BYTES32.test(kyc.dossierHash)) {
          throw new DecisionError("El expediente no tiene un hash SHA-256 válido.");
        }
        const wallet = kyc.investor.walletAddress;
        if (!wallet || !ADDRESS.test(wallet)) throw new DecisionError("El inversionista no ha registrado una wallet.");
        if (!kyc.offering) throw new DecisionError("El expediente no está asociado a una oferta.");
        const { complianceRegistry } = await tx.organization.findUniqueOrThrow({
          where: { id: orgId },
          select: { complianceRegistry: true },
        });
        if (!complianceRegistry) throw new DecisionError("El tenant aún no tiene RwaxiComplianceRegistry desplegado.");

        const now = new Date();
        // Conditional transition: if another reviewer resolved the case first, nothing is written.
        const { count } = await tx.kycCase.updateMany({
          where: { id: kyc.id, status: "PENDING" },
          data: { status: "APPROVED", reviewedById: session.reviewer.id, reviewedAt: now, rejectionReason: null },
        });
        if (count !== 1) throw new DecisionError("Otro revisor ya resolvió este expediente; recarga la bandeja.");

        // Outbox: signed later by the tenant's compliance officer key (RwaxiComplianceRegistry.approveInvestor).
        const chainTx = await tx.chainTransaction.create({
          data: {
            organizationId: orgId,
            offeringId: kyc.offering.id,
            network: kyc.offering.network,
            kind: "INVESTOR_WHITELISTED",
            contractAddress: complianceRegistry,
            method: "approveInvestor(address,uint16,bytes32)",
            args: { wallet, countryCode: kyc.investor.countryCode, kycDossierHash: kyc.dossierHash },
            status: "PENDING",
          },
        });

        const nda = await tx.ndaAcceptance.findUnique({
          where: { offeringId_investorId: { offeringId: kyc.offering.id, investorId: kyc.investorId } },
          select: { id: true },
        });
        const grant = nda
          ? await tx.dataRoomAccessGrant.create({
              data: {
                organizationId: orgId,
                offeringId: kyc.offering.id,
                investorId: kyc.investorId,
                ndaAcceptanceId: nda.id,
                kycCaseId: kyc.id,
                grantedAt: now,
                expiresAt: new Date(now.getTime() + GRANT_TTL_MS),
              },
              select: { id: true },
            })
          : null;

        await tx.auditEvent.create({
          data: {
            organizationId: orgId,
            action: "KYC_APPROVED",
            actorUserId: session.reviewer.id,
            actorEmail: session.reviewer.email,
            entityType: "KycCase",
            entityId: kyc.id,
            subjectHash: kyc.dossierHash,
            payload: {
              investorId: kyc.investorId,
              investorName: kyc.investor.fullName,
              from: "PENDING",
              to: "APPROVED",
              wallet,
              chainTransactionId: chainTx.id,
              chainStatus: chainTx.status,
              accessGrantId: grant?.id ?? null,
            },
            ...meta,
            createdAt: now,
          },
        });
        return tr("{name} aprobado · whitelist on-chain en cola", { name: kyc.investor.fullName });
      },
      TX_OPTIONS,
    );

    refresh();
    return { ok: true, message };
  } catch (e) {
    return failure(e, tr);
  }
}

/** Reject a pending KYC case with one of the predefined reasons: REJECTED + audit event. */
export async function rejectInvestor(kycCaseId: string, reasonIndex: number): Promise<ActionResult> {
  const tr = await requestTranslate("tenant");
  try {
    if (typeof kycCaseId !== "string" || !CUID.test(kycCaseId)) throw new DecisionError("Expediente inválido.");
    const reason = Number.isInteger(reasonIndex) ? (REJECT_REASONS as string[])[reasonIndex] : undefined;
    if (!reason) throw new DecisionError("Motivo de rechazo inválido.");
    const session = await requireBackofficeSession();
    const meta = await requestMeta();
    const orgId = session.tenant.id;

    const message = await withTenant(
      orgId,
      async (tx) => {
        const kyc = await tx.kycCase.findUnique({ where: { id: kycCaseId }, include: { investor: true } });
        if (!kyc) throw new DecisionError("Expediente no encontrado en este tenant.");
        if (kyc.status !== "PENDING") {
          throw new DecisionError("El expediente ya está {status}; recarga la bandeja.", { status: STATUS_LABEL[kyc.status] });
        }

        const now = new Date();
        const { count } = await tx.kycCase.updateMany({
          where: { id: kyc.id, status: "PENDING" },
          data: { status: "REJECTED", reviewedById: session.reviewer.id, reviewedAt: now, rejectionReason: reason },
        });
        if (count !== 1) throw new DecisionError("Otro revisor ya resolvió este expediente; recarga la bandeja.");

        await tx.auditEvent.create({
          data: {
            organizationId: orgId,
            action: "KYC_REJECTED",
            actorUserId: session.reviewer.id,
            actorEmail: session.reviewer.email,
            entityType: "KycCase",
            entityId: kyc.id,
            subjectHash: kyc.dossierHash,
            payload: {
              investorId: kyc.investorId,
              investorName: kyc.investor.fullName,
              from: "PENDING",
              to: "REJECTED",
              reason,
            },
            ...meta,
            createdAt: now,
          },
        });
        return tr("Solicitud de {name} rechazada con motivo", { name: kyc.investor.fullName });
      },
      TX_OPTIONS,
    );

    refresh();
    return { ok: true, message };
  } catch (e) {
    return failure(e, tr);
  }
}
