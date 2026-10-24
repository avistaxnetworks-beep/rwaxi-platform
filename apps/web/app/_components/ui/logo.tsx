"use client";
import { useI18n } from "@/app/_i18n/provider";

/**
 * The official wordmark (public/brand/rwaxi-logo-wordmark.webp: rwaxi-logo-principal.webp without its margins and
 * without the baked-in tagline, 3× the header size). From 768 px up its box is 10 % larger (37 px high instead of
 * 34). The tagline stays live text below it: legible at header size and translated into the vitrina's languages.
 * null falls back to the typographic logo.
 */
export const OFFICIAL_LOGO_SRC: string | null = "/brand/rwaxi-logo-wordmark.webp";

export function Logo({ onClick: e }: { onClick: () => void }) {
  const { tr } = useI18n();
  const tagline = (
    <span
      className="mt-[5px] md:mt-[5.5px] text-[8.5px] md:text-[9.35px] font-semibold tracking-[0.24em] text-rxGold"
      aria-hidden="true"
    >
      {tr("ACTIVOS REALES · INVERSIONES DIGITALES")}
    </span>
  );
  return (
    <button
      onClick={e}
      className="brand-logo flex flex-col items-start leading-none focus-ring"
      aria-label={tr("RWAXI, ir a oportunidades")}
    >
      {OFFICIAL_LOGO_SRC ? (
        <>
          <img
            src={OFFICIAL_LOGO_SRC}
            alt="RWAXI"
            width={330}
            height={111}
            className="h-[34px] md:h-[37px] w-auto"
            data-official-logo
          />
          {tagline}
        </>
      ) : (
        <>
          <span
            className="font-display italic font-semibold text-rxPurple text-[31px] md:text-[34px] tracking-[0.01em] leading-none"
            aria-hidden="true"
          >
            RWA<span className="logo-x">X</span>I
          </span>
          {tagline}
        </>
      )}
    </button>
  );
}
