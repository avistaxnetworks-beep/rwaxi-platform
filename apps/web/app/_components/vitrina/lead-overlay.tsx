// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { portalHost } from "@/app/_lib/hosts";

export function LeadOverlay({ lead: e, tenant: a, project: t }) {
  return (
    <div
      className="fixed inset-0 z-[70] bg-[#190A36]/85 grid place-items-center modal-pad"
      role="status"
      aria-live="polite"
    >
      <div className="bg-[#0E0620] border border-white/15 text-white w-full max-w-[520px] p-6 flex flex-col gap-4">
        <p className="font-mono text-[11px] tracking-[0.14em] text-[#A79FC0] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rxAqua pulse" />
          ATRIBUCIÓN DE LEAD
        </p>
        <div className="font-mono text-[12.5px] leading-[1.9]">
          <p>
            <span className="text-rxAqua">✓</span>
            {" LeadReferral Token generado: "}
            <span className="text-lav">{e.token.slice(0, 12)}...</span>
          </p>
          <p className="text-[#C9C1E3]">
            <span className="text-rxAqua">✓</span>
            {" Origen: www.rwaxi.com → "}
            {portalHost(a)}
          </p>
          <p className="text-[#C9C1E3]">
            <span className="text-rxGold">●</span>
            {" Abriendo portal oficial de "}
            {a.legalName}…
          </p>
        </div>
        <div className="h-[3px] bg-white/10">
          <div className="h-full bg-rxAqua lead-bar" />
        </div>
        <p className="text-[11.5px] text-[#A79FC0]">
          {t.asset}
          {" · el desarrollador es responsable de la relación contractual y del cumplimiento."}
        </p>
      </div>
    </div>
  );
}
