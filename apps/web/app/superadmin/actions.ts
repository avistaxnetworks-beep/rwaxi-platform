"use server";

/**
 * Operational actions of the Super-Admin console (admin.rwaxirealestate.com), with the platform role
 * (platformPrisma, BYPASSRLS) and only on the admin host (requirePlatformSession).
 *
 *   Module A · governance: portal status, publication in the vitrina and the pause of an offering's
 *   capital raising. All are off-chain platform controls: RWAXI never pauses the issuer's token.
 *   Module C · B2B billing: agreed fee terms, invoices over ACCRUED ledger entries, payments.
 *   Onboarding: a new developer (organization, team, first offering, Data Room, setup fee) and the
 *   deployment of its RwaxiComplianceRegistry through the factory (RWAXI_OPERATOR_ROLE).
 *
 * Each action is one transaction with a conditional state transition and an AuditEvent on the
 * affected organization, whose subjectHash is the SHA-256 (canonical JSON) of the recorded decision.
 */
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { keccak256, toHex } from "viem";
import { evidenceHash } from "@rwaxi/blockchain-sdk/canonical";
import { PLATFORM_FEE_BPS_MAX, PLATFORM_FEE_BPS_MIN, parsePlatformFeeBps, platformFeePercent } from "@rwaxi/blockchain-sdk/platform-fee";
import { objectKey } from "@rwaxi/document-vault";
import {
  isUniqueViolation,
  platformPrisma,
  retryTransient,
  transaction,
  withTenant,
  type AuditAction,
  type ChainNetwork,
  type PortalStatus,
  type Prisma,
} from "@rwaxi/database";
import { LEGAL_COMPLIANCE, LEGAL_NDA } from "@/app/_lib/data/legal";
import { ExecutionError, executeChainTx, executionMode, operatorAddress, readTokenSupply } from "@/app/_lib/server/chain-executor";
import { READINESS_GAP, officialWallets, readinessGaps } from "@/app/_lib/server/raising-readiness";
import { issueInvitation, type InvitedRole } from "@/app/_lib/server/staff-invitations";
import { TenantAccessError, requestMeta } from "@/app/_lib/server/tenant-context";
import { vault, verifyReceipt } from "@/app/_lib/server/vault";
import { parseOnboarding } from "./_lib/onboarding";
import { RESERVED_SLUGS, SLUG_RULE, WALLET_RULE } from "./_lib/onboarding-shared";
import { requirePlatformSession, type PlatformSession } from "./_lib/session";
import type { PlatformActionResult } from "./_lib/types";

// Record ids: cuid() by default, fixed ids for seeded organizations (org_avista…). Looked up under the platform role.
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const INVOICE_NUMBER = /^[A-Z0-9](?:[A-Z0-9./-]{2,38})[A-Z0-9]$/;
const RECEIPT = /^[A-Z0-9](?:[A-Z0-9 ._/#-]{2,62})[A-Z0-9]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };
const PORTAL_STATUSES: PortalStatus[] = ["ACTIVE", "REVIEW", "SUSPENDED"];
const STATUS_LABEL: Record<PortalStatus, string> = { ACTIVE: "activo", REVIEW: "en revisión", SUSPENDED: "suspendido" };
const MAX_INVOICE_ENTRIES = 50;

class PlatformError extends Error {}

function failure(e: unknown, unique = "Ese registro ya existe."): PlatformActionResult {
  if (e instanceof PlatformError || e instanceof TenantAccessError || e instanceof ExecutionError) return { ok: false, error: e.message };
  if (isUniqueViolation(e)) return { ok: false, error: unique };
  console.error("[superadmin] platform action failed", e);
  return { ok: false, error: "No se pudo registrar la acción. Inténtalo de nuevo." };
}

// Governance changes are visible at once in the vitrina, the tenant's portal and its backoffice.
function refresh() {
  revalidatePath("/superadmin", "page");
  revalidatePath("/vitrina", "page");
  revalidatePath("/tenant/[slug]", "page");
  revalidatePath("/tenant/[slug]/backoffice", "page");
}

const clean = (raw: unknown) => (typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "");

/** A cuid-shaped id for an organization created by the onboarding (its vault keys need it before the INSERT). */
const newOrganizationId = () => `c${Date.now().toString(36)}${crypto.randomBytes(8).toString("hex")}`;

/** Restrictive decisions need a motive (10–300 chars); lifting them may carry one. */
function reasonOf(raw: unknown, required: boolean): string | null {
  const reason = clean(raw);
  if (required && reason.length < 10) throw new PlatformError("Indica el motivo de la decisión (mínimo 10 caracteres).");
  if (reason.length > 300) throw new PlatformError("El motivo no puede superar 300 caracteres.");
  return reason || null;
}

async function audit(
  tx: Prisma.TransactionClient,
  session: PlatformSession,
  meta: Awaited<ReturnType<typeof requestMeta>>,
  event: { organizationId: string; action: AuditAction; entityType: string; entityId: string; payload: Record<string, unknown> },
) {
  await tx.auditEvent.create({
    data: {
      organizationId: event.organizationId,
      action: event.action,
      actorUserId: session.admin.id,
      actorEmail: session.admin.email,
      entityType: event.entityType,
      entityId: event.entityId,
      subjectHash: evidenceHash({ action: event.action, organizationId: event.organizationId, entityId: event.entityId, ...event.payload }),
      payload: event.payload as Prisma.InputJsonValue,
      ...meta,
    },
  });
}

const platformTx = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => transaction(platformPrisma(), fn, TX_OPTIONS);

// ───────────────────────────────────────────────────────── Module A · governance

/** ACTIVE ⇄ REVIEW ⇄ SUSPENDED. SUSPENDED blocks new NDA, KYC and subscriptions in the portal. */
export async function setPortalStatus(organizationId: string, status: PortalStatus, reason: string): Promise<PlatformActionResult> {
  try {
    if (typeof organizationId !== "string" || !ID.test(organizationId)) throw new PlatformError("Organización inválida.");
    if (!PORTAL_STATUSES.includes(status)) throw new PlatformError("Estado de portal inválido.");
    const motive = reasonOf(reason, status !== "ACTIVE");
    const session = await requirePlatformSession();
    const meta = await requestMeta();

    const message = await platformTx(async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { displayName: true, portalStatus: true } });
      if (!org) throw new PlatformError("Organización no encontrada.");
      if (org.portalStatus === status) throw new PlatformError(`El portal de ${org.displayName} ya está ${STATUS_LABEL[status]}.`);
      const { count } = await tx.organization.updateMany({
        where: { id: organizationId, portalStatus: org.portalStatus },
        data: { portalStatus: status },
      });
      if (count !== 1) throw new PlatformError("Otro administrador cambió el estado del portal; recarga la consola.");
      await audit(tx, session, meta, {
        organizationId,
        action: "PORTAL_STATUS_CHANGED",
        entityType: "Organization",
        entityId: organizationId,
        payload: { tenant: org.displayName, from: org.portalStatus, to: status, reason: motive },
      });
      return `${org.displayName}: portal ${STATUS_LABEL[status]} (control off-chain; el contrato del emisor no se modifica)`;
    });
    refresh();
    return { ok: true, message };
  } catch (e) {
    return failure(e);
  }
}

