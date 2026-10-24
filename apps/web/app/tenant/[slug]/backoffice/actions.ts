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
import { evidenceHash } from "@rwaxi/blockchain-sdk/canonical";
import { withTenant, type KycStatus, type Prisma } from "@rwaxi/database";
import { LocalizedError, msg } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import type { Translate } from "@/app/_i18n/translate";
import { REJECT_REASONS, REVOCATION_REASONS } from "@/app/_lib/data/kyc";
import { REGISTRY_KINDS, loadChainState, registryEntry } from "@/app/_lib/server/chain-invariants";
import { walletOf } from "@/app/_lib/server/chain-queue";
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
  REVOKED: msg("revocado"),
};
/** Length of the officer's justification of a revocation or a freeze. */
const NOTE = { min: 10, max: 300 };
const cleanNote = (raw: unknown) => (typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "");
/** Subscriptions a revocation cancels: every one whose tokens were not minted yet. */
const OPEN_SUBSCRIPTIONS = ["RESERVED", "PAYMENT_PENDING", "MINT_PENDING"] as const;

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

/**
 * Revokes an approved investor (COMPLIANCE_OFFICER), with a ground from REVOCATION_REASONS and the officer's
 * justification — in one transaction: the case becomes REVOKED, the Data Room grants are revoked, every subscription
 * whose tokens were not minted is CANCELLED (its committed units released, its unsent mintSubscription() withdrawn,
 * its accrued usage fee voided), an approveInvestor() never sent is withdrawn and a confirmed whitelisting is undone
 * with revokeInvestor() queued for the officer's wallet; KYC_REVOKED and one SUBSCRIPTION_CANCELLED per subscription
 * are recorded. Refused while a transaction of the investor is in flight on the network (it could still land).
 */
