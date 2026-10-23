// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
import { TRM } from "@/app/_lib/data/projects";
import { seededHex } from "@/app/_lib/hash";

// Locale of every figure below: es-CO (the prototype) unless the i18n provider sets the visitor's language
// (browser only). Other languages use their own separators, compact units (M, Mio., 万/億…) and percent style.
let NUMBER_LOCALE = "es-CO";
export const setNumberLocale = (e) => {
  NUMBER_LOCALE = e;
};

export const nf = (e = 0) =>
  new Intl.NumberFormat(NUMBER_LOCALE, {
    minimumFractionDigits: e,
    maximumFractionDigits: e,
  });

export function money(e, a, t) {
  const o = a === "COP" ? e * TRM : e;
  if (t && Math.abs(o) >= 1e6) {
    if (NUMBER_LOCALE !== "es-CO") {
      return `${a} ${new Intl.NumberFormat(NUMBER_LOCALE, { notation: "compact", maximumSignificantDigits: 3 }).format(o)}`;
    }
    const n = o / 1e6;
    return `${a} ${nf(n >= 100 ? 0 : 1).format(n)} M`;
  }
  return `${a} ${nf(0).format(Math.round(o))}`;
}

export const other = (e) => (e === "COP" ? "USD" : "COP");

export const alt = (e, a, t) => `≈ ${money(e, other(a), t)}`;

export const pct = (e, a = 1) =>
  NUMBER_LOCALE === "es-CO"
    ? `${nf(a).format(e)} %`
    : new Intl.NumberFormat(NUMBER_LOCALE, {
        style: "percent",
        minimumFractionDigits: a,
        maximumFractionDigits: a,
      }).format(e / 100);

export const shortHash = (e, a = 8, t = 6) => `${e.slice(0, a)}…${e.slice(-t)}`;

export function copyText(e, a) {
  const t = () => a && a(false);
  try {
    navigator.clipboard.writeText(e).then(() => a && a(true), t);
  } catch (o) {
    t();
  }
}

export function luminance(e) {
  const a = /^#?([0-9a-f]{6})$/i.exec(e || "");
  if (!a) return 0;
  const t = parseInt(a[1], 16),
    o = [(t >> 16) & 255, (t >> 8) & 255, t & 255].map(
      (n) => ((n /= 255), n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)),
    );
  return 0.2126 * o[0] + 0.7152 * o[1] + 0.0722 * o[2];
}

export const contrast = (e, a) => {
  const t = luminance(e),
    o = luminance(a);
  return (Math.max(t, o) + 0.05) / (Math.min(t, o) + 0.05);
};

export const onColor = (e) => (contrast(e, "#FFFFFF") >= contrast(e, "#190A36") ? "#FFFFFF" : "#190A36");

export const initials = (e) =>
  e
    .split(/\s+/)
    .filter((a) => /^[A-ZÁÉÍÓÚ]/.test(a))
    .slice(0, 2)
    .map((a) => a[0])
    .join("");

export const nowISO = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

export const newToken = (e) => "ref_rwx_" + seededHex(e + Date.now() + Math.random(), 24);
