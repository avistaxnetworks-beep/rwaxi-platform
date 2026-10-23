// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
import { seededHex } from "@/app/_lib/hash";

export const TRM = 4100;

export const STAGES = {
  operacion: {
    label: "En Operación / Rentando",
    short: "En operación",
    cls: "bg-blueTint text-rxBlue",
  },
  estructuracion: {
    label: "En Estructuración / Construcción",
    short: "En estructuración",
    cls: "bg-goldTint text-goldInk",
  },
  preventa: {
    label: "Pre-venta",
    short: "Pre-venta",
    cls: "bg-purpleTint text-rxPurple",
  },
};

export const PROJECTS = [
  {
    id: "santabarbara",
    code: "P-01",
    asset: "Torre Corporativa Santa Bárbara",
    city: "Bogotá",
    region: "Santa Bárbara · Usaquén",
    type: "Oficinas corporativas clase A",
    stage: "estructuracion",
    render: "tower",
    vehicle: "Santa Bárbara Office S.A.S.",
    wrapper: "SPV Sociedad por Acciones Simplificada (S.A.S.)",
    wrapperNote:
      "Sociedad independiente creada solo para este activo; el inversionista participa en sus derechos económicos.",
    right: "Participación sobre flujos de arrendamiento corporativo desde la entrega y valorización estimada",
    tir: 15.2,
    dist: 6.1,
    val: 7.4,
    ticket: 2500,
    unit: 250,
    raise: 25e6,
    subscribed: 0.41,
    chain: "EVM Polygon",
    contract: "0x3fA...C41",
    rentStart: 20,
    assetValue: 41e6,
    pipeline: ["done", "done", "active", "pending"],
  },
  {
    id: "poblado",
    code: "P-02",
    asset: "Suites El Poblado",
    city: "Medellín",
    region: "El Poblado",
    type: "Renta corta · Suites amobladas",
    stage: "preventa",
    render: "suites",
    vehicle: "P.A. El Poblado Suites",
    wrapper: "Patrimonio Autónomo / Encargo Fiduciario",
    wrapperNote:
      "Recursos y activo administrados por una sociedad fiduciaria, separados del patrimonio del promotor.",
    right: "Participación sobre flujos de renta corta desde la apertura y valorización estimada",
    tir: 14.5,
    dist: 8.1,
    val: 6.3,
    ticket: 500,
    unit: 50,
    raise: 65e5,
    subscribed: 0.18,
    chain: "EVM Base",
    contract: "0x9bE...07D",
    rentStart: 14,
    assetValue: 92e5,
    pipeline: ["done", "active", "pending", "pending"],
  },
  {
    id: "avista",
    code: "P-03",
    asset: "Avista Beach Villas & Resort",
    city: "Córdoba",
    region: "Litoral Caribe",
    type: "Hospitality · Villas turísticas",
    stage: "operacion",
    render: "resort",
    vehicle: "Avista Tokenization Fund I",
    wrapper: "Vehículo de Propósito Especial (SPV / Cuentas en Participación)",
    wrapperNote:
      "Contrato de cuentas en participación con un gestor ostensible; los partícipes reciben su parte de los resultados del negocio.",
    right: "Participación sobre flujos de renta hotelera y valorización estimada del activo",
    tir: 13.8,
    dist: 7.2,
    val: 5.9,
    ticket: 1e3,
    unit: 100,
    raise: 12e6,
    subscribed: 0.68,
    chain: "EVM Base",
    contract: "0x71C...9A2",
    rentStart: 0,
    assetValue: 185e5,
    pipeline: ["done", "done", "done", "active"],
  },
].map((e) => ({
  ...e,
  merkle: seededHex("merkle-" + e.id, 64),
  totalUnits: e.raise / e.unit,
}));

export const PIPELINE = [
  {
    n: "01",
    name: "Legal",
    icon: "Scale",
    text: "Constitución del vehículo, estudio de títulos y tradición del inmueble, y constitución del Vehículo Jurídico Independiente (Legal Wrapper) que separa el activo del patrimonio del originador: S.A.S., patrimonio autónomo o cuentas en participación, según el negocio.",
  },
  {
    n: "02",
    name: "Financiero",
    icon: "Calculator",
    text: "Modelo financiero auditado, avalúo de referencia, escenarios base y conservador de renta y valorización, y política de distribuciones.",
  },
  {
    n: "03",
    name: "Tecnología",
    icon: "Cpu",
    text: "Emisión de unidades digitales con contrato OpenZeppelin permissioned, whitelist de inversionistas elegibles y sellado del Data Room con Merkle Root SHA-256.",
  },
  {
    n: "04",
    name: "Capital",
    icon: "Coins",
    text: "Ronda de suscripción para inversionistas elegibles, registro on-chain de la titularidad y distribuciones periódicas en USDC o transferencia bancaria.",
  },
];

export const DATAROOM = [
  {
    n: "01",
    name: "Jurídico y Tradición",
    docs: [
      ["Resumen de estructura del vehículo", false],
      ["Certificado de tradición y libertad", true],
      ["Documento constitutivo del Legal Wrapper", true],
      ["Estudio de títulos", true],
    ],
  },
  {
    n: "02",
    name: "Modelo Financiero",
    docs: [
      ["Teaser financiero del proyecto", false],
      ["Modelo financiero (escenarios base y conservador)", true],
      ["Avalúo comercial de referencia", true],
    ],
  },
  {
    n: "03",
    name: "Licencias Técnicas",
    docs: [
      ["Ficha técnica del inmueble", false],
      ["Licencia de construcción / uso de suelo", true],
      ["Pólizas y estudios técnicos", true],
    ],
  },
  {
    n: "04",
    name: "Gobierno Corporativo",
    docs: [
      ["Política de distribuciones", false],
      ["Reglamento de asamblea de inversionistas", true],
      ["Informe del comité de inversiones", true],
    ],
  },
];

export const SEED_HOLDINGS = [
  {
    id: "h1",
    projectId: "avista",
    units: 120,
    capital: 12e3,
    accrued: 1296,
    since: "2025-11-14",
    tx: "0x" + seededHex("tx-avista", 64),
  },
  {
    id: "h2",
    projectId: "santabarbara",
    units: 20,
    capital: 5e3,
    accrued: 0,
    since: "2026-03-09",
    tx: "0x" + seededHex("tx-santabarbara", 64),
  },
];

export const WALLET = "0x4aB...89F";

export const byId = (e) => PROJECTS.find((a) => a.id === e);
