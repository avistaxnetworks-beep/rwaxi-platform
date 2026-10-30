"use server";

/**
 * Fiduciary payment reconciliation in the developer's backoffice.
 *
 * Signing a subscription in the portal only reserves units (PAYMENT_PENDING). When the
 * developer's treasury sees the transfer, it confirms it here with the receipt reference, in one
 * transaction bound to the host tenant (withTenant → RLS): MINT_PENDING, the paymentEvidenceRef
 * that binds the receipt to the signed agreement, the queued mintSubscription(), RWAXI's
 * INFRASTRUCTURE_USAGE fee and the audit event commit together or not at all.
 */
import { revalidatePath } from "next/cache";
import { isUniqueViolation, withTenant, type SubscriptionStatus } from "@rwaxi/database";
import { LocalizedError, msg } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import type { Translate } from "@/app/_i18n/translate";
import { paymentCodeOf, paymentEvidenceRef } from "@/app/_lib/server/subscriptions";
import { requestMeta } from "@/app/_lib/server/tenant-context";
import { requireBackofficeSession } from "./_lib/session";
import type { ActionResult } from "./_lib/types";

const CUID = /^[a-z0-9]{20,40}$/i;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
/** Receipt references as banks and fiduciaries print them, normalised to upper case (4–64 chars). */
const REFERENCE = /^[A-Z0-9](?:[A-Z0-9 ._/#-]{2,62})[A-Z0-9]$/;
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };
const MINT_METHOD = "mintSubscription(bytes32,address,uint256,bytes32)";

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  RESERVED: msg("reservada (pre-venta, sin token)"),
  PAYMENT_PENDING: msg("pendiente de pago"),
  MINT_PENDING: msg("con el pago ya conciliado"),
  MINTED: msg("emitida"),
  CANCELLED: msg("cancelada"),
};

class PaymentError extends LocalizedError {}

function failure(e: unknown, tr: Translate): ActionResult {
  if (e instanceof LocalizedError) return { ok: false, error: render(tr, e.reason) };
  if (isUniqueViolation(e)) {
    return { ok: false, error: tr("Esa referencia de pago ya se usó para otra suscripción de este tenant.") };
  }
  console.error("[backoffice] payment confirmation failed", e);
  return { ok: false, error: tr("No se pudo conciliar el pago. Inténtalo de nuevo.") };
}

const refresh = () => {
  revalidatePath("/tenant/[slug]/backoffice", "page");
  revalidatePath("/tenant/[slug]", "page");
};

const normalizeReference = (raw: string) => raw.trim().replace(/\s+/g, " ").toUpperCase();

