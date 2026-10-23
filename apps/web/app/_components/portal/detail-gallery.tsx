// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { STAGES } from "@/app/_lib/data/projects";
import { useI18n } from "@/app/_i18n/provider";

export function DetailGallery({ p: e, photos: a, onUpload: t }) {
  const { tr } = useI18n();
  const [o, n] = useState(0);
  useEffect(() => n(0), [e.id]);
  const l = useRef(),
    r = a[o],
    i = a.filter((s) => s.real).length;
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_240px] gap-3">
      <div className="relative aspect-[16/9] max-w-full overflow-hidden bg-rxDeep border border-line">
        <img src={r.src} alt={`${e.asset}: ${tr(r.label)}`} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#190A36]/60 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-3 start-3 flex gap-2 flex-wrap">
          <span className="bg-white/95 text-rxPurple font-mono text-[10.5px] tracking-[0.12em] px-2 py-1 inline-flex items-center gap-1">
            <Icon name="MapPin" size={12} />
            {e.city.toUpperCase()}
            {" · "}
            {e.region.toUpperCase()}
          </span>
          <span
            className={`text-[10px] font-semibold tracking-[0.1em] uppercase px-2 py-1 ${STAGES[e.stage].cls}`}
          >
            {tr(STAGES[e.stage].label)}
          </span>
        </div>
        <button
          onClick={() => n((o + 3) % 4)}
          aria-label={tr("Foto anterior")}
          className="absolute start-3 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center bg-white/90 text-rxPurple hover:bg-white focus-ring"
        >
          <Icon name="ChevronLeft" size={20} className="rtl:-scale-x-100" />
        </button>
        <button
          onClick={() => n((o + 1) % 4)}
          aria-label={tr("Foto siguiente")}
          className="absolute end-3 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center bg-white/90 text-rxPurple hover:bg-white focus-ring"
        >
          <Icon name="ChevronRight" size={20} className="rtl:-scale-x-100" />
        </button>
        <div className="absolute bottom-4 start-4 end-4 flex flex-wrap items-end justify-between gap-2 text-white">
          <span>
            <span className="font-mono text-[11px] tracking-[0.12em] text-white/75">
              0{o + 1}
              {" / 04"}
            </span>
            <span className="block font-display font-semibold text-[24px] leading-tight">{tr(r.label)}</span>
          </span>
          <span className="text-[11px] bg-black/30 px-2 py-1">
            {r.real ? tr("Fotografía del activo") : tr("Render ilustrativo · referencia visual")}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-4 lg:grid-cols-1 gap-3 min-w-0">
        {a.map((s, c) => (
          <button
            key={c}
            onClick={() => n(c)}
            aria-pressed={c === o}
            className={`relative text-start overflow-hidden border-2 focus-ring ${c === o ? "border-rxPurple" : "border-transparent hover:border-line"}`}
          >
            <img src={s.src} alt="" className="w-full aspect-[16/10] lg:aspect-[16/7] object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#190A36]/85 to-transparent px-2 pt-4 pb-1.5 text-white text-[10.5px] sm:text-[11.5px] font-medium leading-tight">
              {tr(s.label)}
            </span>
          </button>
        ))}
      </div>
      <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-muted">
        <span>
          {i
            ? tr("{n} de 4 imágenes son fotografías cargadas.", { n: i, count: i })
            : tr("Imágenes de referencia generadas para este prototipo. Carga las fotografías del Data Room para reemplazarlas.")}
        </span>
        <span>
          <input
            ref={l}
            id="photo-upload"
            type="file"
            accept="image/*"
            multiple={true}
            className="sr-only"
            onChange={(s) => {
              t(e.id, s.target.files), (s.target.value = "");
            }}
          />
          <button
            onClick={() => l.current && l.current.click()}
            className="inline-flex items-center gap-1.5 border border-line bg-white px-3 py-1.5 text-rxBlue font-medium hover:border-rxBlue focus-ring"
          >
            <Icon name="ImagePlus" size={14} />
            {tr("Cargar fotografías del inmueble")}
          </button>
        </span>
      </div>
    </div>
  );
}
