"use server";

/**
 * Lifecycle of an offering, decided by the developer (TENANT_ADMIN) in its backoffice: STRUCTURING (listed as
 * "coming soon", no subscriptions) → ACTIVE (raises capital) → FUNDED (raise completed). Only ACTIVE takes new
 * subscriptions (subscribe() checks it, also inside its atomic UPDATE). Subscriptions already signed carry on
 * (reconciliation and mint) whatever the status. One withTenant transaction: conditional transition + AuditEvent.
 */
import { revalidatePath } from "next/cache";
import { evidenceHash } from "@rwaxi/blockchain-sdk/canonical";
import { withTenant, type ProjectStatus } from "@rwaxi/database";
import { LocalizedError } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import { operatorAddress } from "@/app/_lib/server/chain-executor";
import { READINESS_GAP, readinessGaps } from "@/app/_lib/server/raising-readiness";
import { requestMeta } from "@/app/_lib/server/tenant-context";
import { requireBackofficeSession } from "./_lib/session";
import type { ActionResult } from "./_lib/types";

/** Seeded offerings have readable ids (off_avista); the rest are cuids. */
const OFFERING_ID = /^[A-Za-z0-9_-]{1,64}$/;
const STATUSES: readonly ProjectStatus[] = ["STRUCTURING", "ACTIVE", "FUNDED"];
/** Allowed transitions. Leaving ACTIVE stops capital raising: it needs a reason. */
const NEXT: Record<ProjectStatus, readonly ProjectStatus[]> = {
  STRUCTURING: ["ACTIVE"],
  ACTIVE: ["STRUCTURING", "FUNDED"],
  FUNDED: ["ACTIVE"],
};

class OfferingStatusError extends LocalizedError {}

const clean = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/** "Estado de captación": opens, closes or completes the raise of one offering of the host tenant. */
export async function setOfferingStatus(offeringId: string, status: ProjectStatus, reason: string): Promise<ActionResult> {
  const tr = await requestTranslate("tenant");
  try {
    if (typeof offeringId !== "string" || !OFFERING_ID.test(offeringId)) throw new OfferingStatusError("Oferta inválida.");
    if (!STATUSES.includes(status)) throw new OfferingStatusError("Estado de la oferta inválido.");
    const note = clean(reason);
    if (note.length > 300) throw new OfferingStatusError("El motivo admite hasta 300 caracteres.");
    const session = await requireBackofficeSession("TENANT_ADMIN");
    const meta = await requestMeta();
    const orgId = session.tenant.id;

    const message = await withTenant(
      orgId,
      async (tx) => {
        const offering = await tx.offering.findUnique({
          where: { id: offeringId },
          select: { id: true, code: true, assetName: true, status: true, totalUnits: true, unitsSubscribed: true },
        });
        if (!offering) throw new OfferingStatusError("Oferta no encontrada en este tenant.");
        if (offering.status === status) throw new OfferingStatusError("La oferta ya está en ese estado; recarga la mesa.");
        if (!NEXT[offering.status].includes(status)) throw new OfferingStatusError("Ese cambio de estado no está permitido.");
        if (offering.status === "ACTIVE" && note.length < 10) {
          throw new OfferingStatusError("Cerrar la captación exige un motivo de 10 a 300 caracteres.");
        }
        if (status === "ACTIVE") {
          // Opening the raise requires what deploying the token requires: the tenant's compliance registry, the
          // official wallets declared and an active compliance officer assigned (without them no KYC can be
          // approved, no token deployed, nobody could subscribe).
          const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId }, select: { complianceRegistry: true } });
          const staff = await tx.user.findMany({
            where: { role: { in: ["TENANT_ADMIN", "COMPLIANCE_OFFICER"] } },
            select: { role: true, active: true, walletAddress: true },
          });
          const gaps = readinessGaps({ complianceRegistry: org.complianceRegistry, staff, operator: operatorAddress() });
          if (gaps.length) {
            throw new OfferingStatusError("No se puede abrir la captación: {gaps}", { gaps: gaps.map((g) => tr(READINESS_GAP[g])).join(" ") });
          }
        }

        const now = new Date();
        const { count } = await tx.offering.updateMany({ where: { id: offering.id, status: offering.status }, data: { status } });
        if (count !== 1) throw new OfferingStatusError("Otro usuario cambió el estado de la oferta; recarga la mesa.");

        const payload = {
          offeringCode: offering.code,
          assetName: offering.assetName,
          from: offering.status,
          to: status,
          reason: note || null,
          unitsSubscribed: offering.unitsSubscribed,
          totalUnits: offering.totalUnits,
        };
        await tx.auditEvent.create({
          data: {
            organizationId: orgId,
            action: "OFFERING_STATUS_CHANGED",
            actorUserId: session.reviewer.id,
            actorEmail: session.reviewer.email,
            entityType: "Offering",
            entityId: offering.id,
            subjectHash: evidenceHash({ action: "OFFERING_STATUS_CHANGED", organizationId: orgId, entityId: offering.id, ...payload }),
            payload,
            ...meta,
            createdAt: now,
          },
        });
        return status === "ACTIVE"
          ? tr("{code}: captación abierta (ACTIVE)", { code: offering.code })
          : status === "FUNDED"
            ? tr("{code}: captación completada (FUNDED)", { code: offering.code })
            : tr("{code}: de vuelta a estructuración (STRUCTURING)", { code: offering.code });
      },
      { maxWait: 10_000, timeout: 15_000 },
    );

    revalidatePath("/tenant/[slug]/backoffice", "page");
    revalidatePath("/tenant/[slug]", "page");
    revalidatePath("/vitrina", "page");
    return { ok: true, message };
  } catch (e) {
    if (e instanceof LocalizedError) return { ok: false, error: render(tr, e.reason) };
    console.error("[backoffice] offering status change failed", e);
    return { ok: false, error: tr("No se pudo cambiar el estado de la oferta. Inténtalo de nuevo.") };
  }
}
