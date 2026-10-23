// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useState } from "react";
import { YearChart } from "@/app/_components/portal/year-chart";
import { CurrencyToggle } from "@/app/_components/ui/currency-toggle";
import { Icon } from "@/app/_components/ui/icon";
import { CopyChip, LayerTag } from "@/app/_components/ui/primitives";
import { Pipeline } from "@/app/_components/vitrina/pipeline";
import { simulate } from "@/app/_lib/finance";
import { alt, money, nf, pct, shortHash } from "@/app/_lib/format";
import { useI18n } from "@/app/_i18n/provider";

export function InfoTabs({
  t: e,
  p: a,
  currency: t,
  setCurrency: o,
  amount: n,
  setAmount: l,
  toSubscribe: r,
  toast: i,
}) {
  const { tr } = useI18n();
  const [s, c] = useState("capas"),
    [d, p] = useState(60),
    m = simulate(a, n, d),
    u = 25e4;
  return (
    <section id="info" className="bg-white border border-line">
      <div className="flex overflow-x-auto border-b border-line" role="tablist">
        {[
          ["capas", tr("Estructura de 4 capas")],
          ["simulador", tr("Simulador financiero")],
          ["ruta", tr("Ruta de estructuración")],
          ["ficha", tr("Ficha técnica")],
        ].map(([h, b]) => (
          <button
            key={h}
            role="tab"
            aria-selected={s === h}
            onClick={() => c(h)}
            className={`shrink-0 px-5 py-3.5 text-[12.5px] font-semibold border-b-2 -mb-px focus-ring ${s === h ? "tc-border tc-text" : "border-transparent text-muted hover:text-rxPurple"}`}
          >
            {b}
          </button>
        ))}
      </div>
      <div className="p-6">
        {s === "capas" && (
          <div className="grid md:grid-cols-4 border border-line">
            {[
              ["1", tr("Activo real"), a.asset, `${a.city} · ${a.type}`],
              [
                "2",
                tr("Vehículo Jurídico Independiente"),
                tr(a.wrapper),
                `${a.vehicle} · Structured by RWAXI`,
              ],
              ["3", tr("Derecho económico"), tr("Flujos de renta + valorización"), tr("Escenario Estimado")],
              [
                "4",
                tr("Infraestructura digital"),
                "Powered by RWAXI",
                `OpenZeppelin · ${e.mint.network} · SHA-256`,
              ],
            ].map(([h, b, y, f], N) => (
              <div
                key={h}
                className={`p-5 min-w-0 ${N ? "border-t md:border-t-0 md:border-s border-line" : ""} ${h === "4" ? "bg-aquaTint" : ""}`}
              >
                <LayerTag n={h}>{b}</LayerTag>
                <p
                  className={`mt-1.5 text-[14px] font-semibold ${h === "4" ? "text-aquaInk" : "text-rxPurple"}`}
                >
                  {y}
                </p>
                <p
                  className={`text-[11.5px] mt-0.5 ${h === "2" ? "text-goldInk font-semibold" : h === "4" ? "text-aquaInk" : "text-muted"}`}
                >
                  {f}
                </p>
                {h === "2" && (
                  <p className="text-[11.5px] text-muted mt-1">
                    {tr("Desarrollador:")} {e.legalName}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {s === "simulador" && (
          <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
            <div className="flex flex-col gap-5 min-w-0">
              <div className="flex justify-between items-center gap-3 flex-wrap">
                <span className="text-[12px] font-semibold tracking-[0.06em] uppercase text-muted">
                  {tr("Capital")}
                </span>
                <CurrencyToggle currency={t} setCurrency={o} label={false} />
              </div>
              <div>
                <p className="font-mono text-[26px] text-rxPurple tnum leading-tight">{money(n, t)}</p>
                <p className="font-mono text-[12px] text-muted">{alt(n, t)}</p>
                <input
                  id="info-amt"
                  aria-label={tr("Monto")}
                  type="range"
                  min={a.ticket}
                  max={u}
                  step={a.unit}
                  value={n}
                  onChange={(h) => l(+h.target.value)}
                  className="rx-range w-full mt-3"
                  style={{
                    "--fill": `${((n - a.ticket) / (u - a.ticket)) * 100}%`,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 border border-line" role="group" aria-label={tr("Horizonte")}>
                {[36, 60].map((h) => (
                  <button
                    key={h}
                    onClick={() => p(h)}
                    aria-pressed={d === h}
                    className={`py-2.5 text-[13px] font-semibold focus-ring ${d === h ? "tc-btn" : "bg-white text-inkBody hover:bg-cloud"}`}
                  >
                    {tr("{n} meses", { n: h, count: h })}
                  </button>
                ))}
              </div>
              <button
                onClick={r}
                className="tc-btn font-semibold text-[13px] py-3 inline-flex items-center justify-center gap-2 focus-ring"
              >
                {tr("Suscribir este monto")}{" "}
                <Icon name="ArrowUpRight" size={15} className="rtl:-scale-x-100" />
              </button>
            </div>
            <div className="flex flex-col gap-3 min-w-0">
              <div className="grid sm:grid-cols-2 gap-px bg-line border border-line">
                {[
                  [
                    tr("Unidades digitales"),
                    nf(0).format(m.units),
                    tr("{price} c/u", { price: money(a.unit, t) }),
                  ],
                  [
                    tr("Flujo mensual estimado"),
                    money(m.monthly, t),
                    a.rentStart ? tr("Desde el mes {month}", { month: a.rentStart + 1 }) : alt(m.monthly, t),
                  ],
                  [
                    tr("Valorización · {months} m", { months: d }),
                    money(m.valuation, t),
                    tr("{rate} anual", { rate: pct(a.val) }),
                  ],
                  [tr("Retorno total estimado"), money(m.total, t), alt(m.total, t)],
                ].map(([h, b, y]) => (
                  <div key={h} className="bg-white p-4 min-w-0">
                    <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{h}</p>
                    <p className="font-mono tnum text-[21px] text-rxPurple mt-1 break-words">{b}</p>
                    <p className="text-[11px] text-muted font-mono">{y}</p>
                  </div>
                ))}
              </div>
              <YearChart years={m.years} currency={t} />
              <p className="text-[11.5px] text-muted border-s-2 border-rxGold ps-3">
                {tr(
                  "Escenario Estimado con base en el modelo financiero del vehículo. No constituye oferta ni promesa de rentabilidad; el capital está sujeto a riesgo.",
                )}
              </p>
            </div>
          </div>
        )}
        {s === "ruta" && <Pipeline p={a} />}
        {s === "ficha" && (
          <dl className="border border-line">
            {[
              [tr("Desarrollador"), `${e.legalName} · NIT ${e.nit}`],
              ["Legal Wrapper", tr(a.wrapper)],
              [tr("Vehículo"), `${a.vehicle} | Structured by RWAXI`],
              [tr("Red"), e.mint.network],
              [
                tr("Contrato inteligente"),
                e.mint.contract ? <CopyChip text={e.mint.contract} toast={i} /> : tr("Pendiente de emisión"),
              ],
              [tr("Estándar"), "OpenZeppelin Permissioned Token (ERC-20 + whitelist)"],
              [
                "Merkle Root SHA-256",
                <CopyChip
                  text={e.merkle}
                  display={shortHash(e.merkle, 16, 10)}
                  toast={i}
                  className="text-rxAqua"
                />,
              ],
              ["Unidades", `${nf(0).format(e.mint.supply)} · ${money(e.mint.price, t)} c/u`],
            ].map(([h, b]) => (
              <div
                key={h}
                className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 px-5 py-3 border-b border-line last:border-b-0 text-[13px]"
              >
                <dt className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted pt-0.5">
                  {h}
                </dt>
                <dd className="text-inkBody min-w-0 break-words">{b}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
