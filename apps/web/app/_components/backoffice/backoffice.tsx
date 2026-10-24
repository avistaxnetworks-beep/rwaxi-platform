// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { ConfigTab } from "@/app/_components/backoffice/config-tab";
import { DataMintTab } from "@/app/_components/backoffice/data-mint-tab";
import { TenantLogo } from "@/app/_components/portal/tenant-brand";
import { Icon } from "@/app/_components/ui/icon";
import { LanguageToggle } from "@/app/_i18n/language-switcher";
import { useI18n } from "@/app/_i18n/provider";
import { onColor } from "@/app/_lib/format";

export function Backoffice({
  t: e,
  p: a,
  setTenant: t,
  journey: o,
  setJourney: n,
  currency: l,
  toPortal: r,
  toast: i,
  tab: s,
  setTab: c,
  photos: d,
  emit: p,
  openInspector: m,
  // Persisted compliance inbox (app/tenant/[slug]/backoffice/_components/compliance-inbox.tsx).
  complianceSlot: g,
  // Persisted payments desk and chain queue (app/tenant/[slug]/backoffice/_components/subscriptions-desk.tsx).
  subscriptionsSlot: q,
  // Persisted yield distributions (app/tenant/[slug]/backoffice/_components/distributions-desk.tsx).
  distributionsSlot: w,
  // Signed-in staff member (or the demo session) and «Cerrar sesión» (app/_components/auth/account-badge.tsx).
  accountSlot: z,
  // Persisted Data Room and DocumentVault (app/tenant/[slug]/backoffice/_components/data-room-desk.tsx).
  dataRoomSlot: D,
}) {
  const { tr } = useI18n();
  const u = [
    ["config", "Settings2", tr("Configuración White Label")],
    ["cumplimiento", "ShieldCheck", tr("Cumplimiento y Leads")],
    ["suscripciones", "Coins", tr("Suscripciones y Pagos")],
    ["distribuciones", "Calculator", tr("Distribuciones y Rendimientos")],
    ["dataroom", "Database", tr("Data Room y Minting")],
  ];
  return (
    <div
      style={{
        "--tc": e.color,
        "--tc-on": onColor(e.color),
      }}
      className="min-h-full"
    >
      <header className="bg-white border-b border-line">
        <div className="gutter max-w-[1240px] mx-auto py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3 min-w-0">
            <TenantLogo t={e} size={36} />
            <div className="min-w-0">
              <p className="text-[11px] font-mono tracking-[0.12em] text-muted">
                {tr("BACKOFFICE · TENANT ADMIN")}
              </p>
              <p className="font-bold text-[16px] text-rxPurple leading-tight">{e.legalName}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] bg-cloud border border-line px-2.5 py-1.5">
            <Icon name="Boxes" size={13} className="tc-text" />
            tnt_{e.slug}
            {" · "}
            {tr("datos aislados")}
          </span>
          <button
            onClick={m}
            className="md:ml-auto bg-rxDeep text-white text-[12px] font-mono px-3 py-2 inline-flex items-center gap-1.5 focus-ring"
          >
            <Icon name="Link" size={14} className="text-rxAqua" />
            {tr("Inspector On-Chain")}
          </button>
          <LanguageToggle />
          {z}
          <button
            onClick={r}
            className="tc-btn text-[12.5px] font-semibold px-3.5 py-2 inline-flex items-center gap-1.5 focus-ring"
          >
            {tr("Ver mi portal")} <Icon name="ArrowUpRight" size={14} />
          </button>
        </div>
        <div className="gutter max-w-[1240px] mx-auto flex overflow-x-auto" role="tablist">
          {u.map(([v, h, b], y) => (
            <button
              key={v}
              role="tab"
              aria-selected={s === v}
              onClick={() => c(v)}
              className={`shrink-0 mr-6 py-3 text-[12.5px] font-semibold inline-flex items-center gap-2 border-b-2 focus-ring ${s === v ? "tc-border tc-text" : "border-transparent text-muted hover:text-rxPurple"}`}
            >
              <span className="font-mono text-[10.5px]">{y + 1}</span>
              <Icon name={h} size={15} />
              {b}
            </button>
          ))}
        </div>
      </header>
      <main className="gutter max-w-[1240px] mx-auto py-8">
        {s === "config" && <ConfigTab t={e} p={a} setTenant={t} toPortal={r} toast={i} photos={d} />}
        {s === "cumplimiento" && g}
        {s === "suscripciones" && q}
        {s === "distribuciones" && w}
        {s === "dataroom" && (
          <DataMintTab
            emit={p}
            t={e}
            p={a}
            setTenant={t}
            setJourney={n}
            journey={o}
            toast={i}
            dataRoomSlot={D}
          />
        )}
      </main>
    </div>
  );
}
