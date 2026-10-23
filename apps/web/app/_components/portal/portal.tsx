// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useEffect, useState } from "react";
import { LegalText } from "@/app/_components/legal/legal-text";
import { DataRoomPanel, LockedNote } from "@/app/_components/portal/data-room-panel";
import { FunnelStepper } from "@/app/_components/portal/funnel-stepper";
import { InfoTabs } from "@/app/_components/portal/info-tabs";
import { KycPanel } from "@/app/_components/portal/kyc-panel";
import { MediaHero } from "@/app/_components/portal/media-hero";
import { NdaPanel } from "@/app/_components/portal/nda-panel";
import { PortalHeader } from "@/app/_components/portal/portal-header";
import { SubscriptionPanel } from "@/app/_components/portal/subscription-panel";
import { PoweredSeal } from "@/app/_components/portal/tenant-brand";
import { Icon } from "@/app/_components/ui/icon";
import { SectionHead } from "@/app/_components/ui/primitives";
import { REGIMES } from "@/app/_lib/data/kyc";
import { LEGAL_FRONTIER_TENANT, legalVars } from "@/app/_lib/data/legal";
import { onColor } from "@/app/_lib/format";

export function Portal({
  t: e,
  p: a,
  journey: t,
  setJourney: o,
  currency: n,
  setCurrency: l,
  photosFor: r,
  onUpload: i,
  openDoc: s,
  startSub: c,
  toast: d,
  toBackoffice: p,
}) {
  const [m, u] = useState(() => (t.holdings.length || t.grant ? 3 : t.nda ? 1 : 0)),
    [v, h] = useState(Math.max(a.ticket, 25e3));
  useEffect(() => {
    u(t.holdings.length || t.grant ? 3 : t.nda ? 1 : 0), h(Math.max(a.ticket, 25e3));
  }, [a.id]);
  const b = (g) => {
      const w = document.getElementById(g);
      w &&
        w.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    },
    y = (g) => {
      if (g === "top")
        return window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      if (g === "funnel-3") return u(2), b("funnel");
      if (g === "funnel-4") return u(3), b("funnel");
      b(g);
    },
    f = REGIMES[e.regime],
    N = e.portalStatus === "SUSPENDED",
    x = [
      "Paso 1 · Acuerdo de Confidencialidad (NDA)",
      `Paso 2 · Verificación KYC/AML + ${f.short}`,
      "Paso 3 · Data Room (AccessGrant)",
      "Paso 4 · Suscripción de tokens y portafolio",
    ];
  return (
    <div
      style={{
        "--tc": e.color,
        "--tc-on": onColor(e.color),
      }}
    >
      <PortalHeader t={e} journey={t} go={y} />
      {e.portalStatus !== "ACTIVE" && (
        <div
          className={e.portalStatus === "SUSPENDED" ? "bg-rxDeep text-white" : "bg-goldTint text-goldInk"}
          role="alert"
        >
          <div className="gutter max-w-[1240px] mx-auto py-4 flex flex-wrap items-start gap-3">
            <Icon
              name={e.portalStatus === "SUSPENDED" ? "PauseOctagon" : "Clock"}
              size={20}
              className={
                e.portalStatus === "SUSPENDED" ? "text-[#D9A24A] shrink-0 mt-0.5" : "shrink-0 mt-0.5"
              }
            />
            <div className="min-w-0">
              <p className="font-semibold text-[14px]">
                {e.portalStatus === "SUSPENDED"
                  ? "Portal temporalmente suspendido para nuevas operaciones"
                  : "Portal en revisión por RWAXI"}
              </p>
              <p className={`text-[12.5px] mt-0.5 ${e.portalStatus === "SUSPENDED" ? "text-[#C9C1E3]" : ""}`}>
                {e.portalStatus === "SUSPENDED"
                  ? `Por decisión de gobierno de la plataforma, ${e.legalName} no puede recibir nuevos NDA, verificaciones ni suscripciones. Si ya eres inversionista, tu portafolio y tus documentos siguen disponibles.`
                  : "El portal opera normalmente, pero el proyecto no recibe tráfico desde la vitrina pública mientras termina la revisión."}
              </p>
            </div>
          </div>
        </div>
      )}
      <main className="gutter max-w-[1240px] mx-auto py-10 flex flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-[0.14em] uppercase tc-text">
              {a.code}
              {" · Portal oficial del desarrollador"}
            </p>
            <h1 className="font-display font-semibold text-rxPurple text-[36px] md:text-[48px] leading-[1.04] mt-1 balance">
              {a.asset}
            </h1>
            <p className="text-[13.5px] text-muted mt-1">
              {a.city}
              {" · "}
              {a.region}
              {" · "}
              {a.type}
            </p>
          </div>
          {t.lead && (
            <span className="inline-flex items-center gap-2 border border-line bg-white px-3 py-2 text-[11.5px] text-inkBody">
              <Icon name="Link2" size={14} className="text-rxAqua" />
              {"Referido desde RWAXI · "}
              <span className="font-mono text-aquaInk">{t.lead.token.slice(0, 16)}…</span>
            </span>
          )}
        </div>
        <MediaHero t={e} p={a} photos={r(a)} onUpload={i} currency={n} toast={d} />
        <section id="funnel" className="flex flex-col gap-4 scroll-mt-24">
          <SectionHead n="Embudo legal y de cumplimiento" title="Tu proceso con el desarrollador" />
          <FunnelStepper
            journey={t}
            active={m}
            setActive={u}
            minted={e.mint.status === "minted"}
            regime={e.regime}
          />
          <div className="bg-white border border-line p-6 flex flex-col gap-5">
            <h3 className="font-display font-semibold text-[26px] text-rxPurple leading-tight">{x[m]}</h3>
            {m === 0 && N && !t.nda && (
              <LockedNote text="Portal temporalmente suspendido para nuevas operaciones: no se pueden firmar nuevos NDA." />
            )}
            {m === 0 && !(N && !t.nda) && (
              <NdaPanel
                t={e}
                p={a}
                journey={t}
                toast={d}
                onSign={(g) => {
                  o((w) => ({
                    ...w,
                    nda: g,
                  })),
                    d("NDA firmado · ConsentRecord registrado"),
                    u(1);
                }}
              />
            )}
            {m === 1 && N && t.kyc.stage === "form" && (
              <LockedNote text="Portal temporalmente suspendido para nuevas operaciones: no se reciben nuevas verificaciones." />
            )}
            {m === 1 && !(N && t.kyc.stage === "form") && (
              <KycPanel t={e} p={a} journey={t} setJourney={o} currency={n} toBackoffice={p} />
            )}
            {m === 2 && <DataRoomPanel t={e} p={a} journey={t} openDoc={s} />}
            {m === 3 && (
              <SubscriptionPanel
                t={e}
                p={a}
                journey={t}
                currency={n}
                amount={v}
                setAmount={h}
                startSub={c}
                openDoc={s}
                toast={d}
                suspended={N}
              />
            )}
          </div>
        </section>
        <InfoTabs
          t={e}
          p={a}
          currency={n}
          setCurrency={l}
          amount={v}
          setAmount={h}
          toast={d}
          toSubscribe={() => {
            u(3), b("funnel");
          }}
        />
      </main>
      <footer className="bg-white border-t border-line">
        <div className="gutter max-w-[1240px] mx-auto py-6 flex flex-wrap gap-4 justify-between items-center text-[11.5px] text-muted">
          <div className="max-w-[90ch]">
            <LegalText
              tpl={LEGAL_FRONTIER_TENANT}
              vars={legalVars(e, a)}
              compact={true}
              className="text-[11.5px] text-muted"
            />
          </div>
          <PoweredSeal />
        </div>
      </footer>
    </div>
  );
}
