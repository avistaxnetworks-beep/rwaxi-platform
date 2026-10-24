// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useState } from "react";
import { TenantLogo } from "@/app/_components/portal/tenant-brand";
import { OnboardTenantModal } from "@/app/_components/superadmin/onboard-tenant-modal";
import { Icon } from "@/app/_components/ui/icon";
import { Switch } from "@/app/_components/ui/primitives";
import { TX } from "@/app/_lib/chain/simulator";
import { PORTAL_STATUS } from "@/app/_lib/data/fees";
import { REGIMES } from "@/app/_lib/data/kyc";
import { PROJECTS } from "@/app/_lib/data/projects";
import { money } from "@/app/_lib/format";
import { portalHost } from "@/app/_lib/hosts";

export function Governance({
  emit: e,
  tenants: a,
  setTenants: t,
  journeys: o,
  orgs: n,
  setOrgs: l,
  feeRules: r,
  currency: i,
  toast: s,
  log: c,
  audit: d,
  openTenant: p,
}) {
  const [m, u] = useState(false),
    v = (f, N, x) => {
      t((g) => ({
        ...g,
        [f]: {
          ...g[f],
          ...N,
        },
      })),
        x && (s(x), c(x));
    },
    h = PROJECTS.filter((f) => a[f.id].portalStatus === "ACTIVE").length,
    b = PROJECTS.filter((f) => a[f.id].published).length,
    y = PROJECTS.reduce((f, N) => f + (a[N.id].portalStatus === "SUSPENDED" ? 0 : r[N.id].monthly), 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line">
        {[
          ["Organizations", PROJECTS.length + n.length],
          ["Portales activos", h],
          ["Publicados en vitrina", b],
          ["MRR SaaS", money(y, i)],
        ].map(([f, N]) => (
          <div key={f} className="bg-white p-4 min-w-0">
            <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{f}</p>
            <p className="font-mono text-[24px] text-rxPurple tnum mt-1 break-words">{N}</p>
          </div>
        ))}
      </div>
      <div className="bg-white border border-line">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between items-center gap-3">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
            Organizations · TenantPortals
          </p>
          <button
            onClick={() => u(true)}
            className="tc-btn px-3.5 py-2 text-[12.5px] font-semibold inline-flex items-center gap-1.5 focus-ring"
          >
            <Icon name="Plus" size={15} />
            Dar de Alta Nuevo Desarrollador (Onboarding Tenant)
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                <th className="font-semibold px-5 py-3">Desarrollador</th>
                <th className="font-semibold px-3 py-3">Portal</th>
                <th className="font-semibold px-3 py-3">Régimen</th>
                <th className="font-semibold px-3 py-3">Proyecto</th>
                <th className="font-semibold px-3 py-3">Estado del portal</th>
                <th className="font-semibold px-3 py-3">Vitrina RWAXI</th>
                <th className="font-semibold px-3 py-3 text-right">Leads</th>
                <th className="font-semibold px-5 py-3">
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {PROJECTS.map((f) => {
                const N = a[f.id];
                return (
                  <tr key={f.id} className="border-b border-line align-middle">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <TenantLogo t={N} size={30} />
                        <div className="min-w-0">
                          <p className="font-semibold text-rxPurple">{N.legalName}</p>
                          <p className="font-mono text-[10.5px] text-muted">
                            {"NIT "}
                            {N.nit}
                            {" · cliente desde "}
                            {N.since}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 font-mono text-[11.5px] text-inkBody">
                      {portalHost(N)}
                      {N.domainStatus === "verificado" && N.domain && (
                        <span className="block text-muted">{N.domain}</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-[11.5px]">{REGIMES[N.regime].short}</td>
                    <td className="px-3 py-3.5">
                      <p className="text-inkBody">{f.asset}</p>
                      <p className="text-[10.5px] text-muted">
                        {N.mint.status === "minted" ? `Token ${N.mint.symbol} emitido` : "Token sin emitir"}
                      </p>
                    </td>
                    <td className="px-3 py-3.5">
                      <label htmlFor={`st-${f.id}`} className="sr-only">
                        {"Estado del portal de "}
                        {N.displayName}
                      </label>
                      <select
                        id={`st-${f.id}`}
                        value={N.portalStatus}
                        onChange={(x) =>
                          v(
                            f.id,
                            {
                              portalStatus: x.target.value,
                            },
                            `${N.displayName}: portal en estado ${x.target.value} (solo off-chain)`,
                          )
                        }
                        className={`border border-line px-2 py-1.5 text-[11.5px] font-semibold font-mono focus-ring ${PORTAL_STATUS[N.portalStatus][1]}`}
                      >
                        {Object.keys(PORTAL_STATUS).map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`pub-${f.id}`}
                          checked={N.published}
                          label={`Publicado en Vitrina Pública RWAXI: ${N.displayName}`}
                          onChange={(x) =>
                            v(
                              f.id,
                              {
                                published: x,
                              },
                              `${f.asset} ${x ? "publicado en" : "retirado de"} la vitrina pública`,
                            )
                          }
                        />
                        <span className="font-mono text-[10.5px] text-muted">
                          {"isPublishedInRwaxi: "}
                          {String(N.published)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono tnum">
                      {N.leads.length + (o[f.id].lead || o[f.id].nda ? 1 : 0)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => p(f.id)}
                        className="text-rxBlue font-medium inline-flex items-center gap-1 focus-ring whitespace-nowrap"
                      >
                        {"Ver portal "}
                        <Icon name="ArrowUpRight" size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {n.map((f) => (
                <tr key={f.slug} className="border-b border-line last:border-b-0 align-middle bg-[#FBF8F1]">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <TenantLogo t={f} size={30} />
                      <div className="min-w-0">
                        <p className="font-semibold text-rxPurple">{f.legalName}</p>
                        <p className="font-mono text-[10.5px] text-muted">
                          {"NIT "}
                          {f.nit}
                          {" · alta "}
                          {f.since}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 font-mono text-[11.5px] text-inkBody">{f.slug}.rwaxirealestate.com</td>
                  <td className="px-3 py-3.5 text-[11.5px]">{REGIMES[f.regime].short}</td>
                  <td className="px-3 py-3.5 text-[11.5px] text-muted">Sin proyectos aún</td>
                  <td className="px-3 py-3.5">
                    <span
                      className={`text-[11px] font-semibold font-mono px-2 py-1 ${PORTAL_STATUS.REVIEW[1]}`}
                    >
                      REVIEW
                    </span>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`pub-${f.slug}`}
                        checked={false}
                        disabled={true}
                        label="Sin proyecto para publicar"
                        onChange={() => {}}
                      />
                      <span className="text-[10.5px] text-muted">Requiere KYB y proyecto</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono">0</td>
                  <td className="px-5 py-3.5 text-right text-[11px] text-goldInk font-semibold whitespace-nowrap">
                    Onboarding en curso
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-line p-5 flex flex-col gap-2 text-[12.5px] text-inkBody leading-[1.6]">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase mb-1">
            Efecto de los controles
          </p>
          <p>
            <strong className="text-rxPurple">ACTIVE:</strong>
            {" el portal opera y la vitrina permite ir a él."}
          </p>
          <p>
            <strong className="text-rxPurple">REVIEW:</strong>
            {" el portal funciona y la vitrina muestra el proyecto sin enlace al portal."}
          </p>
          <p>
            <strong className="text-rxPurple">SUSPENDED:</strong>
            {
              " bloquea solo la interfaz web del portal (off-chain): aviso institucional, sin NDA, KYC ni suscripciones nuevas. RWAXI no ejecuta ninguna transacción sobre el contrato del emisor; pausar el token on-chain es decisión exclusiva del desarrollador."
            }
          </p>
          <p>
            <strong className="text-rxPurple">isPublishedInRwaxi:</strong>
            {" si está apagado, el proyecto desaparece del catálogo público."}
          </p>
        </div>
        <div className="bg-white border border-line">
          <p className="px-5 py-3 border-b border-line font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
            Registro de auditoría
          </p>
          <ul className="max-h-[220px] overflow-y-auto">
            {d.map((f, N) => (
              <li key={N} className="px-5 py-2.5 border-b border-line last:border-b-0 text-[12px]">
                <span className="font-mono text-[11px] text-muted">{f.at}</span>
                {" · "}
                <span className="text-inkBody">{f.what}</span>
                <span className="block text-[10.5px] text-muted">{f.who}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {m && (
        <OnboardTenantModal
          onClose={() => u(false)}
          existing={[...PROJECTS.map((f) => a[f.id].nit), ...n.map((f) => f.nit)]}
          onCreate={(f) => {
            e(TX.registry(f)),
              l((N) => [...N, f]),
              u(false),
              s(`${f.legalName} dado de alta · portal ${f.slug}.rwaxirealestate.com en revisión`),
              c(`Dio de alta el tenant ${f.legalName} (setup ${money(f.fees.setup, "USD")})`);
          }}
        />
      )}
    </div>
  );
}
