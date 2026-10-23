// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { PIPELINE } from "@/app/_lib/data/projects";

export function Pipeline({ p: e }) {
  const [a, t] = useState(() => Math.max(0, e.pipeline.indexOf("active")));
  useEffect(() => t(Math.max(0, e.pipeline.indexOf("active"))), [e.id]);
  const o = {
    done: "Completada",
    active: "En curso",
    pending: "Pendiente",
  };
  return (
    <div className="bg-white border border-line">
      <div className="overflow-x-auto">
        <ol className="flex items-start min-w-[640px] px-6 pt-6 pb-4">
          {PIPELINE.map((n, l) => {
            const r = e.pipeline[l];
            return (
              <li key={n.n} className="flex-1 flex items-start">
                <button
                  onClick={() => t(l)}
                  aria-pressed={a === l}
                  className={`flex flex-col items-start text-left gap-2 focus-ring px-1 -mx-1 ${a === l ? "" : "opacity-80 hover:opacity-100"}`}
                >
                  <span className="font-mono text-[11px] tracking-[0.12em] text-muted">{n.n}</span>
                  <span
                    className={`font-display font-semibold text-[22px] leading-none ${a === l ? "text-rxPurple" : "text-inkBody"}`}
                  >
                    {n.name}
                  </span>
                  <span
                    className={`text-[10px] font-semibold tracking-[0.1em] uppercase ${r === "done" ? "text-aquaInk" : r === "active" ? "text-goldInk" : "text-muted"}`}
                  >
                    {o[r]}
                  </span>
                </button>
                {l < PIPELINE.length - 1 && (
                  <span className="flex-1 flex items-center mx-3 mt-[26px]" aria-hidden="true">
                    <span className={`h-px flex-1 ${r === "done" ? "bg-rxAqua" : "bg-line"}`} />
                    <span
                      className={`w-2.5 h-2.5 rounded-full mx-1 ${r === "done" ? "bg-rxAqua" : r === "active" ? "bg-rxGold" : "bg-white border border-[#8E88A3]"}`}
                    />
                    <span
                      className={`h-px flex-1 ${e.pipeline[l + 1] !== "pending" ? "bg-rxAqua" : "bg-line"}`}
                    />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <div className="border-t border-line bg-stone px-6 py-4 flex gap-3 items-start">
        <Icon name={PIPELINE[a].icon} size={18} className="text-rxPurple mt-0.5 shrink-0" />
        <p className="text-[13.5px] text-inkBody leading-[1.6] max-w-[80ch]">
          <strong className="text-rxPurple">
            {PIPELINE[a].n} {PIPELINE[a].name}.
          </strong>{" "}
          {PIPELINE[a].text}
        </p>
      </div>
    </div>
  );
}
