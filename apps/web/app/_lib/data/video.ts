// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
import { money, pct } from "@/app/_lib/format";

export const PITCH_DURATION = 180;

export const CHAPTERS = [
  {
    at: 0,
    label: "El Activo y Ubicación",
    shot: 0,
  },
  {
    at: 45,
    label: "Flujo de Caja y Rentabilidad",
    shot: 2,
  },
  {
    at: 95,
    label: "Vehículo Jurídico y Respaldo",
    shot: 1,
  },
  {
    at: 140,
    label: "Tokenización y Salida",
    shot: 3,
  },
];

export const PRESENTERS = {
  santabarbara: ["Ing. Carlos Mendoza", "Director de Estructuración"],
  poblado: ["Arq. Juliana Restrepo", "Gerente de Proyecto"],
  avista: ["Andrés Villalba", "CEO · Avista Hospitality Group"],
};

export const defaultVideo = (e) => ({
  title: `Presentación oficial · ${e.asset}`,
  presenter: PRESENTERS[e.id][0],
  role: PRESENTERS[e.id][1],
  source: "demo",
  url: "",
  fileUrl: null,
  fileName: "",
  fileDuration: null,
  posterIdx: 0,
  poster: null,
});

export const mmss = (e) =>
  `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(Math.floor(e % 60)).padStart(2, "0")}`;

export function streamProvider(e) {
  return e
    ? /vimeo\.com\//i.test(e)
      ? "Vimeo Pro"
      : /(cloudflarestream\.com|videodelivery\.net)/i.test(e)
        ? "Cloudflare Stream"
        : /(youtube\.com\/|youtu\.be\/)/i.test(e)
          ? "YouTube (no listado)"
          : /\.(mp4|mov|m3u8)(\?|$)/i.test(e)
            ? "Archivo directo"
            : null
    : null;
}

export function chapterAt(e) {
  let a = 0;
  return (
    CHAPTERS.forEach((t, o) => {
      e >= t.at && (a = o);
    }),
    a
  );
}

export function sceneOverlay(e, a, t, o) {
  return e === 0
    ? [
        ["Activo", t.asset],
        ["Ubicación", `${t.region} · ${t.city}`],
        ["Tipo", t.type],
      ]
    : e === 1
      ? [
          ["TIR Estimada", pct(t.tir)],
          ["Distribución anual est.", pct(t.dist)],
          ["Valorización proy.", pct(t.val)],
        ]
      : e === 2
        ? [
            ["Legal Wrapper", t.wrapper],
            ["Emisor", a.legalName],
            ["Respaldo", "Activo aportado al vehículo + Data Room"],
          ]
        : [
            ["Token", `${a.mint.symbol} · ${a.mint.network}`],
            ["Ticket mínimo", money(t.ticket, o)],
            ["Salida", "Venta del activo o mercado secundario permisionado"],
          ];
}

export const SUBTITLES = [
  (e, a) => `“${a.asset} está en ${a.region}, una de las zonas de mayor demanda de ${a.city}.”`,
  (e, a) =>
    `“El escenario base proyecta una TIR estimada de ${pct(a.tir)}, con distribuciones por renta y valorización.”`,
  (e, a) => `“El activo se aísla en un vehículo independiente: ${a.wrapper}.”`,
  (e, a) => "“Cada unidad digital se registra on-chain y solo circula entre inversionistas elegibles.”",
];
