"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { Modal } from "@/app/_components/ui/modal";
import { Switch } from "@/app/_components/ui/primitives";
import { fieldCls } from "@/app/_components/ui/form";
import { PORTAL_STATUS } from "@/app/_lib/data/fees";
import { REGIMES } from "@/app/_lib/data/kyc";
import { money } from "@/app/_lib/format";
import { envHref } from "@/app/_lib/hosts";
import { setOfferingCapture, setOrganizationPublished, setPortalStatus } from "../actions";
import type {
  PlatformActionResult,
  PlatformMetrics,
  PlatformMetricsResult,
  PlatformOfferingRow,
  PlatformTenantRow,
  PortalStatusKey,
} from "../_lib/types";

type Currency = "COP" | "USD";
type Toast = (message: string) => void;
type Decision =
  | { kind: "status"; tenant: PlatformTenantRow; to: PortalStatusKey }
  | { kind: "publish"; tenant: PlatformTenantRow; to: boolean }
  | { kind: "capture"; tenant: PlatformTenantRow; offering: PlatformOfferingRow; pause: boolean };

const STATUSES: PortalStatusKey[] = ["ACTIVE", "REVIEW", "SUSPENDED"];
const REGIME_KEY = { SAGRILAFT_PTEE: "sagrilaft", SARLAFT: "sarlaft" } as const;
const TOKEN_LABEL: Record<string, string> = {
  NOT_DEPLOYED: "Token sin emitir",
  DEPLOYING: "Token en despliegue",
  DEPLOYED: "emitido",
  PAUSED: "pausado on-chain por el emisor",
};
const utc = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;

/** What a decision does, as the confirmation dialog explains it (all controls are off-chain). */
function effectOf(d: Decision): { title: string; effect: string; restrictive: boolean } {
  if (d.kind === "status") {
    const effect = {
      ACTIVE: "El portal vuelve a operar con normalidad y la vitrina lo enlaza de nuevo.",
      REVIEW: "El portal sigue operando, pero la vitrina muestra el proyecto sin enlace al portal mientras termina la revisión.",
      SUSPENDED:
        "El portal mostrará un aviso institucional y no recibirá nuevos NDA, verificaciones KYC ni suscripciones. Los inversionistas existentes conservan su portafolio y documentos. RWAXI no ejecuta ninguna transacción sobre el contrato del emisor.",
    }[d.to];
    return { title: `Portal de ${d.tenant.displayName} → ${PORTAL_STATUS[d.to][0]}`, effect, restrictive: d.to !== "ACTIVE" };
  }
  if (d.kind === "publish") {
    return {
      title: `${d.to ? "Publicar" : "Retirar"} ${d.tenant.displayName} ${d.to ? "en" : "de"} la vitrina`,
      effect: d.to
        ? "Sus proyectos publicados vuelven al catálogo público de la vitrina RWAXI."
        : "Sus proyectos desaparecen del catálogo público de la vitrina; el portal del desarrollador sigue operando.",
      restrictive: !d.to,
    };
  }
  return {
    title: `${d.pause ? "Pausar" : "Reanudar"} la captación de ${d.offering.code} · ${d.offering.assetName}`,
    effect: d.pause
      ? "La vitrina mostrará la oferta como «Captación pausada» y el portal no aceptará nuevas suscripciones. Las suscripciones ya firmadas siguen su curso (conciliación del pago y emisión). Es un control de la plataforma (off-chain): el token del emisor no se pausa."
      : "La oferta vuelve a recibir suscripciones desde el portal y la vitrina la enlaza de nuevo.",
    restrictive: d.pause,
  };
}

/** Module A · governance of tenants, backed by PostgreSQL (platform role) and recorded in AuditEvent. */
export function PlatformGovernance({
  metrics,
  currency,
  toast,
  onboarding,
}: {
  metrics: PlatformMetricsResult;
  currency: Currency;
  toast: Toast;
  /** developer onboarding (KYB) still runs on the prototype's demo state */
  onboarding: ReactNode;
}) {
  if (!metrics.ok) return null; // PlatformOverview already shows the error
  return <GovernanceView data={metrics.data} currency={currency} toast={toast} onboarding={onboarding} />;
}