export async function revokeInvestor(kycCaseId: string, reasonIndex: number, note: string): Promise<ActionResult> {
  const tr = await requestTranslate("tenant");
  try {
    if (typeof kycCaseId !== "string" || !CUID.test(kycCaseId)) throw new DecisionError("Expediente inválido.");
    const reason = Number.isInteger(reasonIndex) ? (REVOCATION_REASONS as string[])[reasonIndex] : undefined;
    if (!reason) throw new DecisionError("Motivo de revocación inválido.");
    const justification = cleanNote(note);
    if (justification.length < NOTE.min || justification.length > NOTE.max) {
      throw new DecisionError("Justifica la decisión (entre {min} y {max} caracteres).", NOTE);
    }
    const session = await requireBackofficeSession("COMPLIANCE_OFFICER");
    const meta = await requestMeta();
    const orgId = session.tenant.id;

    const message = await withTenant(
      orgId,
      async (tx) => {
        const found = await tx.kycCase.findUnique({ where: { id: kycCaseId }, select: { investorId: true } });
        if (!found) throw new DecisionError("Expediente no encontrado en este tenant.");
        // Serialises with subscribe() (it locks the investor too): no subscription slips in meanwhile.
        await tx.$queryRaw`SELECT id FROM investors WHERE id = ${found.investorId} FOR UPDATE`;
        const kyc = await tx.kycCase.findUniqueOrThrow({ where: { id: kycCaseId }, include: { investor: true } });
        if (kyc.status !== "APPROVED") {
          throw new DecisionError("Sólo se revoca un inversionista aprobado; el expediente está {status}.", {
            status: STATUS_LABEL[kyc.status],
          });
        }
        const wallet = kyc.investor.walletAddress?.toLowerCase() ?? null;
        const state = await loadChainState(tx);
        const ofInvestor = state.txs.filter(
          (t) => t.status === "PENDING" && (REGISTRY_KINDS.has(t.kind) || t.kind === "SUBSCRIPTION_MINTED") && !!wallet && walletOf(t.args) === wallet,
        );
        const inFlight = ofInvestor.find((t) => t.executionMode);
        if (inFlight) {
          throw new DecisionError(
            "Hay una transacción de este inversionista en curso en la red ({fn} · {hash}): concíliala antes de revocar.",
            { fn: inFlight.method.split("(")[0] ?? inFlight.method, hash: inFlight.txHash ? `${inFlight.txHash.slice(0, 10)}…` : "—" },
          );
        }

        const now = new Date();
        const revoked = await tx.kycCase.updateMany({
          where: { id: kyc.id, status: "APPROVED" },
          data: { status: "REVOKED", revokedAt: now, revokedById: session.reviewer.id, revocationReason: reason, revocationNote: justification },
        });
        if (revoked.count !== 1) throw new DecisionError("Otro revisor ya resolvió este expediente; recarga la bandeja.");

        const grants = await tx.dataRoomAccessGrant.updateMany({
          where: { investorId: kyc.investorId, revokedAt: null },
          data: { revokedAt: now },
        });

        // Subscriptions whose tokens were not minted: cancelled, their units back to the offering.
        const open = await tx.subscription.findMany({
          where: { investorId: kyc.investorId, status: { in: [...OPEN_SUBSCRIPTIONS] } },
          select: { id: true, offeringId: true, onchainId: true, units: true, capitalUsd: true, status: true, paymentConfirmedAt: true },
        });
        for (const sub of open) {
          const done = await tx.subscription.updateMany({
            where: { id: sub.id, status: sub.status },
            data: { status: "CANCELLED", cancelledAt: now, cancellationReason: "KYC_REVOKED" },
          });
          if (done.count !== 1) throw new DecisionError("Una suscripción del inversionista cambió mientras se revocaba; vuelve a intentarlo.");
        }
        const unitsByOffering = new Map<string, number>();
        for (const sub of open) unitsByOffering.set(sub.offeringId, (unitsByOffering.get(sub.offeringId) ?? 0) + sub.units);
        for (const [offeringId, units] of unitsByOffering) {
          const released = await tx.$executeRaw`
            UPDATE offerings SET units_subscribed = units_subscribed - ${units}::int
             WHERE id = ${offeringId} AND units_subscribed >= ${units}::int`;
          if (released !== 1) throw new DecisionError("No se pudieron liberar las unidades comprometidas de la oferta.");
        }
        // Their mintSubscription() never sent: withdrawn. Their accrued usage fee: voided (no emission happened).
        const cancelledIds = new Set(open.map((s) => s.onchainId?.toLowerCase()).filter(Boolean));
        const mints = ofInvestor.filter(
          (t) => t.kind === "SUBSCRIPTION_MINTED" && cancelledIds.has(String((t.args as { subscriptionId?: unknown }).subscriptionId).toLowerCase()),
        );
        const approvals = ofInvestor.filter((t) => t.kind === "INVESTOR_WHITELISTED");
        const withdrawn = [...mints, ...approvals].map((t) => t.id);
        if (withdrawn.length) {
          const { count } = await tx.chainTransaction.updateMany({
            where: { id: { in: withdrawn }, status: "PENDING", executionMode: null },
            data: { status: "CANCELLED", error: `withdrawn: KYC ${kyc.id} revoked` },
          });
          if (count !== withdrawn.length) throw new DecisionError("Una transacción en cola del inversionista cambió mientras se revocaba; vuelve a intentarlo.");
        }
        const fees = await tx.feeLedgerEntry.findMany({
          where: { subscriptionId: { in: open.map((s) => s.id) } },
          select: { id: true, status: true, amountUsd: true, subscriptionId: true },
        });
        const voidable = fees.filter((f) => f.status === "ACCRUED").map((f) => f.id);
        if (voidable.length) {
          await tx.feeLedgerEntry.updateMany({ where: { id: { in: voidable }, status: "ACCRUED" }, data: { status: "VOIDED", voidedAt: now } });
        }

        // A whitelisting confirmed on-chain is undone by the officer's revokeInvestor().
        const entry = wallet ? registryEntry(state, wallet) : { approved: false, frozen: false };
        const whitelisted = state.txs
          .filter((t) => t.kind === "INVESTOR_WHITELISTED" && t.status === "CONFIRMED" && walletOf(t.args) === wallet)
          .at(-1);
        const revokeTx =
          entry.approved && whitelisted && state.registry
            ? await tx.chainTransaction.create({
                data: {
                  organizationId: orgId,
                  offeringId: whitelisted.offeringId,
                  network: whitelisted.network,
                  kind: "INVESTOR_REVOKED",
                  contractAddress: state.registry,
                  method: "revokeInvestor(address)",
                  args: { wallet },
                  status: "PENDING",
                },
              })
            : null;

        const payload = {
          investorId: kyc.investorId,
          investorName: kyc.investor.fullName,
          from: "APPROVED",
          to: "REVOKED",
          reason,
          note: justification,
          wallet,
          accessGrantsRevoked: grants.count,
          cancelledSubscriptions: open.map((s) => ({
            id: s.id,
            from: s.status,
            units: s.units,
            capitalUsd: s.capitalUsd.toFixed(2),
            refundDue: !!s.paymentConfirmedAt,
          })),
          unitsReleased: open.reduce((n, s) => n + s.units, 0),
          withdrawnChainTransactionIds: withdrawn,
          voidedFeeIds: voidable,
          feesAlreadyBilled: fees.filter((f) => f.status !== "ACCRUED").map((f) => f.id),
          revokeChainTransactionId: revokeTx?.id ?? null,
        };
        await tx.auditEvent.create({
          data: {
            organizationId: orgId,
            action: "KYC_REVOKED",
            actorUserId: session.reviewer.id,
            actorEmail: session.reviewer.email,
            entityType: "KycCase",
            entityId: kyc.id,
            subjectHash: evidenceHash({ action: "KYC_REVOKED", organizationId: orgId, entityId: kyc.id, ...payload }),
            payload: payload as Prisma.InputJsonValue,
            ...meta,
            createdAt: now,
          },
        });
        for (const sub of open) {
          const subPayload = {
            investorName: kyc.investor.fullName,
            from: sub.status,
            to: "CANCELLED",
            reason: "KYC_REVOKED",
            kycCaseId: kyc.id,
            units: sub.units,
            capitalUsd: sub.capitalUsd.toFixed(2),
            refundDue: !!sub.paymentConfirmedAt,
            mintChainTransactionId: mints.find((t) => String((t.args as { subscriptionId?: unknown }).subscriptionId).toLowerCase() === sub.onchainId?.toLowerCase())?.id ?? null,
            voidedFeeIds: fees.filter((f) => f.subscriptionId === sub.id && f.status === "ACCRUED").map((f) => f.id),
          };
          await tx.auditEvent.create({
            data: {
              organizationId: orgId,
              action: "SUBSCRIPTION_CANCELLED",
              actorUserId: session.reviewer.id,
              actorEmail: session.reviewer.email,
              entityType: "Subscription",
              entityId: sub.id,
              subjectHash: evidenceHash({ action: "SUBSCRIPTION_CANCELLED", organizationId: orgId, entityId: sub.id, ...subPayload }),
              payload: subPayload as Prisma.InputJsonValue,
              ...meta,
              createdAt: now,
            },
          });
        }
        return revokeTx
          ? tr("{name} revocado · {n} suscripción(es) cancelada(s) · revokeInvestor en cola", { name: kyc.investor.fullName, n: open.length, count: open.length })
          : tr("{name} revocado · {n} suscripción(es) cancelada(s) · whitelist retirada antes de enviarse", {
              name: kyc.investor.fullName,
              n: open.length,
              count: open.length,
            });
      },
      TX_OPTIONS,
    );

    refresh();
    return { ok: true, message };
  } catch (e) {
    return failure(e, tr);
  }
}