/** isPublishedInRwaxi: whether the developer's projects are listed in the public vitrina. */
export async function setOrganizationPublished(organizationId: string, published: boolean, reason: string): Promise<PlatformActionResult> {
  try {
    if (typeof organizationId !== "string" || !ID.test(organizationId)) throw new PlatformError("Organización inválida.");
    if (typeof published !== "boolean") throw new PlatformError("Valor de publicación inválido.");
    const motive = reasonOf(reason, !published);
    const session = await requirePlatformSession();
    const meta = await requestMeta();

    const message = await platformTx(async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { displayName: true, published: true } });
      if (!org) throw new PlatformError("Organización no encontrada.");
      if (org.published === published) throw new PlatformError(`${org.displayName} ya está ${published ? "publicado" : "fuera de la vitrina"}.`);
      const { count } = await tx.organization.updateMany({ where: { id: organizationId, published: !published }, data: { published } });
      if (count !== 1) throw new PlatformError("Otro administrador cambió la publicación; recarga la consola.");
      await audit(tx, session, meta, {
        organizationId,
        action: "ORGANIZATION_PUBLICATION_CHANGED",
        entityType: "Organization",
        entityId: organizationId,
        payload: { tenant: org.displayName, published, reason: motive },
      });
      return `${org.displayName} ${published ? "publicado en" : "retirado de"} la vitrina pública`;
    });
    refresh();
    return { ok: true, message };
  } catch (e) {
    return failure(e);
  }
}

/** Pauses or resumes an offering's capital raising: no new subscriptions while paused (off-chain). */
export async function setOfferingCapture(offeringId: string, paused: boolean, reason: string): Promise<PlatformActionResult> {
  try {
    if (typeof offeringId !== "string" || !ID.test(offeringId)) throw new PlatformError("Oferta inválida.");
    if (typeof paused !== "boolean") throw new PlatformError("Valor de pausa inválido.");
    const motive = reasonOf(reason, paused);
    const session = await requirePlatformSession();
    const meta = await requestMeta();

    const message = await platformTx(async (tx) => {
      const offering = await tx.offering.findUnique({
        where: { id: offeringId },
        select: { organizationId: true, code: true, assetName: true, capturePausedAt: true },
      });
      if (!offering) throw new PlatformError("Oferta no encontrada.");
      if (!!offering.capturePausedAt === paused) {
        throw new PlatformError(`La captación de ${offering.code} ya está ${paused ? "pausada" : "abierta"}.`);
      }
      const now = new Date();
      const { count } = await tx.offering.updateMany({
        where: { id: offeringId, capturePausedAt: paused ? null : { not: null } },
        data: { capturePausedAt: paused ? now : null },
      });
      if (count !== 1) throw new PlatformError("Otro administrador cambió la captación; recarga la consola.");
      await audit(tx, session, meta, {
        organizationId: offering.organizationId,
        action: paused ? "OFFERING_CAPTURE_PAUSED" : "OFFERING_CAPTURE_RESUMED",
        entityType: "Offering",
        entityId: offeringId,
        payload: {
          offeringCode: offering.code,
          assetName: offering.assetName,
          reason: motive,
          ...(paused ? { pausedAt: now.toISOString() } : { pausedSince: offering.capturePausedAt?.toISOString() ?? null }),
        },
      });
      return `${offering.code} · ${offering.assetName}: captación ${paused ? "pausada (sin nuevas suscripciones)" : "reanudada"}`;
    });
    refresh();
    return { ok: true, message };
  } catch (e) {
    return failure(e);
  }
}

// ───────────────────────────────────────────────────────── Module C · billing

const MONEY = /^\d{1,7}(?:\.\d{1,2})?$/;

function amountOf(raw: unknown, label: string, max: number): string {
  const v = clean(String(raw ?? "")).replace(",", ".");
  if (!MONEY.test(v) || Number(v) > max) throw new PlatformError(`${label}: importe en USD entre 0 y ${max.toLocaleString("es-CO")} (2 decimales).`);
  return Number(v).toFixed(2);
}

/**
 * Agreed fixed terms of a developer: setup fee and monthly SaaS (future accruals). The platform fee per payment is
 * not changed here: only with a signed agreement (setCommercialTerms, module A).
 */
