"use client";

import { useTransition } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { useI18n } from "@/app/_i18n/provider";
import type { AccountView } from "./types";

/** Header account: the signed-in staff member and «Cerrar sesión», or the demo session and a link to sign in. */
export function AccountBadge({
  account,
  logout,
  loginHref,
  dark = false,
}: {
  account: AccountView;
  logout: () => Promise<unknown>;
  loginHref: string;
  dark?: boolean;
}) {
  const { tr } = useI18n();
  const [busy, startTransition] = useTransition();
  const chip = dark ? "bg-white/10 text-white" : "bg-cloud border border-line text-inkBody";
  const link = dark ? "text-[#D9A24A]" : "text-rxBlue";

  if (account.demo) {
    return (
      <span
        className={`inline-flex items-center gap-2 text-[11px] font-mono px-2.5 py-1.5 ${chip}`}
        data-account="demo"
      >
        <Icon name="FlaskConical" size={13} />
        {tr("Sesión demo")}
        <a href={loginHref} className={`underline font-sans text-[11.5px] ${link}`}>
          {tr("Iniciar sesión")}
        </a>
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-2 text-[11px] px-2.5 py-1.5 ${chip}`} data-account="user">
      <Icon name="ShieldCheck" size={13} className={dark ? "text-[#D9A24A]" : "text-aquaInk"} />
      <span className="min-w-0">
        <span className="font-semibold">{account.name}</span>
        {account.role && <span className="opacity-75">{` · ${tr(account.role)}`}</span>}
        <span className="opacity-75 font-mono">{` · ${tr("MFA activo")}`}</span>
      </span>
      <button
        type="button"
        disabled={busy}
        data-logout
        onClick={() =>
          startTransition(async () => {
            await logout();
            window.location.assign(loginHref);
          })
        }
        className={`underline font-semibold text-[11.5px] focus-ring disabled:opacity-60 ${link}`}
      >
        {tr("Cerrar sesión")}
      </button>
    </span>
  );
}
