// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { CurrencyToggle } from "@/app/_components/ui/currency-toggle";
import { Logo } from "@/app/_components/ui/logo";
import { LanguageMenu } from "@/app/_i18n/language-switcher";
import { useI18n } from "@/app/_i18n/provider";

export function VitrinaNav({ currency: e, setCurrency: a, toBackoffice: t }) {
  const { tr } = useI18n();
  const o = (n) => {
    const l = document.getElementById(n);
    l &&
      l.scrollIntoView({
        behavior: "smooth",
      });
  };
  return (
    <header className="sticky-top bg-white border-b border-line z-30">
      <div className="gutter max-w-[1240px] mx-auto flex flex-wrap items-center gap-x-8 gap-y-3 py-3">
        <Logo
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: "smooth",
            })
          }
        />
        <nav
          className="flex flex-wrap gap-x-6 gap-y-1 text-[13.5px] font-medium md:ms-auto"
          aria-label={tr("Principal")}
        >
          {[
            ["oportunidades", tr("Oportunidades")],
            ["como-funciona", tr("Cómo funciona")],
            ["frontera-legal", tr("Frontera legal")],
          ].map(([n, l]) => (
            <button
              key={n}
              onClick={() => o(n)}
              className="shrink-0 whitespace-nowrap py-1.5 text-inkBody hover:text-rxPurple focus-ring"
            >
              {l}
            </button>
          ))}
        </nav>
        <div className="hidden lg:block">
          <CurrencyToggle currency={e} setCurrency={a} label={false} />
        </div>
        <div className="flex items-center gap-3 ms-auto md:ms-0">
          <LanguageMenu />
          <button
            onClick={t}
            className="inline-flex items-center gap-1.5 border border-rxPurple text-rxPurple px-3.5 py-2 text-[12.5px] font-semibold hover:bg-rxPurple hover:text-white transition-colors focus-ring"
          >
            {tr("Acceso Desarrolladores")}{" "}
            <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
              ↗
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
