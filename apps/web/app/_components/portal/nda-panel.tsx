"use client";
import { useState } from "react";
import { LegalText } from "@/app/_components/legal/legal-text";
import { Field, fieldCls } from "@/app/_components/ui/form";
import { Icon } from "@/app/_components/ui/icon";
import { CopyChip } from "@/app/_components/ui/primitives";
import { fillLegal, legalVars } from "@/app/_lib/data/legal";
import { DEMO_KYC } from "@/app/_lib/data/tenants";
import { nowISO, shortHash } from "@/app/_lib/format";
import { sha256Hex } from "@/app/_lib/hash";
import { sha256Text } from "@/app/_lib/sha256";
import { useI18n } from "@/app/_i18n/provider";
import type { NdaResult, NdaSubmission } from "@/app/tenant/[slug]/_lib/journey-types";
import type { PortalJourney, PortalNda, PortalProject, PortalTenant } from "./portal-types";

/**
 * Step 1 of the funnel: the developer's NDA, signed with a click (ConsentRecord with the SHA-256 of the accepted text).
 * Once signed, the whole Data Room opens (step 2). `persist` records it on the server (signNda); without it, the
 * prototype's demo.
 */
export function NdaPanel({
  t: e,
  p: a,
  journey: t,
  onSign: o,
  toast: n,
  persist: g,
}: {
  t: PortalTenant & { ndaText: string };
  p: PortalProject;
  journey: PortalJourney;
  onSign: (nda: PortalNda) => void;
  toast: (message: string) => void;
  persist?: (input: NdaSubmission) => Promise<NdaResult>;
}) {
  const { locale, tr } = useI18n();
  const [l, r] = useState(""),
    [i, s] = useState(""),
    [c, d] = useState(false),
    [p, m] = useState(false),
    [u, v] = useState("");
  if (t.nda) {
    const b = t.nda;
    return (
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
        <div className="flex flex-col gap-3">
          <p className="inline-flex items-center gap-2 text-aquaInk font-semibold text-[14px]">
            <Icon name="CheckCircle2" size={18} />
            {tr("NDA firmado con {name}", { name: e.legalName })}
          </p>
          <p className="text-[13.5px] text-inkBody leading-[1.65]">
            {tr(
              "Ya tienes acceso al 100 % del Data Room del proyecto (Paso 2). Cuando decidas invertir, completa tu verificación KYC/AML con el Oficial de Cumplimiento del desarrollador (Paso 3).",
            )}
          </p>
        </div>
        <dl className="border border-line text-[12.5px]">
          <div className="px-4 py-2.5 border-b border-line bg-cloud font-mono text-[10.5px] tracking-[0.12em] text-muted">
            CONSENTRECORD
          </div>
          {[
            ["ID", b.id ?? "—"],
            [tr("Firmante"), `${b.signer} · ${b.email}`],
            [tr("Contraparte"), `${e.legalName} · NIT ${e.nit}`],
            [tr("Fecha (UTC)"), b.at],
          ].map(([y, f]) => (
            <div key={y} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-4 py-2 border-b border-line">
              <dt className="text-muted">{y}</dt>
              <dd className="text-inkBody break-words font-mono text-[11.5px]">{f}</dd>
            </div>
          ))}
          <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-4 py-2">
            <dt className="text-muted">SHA-256</dt>
            <dd className="min-w-0">
              <CopyChip text={b.hash} display={shortHash(b.hash, 14, 8)} toast={n} className="text-[11.5px]" />
            </dd>
          </div>
        </dl>
      </div>
    );
  }
  const h = async () => {
    if (l.trim().split(/\s+/).length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(i)) {
      v(tr("Escribe tu nombre completo y un correo válido."));
      return;
    }
    if (!c) {
      v(tr("Confirma que leíste el acuerdo."));
      return;
    }
    v(""), m(true);
    const b: string = nowISO(),
      // Persisted evidence must come from Web Crypto: sha256Hex() falls back to a fake hash on failure.
      y: string | null = await (g ? sha256Text : sha256Hex)(
        JSON.stringify({
          tenant: e.slug,
          nit: e.nit,
          signer: l,
          email: i,
          at: b,
          text: fillLegal(e.ndaText, legalVars(e, a)),
        }),
      ).catch(() => null);
    if (!y) {
      m(false), v(tr("Tu navegador no pudo calcular el hash SHA-256 del acuerdo."));
      return;
    }
    if (g) {
      const w = await g({ signerName: l.trim(), signerEmail: i.trim(), at: b, documentHash: y });
      m(false);
      if (!w.ok) {
        v(w.error);
        return;
      }
      o(w.nda);
      return;
    }
    m(false),
      o({
        id: "cr_" + y.slice(0, 12),
        signer: l.trim(),
        email: i,
        at: b,
        hash: y,
      });
  };
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
      <div className="flex flex-col gap-2 min-w-0">
        {locale !== "es" && (
          <p className="text-[11.5px] text-muted flex gap-1.5 items-start" data-legal-original>
            <Icon name="Scale" size={14} className="tc-text shrink-0 mt-0.5" />
            {tr("Texto legal del desarrollador en su idioma original (español): es la versión vinculante que firmas.")}
          </p>
        )}
        <div className="border border-line bg-stone max-h-[300px] overflow-y-auto p-5" lang="es">
          <LegalText tpl={e.ndaText} vars={legalVars(e, a)} compact={false} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Field id="nda-name" label={tr("Nombre completo del firmante")}>
          <input id="nda-name" value={l} onChange={(b) => r(b.target.value)} className={fieldCls()} autoComplete="name" />
        </Field>
        <Field id="nda-email" label={tr("Correo electrónico")}>
          <input
            id="nda-email"
            type="email"
            value={i}
            onChange={(b) => s(b.target.value)}
            className={fieldCls()}
            autoComplete="email"
          />
        </Field>
        <label className="flex gap-2.5 text-[12.5px] text-inkBody leading-[1.5]">
          <input
            id="nda-ok"
            type="checkbox"
            checked={c}
            onChange={(b) => d(b.target.checked)}
            className="mt-0.5 accent-[#2F145F]"
          />
          {tr("Leí y acepto el Acuerdo de Confidencialidad con {name}.", { name: e.legalName })}
        </label>
        {u && (
          <p className="text-[12px] text-[#B42318]" role="alert">
            {u}
          </p>
        )}
        <button
          onClick={h}
          disabled={p}
          className="tc-btn font-semibold text-[13px] py-3 inline-flex items-center justify-center gap-2 focus-ring disabled:opacity-60"
        >
          <Icon name={p ? "Loader2" : "FileSignature"} size={15} className={p ? "spin" : ""} />
          {tr("Firmar NDA con un clic")}
        </button>
        <button
          onClick={() => {
            // Random alias: emails are unique per tenant in the database.
            r(DEMO_KYC.fullName), s(`inversionista.${Math.random().toString(16).slice(2, 6)}@ejemplo.co`), d(true);
          }}
          className="text-[12px] text-rxBlue underline underline-offset-2 self-start focus-ring"
        >
          {tr("Completar con datos de ejemplo")}
        </button>
        <p className="text-[11px] text-muted">
          {tr("La firma genera un ConsentRecord con hash SHA-256 del texto aceptado, con validez probatoria según la Ley 527 de 1999.")}
        </p>
      </div>
    </div>
  );
}
