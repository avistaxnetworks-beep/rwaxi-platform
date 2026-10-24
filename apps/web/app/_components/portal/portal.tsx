"use client";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { LegalText } from "@/app/_components/legal/legal-text";
import { DataRoomPanel, LockedNote, type DemoDoc, type OpenedDoc } from "@/app/_components/portal/data-room-panel";
import { FunnelStepper } from "@/app/_components/portal/funnel-stepper";
import { InfoTabs } from "@/app/_components/portal/info-tabs";
import { KycPanel } from "@/app/_components/portal/kyc-panel";
import { MediaHero } from "@/app/_components/portal/media-hero";
import { NdaPanel } from "@/app/_components/portal/nda-panel";
import { PortalHeader, type PortalTarget } from "@/app/_components/portal/portal-header";
import { SubscriptionPanel } from "@/app/_components/portal/subscription-panel";
import { PoweredSeal } from "@/app/_components/portal/tenant-brand";
import { Icon } from "@/app/_components/ui/icon";
import { SectionHead } from "@/app/_components/ui/primitives";
import { REGIMES } from "@/app/_lib/data/kyc";
import { LEGAL_FRONTIER_TENANT, legalVars } from "@/app/_lib/data/legal";
import { onColor } from "@/app/_lib/format";
import { useI18n } from "@/app/_i18n/provider";
import type { KycResult, NdaResult, NdaSubmission } from "@/app/tenant/[slug]/_lib/journey-types";
import { STEP, type Currency, type PortalJourney, type PortalKyc, type PortalNda, type PortalProject, type PortalTenant } from "./portal-types";

/** The developer as the portal page holds it: the prototype's tenant object (demo Data Room included). */
type PortalPageTenant = PortalTenant & { portalStatus: string; docs: DemoDoc[]; merkle: string; ndaText: string };
/** The offering as the portal page holds it: the prototype's project with its localized copy. */
type PortalPageProject = PortalProject & { city: string; region: string; type: string };

/** Where a visitor lands: NDA first; once signed, the Data Room; the KYC while it is under way; then step 4. */
function landingStep(t: PortalJourney): number {
  if (t.holdings.length || t.kyc.status === "aprobado") return STEP.subscription;
  if (t.kyc.stage === "status" && t.kyc.status) return STEP.kyc;
  return t.nda ? STEP.dataRoom : STEP.nda;
}

