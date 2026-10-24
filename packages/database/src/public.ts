import type { PrismaClient } from "@prisma/client";
import { prisma } from "./client";
import { retryTransient } from "./pool";

/** The developer's commercial copy of an offering in one language (each field falls back to the Spanish column). */
export interface OfferingCopy {
  city?: string;
  region?: string;
  assetType?: string;
  economicRight?: string;
  legalWrapperNote?: string;
}
/** Offering.translations: copy per language code (en, pt, fr, de, ru, ar, zh, ja, ko). */
export type OfferingTranslations = Partial<Record<string, OfferingCopy>>;

/** One published offering as the public vitrina may show it (no investor data). */
export interface PublicOffering {
  tenant: { slug: string; displayName: string; legalName: string; brandColor: string; portalStatus: string };
  code: string;
  assetName: string;
  city: string;
  region: string;
  assetType: string;
  stage: string;
  renderKind: string;
  legalEntityName: string;
  legalWrapperType: string;
  legalWrapperNote: string;
  economicRight: string;
  targetIrrPct: number;
  distributionYieldPct: number;
  appreciationPct: number;
  minTicketUsd: number;
  unitPriceUsd: number;
  raiseTargetUsd: number;
  assetValueUsd: number;
  totalUnits: number;
  unitsSubscribed: number;
  rentStartMonths: number;
  network: string;
  pipeline: string[];
  dataRoomRoot: string | null;
  token: { status: string; symbol: string; address: string | null } | null;
  /** capital raising paused by the platform (off-chain): shown, but no new subscriptions */
  capturePaused: boolean;
  translations: OfferingTranslations;
}

interface Row {
  tenant_slug: string;
  tenant_display_name: string;
  tenant_legal_name: string;
  tenant_brand_color: string;
  tenant_portal_status: string;
  offering_code: string;
  asset_name: string;
  city: string;
  region: string;
  asset_type: string;
  stage: string;
  render_kind: string;
  legal_entity_name: string;
  legal_wrapper_type: string;
  legal_wrapper_note: string;
  economic_right: string;
  target_irr_pct: unknown;
  distribution_yield_pct: unknown;
  appreciation_pct: unknown;
  min_ticket_usd: unknown;
  unit_price_usd: unknown;
  raise_target_usd: unknown;
  asset_value_usd: unknown;
  total_units: number;
  units_subscribed: number;
  rent_start_months: number;
  network: string;
  pipeline: unknown;
  data_room_root: string | null;
  token_status: string | null;
  token_symbol: string | null;
  token_address: string | null;
  capture_paused: boolean;
  translations: unknown;
}

const n = (v: unknown) => Number(v ?? 0);

/**
 * Public catalogue for the vitrina, through the SECURITY DEFINER function
 * `rwaxi_public_offerings()`: works without a tenant context and returns only published
 * offerings of published developers, with live progress (units committed / total).
 */
export async function listPublicOfferings(base: PrismaClient = prisma): Promise<PublicOffering[]> {
  const rows = await retryTransient(() => base.$queryRaw<Row[]>`SELECT * FROM rwaxi_public_offerings()`, {
    repeatable: true,
  });
  return rows.map((r) => ({
    tenant: {
      slug: r.tenant_slug,
      displayName: r.tenant_display_name,
      legalName: r.tenant_legal_name,
      brandColor: r.tenant_brand_color,
      portalStatus: r.tenant_portal_status,
    },
    code: r.offering_code,
    assetName: r.asset_name,
    city: r.city,
    region: r.region,
    assetType: r.asset_type,
    stage: r.stage,
    renderKind: r.render_kind,
    legalEntityName: r.legal_entity_name,
    legalWrapperType: r.legal_wrapper_type,
    legalWrapperNote: r.legal_wrapper_note,
    economicRight: r.economic_right,
    targetIrrPct: n(r.target_irr_pct),
    distributionYieldPct: n(r.distribution_yield_pct),
    appreciationPct: n(r.appreciation_pct),
    minTicketUsd: n(r.min_ticket_usd),
    unitPriceUsd: n(r.unit_price_usd),
    raiseTargetUsd: n(r.raise_target_usd),
    assetValueUsd: n(r.asset_value_usd),
    totalUnits: r.total_units,
    unitsSubscribed: r.units_subscribed,
    rentStartMonths: r.rent_start_months,
    network: r.network,
    pipeline: Array.isArray(r.pipeline) ? (r.pipeline as string[]) : [],
    dataRoomRoot: r.data_room_root,
    token: r.token_status ? { status: r.token_status, symbol: r.token_symbol ?? "", address: r.token_address } : null,
    capturePaused: r.capture_paused === true,
    translations: offeringTranslations(r.translations),
  }));
}

const COPY_FIELDS = ["city", "region", "assetType", "economicRight", "legalWrapperNote"] as const;

/** Offering.translations as stored (jsonb) → only string fields of known keys; anything else is dropped. */
export function offeringTranslations(raw: unknown): OfferingTranslations {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: OfferingTranslations = {};
  for (const [locale, copy] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-z]{2}$/.test(locale) || !copy || typeof copy !== "object") continue;
    const clean: OfferingCopy = {};
    for (const field of COPY_FIELDS) {
      const value = (copy as Record<string, unknown>)[field];
      if (typeof value === "string" && value.trim()) clean[field] = value;
    }
    out[locale] = clean;
  }
  return out;
}
