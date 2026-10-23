// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
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

export function NdaPanel({ t: e, p: a, journey: t, onSign: o, toast: n, persist: g }) {
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
            {"NDA firmado con "}
            {e.legalName}
          </p>
          <p className="text-[13.5px] text-inkBody leading-[1.65]">
            Ya puedes ver los detalles reservados del proyecto. El siguiente paso es tu verificación KYC/AML
            con el Oficial de Cumplimiento del desarrollador.
          </p>
        </div>
        <dl className="border border-line text-[12.5px]">
          <div className="px-4 py-2.5 border-b border-line bg-cloud font-mono text-[10.5px] tracking-[0.12em] text-muted">
            CONSENTRECORD
          </div>
          {[
            ["ID", b.id],
            ["Firmante", `${b.signer} · ${b.email}`],
            ["Contraparte", `${e.legalName} · NIT ${e.nit}`],
            ["Fecha (UTC)", b.at],
          ].map(([y, f]) => (
            <div key={y} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-4 py-2 border-b border-line">
              <dt className="text-muted">{y}</dt>
              <dd className="text-inkBody break-words font-mono text-[11.5px]">{f}</dd>
            </div>
          ))}
          <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-4 py-2">
            <dt className="text-muted">SHA-256</dt>
            <dd className="min-w-0">
              <CopyChip
                text={b.hash}
                display={shortHash(b.hash, 14, 8)}
                toast={n}
                className="text-[11.5px]"
              />
            </dd>
          </div>
        </dl>
      </div>
    );
  }
  const h = async () => {
    if (l.trim().split(/\s+/).length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(i)) {
      v("Escribe tu nombre completo y un correo válido.");
      return;
    }
    if (!c) {
      v("Confirma que leíste el acuerdo.");
      return;
    }
    v(""), m(true);
    const b = nowISO(),
      // Persisted evidence must come from Web Crypto: sha256Hex() falls back to a fake hash on failure.
      y = await (g ? sha256Text : sha256Hex)(
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
      m(false), v("Tu navegador no pudo calcular el hash SHA-256 del acuerdo.");
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
      <div className="border border-line bg-stone max-h-[300px] overflow-y-auto p-5">
        <LegalText tpl={e.ndaText} vars={legalVars(e, a)} />
      </div>
      <div className="flex flex-col gap-3">
        <Field id="nda-name" label="Nombre completo del firmante">
          <input
            id="nda-name"
            value={l}
            onChange={(b) => r(b.target.value)}
            className={fieldCls()}
            autoComplete="name"
          />
        </Field>
        <Field id="nda-email" label="Correo electrónico">
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
          {"Leí y acepto el Acuerdo de Confidencialidad con "}
          {e.legalName}.
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
          Firmar NDA con un clic
        </button>
        <button
          onClick={() => {
            // Random alias: emails are unique per tenant in the database.
            r(DEMO_KYC.fullName), s(`inversionista.${Math.random().toString(16).slice(2, 6)}@ejemplo.co`), d(true);
          }}
          className="text-[12px] text-rxBlue underline underline-offset-2 self-start focus-ring"
        >
          Completar con datos de ejemplo
        </button>
        <p className="text-[11px] text-muted">
          La firma genera un ConsentRecord con hash SHA-256 del texto aceptado, con validez probatoria según
          la Ley 527 de 1999.
        </p>
      </div>
    </div>
  );
}
