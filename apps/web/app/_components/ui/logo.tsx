// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
export const OFFICIAL_LOGO_SRC = null;

export function Logo({ onClick: e }) {
  return (
    <button
      onClick={e}
      className="brand-logo flex flex-col items-start leading-none focus-ring"
      aria-label="RWAXI, ir a oportunidades"
    >
      {OFFICIAL_LOGO_SRC ? (
        <img src={OFFICIAL_LOGO_SRC} alt="RWAXI" className="h-[34px] w-auto" />
      ) : (
        <>
          <span
            className="font-display italic font-semibold text-rxPurple text-[31px] tracking-[0.01em] leading-none"
            aria-hidden="true"
          >
            RWA<span className="logo-x">X</span>I
          </span>
          <span
            className="mt-[5px] text-[8.5px] font-semibold tracking-[0.24em] text-rxGold"
            aria-hidden="true"
          >
            ACTIVOS REALES · INVERSIONES DIGITALES
          </span>
        </>
      )}
    </button>
  );
}
