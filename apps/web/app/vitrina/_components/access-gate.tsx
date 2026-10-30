"use client";

import { useEffect, useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { fieldCls } from "@/app/_components/ui/form";
import { LanguageMenu } from "@/app/_i18n/language-switcher";
import { useI18n } from "@/app/_i18n/provider";
import { acceptVitrinaAccess } from "../actions";
import { VITRINA_CONSENTS, type ConsentKey } from "../_lib/access-terms";

/**
 * Legal wall of the vitrina ("gated content"): until the visitor gives an email and the three mandatory consents
 * (terms + liability disclaimer, personal data, cookies — each linking to its /legal/* document, which is outside the
 * wall and opens in a new tab), the vitrina stays blurred and inert behind a dialog that cannot be dismissed. `granted` comes from the
 * server (signed HttpOnly cookie, app/_lib/server/vitrina-access.ts); accepting records the acceptance in
 * PostgreSQL and sets that cookie, so the wall does not come back on the next visit.
 */
export function VitrinaAccessGate({ granted, children }: { granted: boolean; children: ReactNode }) {
  const { tr, rich } = useI18n();
  const [locked, setLocked] = useState(!granted);
  const [email, setEmail] = useState("");
  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>({ terms: false, privacy: false, cookies: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const titleId = useId();

  // The page behind the wall does not scroll while it is locked.
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    startTransition(async () => {
      const result = await acceptVitrinaAccess({ email, consents });
      if (result.ok) setLocked(false);
      else setError(result.error);
    });
  };
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  // granular consent: the three checkboxes are independent and all mandatory
  const allAccepted = VITRINA_CONSENTS.every((c) => consents[c.key]);

  return (
    <>
      <div
        data-vitrina-gate={locked ? "locked" : "open"}
        inert={locked}
        aria-hidden={locked || undefined}
        className={locked ? "blur-md pointer-events-none select-none" : undefined}
      >
        {children}
      </div>
      {locked && (
        <div className="fixed inset-0 z-[100] bg-rxDeep/70 overflow-y-auto" data-vitrina-access-dialog>
          <div className="min-h-full grid place-items-center p-4">
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onSubmit={submit}
              className="w-full max-w-[520px] bg-white border border-line shadow-2xl"
            >
              <div className="bg-rxDeep px-6 py-4 flex items-center justify-between gap-3">
                <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-lav">Powered by RWAXI Technology</p>
                <LanguageMenu />
              </div>
              <div className="px-6 py-6 flex flex-col gap-4">
                <div>
                  <h2 id={titleId} className="font-display font-semibold text-rxPurple text-[28px] leading-[1.1] balance">
                    {tr("Comunidad privada de inversionistas")}
                  </h2>
                  <p className="text-[13px] text-inkBody mt-2 leading-relaxed">
                    {tr(
                      "La vitrina RWAXI reúne oportunidades de coinversión inmobiliaria de desarrolladores independientes. Para ver los proyectos, identifícate con tu correo y acepta las condiciones de ingreso.",
                    )}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="vitrina-access-email" className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted">
                    {tr("Correo electrónico")}
                  </label>
                  <input
                    id="vitrina-access-email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={fieldCls(false) + " text-[13.5px]"}
                    dir="ltr"
                  />
                </div>
                <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
                  <legend className="sr-only">{tr("Condiciones de ingreso")}</legend>
                  {VITRINA_CONSENTS.map((c) => (
                    <div key={c.key} className="flex gap-3 items-start text-[12.5px] text-inkBody leading-relaxed" data-consent={c.key}>
                      <input
                        id={`vitrina-consent-${c.key}`}
                        type="checkbox"
                        required
                        checked={consents[c.key]}
                        onChange={(e) => setConsents((v) => ({ ...v, [c.key]: e.target.checked }))}
                        className="mt-1 h-4 w-4 shrink-0 accent-rxPurple cursor-pointer"
                      />
                      <label htmlFor={`vitrina-consent-${c.key}`} className="cursor-pointer">
                        {rich(c.text, {
                          link: (
                            <a
                              href={c.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-rxBlue underline underline-offset-2 focus-ring"
                            >
                              {tr(c.link)}
                            </a>
                          ),
                        })}
                      </label>
                    </div>
                  ))}
                </fieldset>
                {error && (
                  <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  data-vitrina-access-submit
                  disabled={busy || !allAccepted || !emailOk}
                  className="bg-rxPurple hover:bg-rxDeep text-white text-[13px] font-semibold py-3 inline-flex items-center justify-center gap-2 focus-ring disabled:opacity-50"
                >
                  {busy && <Icon name="Loader2" size={15} className="spin" />}
                  {tr("Ingresar a la vitrina")}
                </button>
                <p className="text-[11px] text-muted leading-relaxed">
                  {tr(
                    "RWAXI actúa como canal de descubrimiento y proveedor tecnológico: no custodia recursos ni realiza ofertas públicas. Cada oferta es responsabilidad de su desarrollador.",
                  )}
                </p>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