/**
 * The White Label portal of a developer: project, media and the investor's funnel — 1 NDA, 2 Data Room (100 % of the
 * documents with the NDA), 3 KYC/AML (what investing requires) and 4 subscription and portfolio.
 */
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
  // Server Actions (app/tenant/[slug]/actions.ts): NDA and KYC persist to PostgreSQL.
  persistNda: P,
  persistKyc: Q,
  // Persisted yield distributions with their Merkle proofs (app/tenant/[slug]/_components/investor-distributions.tsx).
  distributionsSlot: D,
  // «Recuperar mi sesión» by email code, for a visitor without an investor session (app/tenant/[slug]/_components/session-recovery.tsx).
  recoverySlot: R,
  // Persisted Data Room with verified downloads from the DocumentVault (app/tenant/[slug]/_components/investor-data-room.tsx).
  dataRoomSlot: DR,
}: {
  t: PortalPageTenant;
  p: PortalPageProject;
  journey: PortalJourney;
  setJourney: (u: (j: PortalJourney) => PortalJourney) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  photosFor: (project: PortalPageProject) => unknown;
  onUpload: (projectId: string, files: FileList | File[] | null) => void;
  openDoc: (doc: OpenedDoc) => void;
  startSub: (draft: { units: number; capital: number }) => void;
  toast: (message: string) => void;
  toBackoffice: () => void;
  persistNda?: (input: NdaSubmission) => Promise<NdaResult>;
  persistKyc?: (data: PortalKyc["data"]) => Promise<KycResult>;
  distributionsSlot?: ReactNode;
  recoverySlot?: ReactNode;
  dataRoomSlot?: ReactNode;
}) {
  const { tr } = useI18n();
  const [m, u] = useState<number>(() => landingStep(t)),
    [v, h] = useState(Math.max(a.ticket, 25e3));
  useEffect(() => {
    u(landingStep(t)), h(Math.max(a.ticket, 25e3));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per project, as the prototype did
  }, [a.id]);
  const b = (g: string) => {
      const w = document.getElementById(g);
      w &&
        w.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    },
    toStep = (step: number) => {
      u(step), b("funnel");
    },
    y = (g: PortalTarget) => {
      if (g === "top")
        return window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      if (g === "data-room") return toStep(STEP.dataRoom);
      if (g === "portfolio") return toStep(STEP.subscription);
      b(g);
    },
    f = REGIMES[e.regime],
    N = e.portalStatus === "SUSPENDED",
    approved = t.kyc.status === "aprobado",
    revoked = t.kyc.status === "revocado",
    x = [
      tr("Paso 1 · Acuerdo de Confidencialidad (NDA)"),
      tr("Paso 2 · Data Room inmobiliario"),
      tr("Paso 3 · Verificación KYC/AML + {regime}", { regime: f.short }),
      tr("Paso 4 · Suscripción de tokens y portafolio"),
    ];
  return (
    <div
      style={
        {
          "--tc": e.color,
          "--tc-on": onColor(e.color),
        } as CSSProperties
      }
    >
      <PortalHeader t={e} journey={t} go={y} />
      {e.portalStatus !== "ACTIVE" && (
        <div className={e.portalStatus === "SUSPENDED" ? "bg-rxDeep text-white" : "bg-goldTint text-goldInk"} role="alert">
          <div className="gutter max-w-[1240px] mx-auto py-4 flex flex-wrap items-start gap-3">
            <Icon
              name={e.portalStatus === "SUSPENDED" ? "PauseOctagon" : "Clock"}
              size={20}
              className={e.portalStatus === "SUSPENDED" ? "text-[#D9A24A] shrink-0 mt-0.5" : "shrink-0 mt-0.5"}
            />
            <div className="min-w-0">
              <p className="font-semibold text-[14px]">
                {e.portalStatus === "SUSPENDED"
                  ? tr("Portal temporalmente suspendido para nuevas operaciones")
                  : tr("Portal en revisión por RWAXI")}
              </p>
              <p className={`text-[12.5px] mt-0.5 ${e.portalStatus === "SUSPENDED" ? "text-[#C9C1E3]" : ""}`}>
                {e.portalStatus === "SUSPENDED"
                  ? tr(
                      "Por decisión de gobierno de la plataforma, {name} no puede recibir nuevos NDA, verificaciones ni suscripciones. Si ya eres inversionista, tu portafolio y tus documentos siguen disponibles.",
                      { name: e.legalName },
                    )
                  : tr("El portal opera normalmente, pero el proyecto no recibe tráfico desde la vitrina pública mientras termina la revisión.")}
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
              {" · "}
              {tr("Portal oficial del desarrollador")}
            </p>
            <h1 className="font-display font-semibold text-rxPurple text-[36px] md:text-[48px] leading-[1.04] mt-1 balance">{a.asset}</h1>
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
              {tr("Referido desde RWAXI")}
              {" · "}
              <span className="font-mono text-aquaInk">{t.lead.token.slice(0, 16)}…</span>
            </span>
          )}
        </div>
        <MediaHero t={e} p={a} photos={r(a)} onUpload={i} currency={n} toast={d} />
        <section id="funnel" className="flex flex-col gap-4 scroll-mt-24">
          <SectionHead n={tr("Embudo legal y de cumplimiento")} title={tr("Tu proceso con el desarrollador")} />
          <FunnelStepper journey={t} active={m} setActive={u} minted={e.mint.status === "minted"} regime={e.regime} />
          <div className="bg-white border border-line p-6 flex flex-col gap-5" data-funnel-step={m + 1}>
            <h3 className="font-display font-semibold text-[26px] text-rxPurple leading-tight">{x[m]}</h3>
            {m === STEP.nda && N && !t.nda && (
              <LockedNote text={tr("Portal temporalmente suspendido para nuevas operaciones: no se pueden firmar nuevos NDA.")} />
            )}
            {m === STEP.nda && !(N && !t.nda) && (
              <NdaPanel
                t={e}
                p={a}
                journey={t}
                toast={d}
                persist={P}
                onSign={(g: PortalNda) => {
                  o((w) => ({
                    ...w,
                    nda: g,
                  })),
                    d(tr("NDA firmado · ConsentRecord registrado")),
                    u(STEP.dataRoom);
                }}
              />
            )}
            {m === STEP.nda && !t.nda && R}
            {m === STEP.dataRoom && (
              <>
                {DR || <DataRoomPanel t={e} p={a} journey={t} openDoc={s} />}
                {t.nda && !revoked && (
                  <div
                    className="border border-line bg-cloud px-5 py-4 flex flex-wrap items-center justify-between gap-3"
                    data-invest-cta
                  >
                    <p className="text-[13px] text-inkBody max-w-[62ch]">
                      {approved
                        ? tr("Tu verificación ya está aprobada: elige cuántas unidades quieres y firma tu acuerdo de suscripción.")
                        : tr("¿Te convence el respaldo del proyecto? Completa tu verificación KYC para poder invertir: el Data Room sigue abierto mientras tanto.")}
                    </p>
                    <button
                      onClick={() => toStep(approved ? STEP.subscription : STEP.kyc)}
                      className="tc-btn font-semibold text-[13px] px-5 py-3 inline-flex items-center gap-2 focus-ring"
                    >
                      {approved
                        ? tr("Quiero invertir en este proyecto — Suscribir unidades")
                        : tr("Quiero invertir en este proyecto — Completar KYC y Suscribir")}
                      <Icon name="ArrowRight" size={15} className="rtl:-scale-x-100" />
                    </button>
                  </div>
                )}
              </>
            )}
            {m === STEP.kyc && N && t.kyc.stage === "form" && (
              <LockedNote text={tr("Portal temporalmente suspendido para nuevas operaciones: no se reciben nuevas verificaciones.")} />
            )}
            {m === STEP.kyc && !(N && t.kyc.stage === "form") && (
              <KycPanel
                t={e}
                p={a}
                journey={t}
                setJourney={o}
                currency={n}
                toBackoffice={p}
                persist={Q}
                toSubscribe={() => toStep(STEP.subscription)}
              />
            )}
            {m === STEP.subscription && (
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
                distributionsSlot={D}
                toKyc={() => toStep(STEP.kyc)}
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
          toSubscribe={() => toStep(STEP.subscription)}
        />
      </main>
      <footer className="bg-white border-t border-line">
        <div className="gutter max-w-[1240px] mx-auto py-6 flex flex-wrap gap-4 justify-between items-center text-[11.5px] text-muted">
          <div className="max-w-[90ch]">
            <LegalText
              tpl={tr(LEGAL_FRONTIER_TENANT)}
              vars={{ ...legalVars(e, a), LEGAL_WRAPPER_TYPE: tr(a.wrapper) }}
              compact={true}
              className="text-[11.5px] text-muted"
            />
          </div>
          <PoweredSeal dark={false} />
        </div>
      </footer>
    </div>
  );
}
