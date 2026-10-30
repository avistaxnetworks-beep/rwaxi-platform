import "server-only";
import { computeDataRoomRoot } from "@rwaxi/blockchain-sdk/merkle";
import { PLATFORM_FEE_BPS_MAX, PLATFORM_FEE_BPS_MIN, parsePlatformFeeBps } from "@rwaxi/blockchain-sdk/platform-fee";
import type { ChainNetwork, ComplianceRegime, LegalWrapperType, OfferingStage } from "@rwaxi/database";
import {
  DOCUMENT_SLOTS,
  EMAIL_RULE,
  HEX_COLOR,
  NIT_RULE,
  OFFERING_CODE,
  OFFERING_STAGES,
  RENDER_KINDS,
  RESERVED_SLUGS,
  SLUG_RULE,
  TOKEN_SYMBOL,
  WALLET_RULE,
  WRAPPERS,
  brandContrast,
  nitCheckDigit,
  type OnboardingInput,
} from "./onboarding-shared";

/** Networks a new developer may be onboarded on (the local Hardhat node only outside production). */
export const onboardingNetworks = (): ChainNetwork[] => [
  "POLYGON_AMOY",
  "BASE_SEPOLIA",
  "POLYGON",
  "BASE",
  ...(process.env.NODE_ENV !== "production" ? (["HARDHAT"] as const) : []),
];

export interface OnboardingPlan {
  company: { legalName: string; displayName: string; taxId: string; slug: string; regime: ComplianceRegime; brandColor: string };
  /** `wallet`: null when not declared yet; the registry is queued only once both wallets exist */
  admin: { fullName: string; email: string; wallet: string | null };
  officer: { fullName: string; email: string; wallet: string | null };
  offering: {
    code: string;
    assetName: string;
    city: string;
    region: string;
    assetType: string;
    stage: OfferingStage;
    renderKind: string;
    legalWrapperType: LegalWrapperType;
    legalWrapperNote: string;
    legalEntityName: string;
    economicRight: string;
    unitPriceUsd: string;
    totalUnits: number;
    minTicketUsd: string;
    raiseTargetUsd: string;
    assetValueUsd: string;
    targetIrrPct: string;
    distributionYieldPct: string;
    appreciationPct: string;
    rentStartMonths: number;
    network: ChainNetwork;
    tokenSymbol: string;
    pipeline: string[];
  };
  /** `receipt`: the DocumentVault receipt of the file's verified upload to staging (/api/vault/upload) */
  documents: { folder: string; name: string; restricted: boolean; sha256: string; sizeBytes: number; receipt: string }[];
  dataRoomRoot: string;
  /** platformFeeBps: whole basis points within 25–500 (0.25 %–5 %), the range RwaxiPropertyToken enforces */
  fees: { setupUsd: string; monthlyUsd: string; platformFeeBps: number };
}

class Invalid extends Error {}

/** The platform fee agreed with the developer: whole basis points within 25 (0.25 %) and 500 (5 %). */
function platformFee(v: unknown): number {
  const bps = parsePlatformFeeBps(v);
  if (bps === null) {
    throw new Invalid(
      `Comisión de plataforma: un número entero de puntos básicos entre ${PLATFORM_FEE_BPS_MIN} (0,25 %) y ${PLATFORM_FEE_BPS_MAX} (5 %).`,
    );
  }
  return bps;
}

const clean = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
function text(v: unknown, label: string, min: number, max: number): string {
  const s = clean(v);
  if (s.length < min || s.length > max) throw new Invalid(`${label}: entre ${min} y ${max} caracteres.`);
  return s;
}
function decimal(v: unknown, label: string, min: number, max: number, decimals: number): string {
  const s = clean(String(v ?? "")).replace(",", ".");
  const n = Number(s);
  if (!new RegExp(`^\\d{1,12}(?:\\.\\d{1,${decimals}})?$`).test(s) || n < min || n > max) {
    throw new Invalid(`${label}: valor entre ${min.toLocaleString("es-CO")} y ${max.toLocaleString("es-CO")} (hasta ${decimals} decimales).`);
  }
  return n.toFixed(decimals);
}
function integer(v: unknown, label: string, min: number, max: number): number {
  const s = clean(String(v ?? ""));
  const n = Number(s);
  if (!/^\d{1,12}$/.test(s) || n < min || n > max) throw new Invalid(`${label}: entero entre ${min.toLocaleString("es-CO")} y ${max.toLocaleString("es-CO")}.`);
  return n;
}
function person(raw: unknown, label: string) {
  const p = (raw ?? {}) as Record<string, unknown>;
  const email = clean(p.email).toLowerCase();
  // Optional at onboarding: an empty wallet is "not declared yet"; one that is given must be valid.
  const wallet = clean(p.wallet).toLowerCase() || null;
  if (!EMAIL_RULE.test(email) || email.length > 254) throw new Invalid(`${label}: correo inválido.`);
  if (wallet !== null && !WALLET_RULE.test(wallet)) throw new Invalid(`${label}: wallet EVM inválida (0x + 40 hex).`);
  return { fullName: text(p.fullName, `${label}: nombre`, 5, 120), email, wallet };
}

