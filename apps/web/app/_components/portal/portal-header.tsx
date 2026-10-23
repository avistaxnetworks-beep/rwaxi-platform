// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { PoweredSeal, TenantLogo } from "@/app/_components/portal/tenant-brand";
import { Icon } from "@/app/_components/ui/icon";
import { LanguageToggle } from "@/app/_i18n/language-switcher";
import { useI18n } from "@/app/_i18n/provider";

export function PortalHeader({ t: e, journey: a, go: t }) {
  const { tr } = useI18n();
  const o = a.kyc.status,
    n =
      o === "aprobado"
        ? [tr("Inversionista Elegible"), "bg-aquaTint text-aquaInk", "BadgeCheck"]
        : o === "pendiente"
          ? [tr("KYC en revisión"), "bg-goldTint text-goldInk", "Clock"]
          : o === "rechazado"
            ? [tr("KYC rechazado"), "bg-[#FDECEA] text-[#B42318]", "AlertTriangle"]
            : a.nda
              ? [tr("NDA firmado"), "bg-cloud text-inkBody", "FileSignature"]
              : [tr("Visitante"), "bg-cloud text-muted", "User"];
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
        <nav
          className="flex gap-5 text-[13px] font-medium md:ms-auto overflow-x-auto"
          aria-label={tr("Portal")}
        >
          {[
            ["top", tr("Proyecto")],
            ["info", tr("Simulador")],
            ["funnel-3", tr("Data Room")],
            ["funnel-4", tr("Mi portafolio")],
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
        <LanguageToggle />
        <div className="w-full md:w-auto flex md:block">
          <PoweredSeal />
        </div>
      </div>
    </header>
  );
}
