"use client";

import type { CSSProperties } from "react";
import { StaffLogin } from "@/app/_components/auth/staff-login";
import { EnvironmentFrame } from "@/app/_components/shell/environment-frame";
import { LanguageToggle } from "@/app/_i18n/language-switcher";
import { useI18n } from "@/app/_i18n/provider";
import { onColor } from "@/app/_lib/format";
import { backofficeLogin, backofficeVerify } from "../auth-actions";

/** Sign-in of the developer's staff, in the tenant's brand and in ES | EN | PT. */
export function BackofficeLogin({ brand }: { brand: { name: string; legalName: string; color: string } }) {
  const { tr } = useI18n();
  return (
    <EnvironmentFrame env="backoffice">
      <div style={{ "--tc": brand.color, "--tc-on": onColor(brand.color) } as CSSProperties}>
        <StaffLogin
          brand={
            <p className="inline-flex items-center gap-2.5">
              <span className="w-9 h-9 grid place-items-center tc-bg font-display italic font-semibold text-[15px]">
                {brand.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-[14px] text-rxPurple leading-tight">{brand.name}</span>
                <span className="block text-[10.5px] font-mono tracking-[0.12em] text-muted">
                  {tr("BACKOFFICE · TENANT ADMIN")}
                </span>
              </span>
            </p>
          }
          title={tr("Acceso al backoffice")}
          subtitle={tr("Personal autorizado de {name}: administración y cumplimiento.", {
            name: brand.legalName || brand.name,
          })}
          login={backofficeLogin}
          verify={backofficeVerify}
          next="/backoffice"
          aside={<LanguageToggle />}
        />
      </div>
    </EnvironmentFrame>
  );
}
