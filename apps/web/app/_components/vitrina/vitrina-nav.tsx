// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { CurrencyToggle } from "@/app/_components/ui/currency-toggle";
import { Logo } from "@/app/_components/ui/logo";

export function VitrinaNav({ currency: e, setCurrency: a, toBackoffice: t }) {
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
        <nav className="flex gap-6 text-[13.5px] font-medium md:ml-auto" aria-label="Principal">
          {[
            ["oportunidades", "Oportunidades"],
            ["como-funciona", "Cómo funciona"],
            ["frontera-legal", "Frontera legal"],
          ].map(([n, l]) => (
            <button
              key={n}
              onClick={() => o(n)}
              className="py-1.5 text-inkBody hover:text-rxPurple focus-ring"
            >
              {l}
            </button>
          ))}
        </nav>
        <div className="hidden lg:block">
          <CurrencyToggle currency={e} setCurrency={a} label={false} />
        </div>
        <button
          onClick={t}
          className="ml-auto md:ml-0 inline-flex items-center gap-1.5 border border-rxPurple text-rxPurple px-3.5 py-2 text-[12.5px] font-semibold hover:bg-rxPurple hover:text-white transition-colors focus-ring"
        >
          {"Acceso Desarrolladores "}
          <span aria-hidden="true">↗</span>
        </button>
      </div>
    </header>
  );
}