/** Validates and normalises the wizard's input; the error text is safe to show. */
export function parseOnboarding(raw: unknown): { ok: true; plan: OnboardingPlan } | { ok: false; error: string } {
  try {
    const input = (raw ?? {}) as Partial<OnboardingInput>;
    const c = (input.company ?? {}) as Partial<OnboardingInput["company"]>;
    const o = (input.offering ?? {}) as Partial<OnboardingInput["offering"]>;
    const f = (input.fees ?? {}) as Partial<OnboardingInput["fees"]>;

    const taxId = clean(c.taxId);
    if (!NIT_RULE.test(taxId)) throw new Invalid("NIT: formato 900.123.456-7.");
    const dv = nitCheckDigit(taxId.slice(0, 11).replace(/\./g, ""));
    if (dv !== Number(taxId.slice(-1))) throw new Invalid(`NIT: el dígito de verificación no corresponde (debería ser ${dv}).`);
    const slug = clean(c.slug).toLowerCase();
    if (!SLUG_RULE.test(slug)) throw new Invalid("Subdominio: 3 a 32 caracteres (minúsculas, números y guiones; sin guion al inicio o al final).");
    if (RESERVED_SLUGS.has(slug)) throw new Invalid(`Subdominio: «${slug}» está reservado.`);
    const brandColor = clean(c.brandColor).toUpperCase();
    if (!HEX_COLOR.test(brandColor)) throw new Invalid("Color de marca: formato #RRGGBB.");
    if (brandContrast(brandColor) < 4.5) throw new Invalid("Color de marca: no alcanza contraste AA (4,5:1) con texto blanco ni oscuro.");
    if (c.regime !== "SAGRILAFT_PTEE" && c.regime !== "SARLAFT") throw new Invalid("Régimen de cumplimiento inválido.");

    const admin = person(input.team?.admin, "Administrador");
    const officer = person(input.team?.officer, "Oficial de Cumplimiento");
    if (admin.email === officer.email) throw new Invalid("El administrador y el oficial de cumplimiento deben tener correos distintos.");
    if (admin.wallet !== null && admin.wallet === officer.wallet) throw new Invalid("El administrador y el oficial de cumplimiento deben tener wallets distintas.");

    const code = clean(o.code).toUpperCase();
    if (!OFFERING_CODE.test(code)) throw new Invalid("Código de la oferta: formato P-04.");
    if (!o.stage || !(o.stage in OFFERING_STAGES)) throw new Invalid("Etapa: pre-venta o estructuración.");
    if (!o.renderKind || !(o.renderKind in RENDER_KINDS)) throw new Invalid("Tipo de render inválido.");
    if (!o.legalWrapperType || !(o.legalWrapperType in WRAPPERS)) throw new Invalid("Vehículo jurídico inválido.");
    const network = clean(o.network) as ChainNetwork;
    if (!onboardingNetworks().includes(network)) throw new Invalid("Red no habilitada para nuevos desarrolladores.");
    const tokenSymbol = clean(o.tokenSymbol).toUpperCase();
    if (!TOKEN_SYMBOL.test(tokenSymbol)) throw new Invalid("Símbolo del token: 3 a 6 letras.");

    const unitPriceUsd = decimal(o.unitPriceUsd, "Precio por unidad (USD)", 1, 1_000_000, 2);
    const totalUnits = integer(o.totalUnits, "Unidades totales", 1, 100_000_000);
    const raise = Number(unitPriceUsd) * totalUnits;
    if (raise > 10_000_000_000) throw new Invalid("La captación (precio × unidades) supera 10.000 millones de USD.");
    const minTicketUsd = decimal(o.minTicketUsd, "Ticket mínimo (USD)", 1, 10_000_000, 2);
    if (Number(minTicketUsd) < Number(unitPriceUsd) || Number(minTicketUsd) > raise) {
      throw new Invalid("Ticket mínimo: entre el precio de una unidad y la captación total.");
    }
    const assetValueUsd = decimal(o.assetValueUsd, "Valor del activo (USD)", 1, 100_000_000_000, 2);
    if (Number(assetValueUsd) < raise) throw new Invalid("El valor del activo no puede ser menor que la captación total.");

    const slots = new Set(DOCUMENT_SLOTS.map((d) => d.folder));
    const docs = Array.isArray(input.documents) ? input.documents : [];
    if (docs.length < 1 || docs.length > 40) throw new Invalid("Data Room: adjunta entre 1 y 40 documentos base.");
    const documents = docs.map((d, i) => {
      const sha256 = clean(d?.sha256).toLowerCase();
      if (!/^0x[0-9a-f]{64}$/.test(sha256)) throw new Invalid(`Documento ${i + 1}: SHA-256 inválido.`);
      const folder = clean(d?.folder);
      if (!slots.has(folder)) throw new Invalid(`Documento ${i + 1}: carpeta del Data Room inválida.`);
      const sizeBytes = Number(d?.sizeBytes);
      if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 50 * 1024 * 1024) throw new Invalid(`Documento ${i + 1}: tamaño entre 1 byte y 50 MB.`);
      const receipt = typeof d?.receipt === "string" ? d.receipt : "";
      if (!receipt) throw new Invalid(`Documento ${i + 1}: el servidor no lo ha verificado; vuelve a adjuntarlo.`);
      return { folder, name: text(d?.name, `Documento ${i + 1}: nombre`, 3, 120), restricted: d?.restricted !== false, sha256, sizeBytes, receipt };
    });
    if (new Set(documents.map((d) => d.sha256)).size !== documents.length) throw new Invalid("Data Room: hay documentos repetidos (mismo SHA-256).");

    const stage = o.stage as OfferingStage;
    const plan: OnboardingPlan = {
      company: {
        legalName: text(c.legalName, "Razón social", 5, 120),
        displayName: text(c.displayName, "Nombre comercial", 2, 60),
        taxId,
        slug,
        regime: c.regime,
        brandColor,
      },
      admin,
      officer,
      offering: {
        code,
        assetName: text(o.assetName, "Nombre del activo", 3, 120),
        city: text(o.city, "Ciudad", 2, 60),
        region: text(o.region, "Zona / región", 2, 80),
        assetType: text(o.assetType, "Tipo de activo", 3, 80),
        stage,
        renderKind: o.renderKind,
        legalWrapperType: o.legalWrapperType,
        legalWrapperNote: WRAPPERS[o.legalWrapperType].note,
        legalEntityName: text(o.legalEntityName, "Vehículo jurídico (razón social)", 3, 120),
        economicRight: text(o.economicRight, "Derecho económico", 10, 300),
        unitPriceUsd,
        totalUnits,
        minTicketUsd,
        raiseTargetUsd: raise.toFixed(2),
        assetValueUsd,
        targetIrrPct: decimal(o.targetIrrPct, "TIR objetivo (%)", 0, 100, 2),
        distributionYieldPct: decimal(o.distributionYieldPct, "Distribución anual (%)", 0, 100, 2),
        appreciationPct: decimal(o.appreciationPct, "Valorización anual (%)", 0, 100, 2),
        rentStartMonths: integer(o.rentStartMonths, "Meses hasta la renta", 0, 120),
        network,
        tokenSymbol,
        pipeline: stage === "PRESALE" ? ["done", "active", "pending", "pending"] : ["done", "done", "active", "pending"],
      },
      documents,
      dataRoomRoot: computeDataRoomRoot(documents),
      fees: {
        setupUsd: decimal(f.setupUsd, "Setup (USD)", 0, 1_000_000, 2),
        monthlyUsd: decimal(f.monthlyUsd, "SaaS mensual (USD)", 0, 100_000, 2),
        platformFeeBps: platformFee(f.platformFeeBps),
      },
    };
    return { ok: true, plan };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}