export async function updateFeeTerms(
  organizationId: string,
  terms: { setupUsd: unknown; monthlyUsd: unknown },
): Promise<PlatformActionResult> {
  try {
    if (typeof organizationId !== "string" || !ID.test(organizationId)) throw new PlatformError("Organización inválida.");
    const setupUsd = amountOf(terms?.setupUsd, "Setup", 1_000_000);
    const monthlyUsd = amountOf(terms?.monthlyUsd, "SaaS mensual", 100_000);
    const session = await requirePlatformSession();
    const meta = await requestMeta();

    const message = await platformTx(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`;
      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { displayName: true, feeSetupUsd: true, feeMonthlyUsd: true },
      });
      if (!org) throw new PlatformError("Organización no encontrada.");
      const from = { setupUsd: org.feeSetupUsd.toFixed(2), monthlyUsd: org.feeMonthlyUsd.toFixed(2) };
      const to = { setupUsd, monthlyUsd };
      if (from.setupUsd === to.setupUsd && from.monthlyUsd === to.monthlyUsd) {
        throw new PlatformError("Las tarifas no cambiaron.");
      }
      await tx.organization.update({
        where: { id: organizationId },
        data: { feeSetupUsd: setupUsd, feeMonthlyUsd: monthlyUsd },
      });
      await audit(tx, session, meta, {
        organizationId,
        action: "FEE_TERMS_UPDATED",
        entityType: "Organization",
        entityId: organizationId,
        payload: { tenant: org.displayName, from, to, appliesTo: "devengos futuros; los asientos existentes no cambian" },
      });
      return `${org.displayName}: tarifas actualizadas (aplican a los próximos devengos)`;
    });
    refresh();
    return { ok: true, message };
  } catch (e) {
    return failure(e);
  }
}

const AGREEMENT_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9 ._/#-]{2,63}$/;

/**
 * Module A · registers a commercial agreement signed with a developer and the platform fee it sets, in basis points
 * (25–500: 0.25 %–5 %, the range RwaxiPropertyToken enforces). The signed PDF was verified in staging by this console
 * session (POST /api/vault/upload, purpose "onboarding": its receipt); it is copied into the developer's vault and
 * kept by its SHA-256. In one transaction: the agreement (append-only), its vault object, Organization.platformFeeBps
 * and a COMMERCIAL_TERMS_UPDATED AuditEvent citing the document's hash. The fee is the one the factory writes into
 * every token deployed from now on, and the usage fee of tokens deployed without one; deployed tokens keep theirs
 * (immutable on-chain).
 */
export async function setCommercialTerms(
  organizationId: string,
  input: {
    platformFeeBps: unknown;
    reference: unknown;
    signedOn: unknown;
    document: { receipt: unknown; sha256: unknown; sizeBytes: unknown; fileName: unknown };
  },
): Promise<PlatformActionResult> {
  try {
    if (typeof organizationId !== "string" || !ID.test(organizationId)) throw new PlatformError("Organización inválida.");
    const platformFeeBps = parsePlatformFeeBps(input?.platformFeeBps);
    if (platformFeeBps === null) {
      throw new PlatformError(
        `Comisión de plataforma: un número entero de puntos básicos entre ${PLATFORM_FEE_BPS_MIN} (0,25 %) y ${PLATFORM_FEE_BPS_MAX} (5 %).`,
      );
    }
    const reference = clean(input?.reference);
    if (!AGREEMENT_REFERENCE.test(reference)) {
      throw new PlatformError("Referencia del acuerdo: 3 a 64 caracteres (letras, números, espacio y . _ / # -).");
    }
    const signedOn = clean(input?.signedOn);
    const signed = DATE.test(signedOn) ? new Date(`${signedOn}T00:00:00Z`) : null;
    if (!signed || Number.isNaN(signed.getTime()) || signed.toISOString().slice(0, 10) !== signedOn) {
      throw new PlatformError("Fecha de firma del acuerdo inválida (AAAA-MM-DD).");
    }
    // "future" in Colombia, where the agreements are signed (after 19:00 there the UTC date is already tomorrow)
    const todayInBogota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    if (signedOn > todayInBogota) throw new PlatformError("La fecha de firma no puede ser futura.");
    const session = await requirePlatformSession();
    const document = input?.document;
    const claims = verifyReceipt(document?.receipt, { scope: "staging", subject: `usr:${session.admin.id}` });
    if (!claims || claims.sha256 !== document?.sha256 || claims.sizeBytes !== document?.sizeBytes) {
      throw new PlatformError("El acuerdo firmado no fue verificado por el servidor: vuelve a adjuntarlo.");
    }
    if (claims.mimeType !== "application/pdf") throw new PlatformError("El acuerdo firmado debe ser un PDF.");
    const fileName =
      (typeof document.fileName === "string" ? document.fileName : "")
        .replace(/[\\/\u0000-\u001f]/g, "_")
        .trim()
        .slice(0, 160) || "acuerdo-comercial.pdf";
    const meta = await requestMeta();

    // The file goes into the developer's vault before its row exists, so no agreement is ever left without it; a
    // copy that a failed transaction leaves unreferenced is removed by the vault GC after its grace period.
    const storageKey = objectKey({ organizationId }, claims.sha256);
    await vault()
      .copy(objectKey("staging", claims.sha256), storageKey)
      .catch(() => {
        throw new PlatformError("El archivo del acuerdo ya no está en la bóveda temporal: vuelve a adjuntarlo.");
      });

    const message = await platformTx(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`;
      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { displayName: true, platformFeeBps: true },
      });
      if (!org) throw new PlatformError("Organización no encontrada.");
      await tx.vaultObject.createMany({
        data: [{ organizationId, sha256: claims.sha256, sizeBytes: claims.sizeBytes, mimeType: claims.mimeType, storageKey }],
        skipDuplicates: true,
      });
      const agreement = await tx.commercialAgreement.create({
        data: {
          organizationId,
          reference,
          signedOn: signed,
          platformFeeBps,
          sha256: claims.sha256,
          sizeBytes: claims.sizeBytes,
          fileName,
          storageKey,
          recordedByEmail: session.admin.email,
        },
      });
      await tx.organization.update({ where: { id: organizationId }, data: { platformFeeBps } });
      await audit(tx, session, meta, {
        organizationId,
        action: "COMMERCIAL_TERMS_UPDATED",
        entityType: "CommercialAgreement",
        entityId: agreement.id,
        payload: {
          tenant: org.displayName,
          from: { platformFeeBps: org.platformFeeBps },
          to: { platformFeeBps },
          agreement: { reference, signedOn, sha256: claims.sha256, fileName, sizeBytes: claims.sizeBytes },
          appliesTo:
            "tokens desplegados desde ahora y devengos de tokens sin comisión fijada; los tokens ya desplegados conservan la suya (inmutable on-chain)",
        },
      });
      const change =
        org.platformFeeBps === platformFeeBps
          ? `se mantiene en ${platformFeePercent(platformFeeBps)} (${platformFeeBps} pb)`
          : `${org.platformFeeBps} → ${platformFeeBps} pb (${platformFeePercent(platformFeeBps)})`;
      return `${org.displayName}: acuerdo ${reference} registrado (SHA-256 ${claims.sha256.slice(0, 10)}…) · comisión de plataforma ${change} · aplica a los tokens que se desplieguen desde ahora`;
    });
    refresh();
    return { ok: true, message };
  } catch (e) {
    return failure(e);
  }
}

/** Issues an invoice over ACCRUED entries of one developer: they become INVOICED. */
export async function issueInvoice(entryIds: string[], invoiceNumber: string): Promise<PlatformActionResult> {
  try {
    const ids = Array.isArray(entryIds) ? [...new Set(entryIds)] : [];
    if (!ids.length || ids.length > MAX_INVOICE_ENTRIES || !ids.every((id) => typeof id === "string" && ID.test(id))) {
      throw new PlatformError(`Selecciona entre 1 y ${MAX_INVOICE_ENTRIES} asientos.`);
    }
    const number = clean(invoiceNumber).toUpperCase();
    if (!INVOICE_NUMBER.test(number)) throw new PlatformError("Número de factura inválido: 4 a 40 caracteres (letras, números, . / -).");
    const session = await requirePlatformSession();
    const meta = await requestMeta();

    const message = await platformTx(async (tx) => {
      const entries = await tx.feeLedgerEntry.findMany({
        where: { id: { in: ids } },
        select: { id: true, organizationId: true, status: true, kind: true, period: true, amountUsd: true, organization: { select: { displayName: true } } },
      });
      if (entries.length !== ids.length) throw new PlatformError("Algún asiento seleccionado no existe.");
      const [first] = entries;
      if (!first || entries.some((e) => e.organizationId !== first.organizationId)) {
        throw new PlatformError("Una factura agrupa asientos de un solo desarrollador.");
      }
      const billed = entries.filter((e) => e.status !== "ACCRUED");
      if (billed.length) throw new PlatformError(`Sólo se facturan asientos ACCRUED (${billed.length} ya están ${billed[0]!.status}).`);
      const total = entries.slice(1).reduce((s, e) => s.add(e.amountUsd), first.amountUsd);

      const invoice = await tx.feeInvoice.create({
        data: { organizationId: first.organizationId, number, issuedAt: new Date(), totalUsd: total },
      });
      const { count } = await tx.feeLedgerEntry.updateMany({
        where: { id: { in: ids }, status: "ACCRUED", invoiceId: null },
        data: { status: "INVOICED", invoiceId: invoice.id },
      });
      if (count !== ids.length) throw new PlatformError("Otro administrador facturó alguno de estos asientos; recarga la consola.");
      await audit(tx, session, meta, {
        organizationId: first.organizationId,
        action: "FEE_INVOICED",
        entityType: "FeeInvoice",
        entityId: invoice.id,
        payload: {
          tenant: first.organization.displayName,
          invoiceNumber: number,
          totalUsd: total.toFixed(2),
          entries: entries.map((e) => ({ id: e.id, kind: e.kind, period: e.period, amountUsd: e.amountUsd.toFixed(2) })),
        },
      });
      return `Factura ${number} emitida a ${first.organization.displayName} · ${entries.length} asiento(s) · ${total.toFixed(2)} USD`;
    });
    refresh();
    return { ok: true, message };
  } catch (e) {
    return failure(e, "Ese número de factura ya existe.");
  }
}

