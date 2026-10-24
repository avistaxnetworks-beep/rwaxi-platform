"use client";
import { useRef, useState } from "react";
import { VideoPitchCard } from "@/app/_components/backoffice/video-pitch-card";
import { LegalEditor } from "@/app/_components/legal/legal-editor";
import type { PortalProject, PortalTenant, RegimeKey } from "@/app/_components/portal/portal-types";
import { PoweredSeal, TenantLogo } from "@/app/_components/portal/tenant-brand";
import { Field, fieldCls } from "@/app/_components/ui/form";
import { Icon } from "@/app/_components/ui/icon";
import { REGIMES } from "@/app/_lib/data/kyc";
import { LEGAL_COMPLIANCE, LEGAL_NDA, legalVars } from "@/app/_lib/data/legal";
import { contrast, nf, onColor } from "@/app/_lib/format";
import { portalHost } from "@/app/_lib/hosts";
import { videoTitle } from "@/app/_lib/data/video";
import { useI18n } from "@/app/_i18n/provider";

/** The portal's pitch video (app/_lib/data/video.ts): what the live preview reads. */
interface PitchVideo {
  title: string;
  presenter: string;
  role: string;
  posterIdx: number;
  poster: string | null;
}

/** The developer's White Label settings (prototype tenant state): what this tab edits and previews. */
export interface WhiteLabelTenant extends PortalTenant {
  domain: string;
  domainStatus: "verificado" | "sin_verificar" | "sin_configurar";
  ndaText: string;
  video: PitchVideo;
}