function GovernanceView({ data, currency, toast, onboarding }: { data: PlatformMetrics; currency: Currency; toast: Toast; onboarding: ReactNode }) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { tenants, totals, audit } = data;
  const canAct = !!data.admin;

  const open = (d: Decision) => {
    setDecision(d);
    setReason("");
    setError(null);
  };
  const confirm = () => {
    if (!decision || busy) return;
    const d = decision;
    setBusy(true);
    setError(null);
    startTransition(async () => {
      let result: PlatformActionResult;
      if (d.kind === "status") result = await setPortalStatus(d.tenant.id, d.to, reason);
      else if (d.kind === "publish") result = await setOrganizationPublished(d.tenant.id, d.to, reason);
      else result = await setOfferingCapture(d.offering.id, d.pause, reason);
      setBusy(false);
      if (result.ok) {
        setDecision(null);
        toast(result.message);
      } else setError(result.error);
    });
  };

  const kpis: [string, string][] = [
    ["Organizations", String(tenants.length)],
    ["Portales activos", String(totals.activeOrganizations)],
    ["Publicados en vitrina", String(totals.published)],
    ["MRR SaaS", money(totals.mrrUsd, currency, false)],
  ];
  const info = decision ? effectOf(decision) : null;

  return (
    <div className="flex flex-col gap-6" data-platform-governance>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line">
        {kpis.map(([label, value]) => (
          <div key={label} className="bg-white p-4 min-w-0">
            <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{label}</p>
            <p className="font-mono text-[24px] text-rxPurple tnum mt-1 break-words">{value}</p>
          </div>
        ))}
      </div>

      {!canAct && (
        <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
          No hay un usuario SUPER_ADMIN activo: los controles de gobierno están deshabilitados.
        </p>
      )}
      {error && !decision && (
        <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
          {error}
        </p>
      )}

      <div className="bg-white border border-line">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between items-center gap-3">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Organizations · TenantPortals · PostgreSQL</p>
          {onboarding}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                <th className="font-semibold px-5 py-3">Desarrollador</th>
                <th className="font-semibold px-3 py-3">Portal</th>
                <th className="font-semibold px-3 py-3">Régimen</th>
                <th className="font-semibold px-3 py-3">Proyecto · captación</th>
                <th className="font-semibold px-3 py-3">Estado del portal</th>
                <th className="font-semibold px-3 py-3">Vitrina RWAXI</th>
                <th className="font-semibold px-3 py-3 text-right">Leads</th>
                <th className="font-semibold px-5 py-3">
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} data-governance-row={t.slug} data-portal-status={t.portalStatus} className="border-b border-line last:border-b-0 align-top">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-rxPurple">{t.legalName}</p>
                    <p className="font-mono text-[10.5px] text-muted">{`NIT ${t.taxId} · cliente desde ${t.onboardedAt}`}</p>
                  </td>
                  <td className="px-3 py-3.5 font-mono text-[11.5px] text-inkBody">
                    {`${t.slug}.rwaxi.com`}
                    {t.customDomain && <span className="block text-muted">{t.customDomain}</span>}
                  </td>
                  <td className="px-3 py-3.5 text-[11.5px]">{REGIMES[REGIME_KEY[t.regime]].short}</td>
                  <td className="px-3 py-3.5 min-w-[240px]">
                    {t.offerings.length === 0 && <span className="text-muted text-[11.5px]">Sin proyectos aún</span>}
                    {t.offerings.map((o) => (
                      <div key={o.id} className="mb-2 last:mb-0" data-offering-capture={o.code} data-capture={o.capturePausedAt ? "paused" : "open"}>
                        <p className="text-inkBody">
                          <span className="font-mono text-[11px] text-muted">{o.code}</span> {o.assetName}
                        </p>
                        <p className="text-[10.5px] text-muted">
                          {o.tokenStatus === "DEPLOYED" || o.tokenStatus === "PAUSED"
                            ? `Token ${o.tokenSymbol} ${TOKEN_LABEL[o.tokenStatus]}`
                            : TOKEN_LABEL[o.tokenStatus ?? "NOT_DEPLOYED"]}
                          {!o.published && " · no publicado"}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span
                            className={`text-[10.5px] font-semibold px-2 py-0.5 ${o.capturePausedAt ? "bg-goldTint text-goldInk" : "bg-aquaTint text-aquaInk"}`}
                          >
                            {o.capturePausedAt ? `Captación pausada · ${o.capturePausedAt.slice(0, 10)}` : "Captación abierta"}
                          </span>
                          <button
                            disabled={!canAct}
                            data-capture-toggle={o.id}
                            onClick={() => open({ kind: "capture", tenant: t, offering: o, pause: !o.capturePausedAt })}
                            className="text-[11px] font-semibold text-rxBlue inline-flex items-center gap-1 focus-ring disabled:opacity-40"
                          >
                            <Icon name={o.capturePausedAt ? "Play" : "Pause"} size={12} />
                            {o.capturePausedAt ? "Reanudar captación" : "Pausar captación"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-3.5">
                    <label htmlFor={`gov-status-${t.slug}`} className="sr-only">
                      {`Estado del portal de ${t.displayName}`}
                    </label>
                    <select
                      id={`gov-status-${t.slug}`}
                      value={t.portalStatus}
                      disabled={!canAct}
                      onChange={(ev) => open({ kind: "status", tenant: t, to: ev.target.value as PortalStatusKey })}
                      className={`border border-line px-2 py-1.5 text-[11.5px] font-semibold font-mono focus-ring ${PORTAL_STATUS[t.portalStatus][1]}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`gov-pub-${t.slug}`}
                        checked={t.published}
                        disabled={!canAct}
                        label={`Publicado en Vitrina Pública RWAXI: ${t.displayName}`}
                        onChange={(next: boolean) => open({ kind: "publish", tenant: t, to: next })}
                      />
                      <span className="font-mono text-[10.5px] text-muted">{`isPublishedInRwaxi: ${String(t.published)}`}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono tnum">{t.leads.referral + t.leads.direct}</td>
                  <td className="px-5 py-3.5 text-right">
                    <a
                      href={envHref("portal", t.slug)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-rxBlue font-medium inline-flex items-center gap-1 focus-ring whitespace-nowrap"
                    >
                      {"Ver portal "}
                      <Icon name="ArrowUpRight" size={13} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-line p-5 flex flex-col gap-2 text-[12.5px] text-inkBody leading-[1.6]">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase mb-1">Efecto de los controles</p>
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
            <strong className="text-rxPurple">Captación pausada:</strong>
            {
              " la oferta sigue visible, sin enlace para suscribir; el portal rechaza nuevas suscripciones mientras dure la pausa. Las ya firmadas continúan (pago fiduciario y emisión)."
            }
          </p>
          <p>
            <strong className="text-rxPurple">isPublishedInRwaxi:</strong>
            {" si está apagado, el desarrollador desaparece del catálogo público."}
          </p>
        </div>
        <div className="bg-white border border-line">
          <p className="px-5 py-3 border-b border-line font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
            Registro de auditoría · AuditEvent (plataforma)
          </p>
          {audit.length === 0 ? (
            <p className="px-5 py-4 text-[12.5px] text-muted">Aún no hay decisiones de plataforma registradas.</p>
          ) : (
            <ul className="max-h-[280px] overflow-y-auto">
              {audit.map((e) => (
                <li key={e.id} data-platform-audit={e.action} className="px-5 py-2.5 border-b border-line last:border-b-0 text-[12px]">
                  <span className="font-mono text-[11px] text-muted">{utc(e.at)}</span>
                  {" · "}
                  <span className="text-inkBody">{`${e.tenant}: ${e.summary}`}</span>
                  <span className="block text-[10.5px] text-muted font-mono">
                    {e.actorEmail}
                    {e.subjectHash && ` · SHA-256 ${e.subjectHash.slice(0, 14)}…`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {decision && info && (
        <Modal title={info.title} onClose={() => !busy && setDecision(null)} wide={true}>
          <div className="flex flex-col gap-4" data-governance-dialog>
            <p className="text-[13px] text-inkBody leading-relaxed">{info.effect}</p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="gov-reason" className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted">
                {info.restrictive ? "Motivo (obligatorio, queda en el registro de auditoría)" : "Motivo (opcional)"}
              </label>
              <textarea
                id="gov-reason"
                value={reason}
                onChange={(ev) => setReason(ev.target.value)}
                rows={3}
                maxLength={300}
                className={fieldCls(false) + " text-[13px]"}
              />
            </div>
            {error && (
              <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setDecision(null)}
                disabled={busy}
                className="border border-line px-4 py-2.5 text-[12.5px] font-semibold text-inkBody focus-ring disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirm}
                disabled={busy || (info.restrictive && reason.trim().length < 10)}
                className="tc-btn px-4 py-2.5 text-[12.5px] font-semibold inline-flex items-center gap-2 focus-ring disabled:opacity-50"
              >
                {busy && <Icon name="Loader2" size={14} className="spin" />}
                Confirmar decisión
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
