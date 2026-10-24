"use client";

import { StaffLogin } from "@/app/_components/auth/staff-login";
import { EnvironmentFrame } from "@/app/_components/shell/environment-frame";
import { consoleLogin, consoleVerify } from "../auth-actions";

/** Sign-in of RWAXI's direction (organization-less SUPER_ADMIN staff). The console is in Spanish. */
export function ConsoleLogin() {
  return (
    <EnvironmentFrame env="superadmin">
      <div style={{ ["--tc" as string]: "#2F145F", ["--tc-on" as string]: "#FFFFFF" }}>
        <StaffLogin
          brand={
            <p className="flex flex-col leading-none">
              <span className="font-display italic font-semibold text-[28px] text-rxPurple">
                RWA<span className="logo-x">X</span>I
              </span>
              <span className="mt-1 text-[9px] font-semibold tracking-[0.24em] text-goldInk">
                CONSOLA SUPER-ADMIN · admin.rwaxi.com
              </span>
            </p>
          }
          title="Acceso a la consola"
          subtitle="Dirección RWAXI: gobierno de portales, atribución y facturación B2B."
          login={consoleLogin}
          verify={consoleVerify}
          next="/"
        />
      </div>
    </EnvironmentFrame>
  );
}
