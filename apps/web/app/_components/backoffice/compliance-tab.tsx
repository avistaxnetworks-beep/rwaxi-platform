// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useState } from "react";
import { fieldCls } from "@/app/_components/ui/form";
import { Icon } from "@/app/_components/ui/icon";
import { Modal } from "@/app/_components/ui/modal";
import { DEMO_WALLET, TX, leadWallet } from "@/app/_lib/chain/simulator";
import { INCOME, KYC_LABEL, REGIMES, REJECT_REASONS, RISK, incomeLabel } from "@/app/_lib/data/kyc";
import { onColor, shortHash } from "@/app/_lib/format";
import { seededHex } from "@/app/_lib/hash";

export function ComplianceTab({
  t: e,
  p: a,
  setTenant: t,
  journey: o,
  setJourney: n,
  currency: l,
  toast: r,
  emit: i,
}) {
  const [s, c] = useState(null),
    [d, p] = useState(null),
    [m, u] = useState(0),
    v =
      o.lead || o.nda
        ? {
            id: "me",
            me: true,
            name: o.kyc.data.fullName || (o.nda ? o.nda.signer : "Visitante referido"),
            doc: o.kyc.data.docNumber ? `C.C. ${o.kyc.data.docNumber}` : "—",
            token: o.lead ? o.lead.token : "—",
            source: o.lead ? "RWAXI" : "Directo",
            at: (o.lead || o.nda).at.slice(0, 10),
            nda: !!o.nda,
            kyc: o.kyc.status || "no_iniciado",
            lists: o.kyc.status ? "Sin coincidencias" : "—",
            activity: o.kyc.data.activity,
            income: o.kyc.data.income,
            risk: o.kyc.data.risk,
            ptee: o.kyc.data.ptee,
            whitelistTx: o.kyc.whitelistTx,
          }
        : null,
    h = v ? [v, ...e.leads] : e.leads,
    b = (g, w) => {
      g.me
        ? n((A) => ({
            ...A,
            kyc: {
              ...A.kyc,
              status: w.kyc,
              reason: w.reason || null,
              whitelistTx: w.whitelistTx || null,
            },
          }))
        : t((A) => ({
            ...A,
            leads: A.leads.map((P) =>
              P.id === g.id
                ? {
                    ...P,
                    ...w,
                  }
                : P,
            ),
          }));
    },
    y = (g) => {
      p(g.id),
        setTimeout(() => {
          const w = g.me ? DEMO_WALLET : leadWallet(g),
            A =
              "0x" +
              (g.me
                ? o.kyc.dossierHash || seededHex("dossier-demo-" + a.id, 64)
                : seededHex("dossier" + g.id, 64)),
            P = TX.approve(e, a.id, w, A);
          i(P),
            b(g, {
              kyc: "aprobado",
              whitelistTx: P.hash,
            }),
            p(null),
            c(null),
            r(`${g.name} aprobado · wallet añadida a la whitelist on-chain de ${e.mint.symbol}`);
        }, 1200);
    },
    f = (g) => {
      b(g, {
        kyc: "rechazado",
        reason: REJECT_REASONS[m],
      }),
        c(null),
        r(`Solicitud de ${g.name} rechazada con motivo`);
    },
    N = [
      ["Leads totales", h.length],
      ["Referidos por RWAXI", h.filter((g) => g.source === "RWAXI").length],
      ["NDA firmados", h.filter((g) => g.nda).length],
      ["KYC pendientes", h.filter((g) => g.kyc === "pendiente").length],
      ["En whitelist", h.filter((g) => g.kyc === "aprobado").length],
    ],
    x = s && h.find((g) => g.id === s);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-line border border-line">
        {N.map(([g, w]) => (
          <div key={g} className="bg-white p-4">
            <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{g}</p>
            <p className="font-mono text-[26px] text-rxPurple tnum mt-1">{w}</p>
          </div>
        ))}
      </div>
      <div className="bg-white border border-line">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
            {"Bandeja de cumplimiento · "}
            {e.legalName}
          </p>
          <p className="text-[11.5px] text-muted">Las filas distintas a la tuya son datos de ejemplo.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                <th className="font-semibold px-5 py-3">Inversionista</th>
                <th className="font-semibold px-3 py-3">LeadReferral</th>
                <th className="font-semibold px-3 py-3">NDA</th>
                <th className="font-semibold px-3 py-3">{REGIMES[e.regime].short}</th>
                <th className="font-semibold px-3 py-3">Listas restrictivas</th>
                <th className="font-semibold px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {h.map((g) => (
                <tr
                  key={g.id}
                  className={`border-b border-line last:border-b-0 align-top ${g.me ? "bg-[#F7F5FB]" : ""}`}
                >
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-rxPurple">
                      {g.name}
                      {g.me && <span className="ml-2 text-[10px] font-semibold tc-text">TU SESIÓN DEMO</span>}
                    </p>
                    <p className="font-mono text-[11px] text-muted">
                      {g.doc}
                      {" · "}
                      {g.at}
                    </p>
                  </td>
                  <td className="px-3 py-3.5">
                    <p
                      className={`text-[11px] font-semibold ${g.source === "RWAXI" ? "text-aquaInk" : "text-muted"}`}
                    >
                      {g.source === "RWAXI" ? "Vitrina RWAXI" : "Directo"}
                    </p>
                    <p className="font-mono text-[10.5px] text-muted">
                      {g.token === "—" ? "—" : g.token.slice(0, 16) + "…"}
                    </p>
                  </td>
                  <td className="px-3 py-3.5">
                    {g.nda ? (
                      <span className="inline-flex items-center gap-1 text-aquaInk">
                        <Icon name="CheckCircle2" size={14} />
                        Firmado
                      </span>
                    ) : (
                      <span className="text-muted">Pendiente</span>
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    <span className={`text-[10.5px] font-semibold px-2 py-0.5 ${KYC_LABEL[g.kyc][1]}`}>
                      {KYC_LABEL[g.kyc][0]}
                    </span>
                    {g.ptee && <p className="text-[10.5px] text-muted mt-1">PTEE aceptado</p>}
                  </td>
                  <td
                    className={`px-3 py-3.5 text-[11.5px] ${/revisar/.test(g.lists) ? "text-goldInk font-semibold" : "text-inkBody"}`}
                  >
                    {g.lists}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={g.kyc === "no_iniciado"}
                        onClick={() => {
                          c(g.id), u(0);
                        }}
                        className="border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-rxBlue disabled:opacity-40 focus-ring"
                      >
                        Revisar formulario
                      </button>
                      {g.kyc === "pendiente" && (
                        <button
                          disabled={d === g.id}
                          onClick={() => y(g)}
                          className="tc-btn px-2.5 py-1.5 text-[11.5px] font-semibold inline-flex items-center gap-1.5 focus-ring disabled:opacity-60"
                        >
                          <Icon
                            name={d === g.id ? "Loader2" : "BadgeCheck"}
                            size={13}
                            className={d === g.id ? "spin" : ""}
                          />
                          Aprobar Inversionista y Añadir a Whitelist On-Chain
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {x && (
        <Modal
          title={`Formulario ${REGIMES[e.regime].short} · ${x.name}`}
          onClose={() => c(null)}
          wide={true}
        >
          <div
            style={{
              "--tc": e.color,
              "--tc-on": onColor(e.color),
            }}
            className="flex flex-col gap-4"
          >
            <dl className="grid sm:grid-cols-2 gap-px bg-line border border-line text-[12.5px]">
              {[
                ["Documento", x.doc],
                ["Origen", x.source === "RWAXI" ? `LeadReferral ${x.token.slice(0, 16)}…` : "Directo"],
                ["Actividad económica", x.activity || "—"],
                [
                  "Ingresos anuales",
                  x.income === null || x.income === undefined ? "—" : incomeLabel(INCOME[x.income], l),
                ],
                ["Perfil de riesgo", (RISK.find((g) => g[0] === x.risk) || [0, "—"])[1]],
                ["Declaración PEP", x.kyc === "no_iniciado" ? "—" : "No es PEP"],
                ["PTEE", x.ptee ? "Aceptado" : "—"],
                ["Listas restrictivas", x.lists],
                ["Biometría", x.kyc === "no_iniciado" ? "—" : "Prueba de vida superada"],
                ["Estado", KYC_LABEL[x.kyc][0]],
              ].map(([g, w]) => (
                <div key={g} className="bg-white px-4 py-2.5">
                  <dt className="text-[10.5px] font-semibold tracking-[0.06em] uppercase text-muted">{g}</dt>
                  <dd className="text-inkBody mt-0.5 break-words">{w}</dd>
                </div>
              ))}
            </dl>
            {x.whitelistTx && (
              <p className="text-[12px] text-muted">
                {"Tx whitelist: "}
                <span className="font-mono text-aquaInk">{shortHash(x.whitelistTx, 14, 8)}</span>
              </p>
            )}
            {x.kyc === "pendiente" && (
              <div className="flex flex-col gap-3 border-t border-line pt-4">
                <button
                  disabled={d === x.id}
                  onClick={() => y(x)}
                  className="tc-btn font-semibold text-[13px] py-3 inline-flex items-center justify-center gap-2 focus-ring disabled:opacity-60"
                >
                  <Icon
                    name={d === x.id ? "Loader2" : "BadgeCheck"}
                    size={15}
                    className={d === x.id ? "spin" : ""}
                  />
                  Aprobar Inversionista y Añadir a Whitelist On-Chain
                </button>
                <div className="flex flex-col sm:flex-row gap-2">
                  <label htmlFor="rej-reason" className="sr-only">
                    Motivo del rechazo
                  </label>
                  <select
                    id="rej-reason"
                    value={m}
                    onChange={(g) => u(+g.target.value)}
                    className={fieldCls() + " text-[12.5px]"}
                  >
                    {REJECT_REASONS.map((g, w) => (
                      <option key={w} value={w}>
                        {g.slice(0, 80)}…
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => f(x)}
                    className="shrink-0 border border-[#B42318] text-[#B42318] px-4 py-2.5 text-[12.5px] font-semibold focus-ring"
                  >
                    Rechazar con motivo
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
