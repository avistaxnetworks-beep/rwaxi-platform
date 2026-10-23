// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useState } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { useI18n } from "@/app/_i18n/provider";
import { copyText } from "@/app/_lib/format";

export function LayerTag({ n: e, children: a }) {
  return (
    <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-muted">
      C{e}
      {" · "}
      {a}
    </span>
  );
}

export function SectionHead({ n: e, title: a, children: t }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
      <div className="min-w-0">
        <p className="font-mono text-[11.5px] tracking-[0.14em] text-muted uppercase">{e}</p>
        <h2 className="font-display font-semibold text-rxPurple text-[32px] md:text-[38px] leading-[1.08] mt-1 balance">
          {a}
        </h2>
      </div>
      {t}
    </div>
  );
}

export function Progress({ value: e }) {
  return (
    <div
      className="h-[5px] bg-cloud w-full"
      role="progressbar"
      aria-valuenow={Math.round(e * 100)}
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div
        className="h-full bg-rxPurple"
        style={{
          width: `${e * 100}%`,
        }}
      />
    </div>
  );
}

export function CopyChip({ text: e, display: a, toast: t, className: o = "" }) {
  const { tr } = useI18n();
  const [n, l] = useState(false);
  return (
    <button
      onClick={() =>
        copyText(e, (r) => {
          l(true),
            t(r ? tr("Copiado al portapapeles") : tr("Selecciona el texto para copiarlo")),
            setTimeout(() => l(false), 1500);
        })
      }
      className={`inline-flex items-center gap-1.5 font-mono text-aquaInk hover:text-rxBlue focus-ring min-w-0 ${o}`}
      title={e}
    >
      <span className="truncate">{a || e}</span>
      <Icon name={n ? "Check" : "Copy"} size={13} className="shrink-0" />
    </button>
  );
}

export function TrustNote() {
  const { tr } = useI18n();
  return (
    <p className="flex gap-2 items-start text-[12px] text-muted leading-[1.55]">
      <Icon name="ShieldCheck" size={16} className="text-rxBlue shrink-0 mt-0.5" />
      {tr("Plataforma protegida bajo estándares de debida diligencia y cumplimiento normativo (KYC/AML).")}
    </p>
  );
}

export function Switch({ id: e, checked: a, onChange: t, label: o, disabled: n }) {
  return (
    <button
      id={e}
      role="switch"
      aria-checked={a}
      aria-label={o}
      disabled={n}
      onClick={() => t(!a)}
      className={`relative w-11 h-6 rounded-full transition-colors focus-ring disabled:opacity-40 ${a ? "bg-rxPurple" : "bg-[#C9C4D6]"}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${a ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

export function Mono({ children: e, className: a = "" }) {
  return <span className={`font-mono ${a}`}>{e}</span>;
}

export function KV({ k: e, v: a, accent: t, full: o }) {
  return (
    <div
      className={`grid ${o ? "grid-cols-1 gap-0.5" : "grid-cols-[170px_minmax(0,1fr)] gap-3"} px-4 py-2 border-b border-white/10 last:border-b-0`}
    >
      <span className="font-mono text-[11px] text-[#A79FC0]">{e}</span>
      <span className={`font-mono text-[11.5px] break-all ${t ? "text-rxAqua" : "text-white"}`}>{a}</span>
    </div>
  );
}

export function Pill({ ok: e, children: a, warn: t }) {
  return (
    <span
      className={`font-mono text-[10.5px] px-2 py-0.5 ${t ? "bg-[#3a2a0c] text-[#D9A24A]" : e ? "bg-[#0c2a3a] text-rxAqua" : "bg-[#3a1018] text-[#FF8A80]"}`}
    >
      {a}
    </span>
  );
}
