// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
import { msg } from "@/app/_i18n/marks";
import { spanish } from "@/app/_i18n/translate";
import { TRM } from "@/app/_lib/data/projects";
import { money } from "@/app/_lib/format";

// Lists and messages are Spanish source texts: the server stores and validates the Spanish value
// (closed lists), the UI shows it with tr() in the visitor's language.

export const COUNTRIES = [
  msg("Colombia"),
  msg("Estados Unidos"),
  msg("España"),
  msg("México"),
  msg("Panamá"),
  msg("Perú"),
  msg("Chile"),
  msg("Ecuador"),
  msg("Canadá"),
  msg("Otro país"),
];

export const ACTIVITIES = [
  msg("Empleado / asalariado"),
  msg("Profesional independiente"),
  msg("Empresario / socio de empresa"),
  msg("Pensionado"),
  msg("Rentista de capital (inversiones, arriendos)"),
  msg("Otra actividad"),
];

export const INCOME = [
  [0, 5e7],
  [5e7, 15e7],
  [15e7, 5e8],
  [5e8, null],
];

export const RISK = [
  [
    "conservador",
    msg("Conservador"),
    msg("Prioriza preservar el capital y acepta rentas estimadas menores."),
  ],
  ["moderado", msg("Moderado"), msg("Busca equilibrio entre rentas periódicas y valorización.")],
  ["dinamico", msg("Dinámico"), msg("Acepta mayor variación y proyectos en estructuración o pre-venta.")],
];

export const REGIMES = {
  sagrilaft: {
    sys: "SAGRILAFT",
    short: "SAGRILAFT + PTEE",
    ptee: true,
    full: msg("SAGRILAFT + PTEE (Sector Real / Constructoras - Supersociedades)"),
    authority: msg("Superintendencia de Sociedades"),
  },
  sarlaft: {
    sys: "SARLAFT",
    short: "SARLAFT",
    ptee: false,
    full: msg("SARLAFT (Entidades Vigiladas Superfinanciera / Fiduciarias)"),
    authority: msg("Superintendencia Financiera"),
  },
};

export const stepsFor = (e = "sagrilaft", tr = spanish) => [
  tr("Identidad y ubicación"),
  tr("Origen de fondos ({sys}) y perfil", { sys: REGIMES[e].sys }),
  tr("Documento y biometría"),
  REGIMES[e].ptee ? tr("PEP, PTEE y términos") : tr("PEP y términos"),
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

export function incomeLabel([e, a], t, tr = spanish) {
  const o = (n) => money(n / TRM, t, true);
  return e
    ? a
      ? `${o(e)} – ${o(a)}`
      : tr("Más de {amount}", { amount: o(e) })
    : tr("Menos de {amount}", { amount: o(a) });
}

export function validateStep(e, a, t = "sagrilaft", tr = spanish) {
  const o = {};
  return (
    e === 0 &&
      (a.fullName.trim().split(/\s+/).length < 2 &&
        (o.fullName = tr("Escribe nombres y apellidos como aparecen en el documento.")),
      a.docType === "CC" &&
        !/^\d{6,10}$/.test(a.docNumber) &&
        (o.docNumber = tr("La cédula tiene entre 6 y 10 dígitos, sin puntos.")),
      a.docType === "PA" &&
        !/^[A-Za-z0-9]{6,12}$/.test(a.docNumber) &&
        (o.docNumber = tr("El pasaporte tiene entre 6 y 12 caracteres alfanuméricos.")),
      // Required by RwaxiComplianceRegistry.approveInvestor(wallet, …).
      /^0x[0-9a-fA-F]{40}$/.test(a.wallet || "") ||
        (o.wallet = tr("Escribe una dirección EVM válida: 0x seguido de 40 caracteres hexadecimales."))),
    e === 1 &&
      (a.activity || (o.activity = tr("Selecciona la actividad económica principal.")),
      a.activity === "Otra actividad" &&
        a.activityOther.trim().length < 4 &&
        (o.activityOther = tr("Describe brevemente la actividad.")),
      a.income === null && (o.income = tr("Selecciona un rango de ingresos.")),
      a.risk || (o.risk = tr("Selecciona tu perfil de riesgo."))),
    e === 2 &&
      (a.docFront || (o.docFront = tr("Sube la foto del frente del documento.")),
      a.docType === "CC" && !a.docBack && (o.docBack = tr("Sube la foto del reverso de la cédula.")),
      a.liveness !== "done" && (o.liveness = tr("Completa la prueba de vida."))),
    e === 3 &&
      (REGIMES[t].ptee
        ? ["noPep", "dataPolicy", "terms", "sarlaft", "ptee", "listas"]
        : ["noPep", "dataPolicy", "terms", "sarlaft", "listas"]
      ).forEach((n) => {
        a[n] || (o[n] = tr("Obligatorio para continuar."));
      }),
    o
  );
}

export const KYC_LABEL = {
  no_iniciado: [msg("No iniciado"), "bg-cloud text-muted"],
  pendiente: [msg("Pendiente de revisión"), "bg-goldTint text-goldInk"],
  aprobado: [msg("Aprobado · Whitelist"), "bg-aquaTint text-aquaInk"],
  rechazado: [msg("Rechazado"), "bg-[#FDECEA] text-[#B42318]"],
};

// Restrictive-list screening results as the seed and the portal store them (KycCase.listsResult).
export const LIST_RESULTS = [
  msg("Sin coincidencias"),
  msg("Coincidencia parcial · revisar homónimo"),
  msg("Pendiente de consulta"),
];

// Stored in Spanish (KycCase.rejectionReason); the portal shows them in the investor's language.
export const REJECT_REASONS = [
  msg(
    "La foto del documento de identidad no es legible: el número y la fecha de expedición no coinciden con los datos registrados.",
  ),
  msg("La declaración de origen de fondos no tiene soporte suficiente para el rango de ingresos declarado."),
  msg("Coincidencia en listas restrictivas pendiente de aclaración por el inversionista."),
];
