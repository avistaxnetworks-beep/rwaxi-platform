// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useState } from "react";
import { Governance } from "@/app/_components/superadmin/governance";
import { CurrencyToggle } from "@/app/_components/ui/currency-toggle";
import { Icon } from "@/app/_components/ui/icon";

export function SuperAdmin({
  emit: e,
  openInspector: a,
  tenants: t,
  setTenants: o,
  journeys: n,
  orgs: l,
  setOrgs: r,
  feeRules: i,
  setFeeRules: s,
  overrides: c,
  setOverrides: d,
  currency: p,
  setCurrency: m,
  tab: u,
  setTab: v,
  toast: h,
  openTenant: b,
  // PostgreSQL-backed panels (app/superadmin/_components/platform-panels.tsx).
  overviewSlot: O,
  governanceSlot: G,
  attributionSlot: Q,
  feesSlot: R,
}) {
  const [y, f] = useState([
      {
        at: "2026-10-21 16:02",
        who: "superadmin@rwaxi.com",
        what: "Aprobó la publicación en vitrina de Suites El Poblado",
      },
      {
        at: "2026-10-18 09:41",
        who: "superadmin@rwaxi.com",
        what: "Actualizó la regla de tarifa por uso de Andes Urbano a 1,2 %",
      },
    ]),
    N = (A) =>
      f((P) =>
        [
          {
            at: new Date().toISOString().slice(0, 16).replace("T", " "),
            who: "superadmin@rwaxi.com",
            what: A,
          },
          ...P,
        ].slice(0, 12),
      );
  return (
    <div
      className="min-h-full flex flex-col"
      style={{
        "--tc": "#2F145F",
        "--tc-on": "#FFFFFF",
      }}
    >
      <header
        className="bg-rxPurple text-white"
        style={{
          borderTop: "4px solid #B77A1E",
        }}
      >
        <div className="gutter max-w-[1240px] mx-auto py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex flex-col leading-none">
            <span className="font-display italic font-semibold text-[30px]">
              RWA<span className="logo-x">X</span>I
            </span>
            <span className="mt-1 text-[9px] font-semibold tracking-[0.24em] text-[#D9A24A]">
              CONSOLA SUPER-ADMIN · admin.rwaxi.com
            </span>
          </div>
          <button
            onClick={() => a("log")}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-mono bg-rxDeep border border-rxAqua/50 text-rxAqua px-3 py-1.5 focus-ring"
          >
            <Icon name="Link" size={13} />
            Inspector On-Chain
          </button>
          <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-mono bg-white/10 px-2.5 py-1.5">
            <Icon name="ShieldCheck" size={13} className="text-[#D9A24A]" />
            Rol: Dirección RWAXI · MFA activo
          </span>
          <div className="md:ml-auto">
            <CurrencyToggle currency={p} setCurrency={m} dark={true} label={false} />
          </div>
        </div>
        <div className="gutter max-w-[1240px] mx-auto flex overflow-x-auto" role="tablist">
          {[
            ["A", "gobierno", "Gobierno de Tenants"],
            ["B", "atribucion", "Atribución LeadReferral"],
            ["C", "tarifas", "Tarifas y Libro Mayor"],
          ].map(([A, P, z]) => (
            <button
              key={P}
              role="tab"
              aria-selected={u === P}
              onClick={() => v(P)}
              className={`shrink-0 mr-7 py-3 text-[12.5px] font-semibold border-b-2 focus-ring ${u === P ? "border-[#D9A24A] text-white" : "border-transparent text-[#C9C1E3] hover:text-white"}`}
            >
              <span className="font-mono text-[10.5px] mr-1.5 text-[#D9A24A]">
                {"MÓDULO "}
                {A}
              </span>
              {z}
            </button>
          ))}
        </div>
      </header>
      <main className="gutter max-w-[1240px] mx-auto py-8 w-full flex-1">
        {O}
        {u === "gobierno" && G}
        {u === "gobierno" && !G && (
          <Governance
            emit={e}
            tenants={t}
            setTenants={o}
            journeys={n}
            orgs={l}
            setOrgs={r}
            feeRules={i}
            currency={p}
            toast={h}
            log={N}
            audit={y}
            openTenant={b}
          />
        )}
        {u === "atribucion" && Q}
        {u === "tarifas" && R}
      </main>
    </div>
  );
}