/** Records the payment of an invoice (date on the receipt + receipt reference): its entries become PAID. */
export async function recordInvoicePayment(invoiceId: string, paidOn: string, receipt: string): Promise<PlatformActionResult> {
  try {
    if (typeof invoiceId !== "string" || !ID.test(invoiceId)) throw new PlatformError("Factura inválida.");
    if (typeof paidOn !== "string" || !DATE.test(paidOn) || Number.isNaN(Date.parse(`${paidOn}T00:00:00Z`))) {
      throw new PlatformError("Fecha de pago inválida (AAAA-MM-DD).");
    }
    const paidDate = new Date(`${paidOn}T00:00:00Z`);
    if (paidDate.toISOString().slice(0, 10) !== paidOn) throw new PlatformError("Fecha de pago inválida.");
    if (paidOn > new Date().toISOString().slice(0, 10)) throw new PlatformError("La fecha de pago no puede ser futura.");
    const reference = clean(receipt).toUpperCase();
    if (!RECEIPT.test(reference)) throw new PlatformError("Comprobante inválido: 4 a 64 caracteres (letras, números, espacio y . _ / # -).");
    const session = await requirePlatformSession();
    const meta = await requestMeta();

    const message = await platformTx(async (tx) => {
      await tx.$queryRaw`SELECT id FROM fee_invoices WHERE id = ${invoiceId} FOR UPDATE`;
      const invoice = await tx.feeInvoice.findUnique({
        where: { id: invoiceId },
        include: { entries: { select: { id: true, status: true } }, organization: { select: { displayName: true } } },
      });
      if (!invoice) throw new PlatformError("Factura no encontrada.");
      if (invoice.paidOn) throw new PlatformError(`La factura ${invoice.number} ya tiene un pago registrado.`);
      if (paidOn < invoice.issuedAt.toISOString().slice(0, 10)) {
        throw new PlatformError("La fecha de pago no puede ser anterior a la emisión de la factura.");
      }
      const { count } = await tx.feeLedgerEntry.updateMany({ where: { invoiceId, status: "INVOICED" }, data: { status: "PAID" } });
      if (count !== invoice.entries.length) throw new PlatformError("Hay asientos de la factura que no están INVOICED.");
      const paid = await tx.feeInvoice.updateMany({ where: { id: invoiceId, paidOn: null }, data: { paidOn: paidDate, paymentReceipt: reference } });
      if (paid.count !== 1) throw new PlatformError("Otro administrador registró el pago; recarga la consola.");
      await audit(tx, session, meta, {
        organizationId: invoice.organizationId,
        action: "FEE_PAYMENT_RECORDED",
        entityType: "FeeInvoice",
        entityId: invoiceId,
        payload: {
          tenant: invoice.organization.displayName,
          invoiceNumber: invoice.number,
          paidOn,
          paymentReceipt: reference,
          totalUsd: invoice.totalUsd.toFixed(2),
          entries: invoice.entries.map((e) => e.id),
        },
      });
      return `Pago de la factura ${invoice.number} registrado (${paidOn} · ${reference})`;
    });
    refresh();
    return { ok: true, message };
  } catch (e) {
    return failure(e);
  }
}

// ───────────────────────────────────────────────────────── onboarding

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DEPLOY_REGISTRY = "deployTenantRegistry(bytes32,string,string,address,address)";

/** RwaxiTenantFactory that deploys the registry: RWAXI_FACTORY_ADDRESS, else the one the network already uses. */
async function factoryFor(tx: Prisma.TransactionClient, network: ChainNetwork): Promise<string> {
  const configured = process.env.RWAXI_FACTORY_ADDRESS;
  if (configured && ADDRESS.test(configured)) return configured;
  const known =
    (await tx.chainTransaction.findFirst({ where: { kind: "TENANT_REGISTRY_DEPLOYED", network }, orderBy: { createdAt: "desc" }, select: { contractAddress: true } })) ??
    (await tx.chainTransaction.findFirst({ where: { kind: "TENANT_REGISTRY_DEPLOYED" }, orderBy: { createdAt: "desc" }, select: { contractAddress: true } }));
  if (!known) throw new PlatformError("No hay RwaxiTenantFactory configurada: define RWAXI_FACTORY_ADDRESS.");
  return known.contractAddress;
}

/** Which unique constraint a P2002 hit, as a message for the operator. */
function onboardingConflict(e: unknown): string {
  const target = (e as { meta?: { target?: unknown } }).meta?.target;
  const fields = Array.isArray(target) ? target.join(",") : String(target ?? "");
  if (/slug/.test(fields)) return "Ese subdominio ya pertenece a otro desarrollador.";
  if (/tax_?id/i.test(fields)) return "Ya existe un desarrollador con ese NIT.";
  if (/email/.test(fields)) return "Uno de los correos ya pertenece a otro usuario de la plataforma.";
  return "El desarrollador o alguno de sus datos ya existe en la plataforma.";
}

/** Live check of the wizard: format, reserved names and availability of a subdomain. */
export async function checkSlugAvailability(slug: string): Promise<{ ok: true; available: boolean; reason: string | null } | { ok: false; error: string }> {
  try {
    await requirePlatformSession();
    const value = typeof slug === "string" ? slug.trim().toLowerCase() : "";
    if (!SLUG_RULE.test(value)) return { ok: true, available: false, reason: "3 a 32 caracteres: minúsculas, números y guiones." };
    if (RESERVED_SLUGS.has(value)) return { ok: true, available: false, reason: "Subdominio reservado." };
    const taken = await retryTransient(() => platformPrisma().organization.findUnique({ where: { slug: value }, select: { id: true } }), {
      repeatable: true,
    });
    return { ok: true, available: !taken, reason: taken ? "Ya pertenece a otro desarrollador." : null };
  } catch (e) {
    return failure(e) as { ok: false; error: string };
  }
}

