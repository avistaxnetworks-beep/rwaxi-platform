"use client";
import { Logo } from "@/app/_components/ui/logo";
import { LanguageMenu } from "@/app/_i18n/language-switcher";
import { useI18n } from "@/app/_i18n/provider";
import { RWAXI_B2B_URL, type VitrinaSection } from "@/app/vitrina/_lib/links";

/**
 * Header of the vitrina. A slim bar on top leads developers who want to tokenize their property to RWAXI's B2B site;
 * the header itself holds the investor's page: logo, the three commercial sections and the language. It sticks from
 * tablet width up (on a phone it would cover a quarter of the screen). Figures switch currency in the hero and the
 * catalogue.
 */
export function VitrinaNav() {
  const { tr } = useI18n();
  const o = (n: VitrinaSection) => {
    const l = document.getElementById(n);
    l &&
      l.scrollIntoView({
        behavior: "smooth",
      });
  };
  const links: [VitrinaSection, string][] = [
    ["oportunidades", tr("Oportunidades")],
    ["como-funciona", tr("Cómo Invertir")],
    ["beneficios-tokenizacion", tr("Inversión Supercargada")],
  ];
  return (
    <header className="md:sticky md:top-0 z-30">
      <div className="bg-rxDeep">
        <div className="gutter max-w-[1240px] mx-auto flex justify-center sm:justify-end py-1.5">
          <a
            href={RWAXI_B2B_URL}
            data-b2b-link="header"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-lav hover:text-white transition-colors focus-ring text-center"
          >
            {tr("¿Eres desarrollador? Tokeniza tu inmueble")}
            <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
              →
            </span>
          </a>
        </div>
      </div>
      <div className="bg-white border-b border-line">
        <div className="gutter max-w-[1240px] mx-auto flex flex-wrap items-center gap-x-8 gap-y-2 py-3">
          <div className="me-auto lg:me-0">
            <Logo
              onClick={() =>
                window.scrollTo({
                  top: 0,
                  behavior: "smooth",
                })
              }
            />
          </div>
          <nav
            className="order-last lg:order-none w-full lg:w-auto lg:ms-auto flex flex-wrap gap-x-6 gap-y-1 text-[13.5px] font-medium"
            aria-label={tr("Principal")}
          >
            {links.map(([n, l]) => (
              <button
                key={n}
                data-nav-section={n}
                onClick={() => o(n)}
                className="shrink-0 whitespace-nowrap py-1.5 text-inkBody hover:text-rxPurple focus-ring"
              >
                {l}
              </button>
            ))}
          </nav>
          <LanguageMenu />
        </div>
      </div>
    </header>
  );
}
