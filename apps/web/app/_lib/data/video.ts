// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
import { msg } from "@/app/_i18n/marks";
import { spanish } from "@/app/_i18n/translate";
import { money, pct } from "@/app/_lib/format";

export const PITCH_DURATION = 180;

export const CHAPTERS = [
  {
    at: 0,
    label: msg("El Activo y Ubicación"),
    shot: 0,
  },
  {
    at: 45,
    label: msg("Flujo de Caja y Rentabilidad"),
    shot: 2,
  },
  {
    at: 95,
    label: msg("Vehículo Jurídico y Respaldo"),
    shot: 1,
  },
  {
    at: 140,
    label: msg("Tokenización y Salida"),
    shot: 3,
  },
];

export const PRESENTERS = {
  santabarbara: ["Ing. Carlos Mendoza", msg("Director de Estructuración")],
  poblado: ["Arq. Juliana Restrepo", msg("Gerente de Proyecto")],
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
          ? msg("YouTube (no listado)")
          : /\.(mp4|mov|m3u8)(\?|$)/i.test(e)
            ? msg("Archivo directo")
            : null
    : null;
}

/** The title of the pitch video in the visitor's language (the default one; a custom title is the developer's). */
export const videoTitle = (video, project, tr = spanish) =>
  video.title === `Presentación oficial · ${project.asset}`
    ? tr("Presentación oficial · {asset}", { asset: project.asset })
    : video.title;

export function chapterAt(e) {
  let a = 0;
  return (
    CHAPTERS.forEach((t, o) => {
      e >= t.at && (a = o);
    }),
    a
  );
}

export function sceneOverlay(e, a, t, o, tr = spanish) {
  return e === 0
    ? [
        [tr("Activo"), t.asset],
        [tr("Ubicación"), `${t.region} · ${t.city}`],
        [tr("Tipo"), t.type],
      ]
    : e === 1
      ? [
          [tr("TIR Estimada"), pct(t.tir)],
          [tr("Distribución anual est."), pct(t.dist)],
          [tr("Valorización proy."), pct(t.val)],
        ]
      : e === 2
        ? [
            ["Legal Wrapper", tr(t.wrapper)],
            [tr("Emisor"), a.legalName],
            [tr("Respaldo"), tr("Activo aportado al vehículo + Data Room")],
          ]
        : [
            ["Token", `${a.mint.symbol} · ${a.mint.network}`],
            [tr("Ticket mínimo"), money(t.ticket, o)],
            [tr("Salida"), tr("Venta del activo o mercado secundario permisionado")],
          ];
}

export const SUBTITLES = [
  (e, a, tr = spanish) =>
    tr("“{asset} está en {region}, una de las zonas de mayor demanda de {city}.”", {
      asset: a.asset,
      region: a.region,
      city: a.city,
    }),
  (e, a, tr = spanish) =>
    tr(
      "“El escenario base proyecta una TIR estimada de {irr}, con distribuciones por renta y valorización.”",
      { irr: pct(a.tir) },
    ),
  (e, a, tr = spanish) =>
    tr("“El activo se aísla en un vehículo independiente: {wrapper}.”", { wrapper: tr(a.wrapper) }),
  (e, a, tr = spanish) =>
    tr("“Cada unidad digital se registra on-chain y solo circula entre inversionistas elegibles.”"),
];