/**
 * Onboarding B2B, all or nothing: Organization (REVIEW, outside the vitrina, agreed fee terms),
 * its TENANT_ADMIN and COMPLIANCE_OFFICER, the first offering (pre-sale or structuring) with its
 * pending token and Data Room (Merkle root of the documents hashed in the browser), the
 * ONBOARDING_SETUP fee (ACCRUED), the registry deployment queued for RWAXI's operator and the
 * ORGANIZATION_ONBOARDED audit event.
 */
export async function onboardDeveloper(input: unknown): Promise<PlatformActionResult & { slug?: string }> {
  let copied: string[] = [];
  try {
    const parsed = parseOnboarding(input);
    if (!parsed.ok) throw new PlatformError(parsed.error);
    const { company: c, admin, officer, offering: o, documents, dataRoomRoot, fees } = parsed.plan;
    const session = await requirePlatformSession();
    const meta = await requestMeta();

    // The Data Room files were verified in staging by this console session (one receipt each); they are copied
    // into the new tenant's vault before the tenant exists in the database, so no document is ever left without
    // its file. The id is chosen here because the vault keys carry it.
    const organizationId = newOrganizationId();
    const files = documents.map((d) => {
      const claims = verifyReceipt(d.receipt, { scope: "staging", subject: `usr:${session.admin.id}` });
      if (!claims || claims.sha256 !== d.sha256 || claims.sizeBytes !== d.sizeBytes) {
        throw new PlatformError(`El documento «${d.name}» no fue verificado por el servidor: vuelve a adjuntarlo.`);
      }
      return { ...d, mimeType: claims.mimeType, storageKey: objectKey({ organizationId }, d.sha256) };
    });
    for (const f of files) {
      await vault()
        .copy(objectKey("staging", f.sha256), f.storageKey)
        .catch(() => {
          throw new PlatformError(`El archivo de «${f.name}» ya no está en la bóveda temporal: vuelve a adjuntarlo.`);
        });
      copied.push(f.storageKey);
    }

    const message = await transaction(
      platformPrisma(),
      async (tx) => {
        if (await tx.offering.findFirst({ where: { code: o.code }, select: { id: true } })) {
          throw new PlatformError(`El código ${o.code} ya se usa en la plataforma: elige otro.`);
        }
        // deployTenantRegistry() hands the registry to both staff wallets: without them it is deferred, not queued.
        const wallets = admin.wallet && officer.wallet ? { tenantAdmin: admin.wallet, complianceOfficer: officer.wallet } : null;
        const factory = wallets ? await factoryFor(tx, o.network) : null;
        const now = new Date();
        const regimeKey = c.regime === "SARLAFT" ? "sarlaft" : "sagrilaft";
        const org = await tx.organization.create({
          data: {
            id: organizationId,
            slug: c.slug,
            displayName: c.displayName,
            legalName: c.legalName,
            taxId: c.taxId,
            brandColor: c.brandColor,
            complianceRegime: c.regime,
            complianceContactEmail: officer.email,
            portalStatus: "REVIEW",
            published: false,
            ndaTemplate: LEGAL_NDA,
            complianceTemplate: { [regimeKey]: (LEGAL_COMPLIANCE as Record<string, unknown>)[regimeKey] } as Prisma.InputJsonValue,
            feeSetupUsd: fees.setupUsd,
            feeMonthlyUsd: fees.monthlyUsd,
            platformFeeBps: fees.platformFeeBps,
            onboardedAt: now,
          },
        });
        const onchainId = keccak256(toHex(org.id));
        await tx.organization.update({ where: { id: org.id }, data: { onchainId } });
        // Without a password: each one activates the account from the invitation link (password + TOTP).
        const team = await Promise.all(
          (
            [
              [admin, "TENANT_ADMIN"],
              [officer, "COMPLIANCE_OFFICER"],
            ] as const
          ).map(([p, role]) =>
            tx.user.create({
              data: { organizationId: org.id, email: p.email, fullName: p.fullName, role, walletAddress: p.wallet },
              select: { id: true, email: true, fullName: true, role: true },
            }),
          ),
        );
        const offering = await tx.offering.create({
          data: {
            organizationId: org.id,
            code: o.code,
            assetName: o.assetName,
            city: o.city,
            region: o.region,
            assetType: o.assetType,
            stage: o.stage,
            renderKind: o.renderKind,
            legalEntityName: o.legalEntityName,
            legalWrapperType: o.legalWrapperType,
            legalWrapperNote: o.legalWrapperNote,
            economicRight: o.economicRight,
            targetIrrPct: o.targetIrrPct,
            distributionYieldPct: o.distributionYieldPct,
            appreciationPct: o.appreciationPct,
            minTicketUsd: o.minTicketUsd,
            unitPriceUsd: o.unitPriceUsd,
            raiseTargetUsd: o.raiseTargetUsd,
            assetValueUsd: o.assetValueUsd,
            totalUnits: o.totalUnits,
            unitsSubscribed: 0,
            rentStartMonths: o.rentStartMonths,
            network: o.network,
            pipeline: o.pipeline,
            dataRoomRoot,
            published: true,
          },
        });
        await tx.tokenDeployment.create({
          data: {
            organizationId: org.id,
            offeringId: offering.id,
            network: o.network,
            name: `${o.assetName} Unit`,
            symbol: o.tokenSymbol,
            maxSupply: o.totalUnits,
            unitPriceUsd: o.unitPriceUsd,
            onchainId: keccak256(toHex(offering.id)),
            status: "NOT_DEPLOYED",
          },
        });
        await tx.vaultObject.createMany({
          data: files.map((f) => ({ organizationId: org.id, sha256: f.sha256, sizeBytes: f.sizeBytes, mimeType: f.mimeType, storageKey: f.storageKey })),
          skipDuplicates: true,
        });
        await tx.dataRoomDocument.createMany({
          data: files.map((f) => ({
            organizationId: org.id,
            offeringId: offering.id,
            folder: f.folder,
            name: f.name,
            restricted: f.restricted,
            sha256: f.sha256,
            sizeBytes: f.sizeBytes,
            storageKey: f.storageKey,
            uploadedAt: now,
          })),
        });
        const fee = Number(fees.setupUsd) > 0
          ? await tx.feeLedgerEntry.create({
              data: {
                organizationId: org.id,
                kind: "ONBOARDING_SETUP",
                amountUsd: fees.setupUsd,
                accruedOn: now,
                evidence: `Contrato de implementación White Label · ${c.slug}`,
                status: "ACCRUED",
              },
            })
          : null;
        const registryTx =
          wallets && factory
            ? await tx.chainTransaction.create({
                data: {
                  organizationId: org.id,
                  offeringId: offering.id,
                  network: o.network,
                  kind: "TENANT_REGISTRY_DEPLOYED",
                  contractAddress: factory,
                  method: DEPLOY_REGISTRY,
                  args: {
                    organizationId: onchainId,
                    organizationTaxId: c.taxId,
                    complianceRegime: c.regime,
                    ...wallets,
                  },
                  status: "PENDING",
                },
              })
            : null;
        await audit(tx, session, meta, {
          organizationId: org.id,
          action: "ORGANIZATION_ONBOARDED",
          entityType: "Organization",
          entityId: org.id,
          payload: {
            tenant: c.displayName,
            slug: c.slug,
            taxId: c.taxId,
            regime: c.regime,
            users: [
              { role: "TENANT_ADMIN", email: admin.email, wallet: admin.wallet },
              { role: "COMPLIANCE_OFFICER", email: officer.email, wallet: officer.wallet },
            ],
            offeringCode: o.code,
            offeringId: offering.id,
            stage: o.stage,
            documents: documents.length,
            dataRoomRoot,
            vault: files.map((f) => ({ sha256: f.sha256, mimeType: f.mimeType, sizeBytes: f.sizeBytes })),
            fees,
            setupFeeEntryId: fee?.id ?? null,
            registryChainTransactionId: registryTx?.id ?? null,
            registryDeferred: registryTx === null,
          },
        });
        for (const user of team) {
          const invitation = await issueInvitation(tx, {
            organizationId: org.id,
            tenant: { slug: c.slug, displayName: c.displayName },
            user: { ...user, role: user.role as InvitedRole },
          });
          await audit(tx, session, meta, {
            organizationId: org.id,
            action: "STAFF_INVITED",
            entityType: "User",
            entityId: user.id,
            payload: {
              tenant: c.displayName,
              email: user.email,
              role: user.role,
              invitationId: invitation.invitationId,
              expiresAt: invitation.expiresAt.toISOString(),
            },
          });
        }
        const registry = registryTx ? "registro on-chain en cola" : "registro on-chain diferido hasta declarar las wallets";
        return `${c.displayName} dado de alta · ${c.slug}.rwaxirealestate.com en revisión · ${registry} · invitaciones de activación enviadas`;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    copied = [];
    refresh();
    return { ok: true, message, slug: parsed.plan.company.slug };
  } catch (e) {
    // The tenant was not created: its vault copies go too (the staged originals stay).
    await Promise.all(copied.map((key) => vault().remove(key).catch(() => undefined)));
    if (isUniqueViolation(e)) return { ok: false, error: onboardingConflict(e) };
    return failure(e);
  }
}

/**
 * Module A · a new activation link for a staff member of a developer whose invitation expired unused (or
 * that has none): earlier links are revoked, the email goes to mail_outbox, STAFF_INVITATION_RESENT is recorded.
 */
export async function resendStaffInvitation(userId: string): Promise<PlatformActionResult> {
  try {
    if (typeof userId !== "string" || !ID.test(userId)) throw new PlatformError("Usuario inválido.");
    const session = await requirePlatformSession();
    const meta = await requestMeta();
    const message = await platformTx(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          active: true,
          passwordHash: true,
          organization: { select: { id: true, slug: true, displayName: true } },
          invitations: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
      if (!user?.organization) throw new PlatformError("Usuario no encontrado.");
      if (user.role !== "TENANT_ADMIN" && user.role !== "COMPLIANCE_OFFICER") throw new PlatformError("Sólo se invita al personal del desarrollador.");
      if (user.passwordHash) throw new PlatformError(`La cuenta de ${user.email} ya está activa.`);
      if (!user.active) throw new PlatformError(`La cuenta de ${user.email} está desactivada.`);
      const last = user.invitations[0];
      if (last && !last.consumedAt && !last.revokedAt && last.expiresAt.getTime() > Date.now()) {
        throw new PlatformError(`La invitación de ${user.email} sigue vigente hasta ${last.expiresAt.toISOString().slice(0, 16).replace("T", " ")} UTC.`);
      }
      const invitation = await issueInvitation(tx, {
        organizationId: user.organization.id,
        tenant: { slug: user.organization.slug, displayName: user.organization.displayName },
        user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
      });
      await audit(tx, session, meta, {
        organizationId: user.organization.id,
        action: "STAFF_INVITATION_RESENT",
        entityType: "User",
        entityId: user.id,
        payload: {
          tenant: user.organization.displayName,
          email: user.email,
          role: user.role,
          invitationId: invitation.invitationId,
          expiresAt: invitation.expiresAt.toISOString(),
          previousInvitationId: last?.id ?? null,
          previousExpiredAt: last?.expiresAt.toISOString() ?? null,
          revoked: invitation.revoked,
        },
      });
      return `Invitación reenviada a ${user.email} · vence ${invitation.expiresAt.toISOString().slice(0, 16).replace("T", " ")} UTC`;
    });
    refresh();
    return { ok: true, message };
  } catch (e) {
    return failure(e);
  }
}

/**
 * Module A · completes an onboarding whose registry was deferred (staff wallets not declared): validates both
 * wallets, records them on the developer's TENANT_ADMIN and COMPLIANCE_OFFICER, queues deployTenantRegistry() —
 * the registry is administered by those wallets, never by RWAXI's — with REGISTRY_WALLETS_DECLARED, and then
 * has RWAXI's operator execute it. If the execution fails the call stays PENDING for «Desplegar registro».
 */
export async function declareRegistryWallets(organizationId: string, adminWallet: string, officerWallet: string): Promise<PlatformActionResult> {
  try {
    if (typeof organizationId !== "string" || !ID.test(organizationId)) throw new PlatformError("Organización inválida.");
    const tenantAdmin = clean(adminWallet).toLowerCase();
    const complianceOfficer = clean(officerWallet).toLowerCase();
    if (!WALLET_RULE.test(tenantAdmin)) throw new PlatformError("Administrador: wallet EVM inválida (0x + 40 hex).");
    if (!WALLET_RULE.test(complianceOfficer)) throw new PlatformError("Oficial de Cumplimiento: wallet EVM inválida (0x + 40 hex).");
    if (tenantAdmin === complianceOfficer) throw new PlatformError("El administrador y el oficial de cumplimiento deben tener wallets distintas.");
    // RWAXI holds no role on the tenant's registry: its operator key may never be one of them.
    const operator = operatorAddress()?.toLowerCase();
    if (operator && (tenantAdmin === operator || complianceOfficer === operator)) {
      throw new PlatformError("Esa es la wallet del operador RWAXI: el registro debe quedar con las wallets del desarrollador.");
    }
    const session = await requirePlatformSession();
    const meta = await requestMeta();

    const queued = await platformTx(async (tx) => {
      // One declaration at a time per developer: a concurrent one waits here and then sees the queued row.
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`;
      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          slug: true,
          displayName: true,
          taxId: true,
          complianceRegime: true,
          complianceRegistry: true,
          onchainId: true,
          offerings: { orderBy: { createdAt: "asc" }, take: 1, select: { id: true, network: true } },
        },
      });
      if (!org) throw new PlatformError("Desarrollador no encontrado.");
      if (org.complianceRegistry) throw new PlatformError(`${org.displayName} ya tiene su registro de cumplimiento desplegado.`);
      const offering = org.offerings[0];
      if (!offering || !org.onchainId) throw new PlatformError(`${org.displayName} no tiene una oferta ni identificador on-chain.`);
      const queuedTx = await tx.chainTransaction.findFirst({
        where: { organizationId: org.id, kind: "TENANT_REGISTRY_DEPLOYED", status: { in: ["PENDING", "CONFIRMED"] } },
        select: { status: true },
      });
      if (queuedTx) throw new PlatformError(`El registro de ${org.displayName} ya está en cola: usa «Desplegar registro».`);

      const staff = await tx.user.findMany({
        where: { organizationId: org.id, role: { in: ["TENANT_ADMIN", "COMPLIANCE_OFFICER"] } },
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, email: true, walletAddress: true },
      });
      const admin = staff.find((u) => u.role === "TENANT_ADMIN");
      const officer = staff.find((u) => u.role === "COMPLIANCE_OFFICER");
      if (!admin || !officer) throw new PlatformError(`${org.displayName} no tiene administrador y oficial de cumplimiento.`);
      await tx.user.update({ where: { id: admin.id }, data: { walletAddress: tenantAdmin } });
      await tx.user.update({ where: { id: officer.id }, data: { walletAddress: complianceOfficer } });

      const factory = await factoryFor(tx, offering.network);
      const registryTx = await tx.chainTransaction.create({
        data: {
          organizationId: org.id,
          offeringId: offering.id,
          network: offering.network,
          kind: "TENANT_REGISTRY_DEPLOYED",
          contractAddress: factory,
          method: DEPLOY_REGISTRY,
          args: {
            organizationId: org.onchainId,
            organizationTaxId: org.taxId,
            complianceRegime: org.complianceRegime,
            tenantAdmin,
            complianceOfficer,
          },
          status: "PENDING",
        },
      });
      await audit(tx, session, meta, {
        organizationId: org.id,
        action: "REGISTRY_WALLETS_DECLARED",
        entityType: "Organization",
        entityId: org.id,
        payload: {
          tenant: org.displayName,
          slug: org.slug,
          tenantAdmin,
          complianceOfficer,
          previous: { tenantAdmin: admin.walletAddress, complianceOfficer: officer.walletAddress },
          users: [
            { role: "TENANT_ADMIN", email: admin.email },
            { role: "COMPLIANCE_OFFICER", email: officer.email },
          ],
          network: offering.network,
          factory,
          registryChainTransactionId: registryTx.id,
        },
      });
      return org.displayName;
    });
    refresh();

    // The deployment itself: RWAXI's operator through the factory (RWAXI_OPERATOR_ROLE), as «Desplegar registro».
    const deployed = await deployTenantRegistry(organizationId);
    return deployed.ok
      ? { ok: true, message: `Wallets de ${queued} declaradas · ${deployed.message}` }
      : {
          ok: true,
          warning: true,
          message: `Wallets de ${queued} declaradas y despliegue en cola, pero la ejecución falló: ${deployed.error} Reinténtalo con «Desplegar registro».`,
        };
  } catch (e) {
    return failure(e);
  }
}

/** RWAXI's operator executes the queued deployTenantRegistry() of a developer (RWAXI_OPERATOR_ROLE). */
export async function deployTenantRegistry(organizationId: string): Promise<PlatformActionResult> {
  try {
    if (typeof organizationId !== "string" || !ID.test(organizationId)) throw new PlatformError("Organización inválida.");
    const session = await requirePlatformSession();
    const meta = await requestMeta();
    const pending = await withTenant(organizationId, (db) =>
      db.chainTransaction.findFirst({
        where: { kind: "TENANT_REGISTRY_DEPLOYED", status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }),
    );
    if (!pending) throw new PlatformError("Este desarrollador no tiene un despliegue de registro pendiente.");
    let ex: Awaited<ReturnType<typeof executeChainTx>>;
    try {
      ex = await executeChainTx(organizationId, pending.id, { id: session.admin.id, email: session.admin.email }, meta, "platform");
    } catch (e) {
      // The row stays PENDING for «Desplegar registro»; why this attempt failed is kept on it for Module A
      // (a successful execution clears it).
      const failed = failure(e);
      const reason = failed.ok ? "" : failed.error;
      await withTenant(organizationId, (db) =>
        db.chainTransaction.updateMany({
          where: { id: pending.id, status: "PENDING" },
          data: { error: `${new Date().toISOString()} · ${reason}`.slice(0, 500) },
        }),
      ).catch((err) => console.error("[superadmin] could not record the failed registry deployment", err));
      refresh();
      return failed;
    }
    refresh();
    return {
      ok: true,
      message:
        ex.mode === "SIMULATION"
          ? `Registro de cumplimiento ERC-3643 (RwaxiComplianceRegistry) activo en ${ex.created} · simulación firmada, no difundida, nonce ${ex.nonce}`
          : `Registro de cumplimiento ERC-3643 (RwaxiComplianceRegistry) activo en red en ${ex.created} · tx ${ex.txHash}`,
    };
  } catch (e) {
    return failure(e);
  }
}

const DEPLOY_TOKEN = "deployOfferingToken(bytes32,bytes32,(string,string,string,string,uint256,bytes32,uint16),address,address)";

/**
 * Module A · deploys an offering's ERC-3643 token through RwaxiTenantFactory (RWAXI_OPERATOR_ROLE). It requires what
 * opening the raise requires (raising-readiness.ts): the tenant's compliance registry deployed, the official wallets
 * declared and an active compliance officer assigned. The token is created with those wallets as its administrators,
 * the Data Room's Merkle root and the developer's agreed platform fee, fixed in it for good. Queued with
 * OFFERING_TOKEN_DEPLOYMENT_QUEUED and executed at once by RWAXI's operator; once confirmed, the offering's pre-sale
 * reservations become payable (SUBSCRIPTION_PAYMENT_OPENED). A failed execution stays PENDING with its error, and
 * «Desplegar token» retries that same row.
 */
export async function deployOfferingToken(offeringId: string): Promise<PlatformActionResult> {
  try {
    if (typeof offeringId !== "string" || !ID.test(offeringId)) throw new PlatformError("Oferta inválida.");
    const session = await requirePlatformSession();
    const meta = await requestMeta();
    const operator = operatorAddress();

    const queued = await platformTx(async (tx) => {
      const offering = await tx.offering.findUnique({
        where: { id: offeringId },
        select: {
          id: true,
          organizationId: true,
          code: true,
          assetName: true,
          network: true,
          legalWrapperType: true,
          legalEntityName: true,
          dataRoomRoot: true,
          token: { select: { id: true, status: true, name: true, symbol: true, maxSupply: true, onchainId: true } },
        },
      });
      if (!offering?.token) throw new PlatformError("Oferta no encontrada.");
      // One deployment at a time per developer: a concurrent request waits here and then finds the queued row.
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${offering.organizationId} FOR UPDATE`;
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: offering.organizationId },
        select: { id: true, displayName: true, onchainId: true, complianceRegistry: true, platformFeeBps: true },
      });
      const base = { orgId: org.id, code: offering.code, symbol: offering.token.symbol };
      const pending = await tx.chainTransaction.findFirst({
        where: { offeringId: offering.id, kind: "OFFERING_TOKEN_DEPLOYED", status: "PENDING" },
        select: { id: true },
      });
      if (pending) return { ...base, chainTxId: pending.id, retry: true };
      if (offering.token.status === "DEPLOYED" || offering.token.status === "PAUSED") {
        throw new PlatformError(`El token de ${offering.code} ya está desplegado.`);
      }
      const staff = await tx.user.findMany({
        where: { organizationId: org.id, role: { in: ["TENANT_ADMIN", "COMPLIANCE_OFFICER"] } },
        orderBy: { createdAt: "asc" },
        select: { role: true, active: true, walletAddress: true },
      });
      const gaps = readinessGaps({ complianceRegistry: org.complianceRegistry, staff, operator });
      const wallets = officialWallets(staff);
      if (gaps.length || !wallets) {
        throw new PlatformError(`No se puede desplegar el token de ${offering.code}: ${gaps.map((g) => READINESS_GAP[g]).join(" ")}`);
      }
      if (!org.onchainId || !offering.token.onchainId) throw new PlatformError(`${offering.code} no tiene identificadores on-chain.`);
      if (!offering.dataRoomRoot) {
        throw new PlatformError(`${offering.code} no tiene Data Room: el token ancla su Merkle Root al desplegarse.`);
      }
      const factory = await factoryFor(tx, offering.network);
      const cfg = {
        name: offering.token.name,
        symbol: offering.token.symbol,
        legalWrapperType: offering.legalWrapperType,
        legalEntityName: offering.legalEntityName,
        maxSupplyCap: offering.token.maxSupply,
        dataRoomMerkleRoot: offering.dataRoomRoot,
        platformFeeBps: org.platformFeeBps,
      };
      const chainTx = await tx.chainTransaction.create({
        data: {
          organizationId: org.id,
          offeringId: offering.id,
          network: offering.network,
          kind: "OFFERING_TOKEN_DEPLOYED",
          contractAddress: factory,
          method: DEPLOY_TOKEN,
          args: { organizationId: org.onchainId, offeringId: offering.token.onchainId, cfg, ...wallets },
          status: "PENDING",
        },
      });
      await tx.tokenDeployment.update({ where: { id: offering.token.id }, data: { status: "DEPLOYING", platformFeeBps: org.platformFeeBps } });
      const reservations = await tx.subscription.count({ where: { offeringId: offering.id, status: "RESERVED" } });
      await audit(tx, session, meta, {
        organizationId: org.id,
        action: "OFFERING_TOKEN_DEPLOYMENT_QUEUED",
        entityType: "Offering",
        entityId: offering.id,
        payload: {
          tenant: org.displayName,
          offeringCode: offering.code,
          assetName: offering.assetName,
          network: offering.network,
          factory,
          symbol: offering.token.symbol,
          maxSupply: offering.token.maxSupply,
          dataRoomRoot: offering.dataRoomRoot,
          platformFeeBps: org.platformFeeBps,
          ...wallets,
          reservations,
          chainTransactionId: chainTx.id,
        },
      });
      return { ...base, chainTxId: chainTx.id, retry: false };
    });
    refresh();

    // The deployment itself: RWAXI's operator through the factory, as «Desplegar registro».
    let ex: Awaited<ReturnType<typeof executeChainTx>>;
    try {
      ex = await executeChainTx(queued.orgId, queued.chainTxId, { id: session.admin.id, email: session.admin.email }, meta, "platform");
    } catch (e) {
      const failed = failure(e);
      const reason = failed.ok ? "" : failed.error;
      await withTenant(queued.orgId, (db) =>
        db.chainTransaction.updateMany({
          where: { id: queued.chainTxId, status: "PENDING" },
          data: { error: `${new Date().toISOString()} · ${reason}`.slice(0, 500) },
        }),
      ).catch((err) => console.error("[superadmin] could not record the failed token deployment", err));
      refresh();
      if (queued.retry) return failed;
      return {
        ok: true,
        warning: true,
        message: `Token de ${queued.code} en cola, pero la ejecución falló: ${reason} Reinténtalo con «Desplegar token».`,
      };
    }
    refresh();
    const opened = await withTenant(queued.orgId, (db) =>
      db.auditEvent.count({ where: { action: "SUBSCRIPTION_PAYMENT_OPENED", payload: { path: ["chainTransactionId"], equals: queued.chainTxId } } }),
    );
    const where =
      ex.mode === "SIMULATION" ? `simulación firmada, no difundida, nonce ${ex.nonce}` : `confirmado en red · tx ${ex.txHash}`;
    return {
      ok: true,
      message: `Token ${queued.symbol} de ${queued.code} desplegado en ${ex.created} (${where}) · reservas abiertas a pago: ${opened}`,
    };
  } catch (e) {
    return failure(e);
  }
}

