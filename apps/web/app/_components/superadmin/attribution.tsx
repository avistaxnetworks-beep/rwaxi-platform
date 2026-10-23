// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useState } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { FEE_STATUS } from "@/app/_lib/data/fees";
import { PROJECTS } from "@/app/_lib/data/projects";
import { money, pct } from "@/app/_lib/format";

export function Attribution({ rows: e, tenants: a, ledger: t, currency: o }) {
  const [n, l] = useState("todos"),
    r = e.filter((p) => n === "todos" || p.tenantId === n),
    i = r.length,
    s = [
      ["Clics desde vitrina", i],
      ["NDA firmado", r.filter((p) => p.nda).length],
      ["KYC aprobado", r.filter((p) => p.kyc === "aprobado").length],
      ["Suscripción verificada", r.filter((p) => p.sub === "verificada").length],
    ],
    c = (p) => p.evidence && t.find((m) => m.evidence === p.evidence),
    d = (p, m, u) => (
      <span
        className={`inline-flex items-center gap-1 text-[11px] ${p ? u || "text-aquaInk" : "text-muted"}`}
      >
        <Icon name={p ? "CheckCircle2" : "Circle"} size={13} />
        {m}
      </span>
    );
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted mr-1">Tenant</span>
        {[["todos", "Todos"], ...PROJECTS.map((p) => [p.id, a[p.id].displayName])].map(([p, m]) => (
          <button
            key={p}
            onClick={() => l(p)}
            aria-pressed={n === p}
            className={`px-3 py-1.5 text-[12px] font-medium border focus-ring ${n === p ? "bg-rxPurple border-rxPurple text-white" : "bg-white border-line text-inkBody hover:border-rxPurple"}`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="bg-white border border-line p-5 grid md:grid-cols-4 gap-5">
        {s.map(([p, m], u) => (
          <div key={p} className="min-w-0">
            <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{p}</p>
            <p className="font-mono text-[26px] text-rxPurple tnum">{m}</p>
            <div className="h-2 bg-cloud mt-1">
              <div
                className="h-full bg-rxPurple"
                style={{
                  width: `${i ? (m / i) * 100 : 0}%`,
                  opacity: 1 - u * 0.18,
                }}
              />
            </div>
            <p className="text-[11px] text-muted mt-1 font-mono">
              {i ? pct((m / i) * 100, 0) : "0 %"}
              {" del total"}
            </p>
          </div>
        ))}
      </div>
      <div className="bg-white border border-line">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
            LeadReferral · tabla maestra
          </p>
          <p className="text-[11.5px] text-muted">Se actualiza en vivo con los Entornos 1, 2 y 3.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                <th className="font-semibold px-5 py-3">Token</th>
                <th className="font-semibold px-3 py-3">Tenant</th>
                <th className="font-semibold px-3 py-3">Inversionista</th>
                <th className="font-semibold px-3 py-3">Clic</th>
                <th className="font-semibold px-3 py-3">NDA</th>
                <th className="font-semibold px-3 py-3">KYC</th>
                <th className="font-semibold px-3 py-3">Suscripción</th>
                <th className="font-semibold px-5 py-3">Tarifa por uso</th>
              </tr>
            </thead>
            <tbody>
              {r.map((p) => {
                const m = c(p);
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-line last:border-b-0 ${p.me ? "bg-[#F7F5FB]" : ""}`}
                  >
                    <td className="px-5 py-3 font-mono text-[11px] text-aquaInk">
                      {p.token.slice(0, 20)}…
                      {p.me && (
                        <span className="block font-sans text-[10px] font-semibold text-rxPurple">
                          TU SESIÓN DEMO
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5"
                          style={{
                            background: a[p.tenantId].color,
                          }}
                        />
                        {a[p.tenantId].displayName}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-inkBody">{p.investor}</td>
                    <td className="px-3 py-3">{d(true, p.at)}</td>
                    <td className="px-3 py-3">{d(p.nda, p.nda ? "Firmado" : "Pendiente")}</td>
                    <td className="px-3 py-3">
                      {p.kyc === "aprobado"
                        ? d(true, "Aprobado")
                        : p.kyc === "pendiente"
                          ? d(true, "En revisión", "text-goldInk")
                          : p.kyc === "rechazado"
                            ? d(true, "Rechazado", "text-[#B42318]")
                            : d(false, "—")}
                    </td>
                    <td className="px-3 py-3">
                      {p.sub === "verificada"
                        ? d(true, "Verificada · minteada")
                        : p.sub === "reservada"
                          ? d(true, "Reservada", "text-goldInk")
                          : d(false, "—")}
                    </td>
                    <td className="px-5 py-3">
                      {m ? (
                        <span
                          className={`text-[10.5px] font-semibold font-mono px-2 py-0.5 ${FEE_STATUS[m.status][1]}`}
                        >
                          {m.status}
                          {" · "}
                          {money(m.amount, o)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted">
                          {p.sub === "reservada" ? "No causa hasta la emisión" : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!r.length && (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center text-muted">
                    Aún no hay clics atribuidos para este tenant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
