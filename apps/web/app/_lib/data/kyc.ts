// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
import { TRM } from "@/app/_lib/data/projects";
import { money } from "@/app/_lib/format";

export const COUNTRIES = [
  "Colombia",
  "Estados Unidos",
  "España",
  "México",
  "Panamá",
  "Perú",
  "Chile",
  "Ecuador",
  "Canadá",
  "Otro país",
];

export const ACTIVITIES = [
  "Empleado / asalariado",
  "Profesional independiente",
  "Empresario / socio de empresa",
  "Pensionado",
  "Rentista de capital (inversiones, arriendos)",
  "Otra actividad",
];

export const INCOME = [
  [0, 5e7],
  [5e7, 15e7],
  [15e7, 5e8],
  [5e8, null],
];

export const RISK = [
  ["conservador", "Conservador", "Prioriza preservar el capital y acepta rentas estimadas menores."],
  ["moderado", "Moderado", "Busca equilibrio entre rentas periódicas y valorización."],
  ["dinamico", "Dinámico", "Acepta mayor variación y proyectos en estructuración o pre-venta."],
];

export const REGIMES = {
  sagrilaft: {
    sys: "SAGRILAFT",
    short: "SAGRILAFT + PTEE",
    ptee: true,
    full: "SAGRILAFT + PTEE (Sector Real / Constructoras - Supersociedades)",
    authority: "Superintendencia de Sociedades",
  },
  sarlaft: {
    sys: "SARLAFT",
    short: "SARLAFT",
    ptee: false,
    full: "SARLAFT (Entidades Vigiladas Superfinanciera / Fiduciarias)",
    authority: "Superintendencia Financiera",
  },
};

export const stepsFor = (e = "sagrilaft") => [
  "Identidad y ubicación",
  `Origen de fondos (${REGIMES[e].sys}) y perfil`,
  "Documento y biometría",
  REGIMES[e].ptee ? "PEP, PTEE y términos" : "PEP y términos",
];

export const STEPS = stepsFor("sagrilaft");

export const EMPTY_KYC = {
  fullName: "",
  docType: "CC",
  docNumber: "",
  country: "Colombia",
  wallet: "",
  activity: "",
  activityOther: "",
  income: null,
  risk: "",
  docFront: null,
  docBack: null,
  liveness: "idle",
  noPep: false,
  dataPolicy: false,
  terms: false,
  sarlaft: false,
  ptee: false,
  listas: false,
};

export function incomeLabel([e, a], t) {
  const o = (n) => money(n / TRM, t, true);
  return e ? (a ? `${o(e)} – ${o(a)}` : `Más de ${o(e)}`) : `Menos de ${o(a)}`;
}

export function validateStep(e, a, t = "sagrilaft") {
  const o = {};
  return (
    e === 0 &&
      (a.fullName.trim().split(/\s+/).length < 2 &&
        (o.fullName = "Escribe nombres y apellidos como aparecen en el documento."),
      a.docType === "CC" &&
        !/^\d{6,10}$/.test(a.docNumber) &&
        (o.docNumber = "La cédula tiene entre 6 y 10 dígitos, sin puntos."),
      a.docType === "PA" &&
        !/^[A-Za-z0-9]{6,12}$/.test(a.docNumber) &&
        (o.docNumber = "El pasaporte tiene entre 6 y 12 caracteres alfanuméricos."),
      // Required by RwaxiComplianceRegistry.approveInvestor(wallet, …).
      /^0x[0-9a-fA-F]{40}$/.test(a.wallet || "") ||
        (o.wallet = "Escribe una dirección EVM válida: 0x seguido de 40 caracteres hexadecimales.")),
    e === 1 &&
      (a.activity || (o.activity = "Selecciona la actividad económica principal."),
      a.activity === "Otra actividad" &&
        a.activityOther.trim().length < 4 &&
        (o.activityOther = "Describe brevemente la actividad."),
      a.income === null && (o.income = "Selecciona un rango de ingresos."),
      a.risk || (o.risk = "Selecciona tu perfil de riesgo.")),
    e === 2 &&
      (a.docFront || (o.docFront = "Sube la foto del frente del documento."),
      a.docType === "CC" && !a.docBack && (o.docBack = "Sube la foto del reverso de la cédula."),
      a.liveness !== "done" && (o.liveness = "Completa la prueba de vida.")),
    e === 3 &&
      (REGIMES[t].ptee
        ? ["noPep", "dataPolicy", "terms", "sarlaft", "ptee", "listas"]
        : ["noPep", "dataPolicy", "terms", "sarlaft", "listas"]
      ).forEach((n) => {
        a[n] || (o[n] = "Obligatorio para continuar.");
      }),
    o
  );
}

export const KYC_LABEL = {
  no_iniciado: ["No iniciado", "bg-cloud text-muted"],
  pendiente: ["Pendiente de revisión", "bg-goldTint text-goldInk"],
  aprobado: ["Aprobado · Whitelist", "bg-aquaTint text-aquaInk"],
  rechazado: ["Rechazado", "bg-[#FDECEA] text-[#B42318]"],
};

export const REJECT_REASONS = [
  "La foto del documento de identidad no es legible: el número y la fecha de expedición no coinciden con los datos registrados.",
  "La declaración de origen de fondos no tiene soporte suficiente para el rango de ingresos declarado.",
  "Coincidencia en listas restrictivas pendiente de aclaración por el inversionista.",
];
