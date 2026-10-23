"use client";

import { useState } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { KYC_LABEL } from "@/app/_lib/data/kyc";
import { PORTAL_STATUS } from "@/app/_lib/data/fees";
import { money, nf, pct } from "@/app/_lib/format";
import type { PlatformMetrics, PlatformMetricsResult } from "../_lib/types";

type Currency = "COP" | "USD";

const utc = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;
const share = (a: number, b: number) => (a + b ? (a / (a + b)) * 100 : 0);

function Unavailable({ error }: { error: string }) {
  return (
    <div role="alert" className="bg-white border border-[#F3C5C0] px-5 py-4 text-[13px] text-[#B42318] flex gap-2 mb-8">
      <Icon name="AlertTriangle" size={16} className="mt-0.5 shrink-0" />
      <span>{error}</span>
    </div>
  );
}

function SourceNote({ data }: { data: PlatformMetrics }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase inline-flex items-center gap-1.5">
        <Icon name="Database" size={13} className="text-rxGold" />
        Consolidado · PostgreSQL · rol de plataforma (BYPASSRLS)
      </p>
      <p className="font-mono text-[10.5px] text-muted text-right">
        {`generado ${utc(data.generatedAt)}`}
        <span className="block">
          {`Módulos A, B y C: PostgreSQL · alta de desarrolladores: demo${data.admin ? ` · sesión ${data.admin.email}` : ""}`}
        </span>
      </p>
    </div>
  );
}

function Kpi({ id, label, value, raw, sub, bar }: { id: string; label: string; value: string; raw: unknown; sub: string; bar?: number }) {
  return (
    <div className="bg-white p-4 min-w-0" data-kpi={id} data-value={JSON.stringify(raw)}>
      <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{label}</p>
      <p className="font-mono text-[24px] text-rxPurple tnum mt-1 break-words">{value}</p>
      {bar !== undefined && (
        <div className="h-1.5 bg-cloud mt-1.5">
          <div className="h-full bg-rxPurple" style={{ width: `${Math.min(100, bar)}%` }} />
        </div>
      )}
      <p className="text-[11px] text-muted mt-1.5 leading-snug">{sub}</p>
    </div>
  );
}

function Status({ status }: { status: keyof typeof PORTAL_STATUS }) {
  const [label, cls] = PORTAL_STATUS[status];
  return <span className={`text-[10.5px] font-semibold px-2 py-0.5 ${cls}`}>{label}</span>;
}

