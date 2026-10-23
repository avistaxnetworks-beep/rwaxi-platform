// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useState } from "react";
import { DetailGallery } from "@/app/_components/portal/detail-gallery";
import { VideoPitch } from "@/app/_components/portal/video-pitch";
import { Icon } from "@/app/_components/ui/icon";

export function MediaHero({ t: e, p: a, photos: t, onUpload: o, currency: n, toast: l }) {
  const [r, i] = useState("video");
  return (
    <section className="flex flex-col gap-3" aria-label="Video y fotografías del proyecto">
      <div className="flex flex-wrap items-center gap-2" role="tablist">
        {[
          ["video", "Video", "Video Explicativo (3 min)"],
          ["fotos", "Image", "Fotografías y Renders del Activo"],
        ].map(([s, c, d]) => (
          <button
            key={s}
            role="tab"
            aria-selected={r === s}
            onClick={() => i(s)}
            className={`px-3.5 py-2 text-[12.5px] font-semibold inline-flex items-center gap-2 border focus-ring ${r === s ? "tc-btn border-transparent" : "bg-white border-line text-inkBody hover:border-[#B9B2CC]"}`}
          >
            <Icon name={c} size={15} />
            {d}
          </button>
        ))}
      </div>
      {r === "video" ? (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_200px] gap-3 items-start">
          <VideoPitch t={e} p={a} photos={t} currency={n} toast={l} />
          <div className="grid grid-cols-4 lg:grid-cols-1 gap-2">
            {t.map((s, c) => (
              <button
                key={c}
                onClick={() => i("fotos")}
                className="relative overflow-hidden border border-line hover:border-[#B9B2CC] focus-ring rounded-[8px]"
              >
                <img
                  src={s.src}
                  alt={`${a.asset}: ${s.label}`}
                  className="w-full aspect-[16/10] lg:aspect-[16/9] object-cover"
                />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#190A36]/85 to-transparent px-2 pt-4 pb-1 text-white text-[10.5px] font-medium text-left">
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <DetailGallery p={a} photos={t} onUpload={o} />
      )}
    </section>
  );
}
