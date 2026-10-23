// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useState } from "react";
import { Icon } from "@/app/_components/ui/icon";

export function CardGallery({ p: e, photos: a, st: t, onOpen: o }) {
  const [n, l] = useState(0),
    r = a.slice(0, 3),
    i = r.length,
    s = (c) => (d) => {
      d.stopPropagation(), l((p) => (p + c + i) % i);
    };
  return (
    <div className="relative aspect-[16/10] max-w-full overflow-hidden bg-rxDeep group">
      {r.map((c, d) => (
        <img
          key={d}
          src={c.src}
          alt={`${e.asset}: ${c.label}`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${d === n ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-[#190A36]/70 via-transparent to-[#190A36]/30 pointer-events-none" />
      <div className="absolute top-3 left-3 right-3 flex flex-wrap gap-2 justify-between items-start">
        <span className="bg-white/95 text-rxPurple font-mono text-[10.5px] tracking-[0.12em] px-2 py-1 inline-flex items-center gap-1">
          <Icon name="MapPin" size={12} />
          {e.city.toUpperCase()}
        </span>
        <span className={`text-[10px] font-semibold tracking-[0.1em] uppercase px-2 py-1 ${t.cls}`}>
          {t.label}
        </span>
      </div>
      <button
        onClick={s(-1)}
        aria-label="Foto anterior"
        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center bg-white/90 text-rxPurple hover:bg-white focus-ring"
      >
        <Icon name="ChevronLeft" size={17} />
      </button>
      <button
        onClick={s(1)}
        aria-label="Foto siguiente"
        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center bg-white/90 text-rxPurple hover:bg-white focus-ring"
      >
        <Icon name="ChevronRight" size={17} />
      </button>
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
        <span className="text-white text-[11px] font-medium">
          {r[n].label}
          <span className="text-white/70">
            {" · "}
            {r[n].real ? "Fotografía" : "Render ilustrativo"}
          </span>
        </span>
        <span className="flex gap-1.5" role="group" aria-label="Fotos">
          {r.map((c, d) => (
            <button
              key={d}
              onClick={(p) => {
                p.stopPropagation(), l(d);
              }}
              aria-label={`Ver foto ${d + 1}`}
              aria-pressed={d === n}
              className={`h-1.5 transition-all focus-ring ${d === n ? "w-5 bg-white" : "w-1.5 bg-white/55"}`}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
