"use client";
import type { CSSProperties } from "react";
import { useI18n } from "@/app/_i18n/provider";
import { initials, onColor } from "@/app/_lib/format";

export function TenantLogo({
  t: e,
  size: a = 40,
  mdSize: m,
}: {
  t: { logo?: string | null; displayName: string; color: string };
  size?: number;
  /** size from 768 px up (md:), for a header that grows on desktop; phones keep `size` */
  mdSize?: number;
}) {
  // Inline sizes ignore breakpoints: with mdSize the box reads CSS variables that the md: utilities switch.
  const v = m ? ({ "--logo": `${a}px`, "--logo-md": `${m}px` } as CSSProperties) : null;
  return e.logo ? (
    <img
      src={e.logo}
      alt={e.displayName}
      style={
        v ?? {
          height: a,
          maxWidth: a * 3.2,
        }
      }
      className={`object-contain${v ? " h-[var(--logo)] max-w-[calc(var(--logo)*3.2)] md:h-[var(--logo-md)] md:max-w-[calc(var(--logo-md)*3.2)]" : ""}`}
    />
  ) : (
    <span
      className={`grid place-items-center font-display italic font-semibold shrink-0${v ? " w-[var(--logo)] h-[var(--logo)] text-[length:calc(var(--logo)*0.48)] md:w-[var(--logo-md)] md:h-[var(--logo-md)] md:text-[length:calc(var(--logo-md)*0.48)]" : ""}`}
      style={{
        ...(v ?? {
          width: a,
          height: a,
          fontSize: a * 0.48,
        }),
        background: e.color,
        color: onColor(e.color),
      }}
      aria-hidden="true"
    >
      {initials(e.displayName)}
    </span>
  );
}

export function PoweredSeal({ dark: e }: { dark?: boolean }) {
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
