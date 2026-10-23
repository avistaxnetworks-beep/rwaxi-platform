// Demo tenants taken from the approved prototype (DEVELOPERS, PROJECTS, DEFAULT_FEES, seedLeads).
// Projects, figures and entities are illustrative.
import type {
  ChainNetwork,
  ComplianceRegime,
  KycStatus,
  LeadSource,
  LegalWrapperType,
  OfferingStage,
  RiskProfile,
} from "@prisma/client";

export interface SeedDeveloper {
  orgId: string;
  slug: string;
  displayName: string;
  legalName: string;
  taxId: string;
  brandColor: string;
  customDomain: string | null;
  regime: ComplianceRegime;
  regimeKey: "sagrilaft" | "sarlaft";
  complianceEmail: string;
  adminEmail: string;
  onboardedAt: string;
  fees: { setup: number; monthly: number; usagePct: number };
  offering: {
    id: string;
    code: string;
    assetName: string;
    city: string;
    region: string;
    assetType: string;
    stage: OfferingStage;
    renderKind: string;
    legalEntityName: string;
    legalWrapperType: LegalWrapperType;
    legalWrapperNote: string;
    economicRight: string;
    targetIrrPct: number;
    distributionYieldPct: number;
    appreciationPct: number;
    minTicketUsd: number;
    unitPriceUsd: number;
    raiseTargetUsd: number;
    assetValueUsd: number;
    rentStartMonths: number;
    network: ChainNetwork;
    pipeline: string[];
    /** share of the raise already placed (prototype PROJECTS.subscribed) */
    subscribedFraction: number;
    token: { name: string; symbol: string; deployed: boolean };
  };
}

export const DEVELOPERS: SeedDeveloper[] = [
  {
    orgId: "org_andes_urbano",
    slug: "santabarbara",
    displayName: "Andes Urbano",
    legalName: "Andes Urbano Desarrollos S.A.S.",
    taxId: "901.482.317-5",
    brandColor: "#0E5A4F",
    customDomain: "inversiones.andesurbano.co",
    regime: "SAGRILAFT_PTEE",
    regimeKey: "sagrilaft",
    complianceEmail: "cumplimiento@andesurbano.co",
    adminEmail: "admin@andesurbano.co",
    onboardedAt: "2026-03-02",
    fees: { setup: 12000, monthly: 1800, usagePct: 1.2 },
    offering: {
      id: "off_santabarbara",
      code: "P-01",
      assetName: "Torre Corporativa Santa Bárbara",
      city: "Bogotá",
      region: "Santa Bárbara · Usaquén",
      assetType: "Oficinas corporativas clase A",
      stage: "STRUCTURING",
      renderKind: "tower",
      legalEntityName: "Santa Bárbara Office S.A.S.",
      legalWrapperType: "SAS_SPV",
      legalWrapperNote:
        "Sociedad independiente creada solo para este activo; el inversionista participa en sus derechos económicos.",
      economicRight:
        "Participación sobre flujos de arrendamiento corporativo desde la entrega y valorización estimada",
      targetIrrPct: 15.2,
      distributionYieldPct: 6.1,
      appreciationPct: 7.4,
      minTicketUsd: 2500,
      unitPriceUsd: 250,
      raiseTargetUsd: 25_000_000,
      assetValueUsd: 41_000_000,
      rentStartMonths: 20,
      network: "POLYGON",
      pipeline: ["done", "done", "active", "pending"],
      subscribedFraction: 0.41,
      token: { name: "Torre Corporativa Santa Bárbara Unit", symbol: "TSB", deployed: false },
    },
  },
  {
    orgId: "org_valle_alto",
    slug: "elpoblado",
    displayName: "Valle Alto Constructora",
    legalName: "Valle Alto Constructora S.A.S.",
    taxId: "900.917.264-1",
    brandColor: "#A4461F",
    customDomain: null,
    regime: "SARLAFT",
    regimeKey: "sarlaft",
    complianceEmail: "oficialcumplimiento@vallealto.co",
    adminEmail: "admin@vallealto.co",
    onboardedAt: "2026-06-17",
    fees: { setup: 6500, monthly: 950, usagePct: 1.5 },
    offering: {
      id: "off_elpoblado",
      code: "P-02",
      assetName: "Suites El Poblado",
      city: "Medellín",
      region: "El Poblado",
      assetType: "Renta corta · Suites amobladas",
      stage: "PRESALE",
      renderKind: "suites",
      legalEntityName: "P.A. El Poblado Suites",
      legalWrapperType: "FIDUCIARY_TRUST",
      legalWrapperNote:
        "Recursos y activo administrados por una sociedad fiduciaria, separados del patrimonio del promotor.",
      economicRight: "Participación sobre flujos de renta corta desde la apertura y valorización estimada",
      targetIrrPct: 14.5,
      distributionYieldPct: 8.1,
      appreciationPct: 6.3,
      minTicketUsd: 500,
      unitPriceUsd: 50,
      raiseTargetUsd: 6_500_000,
      assetValueUsd: 9_200_000,
      rentStartMonths: 14,
      network: "BASE",
      pipeline: ["done", "active", "pending", "pending"],
      subscribedFraction: 0.18,
      token: { name: "Suites El Poblado Unit", symbol: "SEP", deployed: false },
    },
  },
  {
    orgId: "org_avista",
    slug: "avista",
    displayName: "Avista Hospitality Group",
    legalName: "Avista Hospitality Group S.A.S.",
    taxId: "901.105.738-9",
    brandColor: "#0B4F7A",
    customDomain: "invest.avistaresort.co",
    regime: "SAGRILAFT_PTEE",
    regimeKey: "sagrilaft",
    complianceEmail: "compliance@avistaresort.co",
    adminEmail: "admin@avistaresort.co",
    onboardedAt: "2025-09-08",
    fees: { setup: 9500, monthly: 1400, usagePct: 1 },
    offering: {
      id: "off_avista",
      code: "P-03",
      assetName: "Avista Beach Villas & Resort",
      city: "Córdoba",
      region: "Litoral Caribe",
      assetType: "Hospitality · Villas turísticas",
      stage: "OPERATING",
      renderKind: "resort",
      legalEntityName: "Avista Tokenization Fund I",
      legalWrapperType: "PARTICIPATION_ACCOUNTS",
      legalWrapperNote:
        "Contrato de cuentas en participación con un gestor ostensible; los partícipes reciben su parte de los resultados del negocio.",
      economicRight: "Participación sobre flujos de renta hotelera y valorización estimada del activo",
      targetIrrPct: 13.8,
      distributionYieldPct: 7.2,
      appreciationPct: 5.9,
      minTicketUsd: 1000,
      unitPriceUsd: 100,
      raiseTargetUsd: 12_000_000,
      assetValueUsd: 18_500_000,
      rentStartMonths: 0,
      network: "BASE",
      pipeline: ["done", "done", "done", "active"],
      subscribedFraction: 0.68,
      token: { name: "Avista Villas Unit", symbol: "AVB", deployed: true },
    },
  },
];

