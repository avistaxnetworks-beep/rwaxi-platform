import "server-only";
import { forTenant, offeringTranslations, resolveTenant, type PublicOffering } from "@rwaxi/database";
import type { DbTenantView } from "@/app/_lib/data/db-tenants";
import { msg } from "@/app/_i18n/marks";
import { LEGAL_COMPLIANCE } from "@/app/_lib/data/legal";
import { toVitrinaProject } from "@/app/_lib/offering-view";
import { findTenant } from "./directory";
import { PORTAL_OFFERING } from "./journey";

const DOMAIN_STATUS = { NOT_CONFIGURED: "sin_configurar", PENDING_DNS: "sin_verificar", VERIFIED: "verificado" } as const;

/** Display name of the tenant on this host, for page titles (demo developers first). */
export async function tenantDisplayName(slug: string): Promise<string | null> {
  return findTenant(slug)?.displayName ?? (await resolveTenant(slug).catch(() => null))?.displayName ?? null;
}

/**
 * Tenant onboarded in PostgreSQL (not a demo developer of the prototype), read under RLS: the
 * organization, the offering the portal shows (PORTAL_OFFERING) with its token, and its Data Room.
 * null when the slug has no organization or it has no offering yet.
 */
export async function loadDbTenantView(slug: string): Promise<DbTenantView | null> {
  const resolved = await resolveTenant(slug);
  if (!resolved || resolved.slug !== slug) return null;
  const db = forTenant(resolved.id);
  const [org, offering] = await Promise.all([
    // Only what the portal shows: what a server component awaits can reach the browser (React's development debug
    // info serializes it), and RWAXI's commercial terms with the developer are never the investor's to see.
    db.organization.findUnique({
      where: { id: resolved.id },
      select: {
        slug: true,
        displayName: true,
        legalName: true,
        brandColor: true,
        portalStatus: true,
        published: true,
        taxId: true,
        customDomain: true,
        domainStatus: true,
        complianceRegime: true,
        complianceContactEmail: true,
        complianceTemplate: true,
        ndaTemplate: true,
        onboardedAt: true,
      },
    }),
    db.offering.findFirst({
      ...PORTAL_OFFERING,
      include: { token: true, documents: { orderBy: [{ folder: "asc" }, { uploadedAt: "asc" }, { name: "asc" }] } },
    }),
  ]);
  if (!org || !offering) return null;

  const token = offering.token;
  const deployed = !!token?.contractAddress && (token.status === "DEPLOYED" || token.status === "PAUSED");
  const listed: PublicOffering = {
    tenant: { slug: org.slug, displayName: org.displayName, legalName: org.legalName, brandColor: org.brandColor, portalStatus: org.portalStatus },
    code: offering.code,
    assetName: offering.assetName,
    city: offering.city,
    region: offering.region,
    assetType: offering.assetType,
    stage: offering.stage,
    renderKind: offering.renderKind,
    legalEntityName: offering.legalEntityName,
    legalWrapperType: offering.legalWrapperType,
    legalWrapperNote: offering.legalWrapperNote,
    economicRight: offering.economicRight,
    targetIrrPct: Number(offering.targetIrrPct),
    distributionYieldPct: Number(offering.distributionYieldPct),
    appreciationPct: Number(offering.appreciationPct),
    minTicketUsd: Number(offering.minTicketUsd),
    unitPriceUsd: Number(offering.unitPriceUsd),
    raiseTargetUsd: Number(offering.raiseTargetUsd),
    assetValueUsd: Number(offering.assetValueUsd),
    totalUnits: offering.totalUnits,
    unitsSubscribed: offering.unitsSubscribed,
    rentStartMonths: offering.rentStartMonths,
    network: offering.network,
    pipeline: Array.isArray(offering.pipeline) ? (offering.pipeline as string[]) : [],
    dataRoomRoot: offering.dataRoomRoot,
    token: token ? { status: token.status, symbol: token.symbol, address: token.contractAddress } : null,
    capturePaused: !!offering.capturePausedAt,
    translations: offeringTranslations(offering.translations),
    status: offering.status,
  };
  const project = { ...toVitrinaProject(listed), id: slug } as DbTenantView["project"];
  const merkle = String(project.merkle);

  return {
    id: slug,
    project,
    developer: {
      slug: org.slug,
      displayName: org.displayName,
      legalName: org.legalName,
      nit: org.taxId,
      color: org.brandColor,
      domain: org.customDomain ?? "",
      symbol: token?.symbol ?? "",
    },
    regime: org.complianceRegime === "SARLAFT" ? "sarlaft" : "sagrilaft",
    contact: org.complianceContactEmail,
    since: org.onboardedAt.toISOString().slice(0, 10),
    presenter: [org.displayName, msg("Presentación del desarrollador")],
    tenant: {
      portalStatus: org.portalStatus,
      published: org.published,
      domainStatus: DOMAIN_STATUS[org.domainStatus],
      ndaText: org.ndaTemplate,
      complianceTpl: { ...LEGAL_COMPLIANCE, ...(org.complianceTemplate as Record<string, unknown>) },
      docs: offering.documents.map((d) => ({
        id: d.id,
        folder: d.folder,
        name: d.name,
        restricted: d.restricted,
        hash: d.sha256.replace(/^0x/, ""),
        size: d.sizeBytes,
        at: d.uploadedAt.toISOString().slice(0, 10),
        uploaded: false,
      })),
      merkle,
      onchainRoot: null,
      mint: {
        status: deployed ? "minted" : "none",
        network: String(project.chain),
        name: token?.name ?? `${offering.assetName} Unit`,
        symbol: token?.symbol ?? "",
        supply: token?.maxSupply ?? offering.totalUnits,
        price: Number(token?.unitPriceUsd ?? offering.unitPriceUsd),
        contract: token?.contractAddress ?? null,
        tx: token?.deployTxHash ?? null,
      },
      leads: [],
    },
  };
}
