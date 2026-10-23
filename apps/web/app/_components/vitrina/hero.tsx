// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useMemo } from "react";
import { CurrencyToggle } from "@/app/_components/ui/currency-toggle";
import { Icon } from "@/app/_components/ui/icon";
import { Num } from "@/app/_i18n/num";
import { useI18n } from "@/app/_i18n/provider";
import { PROJECTS } from "@/app/_lib/data/projects";
import { alt, money } from "@/app/_lib/format";

export function Hero({ view: e, go: a, currency: t, setCurrency: o, projects: P }) {
  const { tr } = useI18n();
  // Live catalogue when provided (raise × committed share = capital committed).
  const L = P && P.length ? P : PROJECTS;
  const n = useMemo(() => {
      const i = L.reduce((c, d) => c + d.raise, 0),
        s = L.reduce((c, d) => c + d.raise * d.subscribed, 0);
      return {
        raise: i,
        sub: s,
      };
    }, [L]),
    r = e !== "catalogo";
  return (
    <section className="hero-grid bg-rxDeep text-white relative overflow-hidden">
      <span className="hero-x" aria-hidden="true">
        X
      </span>
      <div className={`gutter max-w-[1240px] mx-auto relative ${r ? "pt-8 pb-0" : "pt-14 pb-0"}`}>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-10 items-end">
          <div className="min-w-0">
            <p className="font-mono text-[11.5px] tracking-[0.14em] text-[#C9C1E3] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rxAqua pulse shrink-0" aria-hidden="true" />
              {tr("RWAXI REAL ESTATE — COINVERSIÓN INMOBILIARIA TOKENIZADA EN COLOMBIA")}
            </p>
            <h1
              className={`font-display font-semibold text-white leading-[1.02] tracking-[-0.01em] mt-4 balance ${r ? "text-[30px] md:text-[38px]" : "text-[40px] md:text-[64px]"}`}
            >
              {r ? (
                <>
                  {tr("Negocios Inmobiliarios.")} <em className="text-lav">{tr("Rentas y Valorización.")}</em>{" "}
                  {tr("Respaldo Jurídico Real.")}
                </>
              ) : (
                <>
                  <span className="block">{tr("Negocios Inmobiliarios.")}</span>
                  <em className="block text-lav">{tr("Rentas y Valorización.")}</em>
                  <span className="block">{tr("Respaldo Jurídico Real.")}</span>
                </>
              )}
            </h1>
            {!r && (
              <p className="mt-5 max-w-[62ch] text-[15.5px] leading-[1.7] text-[#C9C1E3]">
                {tr(
                  "Coinversión inmobiliaria tokenizada, uno de los modelos de mayor crecimiento a nivel global. Cada proyecto cuenta con seguridad jurídica mediante un vehículo legal propio y activos tokenizados en blockchain, brindándote trazabilidad inmutable sobre tu inversión y tus rendimientos.",
                )}
              </p>
            )}
            {!r && (
              <ul
                className="mt-7 grid sm:grid-cols-3 gap-px bg-white/10 border border-white/10"
                aria-label={tr("Sellos de confianza")}
              >
                {[
                  ["Scale", tr("Seguridad Jurídica"), tr("Vehículo Legal Independiente por Proyecto")],
                  ["Link2", tr("Activos Tokenizados"), tr("Registro Inmutable en Blockchain")],
                  ["FileCheck2", tr("Debida Diligencia"), tr("Data Room Auditado con Hash SHA-256")],
                ].map(([i, s, c]) => (
                  <li key={i} className="bg-rxDeep/90 px-4 py-3.5 flex gap-3 items-start min-w-0">
                    <span className="relative shrink-0 w-8 h-8 grid place-items-center border border-rxAqua/50 text-rxAqua">
                      <Icon name={i} size={16} />
                      <span className="absolute -top-1.5 -end-1.5 w-4 h-4 rounded-full bg-rxAqua text-rxDeep grid place-items-center">
                        <Icon name="Check" size={11} />
                      </span>
                    </span>
                    <span className="min-w-0 text-[12.5px] leading-[1.45]">
                      <span className="block font-semibold text-white">{s}</span>
                      <span className="block text-[#C9C1E3]">{c}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {!r && (
            <dl className="grid grid-cols-2 gap-px bg-white/10 border border-white/10 text-[12px] self-end">
              <div className="bg-rxDeep p-4">
                <dt className="text-[#A79FC0] tracking-[0.08em] uppercase text-[10.5px] font-semibold">
                  {tr("Vehículos")}
                </dt>
                <dd className="font-mono text-[22px] mt-1">
                  <Num>{L.length}</Num>
                </dd>
              </div>
              <div className="bg-rxDeep p-4">
                <dt className="text-[#A79FC0] tracking-[0.08em] uppercase text-[10.5px] font-semibold">
                  {tr("Redes")}
                </dt>
                <dd className="font-mono text-[14px] mt-2">
                  <Num>Base · Polygon</Num>
                </dd>
              </div>
              <div className="bg-rxDeep p-4 col-span-2">
                <dt className="text-[#A79FC0] tracking-[0.08em] uppercase text-[10.5px] font-semibold">
                  {tr("Capital suscrito / objetivo")}
                </dt>
                <dd className="font-mono text-[17px] mt-1">
                  <Num>
                    {money(n.sub, t, true)}{" "}
                    <span className="text-[#A79FC0]">
                      {"/ "}
                      {money(n.raise, t, true).replace(/^(USD|COP) /, "")}
                    </span>
                  </Num>
                </dd>
              </div>
              <div className="bg-rxDeep p-4 col-span-2 flex items-center justify-between gap-3">
                <dt className="text-[#A79FC0] tracking-[0.08em] uppercase text-[10.5px] font-semibold">
                  {tr("Ticket desde")}
                </dt>
                <dd className="font-mono text-[15px] text-end">
                  <Num>{money(Math.min(...L.map((i) => i.ticket)), t)}</Num>
                  <span className="block text-[11px] text-[#A79FC0]">
                    <Num>{alt(Math.min(...L.map((i) => i.ticket)), t)}</Num>
                  </span>
                </dd>
              </div>
              <div className="bg-rxDeep p-3 col-span-2">
                <CurrencyToggle currency={t} setCurrency={o} dark={true} />
              </div>
            </dl>
          )}
        </div>
        <div className="h-12" />
      </div>
    </section>
  );
}