export const DATAROOM: { folder: string; docs: [name: string, restricted: boolean][] }[] = [
  {
    folder: "01 Jurídico y Tradición",
    docs: [
      ["Resumen de estructura del vehículo", false],
      ["Certificado de tradición y libertad", true],
      ["Documento constitutivo del Legal Wrapper", true],
      ["Estudio de títulos", true],
    ],
  },
  {
    folder: "02 Modelo Financiero",
    docs: [
      ["Teaser financiero del proyecto", false],
      ["Modelo financiero (escenarios base y conservador)", true],
      ["Avalúo comercial de referencia", true],
    ],
  },
  {
    folder: "03 Licencias Técnicas",
    docs: [
      ["Ficha técnica del inmueble", false],
      ["Licencia de construcción / uso de suelo", true],
      ["Pólizas y estudios técnicos", true],
    ],
  },
  {
    folder: "04 Gobierno Corporativo",
    docs: [
      ["Política de distribuciones", false],
      ["Reglamento de asamblea de inversionistas", true],
      ["Informe del comité de inversiones", true],
    ],
  },
];

export interface SeedLead {
  fullName: string;
  docType: "CC" | "NIT";
  docNumber: string;
  source: LeadSource;
  nda: boolean;
  kyc: KycStatus;
  subscriptionUsd?: number;
  lists: string;
  activity: string | null;
  incomeBracket: number | null;
  risk: RiskProfile | null;
}

export const LEADS: SeedLead[] = [
  {
    fullName: "Laura Gómez Restrepo",
    docType: "CC",
    docNumber: "52381904",
    source: "REFERRAL",
    nda: true,
    kyc: "APPROVED",
    subscriptionUsd: 20000,
    lists: "Sin coincidencias",
    activity: "Empresario / socio de empresa",
    incomeBracket: 2,
    risk: "DYNAMIC",
  },
  {
    fullName: "Carlos A. Méndez Pardo",
    docType: "CC",
    docNumber: "79604112",
    source: "REFERRAL",
    nda: true,
    kyc: "PENDING",
    lists: "Sin coincidencias",
    activity: "Empleado / asalariado",
    incomeBracket: 1,
    risk: "MODERATE",
  },
  {
    fullName: "Jorge Iván Toro",
    docType: "CC",
    docNumber: "71228540",
    source: "REFERRAL",
    nda: true,
    kyc: "PENDING",
    lists: "Coincidencia parcial · revisar homónimo",
    activity: "Rentista de capital (inversiones, arriendos)",
    incomeBracket: 3,
    risk: "MODERATE",
  },
  {
    fullName: "Inversiones Pradera S.A.S.",
    docType: "NIT",
    docNumber: "901330448-2",
    source: "DIRECT",
    nda: false,
    kyc: "NOT_STARTED",
    lists: "—",
    activity: null,
    incomeBracket: null,
    risk: null,
  },
];