/**
 * Queues setFrozen(wallet, frozen) for an investor holding minted tokens (COMPLIANCE_OFFICER), with the officer's
 * justification: INVESTOR_FREEZE_REQUESTED in the same transaction. A frozen wallet cannot transfer its tokens and
 * the portal takes no new subscription from it; the call itself is signed from the on-chain queue.
 */
export async function setInvestorFrozen(investorId: string, frozen: boolean, note: string): Promise<ActionResult> {
  const tr = await requestTranslate("tenant");
  try {
    if (typeof investorId !== "string" || !CUID.test(investorId)) throw new DecisionError("Inversionista inválido.");
    if (typeof frozen !== "boolean") throw new DecisionError("Decisión inválida.");
    const justification = cleanNote(note);
    if (justification.length < NOTE.min || justification.length > NOTE.max) {
      throw new DecisionError("Justifica la decisión (entre {min} y {max} caracteres).", NOTE);
    }
    const session = await requireBackofficeSession("COMPLIANCE_OFFICER");
    const meta = await requestMeta();
    const orgId = session.tenant.id;

    const message = await withTenant(
      orgId,
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM investors WHERE id = ${investorId} FOR UPDATE`;
        const investor = await tx.investor.findUnique({ where: { id: investorId } });
        if (!investor) throw new DecisionError("Inversionista no encontrado en este tenant.");
        const wallet = investor.walletAddress?.toLowerCase() ?? null;
        if (!wallet || !ADDRESS.test(wallet)) throw new DecisionError("El inversionista no ha registrado una wallet.");
        const minted = await tx.subscription.aggregate({
          where: { investorId, status: "MINTED" },
          _sum: { units: true },
        });
        const units = minted._sum.units ?? 0;
        if (units < 1) throw new DecisionError("Sólo se congela la wallet de un inversionista con tokens emitidos.");
        const state = await loadChainState(tx);
        if (!state.registry) throw new DecisionError("El tenant aún no tiene RwaxiComplianceRegistry desplegado.");
        const pending = state.txs.find((t) => t.kind === "INVESTOR_FREEZE_UPDATED" && t.status === "PENDING" && walletOf(t.args) === wallet);
        if (pending) throw new DecisionError("Ya hay un setFrozen() en cola para esta wallet: fírmalo o espera su confirmación.");
        const entry = registryEntry(state, wallet);
        if (frozen && entry.frozen) throw new DecisionError("La wallet ya está congelada.");
        if (!frozen && !entry.frozen) throw new DecisionError("La wallet no está congelada.");
        const whitelisted = state.txs
          .filter((t) => t.kind === "INVESTOR_WHITELISTED" && t.status === "CONFIRMED" && walletOf(t.args) === wallet)
          .at(-1);
        const network = whitelisted?.network ?? state.txs.find((t) => t.kind === "SUBSCRIPTION_MINTED" && walletOf(t.args) === wallet)?.network;
        if (!network) throw new DecisionError("No se encontró la red del registro de esta wallet.");

        const now = new Date();
        const chainTx = await tx.chainTransaction.create({
          data: {
            organizationId: orgId,
            offeringId: whitelisted?.offeringId ?? null,
            network,
            kind: "INVESTOR_FREEZE_UPDATED",
            contractAddress: state.registry,
            method: "setFrozen(address,bool)",
            args: { wallet, frozen },
            status: "PENDING",
          },
        });
        const payload = {
          investorId,
          investorName: investor.fullName,
          wallet,
          frozen,
          note: justification,
          mintedUnits: units,
          chainTransactionId: chainTx.id,
        };
        await tx.auditEvent.create({
          data: {
            organizationId: orgId,
            action: "INVESTOR_FREEZE_REQUESTED",
            actorUserId: session.reviewer.id,
            actorEmail: session.reviewer.email,
            entityType: "Investor",
            entityId: investorId,
            subjectHash: evidenceHash({ action: "INVESTOR_FREEZE_REQUESTED", organizationId: orgId, entityId: investorId, ...payload }),
            payload: payload as Prisma.InputJsonValue,
            ...meta,
            createdAt: now,
          },
        });
        return frozen
          ? tr("Congelamiento de la wallet de {name} en cola (setFrozen)", { name: investor.fullName })
          : tr("Descongelamiento de la wallet de {name} en cola (setFrozen)", { name: investor.fullName });
      },
      TX_OPTIONS,
    );

    refresh();
    return { ok: true, message };
  } catch (e) {
    return failure(e, tr);
  }
}
