// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useState } from "react";
import { FEE_KIND, FEE_STATUS } from "@/app/_lib/data/fees";
import { PROJECTS } from "@/app/_lib/data/projects";
import { money, nf, shortHash } from "@/app/_lib/format";

export function Fees({
  ledger: e,
  tenants: a,
  orgs: t,
  feeRules: o,
  setFeeRules: n,
  setOverrides: l,
  currency: r,
  toast: i,
  log: s,
}) {
  const [c, d] = useState("todos"),
    [p, m] = useState("todos"),
    u = (x) => x.reduce((g, w) => g + w.amount, 0),
    v = (x) => e.filter((g) => g.kind === x),
    h = e
      .filter((x) => (c === "todos" || x.kind === c) && (p === "todos" || x.org === p))
      .sort((x, g) => (x.date < g.date ? 1 : -1)),
    b = (x, g) => {
      l((A) => ({
        ...A,
        [x.id]: g,
      }));
      const w = `${FEE_KIND[x.kind]} de ${x.org}: ${g}`;
      i(w), s(w);
    },
    y = () => {
      const x = e.filter((g) => g.status === "ACCRUED");
      if (!x.length) {
        i("No hay causaciones pendientes de facturar");
        return;
      }
      l((g) => {
        const w = {
          ...g,
        };
        return (
          x.forEach((A) => {
            w[A.id] = "INVOICED";
          }),
          w
        );
      }),
        i(`${x.length} causaciones facturadas · ${money(u(x), r)}`),
        s(`Facturó ${x.length} causaciones pendientes`);
    },
    f = (x, g, w) =>
      n((A) => ({
        ...A,
        [x]: {
          ...A[x],
          [g]: Math.max(0, w),
        },
      })),
    N = [...PROJECTS.map((x) => a[x.id].legalName), ...t.map((x) => x.legalName)];
  return (
    <div className="flex flex-col gap-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line">
        {[
          ["setup", "Setup / Onboarding Fee", "Fijo por implementación White Label"],
          ["saas", "Suscripción SaaS", "Infraestructura, Data Room y nodo blockchain"],
          ["usage", "Tarifa por uso", "Solo operaciones verificadas / minteadas"],
        ].map(([x, g, w]) => (
          <div key={x} className="bg-white p-5 min-w-0">
            <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{g}</p>
            <p className="font-mono text-[24px] text-rxPurple tnum mt-1 break-words">{money(u(v(x)), r)}</p>
            <p className="text-[11px] text-muted">{w}</p>
          </div>
        ))}
        <div className="bg-rxPurple text-white p-5 min-w-0">
          <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-[#D9A24A]">
            Ingresos RWAXI · total
          </p>
          <p className="font-mono text-[24px] tnum mt-1 break-words">{money(u(e), r)}</p>
          <p className="text-[11px] text-[#C9C1E3] font-mono">
            {"PAID "}
            {money(u(e.filter((x) => x.status === "PAID")), r, true)}
            {" · por cobrar "}
            {money(u(e.filter((x) => x.status !== "PAID")), r, true)}
          </p>
        </div>
      </div>
      <div className="bg-white border border-line">
        <p className="px-5 py-3.5 border-b border-line font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
          FeeRule por desarrollador (USD)
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                <th className="font-semibold px-5 py-3">Desarrollador</th>
                <th className="font-semibold px-3 py-3">Setup fee</th>
                <th className="font-semibold px-3 py-3">SaaS mensual</th>
                <th className="font-semibold px-3 py-3">Uso (% capital verificado)</th>
                <th className="font-semibold px-5 py-3 text-right">Ingresos causados</th>
              </tr>
            </thead>
            <tbody>
              {PROJECTS.map((x) => {
                const g = a[x.id],
                  w = o[x.id];
                return (
                  <tr key={x.id} className="border-b border-line">
                    <td className="px-5 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5"
                          style={{
                            background: g.color,
                          }}
                        />
                        <span className="font-semibold text-rxPurple">{g.legalName}</span>
                      </span>
                    </td>
                    {[
                      ["setup", 500],
                      ["monthly", 50],
                      ["usagePct", 0.1],
                    ].map(([A, P]) => (
                      <td key={A} className="px-3 py-2.5">
                        <input
                          aria-label={`${A} ${g.displayName}`}
                          type="number"
                          min="0"
                          step={P}
                          value={w[A]}
                          onChange={(z) => f(x.id, A, +z.target.value)}
                          className="w-[110px] border border-line px-2 py-1.5 font-mono text-[12px] focus-ring"
                        />
                      </td>
                    ))}
                    <td className="px-5 py-2.5 text-right font-mono tnum">
                      {money(u(e.filter((A) => A.tenantId === x.id)), r)}
                    </td>
                  </tr>
                );
              })}
              {t.map((x) => (
                <tr key={x.slug} className="border-b border-line last:border-b-0 bg-[#FBF8F1]">
                  <td className="px-5 py-2.5 font-semibold text-rxPurple">{x.legalName}</td>
                  <td className="px-3 py-2.5 font-mono">{nf(0).format(x.fees.setup)}</td>
                  <td className="px-3 py-2.5 font-mono">{nf(0).format(x.fees.monthly)}</td>
                  <td className="px-3 py-2.5 font-mono">
                    {nf(1).format(x.fees.usagePct)}
                    {" %"}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono tnum">{money(x.fees.setup, r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-white border border-line">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap gap-3 items-center justify-between">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
            FeeLedger · libro mayor B2B
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <label htmlFor="fl-kind" className="sr-only">
              Rubro
            </label>
            <select
              id="fl-kind"
              value={c}
              onChange={(x) => d(x.target.value)}
              className="border border-line px-2 py-1.5 text-[12px] focus-ring"
            >
              <option value="todos">Todos los rubros</option>
              {Object.entries(FEE_KIND).map(([x, g]) => (
                <option key={x} value={x}>
                  {g}
                </option>
              ))}
            </select>
            <label htmlFor="fl-org" className="sr-only">
              Desarrollador
            </label>
            <select
              id="fl-org"
              value={p}
              onChange={(x) => m(x.target.value)}
              className="border border-line px-2 py-1.5 text-[12px] focus-ring max-w-[220px]"
            >
              <option value="todos">Todos los desarrolladores</option>
              {N.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <button onClick={y} className="tc-btn px-3 py-1.5 text-[12px] font-semibold focus-ring">
              Facturar causados
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-[12.5px] tnum">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                <th className="font-semibold px-5 py-3">Fecha</th>
                <th className="font-semibold px-3 py-3">Desarrollador</th>
                <th className="font-semibold px-3 py-3">Rubro</th>
                <th className="font-semibold px-3 py-3">ID de evidencia</th>
                <th className="font-semibold px-3 py-3 text-right">Monto</th>
                <th className="font-semibold px-3 py-3">Estado</th>
                <th className="font-semibold px-5 py-3">
                  <span className="sr-only">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {h.map((x) => (
                <tr key={x.id} className="border-b border-line last:border-b-0">
                  <td className="px-5 py-2.5 font-mono text-[11.5px]">{x.date}</td>
                  <td className="px-3 py-2.5 text-inkBody">{x.org}</td>
                  <td className="px-3 py-2.5">
                    {FEE_KIND[x.kind]}
                    {x.kind === "usage" && (
                      <span className="block text-[10.5px] text-muted font-mono">
                        {nf(1).format(o[x.tenantId] ? o[x.tenantId].usagePct : 0)}
                        {" % × "}
                        {money(x.base, "USD")}
                      </span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2.5 font-mono text-[11px] text-aquaInk max-w-[260px] truncate"
                    title={x.evidence}
                  >
                    {x.kind === "usage" ? shortHash(x.evidence, 12, 6) : x.evidence}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{money(x.amount, r)}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`text-[10.5px] font-semibold font-mono px-2 py-0.5 ${FEE_STATUS[x.status][1]}`}
                    >
                      {x.status}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right whitespace-nowrap">
                    {x.status === "ACCRUED" && (
                      <button
                        onClick={() => b(x, "INVOICED")}
                        className="text-[11.5px] font-semibold text-rxBlue focus-ring"
                      >
                        Facturar
                      </button>
                    )}
                    {x.status === "INVOICED" && (
                      <button
                        onClick={() => b(x, "PAID")}
                        className="text-[11.5px] font-semibold text-rxBlue focus-ring"
                      >
                        Registrar pago
                      </button>
                    )}
                    {x.status === "PAID" && <span className="text-[11px] text-muted">Conciliado</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 border-t border-line text-[11.5px] text-muted">
          La tarifa por uso se causa solo cuando una suscripción queda verificada y minteada; las reservas
          previas a la emisión no generan cobro. Montos de ejemplo.
        </p>
      </div>
    </div>
  );
}
