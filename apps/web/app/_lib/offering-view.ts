// Maps an offering of the live catalogue (PostgreSQL) to the project / developer shapes the ported
// components render: the vitrina catalogue and the portal of tenants onboarded in the database.
// Client-safe: no runtime imports from the database package.
import type { OfferingTranslations, PublicOffering } from "@rwaxi/database";
import type { Locale } from "@/app/_i18n/config";
import { vmsg } from "@/app/_i18n/marks";
import { DEVELOPERS } from "@/app/_lib/data/tenants";

const STAGE: Record<string, string> = { PRESALE: "preventa", STRUCTURING: "estructuracion", OPERATING: "operacion" };
const WRAPPER: Record<string, string> = {
  SAS_SPV: vmsg("SPV Sociedad por Acciones Simplificada (S.A.S.)"),
  FIDUCIARY_TRUST: vmsg("Patrimonio Autónomo / Encargo Fiduciario"),
  PARTICIPATION_ACCOUNTS: vmsg("Vehículo de Propósito Especial (SPV / Cuentas en Participación)"),
};
const CHAIN: Record<string, string> = {
  POLYGON: "EVM Polygon",
  BASE: "EVM Base",
  POLYGON_AMOY: "EVM Polygon Amoy",
  BASE_SEPOLIA: "EVM Base Sepolia",
  HARDHAT: "EVM Hardhat",
};

/** Prototype project ids keep the approved renders and photo slots (elpoblado → "poblado"). */
const PROTOTYPE_ID: Record<string, string> = Object.fromEntries(
  Object.entries(DEVELOPERS as Record<string, { slug: string }>).map(([id, d]) => [d.slug, id]),
);

export const projectIdOf = (o: PublicOffering) => PROTOTYPE_ID[o.tenant.slug] ?? o.tenant.slug;

/* eslint-disable @typescript-eslint/no-explicit-any -- the prototype components are untyped */
/**
 * The project in `locale`: the developer's commercial copy (Offering.translations) over the Spanish
 * original, field by field. Names of assets and vehicles are proper nouns and never change.
 */
export function localizeProject(project: any, translations: OfferingTranslations | null | undefined, locale: Locale): any {
  const copy = locale === "es" ? undefined : translations?.[locale];
  if (!project || !copy) return project;
  return {
    ...project,
    city: copy.city ?? project.city,
    region: copy.region ?? project.region,
    type: copy.assetType ?? project.type,
    right: copy.economicRight ?? project.right,
    wrapperNote: copy.legalWrapperNote ?? project.wrapperNote,
  };
}

export function toVitrinaProject(o: PublicOffering, locale: Locale = "es"): any {
  const address = o.token?.address;
  const project = {
    id: projectIdOf(o),
    slug: o.tenant.slug,
    code: o.code,
    asset: o.assetName,
    city: o.city,
    region: o.region,
    type: o.assetType,
    stage: STAGE[o.stage] ?? "estructuracion",
    render: o.renderKind,
    vehicle: o.legalEntityName,
    wrapper: WRAPPER[o.legalWrapperType] ?? o.legalWrapperType,
    wrapperNote: o.legalWrapperNote,
    right: o.economicRight,
    tir: o.targetIrrPct,
    dist: o.distributionYieldPct,
    val: o.appreciationPct,
    ticket: o.minTicketUsd,
    unit: o.unitPriceUsd,
    raise: o.raiseTargetUsd,
    assetValue: o.assetValueUsd,
    totalUnits: o.totalUnits,
    unitsSubscribed: o.unitsSubscribed,
    // live progress: units committed (signed subscriptions + historic placements) / total units
    subscribed: o.totalUnits ? o.unitsSubscribed / o.totalUnits : 0,
    chain: CHAIN[o.network] ?? o.network,
    contract: address ? `${address.slice(0, 5)}...${address.slice(-3)}` : null,
    tokenStatus: o.token?.status ?? "NOT_DEPLOYED",
    // platform pause of capital raising (Super-Admin, module A): listed without a link to subscribe
    capturePaused: o.capturePaused,
    rentStart: o.rentStartMonths,
    pipeline: o.pipeline,
    merkle: (o.dataRoomRoot ?? "").replace(/^0x/, "") || "0".repeat(64),
  };
  return localizeProject(project, o.translations, locale);
}

export function toVitrinaDeveloper(o: PublicOffering, prototype: any): any {
  return {
    ...(prototype ?? {}),
    slug: o.tenant.slug,
    displayName: o.tenant.displayName,
    legalName: o.tenant.legalName,
    color: o.tenant.brandColor,
    portalStatus: o.tenant.portalStatus,
    published: true,
  };
}
