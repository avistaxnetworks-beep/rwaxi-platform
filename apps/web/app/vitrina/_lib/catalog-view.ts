// Maps the live public catalogue (PostgreSQL) to the project / developer shapes the ported
// vitrina components render. Client-safe: no runtime imports from the database package.
import type { PublicOffering } from "@rwaxi/database";
import { DEVELOPERS } from "@/app/_lib/data/tenants";

const STAGE: Record<string, string> = { PRESALE: "preventa", STRUCTURING: "estructuracion", OPERATING: "operacion" };
const WRAPPER: Record<string, string> = {
  SAS_SPV: "SPV Sociedad por Acciones Simplificada (S.A.S.)",
  FIDUCIARY_TRUST: "Patrimonio Autónomo / Encargo Fiduciario",
  PARTICIPATION_ACCOUNTS: "Vehículo de Propósito Especial (SPV / Cuentas en Participación)",
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
export function toVitrinaProject(o: PublicOffering): any {
  const address = o.token?.address;
  return {
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
