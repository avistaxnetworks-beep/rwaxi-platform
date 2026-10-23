// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useI18n } from "@/app/_i18n/provider";
import { initials, onColor } from "@/app/_lib/format";

export function TenantLogo({ t: e, size: a = 40 }) {
  return e.logo ? (
    <img
      src={e.logo}
      alt={e.displayName}
      style={{
        height: a,
        maxWidth: a * 3.2,
      }}
      className="object-contain"
    />
  ) : (
    <span
      className="grid place-items-center font-display italic font-semibold shrink-0"
      style={{
        width: a,
        height: a,
        background: e.color,
        color: onColor(e.color),
        fontSize: a * 0.48,
      }}
      aria-hidden="true"
    >
      {initials(e.displayName)}
    </span>
  );
}

export function PoweredSeal({ dark: e }) {
  const { tr } = useI18n();
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.1em] uppercase ${e ? "text-[#A79FC0]" : "text-muted"}`}
    >
      {tr("Infraestructura Powered by")}{" "}
      <span className="font-display italic normal-case tracking-normal text-[14px] text-rxPurple">
        RWA<span className="logo-x">X</span>I
      </span>
    </span>
  );
}
