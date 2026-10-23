// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useState } from "react";
import { TxCard } from "@/app/_components/inspector/tx-card";
import { Mono } from "@/app/_components/ui/primitives";
import { useI18n } from "@/app/_i18n/provider";

export function LogTab({ log: e, tenants: a, tenantId: t, toast: o }) {
  const { tr } = useI18n();
  const [n, l] = useState("tenant"),
    r = e.filter((s) => n === "todos" || s.tenantId === t),
    i = e.length ? e[0].id : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex border border-white/15 p-0.5" role="group" aria-label={tr("Alcance")}>
          {[
            ["tenant", a[t].displayName],
            ["todos", tr("Todos los tenants")],
          ].map(([s, c]) => (
            <button
              key={s}
              onClick={() => l(s)}
              aria-pressed={n === s}
              className={`px-3 py-1.5 font-mono text-[11px] focus-ring ${n === s ? "bg-white text-rxDeep" : "text-white hover:bg-white/10"}`}
            >
              {c}
            </button>
          ))}
        </div>
        <Mono className="text-[11px] text-[#A79FC0]">
          {tr("{n} transacciones · más reciente primero", { n: r.length, count: r.length })}
        </Mono>
      </div>
      {r.map((s) => (
        <TxCard
          key={s.id}
          tx={s}
          tenants={a}
          fresh={s.id === i && !String(s.id).startsWith("g-")}
          toast={o}
        />
      ))}
      {!r.length && (
        <p className="font-mono text-[12px] text-[#A79FC0] border border-white/15 px-4 py-6 text-center">
          {tr("Sin transacciones para este tenant.")}
        </p>
      )}
    </div>
  );
}
