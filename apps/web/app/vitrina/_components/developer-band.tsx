"use client";
import { Icon } from "@/app/_components/ui/icon";
import { useI18n } from "@/app/_i18n/provider";
import { RWAXI_B2B_URL } from "../_lib/links";

/** Before the footer: developers and structurers who want to tokenize a property go to RWAXI's B2B site. */
export function DeveloperBand() {
  const { tr } = useI18n();
  return (
    <section className="bg-cloud border-t border-line" data-b2b-band>
      <div className="gutter max-w-[1240px] mx-auto py-12">
        <div className="bg-white border border-line border-s-4 border-s-rxPurple p-6 md:p-8 grid lg:grid-cols-[minmax(0,1fr)_auto] gap-6 items-center">
          <div className="min-w-0 flex gap-4 items-start">
            <span className="hidden sm:grid w-12 h-12 place-items-center bg-rxPurple text-white shrink-0">
              <Icon name="Building2" size={22} />
            </span>
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-rxPurple text-[26px] md:text-[32px] leading-[1.12] balance">
                {tr("¿Eres desarrollador o estructurador inmobiliario y te gustaría tokenizar tu proyecto?")}
              </h2>
              <p className="mt-3 text-[14.5px] leading-[1.7] text-inkBody max-w-[78ch]">
                {tr(
                  "Abre tu propio portal institucional White Label, automatiza tu cumplimiento KYC/SAGRILAFT y conecta tu inmueble con inversionistas globales sin ceder el control fiduciario.",
                )}
              </p>
            </div>
          </div>
          <a
            href={RWAXI_B2B_URL}
            data-b2b-link="band"
            className="justify-self-start lg:justify-self-end bg-rxPurple text-white px-5 py-3 text-[13px] font-semibold inline-flex items-center gap-2 hover:bg-rxDeep transition-colors focus-ring"
          >
            {tr("Conoce cómo estructurar tu inmueble en rwaxi.com")}
            <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
              →
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