// ───────────────────────────────────────────────────────── module G: on-chain census (read-only)

export type OnchainCensusResult =
  | { ok: true; mode: "SIMULATION" | "RPC"; checkedAt: string; supplies: Record<string, { supply: number } | { error: string }> }
  | { ok: false; error: string };

/**
 * Module G · in RPC mode, the totalSupply() each deployed token reports on its network right now, to set against the
 * census of the platform (MINTED subscriptions and confirmed mints). In SIMULATION nothing is broadcast: there is no
 * network to ask. Read-only; keyed by the token address in lowercase.
 */
export async function checkOnchainCensus(): Promise<OnchainCensusResult> {
  try {
    await requirePlatformSession();
    const mode = executionMode();
    const checkedAt = new Date().toISOString();
    if (mode !== "RPC") return { ok: true, mode, checkedAt, supplies: {} };
    const tokens = await retryTransient(
      () =>
        platformPrisma().tokenDeployment.findMany({
          where: { status: { in: ["DEPLOYED", "PAUSED"] }, contractAddress: { not: null } },
          select: { network: true, contractAddress: true },
        }),
      { repeatable: true },
    );
    const supplies: Record<string, { supply: number } | { error: string }> = {};
    await Promise.all(
      tokens.map(async (t) => {
        const key = t.contractAddress!.toLowerCase();
        try {
          supplies[key] = { supply: await readTokenSupply(t.network, t.contractAddress!) };
        } catch (e) {
          supplies[key] = { error: e instanceof ExecutionError ? e.message : e instanceof Error ? e.message.split("\n")[0]! : "error" };
        }
      }),
    );
    return { ok: true, mode, checkedAt, supplies };
  } catch (e) {
    return failure(e) as { ok: false; error: string };
  }
}
