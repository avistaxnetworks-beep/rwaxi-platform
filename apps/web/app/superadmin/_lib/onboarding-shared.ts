// B2B developer onboarding: field rules shared by the wizard (client) and onboardDeveloper() (server).
import { DATAROOM } from "@/app/_lib/data/projects";
import { RESERVED_SUBDOMAINS } from "@/app/_lib/hosts";

export const SLUG_RULE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
export const NIT_RULE = /^\d{3}\.\d{3}\.\d{3}-\d$/;
export const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const WALLET_RULE = /^0x[0-9a-fA-F]{40}$/;
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const OFFERING_CODE = /^P-\d{2,4}$/;
export const TOKEN_SYMBOL = /^[A-Z]{3,6}$/;

/** Slugs a new tenant may not take: reserved subdomains and the ids of the prototype projects. */
export const RESERVED_SLUGS = new Set([...RESERVED_SUBDOMAINS, "santabarbara", "poblado", "avista", "backoffice"]);

/** DIAN check digit (dígito de verificación) of a 9-digit NIT base. */
export function nitCheckDigit(base9: string): number {
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const sum = base9
    .split("")
    .reverse()
    .reduce((s, d, i) => s + Number(d) * weights[i]!, 0);
  const r = sum % 11;
  return r > 1 ? 11 - r : r;
}

export function nitIsValid(nit: string): boolean {
  return NIT_RULE.test(nit) && nitCheckDigit(nit.slice(0, 11).replace(/\./g, "")) === Number(nit.slice(-1));
}

/** "Costa Azul" → "costaazul", "Andes Urbano S.A.S." → "andesurbano" (the prototype's subdomain derivation, max 18 chars). */
export function slugFrom(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/s\.a\.s\.?|s\.a\.?/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 18);
}

const channel = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** WCAG contrast of the brand color against the better of white and Morado Noche (#190A36). */
export function brandContrast(hex: string): number {
  const l = luminance(hex);
  return Math.max(ratio(l, 1), ratio(l, luminance("#190A36")));
}

export const WRAPPERS = {
  SAS_SPV: {
    label: "SPV Sociedad por Acciones Simplificada (S.A.S.)",
    note: "Sociedad independiente creada solo para este activo; el inversionista participa en sus derechos económicos.",
  },
  FIDUCIARY_TRUST: {
    label: "Patrimonio Autónomo / Encargo Fiduciario",
    note: "El activo y los aportes se administran en un patrimonio autónomo separado del originador, bajo una fiduciaria vigilada.",
  },
  PARTICIPATION_ACCOUNTS: {
    label: "Cuentas en Participación",
    note: "El gestor opera el negocio y los partícipes ocultos reciben su parte de los resultados según el contrato.",
  },
} as const;
export type WrapperKey = keyof typeof WRAPPERS;

export const OFFERING_STAGES = { PRESALE: "Pre-venta", STRUCTURING: "En estructuración / construcción" } as const;
export type StageKey = keyof typeof OFFERING_STAGES;

export const RENDER_KINDS = { tower: "Torre de oficinas", suites: "Suites / renta corta", resort: "Resort hotelero" } as const;
export type RenderKey = keyof typeof RENDER_KINDS;

export const NETWORK_LABEL: Record<string, string> = {
  POLYGON_AMOY: "Polygon Amoy (testnet)",
  BASE_SEPOLIA: "Base Sepolia (testnet)",
  POLYGON: "Polygon",
  BASE: "Base",
  HARDHAT: "Hardhat local (desarrollo)",
};

/** The standard Data Room of the approved prototype: 4 folders, 13 documents. */
export const DOCUMENT_SLOTS: { folder: string; name: string; restricted: boolean }[] = (
  DATAROOM as { n: string; name: string; docs: [string, boolean][] }[]
).flatMap((f) => f.docs.map(([name, restricted]) => ({ folder: `${f.n} ${f.name}`, name, restricted })));

export interface OnboardingDocument {
  folder: string;
  name: string;
  restricted: boolean;
  /** SHA-256 of the file bytes, computed in the browser (0x + 64 hex) and recomputed by the server on upload */
  sha256: string;
  sizeBytes: number;
  fileName: string;
  /** DocumentVault receipt of the verified upload to staging, set when "Crear tenant" uploads the files */
  receipt?: string;
}

export interface OnboardingInput {
  company: {
    legalName: string;
    displayName: string;
    taxId: string;
    slug: string;
    regime: "SAGRILAFT_PTEE" | "SARLAFT";
    brandColor: string;
  };
  team: {
    admin: { fullName: string; email: string; wallet: string };
    officer: { fullName: string; email: string; wallet: string };
  };
  offering: {
    code: string;
    assetName: string;
    city: string;
    region: string;
    assetType: string;
    stage: StageKey;
    renderKind: RenderKey;
    legalWrapperType: WrapperKey;
    legalEntityName: string;
    economicRight: string;
    unitPriceUsd: string;
    totalUnits: string;
    minTicketUsd: string;
    assetValueUsd: string;
    targetIrrPct: string;
    distributionYieldPct: string;
    appreciationPct: string;
    rentStartMonths: string;
    network: string;
    tokenSymbol: string;
  };
  documents: OnboardingDocument[];
  fees: { setupUsd: string; monthlyUsd: string; usagePct: string };
}
