"use client";
import { useI18n } from "@/app/_i18n/provider";

/** The final vector logo, once delivered: from 768 px up its box is 10 % larger (37 px high instead of 34). */
export const OFFICIAL_LOGO_SRC: string | null = null;

export function Logo({ onClick: e }: { onClick: () => void }) {
  const { tr } = useI18n();
  return (
    <button
      onClick={e}
      className="brand-logo flex flex-col items-start leading-none focus-ring"
      aria-label={tr("RWAXI, ir a oportunidades")}
    >
      {OFFICIAL_LOGO_SRC ? (
        <img src={OFFICIAL_LOGO_SRC} alt="RWAXI" className="h-[34px] md:h-[37px] w-auto" />
      ) : (
        <>
          <span
            className="font-display italic font-semibold text-rxPurple text-[31px] md:text-[34px] tracking-[0.01em] leading-none"
            aria-hidden="true"
          >
            RWA<span className="logo-x">X</span>I
          </span>
          <span
            className="mt-[5px] md:mt-[5.5px] text-[8.5px] md:text-[9.35px] font-semibold tracking-[0.24em] text-rxGold"
            aria-hidden="true"
          >
            {tr("ACTIVOS REALES · INVERSIONES DIGITALES")}
          </span>
        </>
      )}
    </button>
  );
}