export function ConfigTab({
  t: e,
  p: a,
  setTenant: t,
  toPortal: o,
  toast: n,
  photos: l,
}: {
  t: WhiteLabelTenant;
  p: PortalProject;
  setTenant: (update: (tenant: WhiteLabelTenant) => WhiteLabelTenant) => void;
  toPortal: () => void;
  toast: (message: string) => void;
  photos: { src: string }[];
}) {
  const { tr } = useI18n();
  const r = useRef<HTMLInputElement>(null),
    [i, s] = useState(false),
    c =
      <K extends keyof WhiteLabelTenant>(u: K) =>
      (v: WhiteLabelTenant[K]) =>
      t((h) => ({
        ...h,
        [u]: v,
      })),
    d = ["#0E5A4F", "#A4461F", "#0B4F7A", "#7A00AE", "#1F2937", "#B77A1E"],
    p = contrast(e.color, onColor(e.color)),
    m = () => {
      (s(true),
        setTimeout(() => {
          (s(false),
            t((u) => ({
              ...u,
              domainStatus: u.domain ? "verificado" : "sin_configurar",
            })),
            n(
              e.domain
                ? tr("Dominio {domain} verificado", { domain: e.domain })
                : tr("Escribe un dominio primero"),
            ));
        }, 1100));
    };
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-8 items-start">
      <div className="bg-white border border-line p-6 flex flex-col gap-6 min-w-0">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field id="cfg-name" label={tr("Nombre comercial")}>
            <input
              id="cfg-name"
              value={e.displayName}
              onChange={(u) => c("displayName")(u.target.value)}
              className={fieldCls()}
            />
          </Field>
          <Field id="cfg-nit" label="NIT" hint={tr("Validado contra el RUES al crear el tenant.")}>
            <input
              id="cfg-nit"
              value={e.nit}
              readOnly={true}
              className={fieldCls() + " bg-cloud font-mono"}
            />
          </Field>
        </div>
        <Field
          id="cfg-regime"
          label={tr("Régimen de Cumplimiento del Oferente")}
          hint={tr("Define las etiquetas y declaraciones del Paso 3 del portal. Autoridad: {authority}.", {
            authority: tr(REGIMES[e.regime].authority),
          })}
        >
          <select
            id="cfg-regime"
            value={e.regime}
            onChange={(u) => {
              const v = u.target.value as RegimeKey;
              (t((h) => ({
                ...h,
                regime: v,
              })),
                n(tr("Régimen actualizado: {regime}", { regime: REGIMES[v].short })));
            }}
            className={fieldCls()}
          >
            {Object.entries(REGIMES).map(([u, v]) => (
              <option key={u} value={u}>
                {tr(v.full)}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[12px] font-semibold text-inkBody mb-1.5">{tr("Color de marca")}</legend>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="cfg-color"
              type="color"
              value={e.color}
              onChange={(u) => c("color")(u.target.value.toUpperCase())}
              className="w-11 h-11 p-0.5 border border-line bg-white cursor-pointer"
              aria-label={tr("Seleccionar color")}
            />
            <input
              aria-label={tr("Código hexadecimal")}
              value={e.color}
              onChange={(u) =>
                /^#[0-9a-fA-F]{0,6}$/.test(u.target.value) && c("color")(u.target.value.toUpperCase())
              }
              className={fieldCls() + " font-mono w-[110px]"}
            />
            {d.map((u) => (
              <button
                key={u}
                onClick={() => c("color")(u)}
                aria-label={tr("Usar {color}", { color: u })}
                className={`w-8 h-8 focus-ring ${e.color === u ? "ring-2 ring-offset-2 ring-[#2F145F]" : ""}`}
                style={{
                  background: u,
                }}
              />
            ))}
          </div>
          <p className={`text-[11.5px] ${p >= 4.5 ? "text-aquaInk" : "text-[#B42318]"}`}>
            {tr("Contraste del texto sobre el color: {ratio}:1", { ratio: nf(1).format(p) })}{" "}
            {p >= 4.5 ? tr("· cumple AA") : tr("· no cumple AA, elige un tono más oscuro")}
          </p>
        </fieldset>
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-inkBody">{tr("Logo")}</span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="border border-line bg-cloud p-2 grid place-items-center min-w-[64px] h-[56px]">
              <TenantLogo t={e} size={40} />
            </span>
            <input
              ref={r}
              id="cfg-logo"
              type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              className="sr-only"
              onChange={(u) => {
                const v = u.target.files?.[0];
                if (!v) return;
                const h = new FileReader();
                ((h.onload = () => c("logo")(h.result as string)), h.readAsDataURL(v), (u.target.value = ""));
              }}
            />
            <button
              onClick={() => r.current?.click()}
              className="border border-line bg-white px-3 py-2 text-[12.5px] font-semibold text-rxBlue inline-flex items-center gap-1.5 focus-ring"
            >
              <Icon name="Upload" size={14} />
              {tr("Cargar logo (SVG o PNG)")}
            </button>
            {e.logo && (
              <button onClick={() => c("logo")(null)} className="text-[12px] text-muted underline focus-ring">
                {tr("Usar monograma")}
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Field
            id="cfg-domain"
            label={tr("Dominio personalizado")}
            hint={tr(
              "Crea un registro CNAME de {domain} hacia tenants.rwaxirealestate.com. El portal siempre responde también en {host}.",
              { domain: e.domain || tr("tu dominio"), host: portalHost(e) },
            )}
          >
            <div className="flex gap-2">
              <input
                id="cfg-domain"
                value={e.domain}
                placeholder="inversiones.tuconstructora.co"
                onChange={(u) =>
                  t((v) => ({
                    ...v,
                    domain: u.target.value.trim().toLowerCase(),
                    domainStatus: "sin_verificar",
                  }))
                }
                className={fieldCls() + " font-mono"}
              />
              <button
                onClick={m}
                className="shrink-0 border border-line bg-white px-3 text-[12.5px] font-semibold text-rxBlue focus-ring inline-flex items-center gap-1.5"
              >
                <Icon name={i ? "Loader2" : "Globe"} size={14} className={i ? "spin" : ""} />
                {tr("Verificar DNS")}
              </button>
            </div>
          </Field>
          <span
            className={`self-start text-[10.5px] font-semibold tracking-[0.08em] uppercase px-2 py-1 ${e.domainStatus === "verificado" ? "bg-aquaTint text-aquaInk" : "bg-goldTint text-goldInk"}`}
          >
            {e.domainStatus === "verificado"
              ? tr("Verificado · SSL activo")
              : e.domainStatus === "sin_verificar"
                ? tr("Pendiente de verificación")
                : tr("Sin configurar")}
          </span>
        </div>
        <VideoPitchCard t={e} p={a} setTenant={t} photos={l} toast={n} />
        <LegalEditor
          id="cfg-nda"
          label={tr("NDA · Paso 1 (Ley 527 de 1999)")}
          value={e.ndaText}
          onChange={(u: string) => c("ndaText")(u)}
          onReset={() => c("ndaText")(LEGAL_NDA)}
          isDefault={e.ndaText === LEGAL_NDA}
          vars={legalVars(e, a)}
        />
        <LegalEditor
          id="cfg-sarlaft"
          label={tr("Debida diligencia · Paso 3 ({regime})", { regime: REGIMES[e.regime].short })}
          value={e.complianceTpl[e.regime]}
          onChange={(u: string) =>
            t((v) => ({
              ...v,
              complianceTpl: {
                ...v.complianceTpl,
                [v.regime]: u,
              },
            }))
          }
          onReset={() =>
            t((u) => ({
              ...u,
              complianceTpl: {
                ...u.complianceTpl,
                [u.regime]: LEGAL_COMPLIANCE[u.regime],
              },
            }))
          }
          isDefault={e.complianceTpl[e.regime] === LEGAL_COMPLIANCE[e.regime]}
          vars={legalVars(e, a)}
        />
        <p className="text-[11.5px] text-muted border-l-2 border-rxGold pl-3">
          {tr(
            "Plantillas parametrizadas para revisión del área legal del desarrollador antes de publicar. Las variables entre llaves se reemplazan con los datos del tenant y del proyecto.",
          )}
        </p>
      </div>
      <aside className="lg:sticky lg:top-6 flex flex-col gap-3">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
          {tr("Vista previa en vivo")}
        </p>
        <div
          className="bg-white border border-line"
          style={{
            borderTop: `4px solid ${e.color}`,
          }}
        >
          <div className="p-4 flex items-center gap-3 border-b border-line">
            <TenantLogo t={e} size={34} />
            <div className="min-w-0">
              <p
                className="font-bold text-[14px] truncate"
                style={{
                  color: e.color,
                }}
              >
                {e.displayName}
              </p>
              <p className="font-mono text-[10px] text-muted truncate">
                {"NIT "}
                {e.nit}
              </p>
            </div>
          </div>
          <div className="p-4 flex flex-col gap-3">
            <p className="font-mono text-[10px] tracking-[0.12em] tc-text">
              {a.code}
              {" · "}
              {tr("PORTAL OFICIAL")}
            </p>
            <p className="font-display font-semibold text-[22px] text-rxPurple leading-tight">{a.asset}</p>
            <div className="relative overflow-hidden rounded-[10px] aspect-[16/9] bg-[#0B0518]">
              <img
                src={e.video.poster || (l[e.video.posterIdx] || l[0]).src}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-90"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
              <span className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full tc-bg grid place-items-center">
                <Icon name="Play" size={18} className="ml-0.5" />
              </span>
              <span className="absolute left-2.5 bottom-2 right-2.5 text-white">
                <span className="block text-[12.5px] font-semibold leading-tight truncate">
                  {videoTitle(e.video, a, tr)}
                </span>
                <span className="block text-[10.5px] text-white/80 truncate">
                  {e.video.presenter}
                  {" — "}
                  {e.video.role}
                </span>
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[0, 1, 2, 3].map((u) => (
                <span key={u} className={`h-1.5 ${u < 1 ? "tc-bg" : "bg-line"}`} />
              ))}
            </div>
            <span className="tc-btn text-[12px] font-semibold py-2.5 text-center">
              {tr("Firmar NDA con un clic")}
            </span>
            <PoweredSeal dark={false} />
          </div>
        </div>
        <p className="text-[11.5px] text-muted">
          {tr("Dominio activo:")}{" "}
          <span className="font-mono">
            {e.domainStatus === "verificado" && e.domain ? e.domain : portalHost(e)}
          </span>
        </p>
        <button
          onClick={o}
          className="tc-btn text-[12.5px] font-semibold py-2.5 inline-flex items-center justify-center gap-1.5 focus-ring"
        >
          {tr("Abrir portal con esta configuración")} <Icon name="ArrowUpRight" size={14} />
        </button>
      </aside>
    </div>
  );
}