/** Always-visible header of the console: consolidated KPIs and one row per tenant. */
export function PlatformOverview({ metrics, currency }: { metrics: PlatformMetricsResult; currency: Currency }) {
  if (!metrics.ok) return <Unavailable error={metrics.error} />;
  const { totals: t, tenants } = metrics.data;
  const due = t.feesAll.ACCRUED + t.feesAll.INVOICED;
  return (
    <section data-platform-overview className="flex flex-col gap-4 mb-8">
      <SourceNote data={metrics.data} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line">
        <Kpi
          id="active-orgs"
          label="Organizaciones activas"
          value={`${t.activeOrganizations} / ${t.organizations}`}
          raw={{ active: t.activeOrganizations, total: t.organizations }}
          sub={`${t.published} publicadas en vitrina · ${t.investors} inversionistas`}
        />
        <Kpi
          id="leads"
          label="Leads · RWAXI vs directos"
          value={`${t.leads.referral} · ${t.leads.direct}`}
          raw={t.leads}
          bar={share(t.leads.referral, t.leads.direct)}
          sub={`${pct(share(t.leads.referral, t.leads.direct), 0)} referidos por la vitrina (HMAC verificado)`}
        />
        <Kpi
          id="volume"
          label="Volumen suscrito"
          value={money(t.subscribed.capitalUsd, currency, true)}
          raw={t.subscribed}
          sub={`en wallet ${money(t.subscribed.mintedUsd, currency, true)} · mint en cola ${money(t.subscribed.pendingUsd, currency, true)} · pago por conciliar ${money(t.subscribed.paymentPendingUsd, currency, true)} · reservas ${money(t.subscribed.reservedUsd, currency, true)}`}
        />
        <Kpi
          id="fees"
          label="Comisiones RWAXI"
          value={money(t.feesAll.total, currency, true)}
          raw={t.feesAll}
          sub={`cobrado ${money(t.feesAll.PAID, currency, true)} · por cobrar ${money(due, currency, true)}`}
        />
      </div>
      <div className="bg-white border border-line overflow-x-auto">
        <table className="w-full min-w-[980px] text-[12.5px]">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
              <th className="font-semibold px-5 py-3">Desarrollador</th>
              <th className="font-semibold px-3 py-3">Portal</th>
              <th className="font-semibold px-3 py-3 text-right">Leads RWAXI · directos</th>
              <th className="font-semibold px-3 py-3 text-right">KYC aprobados</th>
              <th className="font-semibold px-3 py-3 text-right">Volumen suscrito</th>
              <th className="font-semibold px-3 py-3">Unidades comprometidas</th>
              <th className="font-semibold px-5 py-3 text-right">Comisiones</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((row) => {
              const used = row.offering ? (row.offering.unitsSubscribed / row.offering.totalUnits) * 100 : 0;
              return (
                <tr key={row.slug} data-tenant-row={row.slug} className="border-b border-line last:border-b-0 align-top">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-rxPurple">{row.legalName}</p>
                    <p className="font-mono text-[11px] text-muted">{`${row.slug} · cliente desde ${row.onboardedAt}`}</p>
                  </td>
                  <td className="px-3 py-3">
                    <Status status={row.portalStatus} />
                    <p className="text-[10.5px] text-muted mt-1">{row.published ? "En vitrina" : "Fuera de vitrina"}</p>
                  </td>
                  <td className="px-3 py-3 text-right font-mono tnum">{`${row.leads.referral} · ${row.leads.direct}`}</td>
                  <td className="px-3 py-3 text-right font-mono tnum">
                    {row.kycApproved}
                    {row.kycPending > 0 && <span className="block text-[10.5px] text-goldInk">{`${row.kycPending} pendientes`}</span>}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tnum">{money(row.subscribed.capitalUsd, currency, true)}</td>
                  <td className="px-3 py-3 min-w-[180px]">
                    {row.offering ? (
                      <>
                        <p className="font-mono text-[11px] text-inkBody">
                          {`${nf(0).format(row.offering.unitsSubscribed)} / ${nf(0).format(row.offering.totalUnits)} · ${row.offering.code}`}
                        </p>
                        <div className="h-1.5 bg-cloud mt-1">
                          <div className="h-full bg-rxGold" style={{ width: `${used}%` }} />
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tnum">{money(row.feesUsd, currency, true)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Module B: RWAXI-referred leads (HMAC-verified) and their funnel, per tenant. */
export function PlatformAttribution({ metrics, currency }: { metrics: PlatformMetricsResult; currency: Currency }) {
  const [tenant, setTenant] = useState("todos");
  if (!metrics.ok) return <Unavailable error={metrics.error} />;
  const { tenants, referrals } = metrics.data;
  const rows = referrals.filter((r) => tenant === "todos" || r.tenant.slug === tenant);
  const scope = tenants.filter((t) => tenant === "todos" || t.slug === tenant);
  const referral = scope.reduce((s, t) => s + t.leads.referral, 0);
  const direct = scope.reduce((s, t) => s + t.leads.direct, 0);
  const funnel: [string, number][] = [
    ["Leads referidos (REFERRAL)", rows.length],
    ["NDA firmado", rows.filter((r) => r.nda).length],
    ["KYC aprobado", rows.filter((r) => r.kyc === "aprobado").length],
    ["Con suscripción", rows.filter((r) => r.subscribedUsd > 0).length],
  ];
  return (
    <div className="flex flex-col gap-6" data-platform-attribution>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted mr-1">Tenant</span>
        {[["todos", "Todos"], ...tenants.map((t) => [t.slug, t.displayName])].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTenant(key!)}
            aria-pressed={tenant === key}
            className={`px-3 py-1.5 text-[12px] font-medium border focus-ring ${tenant === key ? "bg-rxPurple border-rxPurple text-white" : "bg-white border-line text-inkBody hover:border-rxPurple"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="bg-white border border-line p-5 grid md:grid-cols-5 gap-5">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">RWAXI vs directos</p>
          <p className="font-mono text-[26px] text-rxPurple tnum">{`${referral} · ${direct}`}</p>
          <p className="text-[11px] text-muted mt-1 font-mono">{`${pct(share(referral, direct), 0)} referidos`}</p>
        </div>
        {funnel.map(([label, value], i) => (
          <div key={label} className="min-w-0">
            <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{label}</p>
            <p className="font-mono text-[26px] text-rxPurple tnum">{value}</p>
            <div className="h-2 bg-cloud mt-1">
              <div
                className="h-full bg-rxPurple"
                style={{ width: `${funnel[0]![1] ? (value / funnel[0]![1]) * 100 : 0}%`, opacity: 1 - i * 0.18 }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white border border-line overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">LeadReferral · tokens firmados por la vitrina</p>
          <p className="text-[11.5px] text-muted">Un token inválido, manipulado o reutilizado queda como DIRECT.</p>
        </div>
        <table className="w-full min-w-[860px] text-[12.5px]">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
              <th className="font-semibold px-5 py-3">Fecha</th>
              <th className="font-semibold px-3 py-3">Tenant</th>
              <th className="font-semibold px-3 py-3">Referral id</th>
              <th className="font-semibold px-3 py-3">Inversionista</th>
              <th className="font-semibold px-3 py-3">NDA</th>
              <th className="font-semibold px-3 py-3">KYC</th>
              <th className="font-semibold px-5 py-3 text-right">Suscrito</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-referral-row={r.token} className="border-b border-line last:border-b-0">
                <td className="px-5 py-3 font-mono text-[11.5px]">{r.landedAt.slice(0, 10)}</td>
                <td className="px-3 py-3">{r.tenant.displayName}</td>
                <td className="px-3 py-3 font-mono text-[11px] text-aquaInk">{`${r.token.slice(0, 16)}…`}</td>
                <td className="px-3 py-3">{r.investorName ?? "—"}</td>
                <td className="px-3 py-3">{r.nda ? "Firmado" : "—"}</td>
                <td className="px-3 py-3">
                  <span className={`text-[10.5px] font-semibold px-2 py-0.5 ${KYC_LABEL[r.kyc][1]}`}>{KYC_LABEL[r.kyc][0]}</span>
                </td>
                <td className="px-5 py-3 text-right font-mono tnum">{r.subscribedUsd ? money(r.subscribedUsd, currency, false) : "—"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-muted">
                  Sin leads referidos para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