/** "Confirmar Pago Fiduciario": PAYMENT_PENDING → MINT_PENDING + mintSubscription() queued + fee accrued. */
export async function confirmPayment(subscriptionId: string, paymentReference: string): Promise<ActionResult> {
  const tr = await requestTranslate("tenant");
  try {
    if (typeof subscriptionId !== "string" || !CUID.test(subscriptionId)) throw new PaymentError("Suscripción inválida.");
    const reference = typeof paymentReference === "string" ? normalizeReference(paymentReference) : "";
    if (!REFERENCE.test(reference)) {
      throw new PaymentError("Referencia del comprobante inválida: 4 a 64 caracteres (letras, números, espacio y . _ / # -).");
    }
    const session = await requireBackofficeSession("TENANT_ADMIN");
    const meta = await requestMeta();
    const orgId = session.tenant.id;

    const message = await withTenant(
      orgId,
      async (tx) => {
        const sub = await tx.subscription.findUnique({
          where: { id: subscriptionId },
          include: {
            investor: { select: { fullName: true, walletAddress: true } },
            offering: { select: { code: true, token: true } },
          },
        });
        if (!sub) throw new PaymentError("Suscripción no encontrada en este tenant.");
        if (sub.status !== "PAYMENT_PENDING") {
          throw new PaymentError("La suscripción está {status}; recarga la bandeja.", { status: STATUS_LABEL[sub.status] });
        }
        if (!sub.onchainId || !sub.agreementHash || !BYTES32.test(sub.agreementHash)) {
          throw new PaymentError("La suscripción no tiene el hash del contrato firmado.");
        }
        const token = sub.offering.token;
        if (!token?.contractAddress || token.status !== "DEPLOYED") {
          throw new PaymentError(
            token?.status === "PAUSED"
              ? "El emisor pausó el token: reanúdalo antes de conciliar pagos."
              : "El token de la oferta no está desplegado.",
          );
        }
        const wallet = sub.investor.walletAddress;
        if (!wallet || !ADDRESS.test(wallet)) throw new PaymentError("El inversionista no tiene una wallet válida.");

        const evidenceRef = paymentEvidenceRef({
          onchainId: sub.onchainId,
          agreementHash: sub.agreementHash,
          paymentReference: reference,
        });
        const now = new Date();
        // Conditional transition: a second confirmation of the same payment writes nothing.
        const { count } = await tx.subscription.updateMany({
          where: { id: sub.id, status: "PAYMENT_PENDING" },
          data: {
            status: "MINT_PENDING",
            paymentReference: reference,
            paymentConfirmedAt: now,
            paymentConfirmedById: session.reviewer.id,
            paymentEvidenceRef: evidenceRef,
          },
        });
        if (count !== 1) throw new PaymentError("Otro usuario ya concilió este pago; recarga la bandeja.");

        // Outbox: signed by RWAXI's MINTER_ROLE once the investor's whitelisting is confirmed.
        const chainTx = await tx.chainTransaction.create({
          data: {
            organizationId: orgId,
            offeringId: sub.offeringId,
            network: token.network,
            kind: "SUBSCRIPTION_MINTED",
            contractAddress: token.contractAddress,
            method: MINT_METHOD,
            args: { subscriptionId: sub.onchainId, investor: wallet, amount: sub.units, paymentEvidenceRef: evidenceRef },
            status: "PENDING",
          },
        });
        // The platform fee is the one fixed in the token (its mintSubscription declares it on-chain in
        // PlatformFeeAccrued); a token deployed before the fee existed on-chain accrues the agreed one.
        const { platformFeeBps: agreedBps } = await tx.organization.findUniqueOrThrow({
          where: { id: orgId },
          select: { platformFeeBps: true },
        });
        const feeBps = token.platformFeeBps ?? sub.platformFeeBps ?? agreedBps;
        const fee = await tx.feeLedgerEntry.create({
          data: {
            organizationId: orgId,
            subscriptionId: sub.id,
            kind: "INFRASTRUCTURE_USAGE",
            amountUsd: sub.capitalUsd.mul(feeBps).div(10_000).toDecimalPlaces(2),
            baseUsd: sub.capitalUsd,
            platformFeeBps: feeBps,
            accruedOn: now,
            evidence: evidenceRef,
            status: "ACCRUED",
          },
        });
        // The subscription keeps the fee it accrued (the estimate made at signature becomes the accrued amount).
        await tx.subscription.update({ where: { id: sub.id }, data: { platformFeeBps: feeBps, platformFeeUsd: fee.amountUsd } });

        await tx.auditEvent.create({
          data: {
            organizationId: orgId,
            action: "PAYMENT_CONFIRMED",
            actorUserId: session.reviewer.id,
            actorEmail: session.reviewer.email,
            entityType: "Subscription",
            entityId: sub.id,
            subjectHash: evidenceRef,
            payload: {
              investorId: sub.investorId,
              investorName: sub.investor.fullName,
              from: "PAYMENT_PENDING",
              to: "MINT_PENDING",
              units: sub.units,
              capitalUsd: sub.capitalUsd.toFixed(2),
              paymentCode: paymentCodeOf(sub.onchainId),
              paymentReference: reference,
              agreementHash: sub.agreementHash,
              paymentEvidenceRef: evidenceRef,
              chainTransactionId: chainTx.id,
              chainStatus: chainTx.status,
              feeLedgerEntryId: fee.id,
              feeUsd: fee.amountUsd.toFixed(2),
              platformFeeBps: feeBps,
              platformFeeSource: token.platformFeeBps === null ? "agreement" : "token",
            },
            ...meta,
            createdAt: now,
          },
        });
        return tr("Pago conciliado ({reference}) · {units} unidades de {name}: mintSubscription() en cola", {
          reference,
          units: sub.units,
          name: sub.investor.fullName,
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
