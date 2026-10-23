// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useMemo, useState } from "react";
import { highlightSol } from "@/app/_lib/chain/highlight";
import { SOL_SIZES, SOL_SOURCES } from "@/app/_lib/chain/sol-sources";
import { copyText, nf } from "@/app/_lib/format";

export function CodeViewer({ toast: e }) {
  const a = Object.keys(SOL_SOURCES),
    [t, o] = useState("RwaxiPropertyToken"),
    n = useMemo(() => highlightSol(SOL_SOURCES[t]), [t]);
  return (
    <div className="border border-white/15 bg-[#0B0518]">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 p-1">
        {a.map((l) => (
          <button
            key={l}
            onClick={() => o(l)}
            aria-pressed={t === l}
            className={`px-2.5 py-1.5 font-mono text-[11px] focus-ring ${t === l ? "bg-[#1D1236] text-rxAqua" : "text-[#A79FC0] hover:text-white"}`}
          >
            {l}.sol
          </button>
        ))}
        <button
          onClick={() =>
            copyText(SOL_SOURCES[t], (l) => e(l ? `${t}.sol copiado` : "Selecciona el texto para copiarlo"))
          }
          className="ml-auto px-2.5 py-1.5 font-mono text-[11px] text-rxAqua focus-ring"
        >
          Copiar
        </button>
      </div>
      <p className="px-3 py-1.5 font-mono text-[10.5px] text-[#A79FC0] border-b border-white/10">
        {"solc 0.8.24 · OpenZeppelin Contracts 5.0.2 · optimizer 200 · runtime "}
        {nf(0).format(SOL_SIZES[t])}
        {" bytes"}
      </p>
      <div className="overflow-auto max-h-[420px]">
        <table className="font-mono text-[11px] leading-[1.65]">
          <tbody>
            {n.map((l, r) => (
              <tr key={r}>
                <td className="select-none text-right pr-3 pl-3 text-[#5E5873] align-top">{r + 1}</td>
                <td
                  className="pr-4 text-[#E6E1F5] whitespace-pre"
                  dangerouslySetInnerHTML={{
                    __html: l || " ",
                  }}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
