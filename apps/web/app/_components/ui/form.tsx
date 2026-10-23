// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { Icon } from "@/app/_components/ui/icon";
import { STEPS } from "@/app/_lib/data/kyc";

export const fieldCls = (e) =>
  `w-full border ${e ? "border-[#B42318]" : "border-[#C9C4D6]"} bg-white px-3 py-2.5 text-[14px] text-inkBody focus:outline-none focus:tc-border focus:ring-2 focus:ring-[#2F145F]/15`;

export function Field({ id: e, label: a, hint: t, error: o, children: n }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={e} className="text-[12px] font-semibold text-inkBody">
        {a}
      </label>
      {n}
      {o ? (
        <p className="text-[12px] text-[#B42318]" role="alert">
          {o}
        </p>
      ) : t ? (
        <p className="text-[11.5px] text-muted">{t}</p>
      ) : null}
    </div>
  );
}

export function Stepper({ step: e, steps: a = STEPS }) {
  return (
    <div>
      <div className="h-[3px] bg-line">
        <div
          className="h-full tc-bg transition-all duration-300"
          style={{
            width: `${((e + 1) / a.length) * 100}%`,
          }}
        />
      </div>
      <ol className="grid grid-cols-4 mt-3 gap-2">
        {a.map((t, o) => (
          <li key={t} className="flex items-start gap-2 min-w-0">
            <span
              className={`w-6 h-6 shrink-0 grid place-items-center font-mono text-[11px] ${o < e ? "bg-rxAqua text-rxDeep" : o === e ? "tc-bg text-white" : "bg-white border border-[#C9C4D6] text-muted"}`}
            >
              {o < e ? <Icon name="Check" size={13} /> : o + 1}
            </span>
            <span
              className={`hidden md:block text-[12px] leading-tight pt-0.5 ${o === e ? "text-rxPurple font-semibold" : "text-muted"}`}
            >
              {t}
            </span>
          </li>
        ))}
      </ol>
      <p className="md:hidden text-[12.5px] font-semibold text-rxPurple mt-2">
        {"Paso "}
        {e + 1}
        {" de 4 · "}
        {a[e]}
      </p>
    </div>
  );
}

export function CheckRow({ id: e, checked: a, onChange: t, error: o, title: n, children: l }) {
  return (
    <div className={`border ${o ? "border-[#B42318]" : a ? "tc-border" : "border-line"} bg-white`}>
      <label htmlFor={e} className="flex gap-3 p-4 cursor-pointer">
        <input
          id={e}
          type="checkbox"
          checked={a}
          onChange={(r) => t(r.target.checked)}
          className="mt-1 w-4 h-4 accent-[#2F145F] shrink-0"
        />
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold text-rxPurple">{n}</span>
          <span className="block text-[12.5px] text-inkBody leading-[1.6] mt-1">{l}</span>
        </span>
      </label>
      {o && <p className="px-4 pb-3 -mt-1 text-[12px] text-[#B42318]">{o}</p>}
    </div>
  );
}
