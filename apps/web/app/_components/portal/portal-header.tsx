// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { PoweredSeal, TenantLogo } from "@/app/_components/portal/tenant-brand";
import { Icon } from "@/app/_components/ui/icon";

export function PortalHeader({ t: e, journey: a, go: t }) {
  const o = a.kyc.status,
    n =
      o === "aprobado"
        ? ["Inversionista Elegible", "bg-aquaTint text-aquaInk", "BadgeCheck"]
        : o === "pendiente"
          ? ["KYC en revisión", "bg-goldTint text-goldInk", "Clock"]
          : o === "rechazado"
            ? ["KYC rechazado", "bg-[#FDECEA] text-[#B42318]", "AlertTriangle"]
            : a.nda
              ? ["NDA firmado", "bg-cloud text-inkBody", "FileSignature"]
              : ["Visitante", "bg-cloud text-muted", "User"];
  return (
    <header
      className="sticky-top bg-white border-b border-line z-30"
      style={{
        borderTop: `4px solid ${e.color}`,
      }}
    >
      <div className="gutter max-w-[1240px] mx-auto flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <TenantLogo t={e} />
          <div className="min-w-0">
            <p
              className="font-sans font-bold text-[16px] leading-tight"
              style={{
                color: e.color,
              }}
            >
              {e.displayName}
            </p>
            <p className="font-mono text-[10.5px] text-muted truncate">
              {e.legalName}
              {" · NIT "}
              {e.nit}
            </p>
          </div>
        </div>
        <nav className="flex gap-5 text-[13px] font-medium md:ml-auto overflow-x-auto" aria-label="Portal">
          {[
            ["top", "Proyecto"],
            ["info", "Simulador"],
            ["funnel-3", "Data Room"],
            ["funnel-4", "Mi portafolio"],
          ].map(([l, r]) => (
            <button
              key={l}
              onClick={() => t(l)}
              className="py-1.5 whitespace-nowrap text-inkBody hover:tc-text focus-ring"
            >
              {r}
            </button>
          ))}
        </nav>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-semibold ${n[1]}`}
        >
          <Icon name={n[2]} size={14} />
          {n[0]}
        </span>
        <div className="w-full md:w-auto flex md:block">
          <PoweredSeal />
        </div>
      </div>
    </header>
  );
}
