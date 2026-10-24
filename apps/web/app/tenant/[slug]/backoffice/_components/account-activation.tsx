"use client";

import { useEffect, useState, useTransition, type CSSProperties, type FormEvent } from "react";
import { EnvironmentFrame } from "@/app/_components/shell/environment-frame";
import { Icon } from "@/app/_components/ui/icon";
import { LanguageToggle } from "@/app/_i18n/language-switcher";
import { msg } from "@/app/_i18n/marks";
import { useI18n } from "@/app/_i18n/provider";
import { onColor } from "@/app/_lib/format";
import { PASSWORD_RULES, passwordFailures, type PasswordRule } from "@/app/_lib/password-policy";
import type { InvitationView } from "@/app/_lib/server/staff-activation";
import { confirmActivationCode, inspectActivation, setActivationPassword } from "../activation-actions";

type Step =
  | { kind: "loading" }
  | { kind: "invalid"; error: string }
  | { kind: "password" }
  | { kind: "enroll"; secret: string; uri: string };

const ROLE: Record<InvitationView["role"], string> = {
  TENANT_ADMIN: msg("Administrador"),
  COMPLIANCE_OFFICER: msg("Oficial de Cumplimiento"),
};
const field =
  "w-full border border-line bg-white px-3.5 py-3 text-[14px] text-inkBody focus:outline-none focus:border-rxBlue focus-ring";

/**
 * Activation of an invited staff account: the link's token (URL fragment, removed from the address bar at once),
 * a password checked live against the policy, then the TOTP enrolment confirmed by the app's first code.
 */
export function AccountActivation({ brand }: { brand: { name: string; legalName: string; color: string } }) {
  const { tr } = useI18n();
  const [token, setToken] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<InvitationView | null>(null);
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serverFailed, setServerFailed] = useState<PasswordRule[]>([]);
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    window.history.replaceState(null, "", window.location.pathname); // keep the token out of history and screenshots
    setToken(value);
    startTransition(async () => {
      const result = await inspectActivation(value);
      if (!result.ok) return setStep({ kind: "invalid", error: result.error });
      setInvitation(result.invitation);
      setStep({ kind: "password" });
    });
  }, []);

  const failed = invitation
    ? passwordFailures(password, [invitation.name, invitation.email, brand.name, brand.legalName])
    : [];
  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError(tr("Las contraseñas no coinciden."));
    startTransition(async () => {
      const result = await setActivationPassword(token, password);
      if (!result.ok) {
        setServerFailed(result.failed ?? []);
        return setError(result.error);
      }
      setServerFailed([]);
      setCode("");
      setStep({ kind: "enroll", secret: result.secret, uri: result.uri });
    });
  };
  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await confirmActivationCode(token, code);
      if (result.ok) return window.location.assign("/backoffice");
      setError(result.error);
      setCode("");
    });
  };

  return (
    <EnvironmentFrame env="backoffice">
      <div style={{ "--tc": brand.color, "--tc-on": onColor(brand.color) } as CSSProperties}>
        <div className="min-h-[70vh] grid place-items-center gutter py-12 bg-cloud">
          <div
            className="w-full max-w-[480px] bg-white border border-line shadow-sm"
            data-activation-step={step.kind}
          >
            <div className="px-7 pt-7 pb-5 border-b border-line flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-2.5">
                  <span className="w-9 h-9 grid place-items-center tc-bg font-display italic font-semibold text-[15px]">
                    {brand.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="block font-bold text-[14px] text-rxPurple leading-tight">
                    {brand.name}
                  </span>
                </p>
                <h1 className="font-display font-semibold text-[26px] leading-tight text-rxPurple mt-3">
                  {tr("Activa tu cuenta")}
                </h1>
                <p className="text-[12.5px] text-muted mt-1">
                  {tr(
                    "Define tu contraseña y tu verificación en dos pasos para entrar al backoffice de {name}.",
                    {
                      name: brand.legalName || brand.name,
                    },
                  )}
                </p>
              </div>
              <LanguageToggle />
            </div>

            {step.kind === "loading" && (
              <p className="px-7 py-8 text-[12.5px] text-muted inline-flex items-center gap-2">
                <Icon name="Loader2" size={15} className="spin" />
                {tr("Verificando el enlace de activación…")}
              </p>
            )}

            {step.kind === "invalid" && (
              <div className="px-7 py-6 flex flex-col gap-3">
                <p
                  role="alert"
                  className="text-[12.5px] text-[#B42318] bg-[#FDECEA] border border-[#F3C5C0] px-3 py-2.5"
                >
                  {step.error}
                </p>
                <a href="/backoffice/login" className="text-[12px] text-rxBlue underline self-start">
                  {tr("Ir al inicio de sesión")}
                </a>
              </div>
            )}

            {invitation && step.kind !== "loading" && step.kind !== "invalid" && (
              <div className="px-7 pt-5">
                <p
                  className="text-[12px] text-inkBody bg-cloud border border-line px-3 py-2.5"
                  data-activation-account
                >
                  <span className="font-semibold">{invitation.name}</span>
                  {` · ${invitation.email} · ${tr(ROLE[invitation.role])}`}
                </p>
              </div>
            )}

            {step.kind === "password" && (
              <form onSubmit={submitPassword} className="px-7 py-6 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-inkBody">
                  {tr("Nueva contraseña")}
                  <input
                    id="activation-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={field}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-inkBody">
                  {tr("Confirma la contraseña")}
                  <input
                    id="activation-confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={field}
                  />
                </label>
                <ul className="flex flex-col gap-1 text-[12px]" aria-label={tr("Política de contraseñas")}>
                  {PASSWORD_RULES.map((rule) => {
                    const ok =
                      password.length > 0 && !failed.includes(rule.id) && !serverFailed.includes(rule.id);
                    return (
                      <li
                        key={rule.id}
                        data-password-rule={rule.id}
                        data-ok={ok ? "true" : "false"}
                        className={`inline-flex items-center gap-2 ${ok ? "text-aquaInk" : "text-muted"}`}
                      >
                        <Icon name={ok ? "CheckCircle2" : "Circle"} size={14} />
                        {tr(rule.text)}
                      </li>
                    );
                  })}
                </ul>
                {error && (
                  <p
                    role="alert"
                    className="text-[12.5px] text-[#B42318] bg-[#FDECEA] border border-[#F3C5C0] px-3 py-2.5"
                  >
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy || !password}
                  className="tc-btn font-semibold text-[13.5px] py-3 inline-flex items-center justify-center gap-2 focus-ring disabled:opacity-60"
                >
                  <Icon name={busy ? "Loader2" : "KeyRound"} size={16} className={busy ? "spin" : ""} />
                  {tr("Guardar contraseña y continuar")}
                </button>
              </form>
            )}

            {step.kind === "enroll" && (
              <form onSubmit={submitCode} className="px-7 py-6 flex flex-col gap-4">
                <div className="flex flex-col gap-2.5" data-mfa-enrolment>
                  <p className="text-[13px] font-semibold text-rxPurple">
                    {tr("Configura tu verificación en dos pasos")}
                  </p>
                  <p className="text-[12.5px] text-muted leading-[1.55]">
                    {tr(
                      "Agrega esta clave a tu app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password…) y escribe el código de 6 dígitos que genere.",
                    )}
                  </p>
                  <code
                    className="font-mono text-[13px] tracking-[0.12em] bg-cloud border border-line px-3 py-2.5 break-all"
                    data-totp-secret
                  >
                    {step.secret.replace(/(.{4})/g, "$1 ").trim()}
                  </code>
                  <a href={step.uri} className="text-[12px] text-rxBlue underline self-start">
                    {tr("Abrir en la app de autenticación")}
                  </a>
                </div>
                <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-inkBody">
                  {tr("Código de verificación")}
                  <input
                    id="activation-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className={`${field} font-mono text-[20px] tracking-[0.4em] text-center`}
                  />
                </label>
                {error && (
                  <p
                    role="alert"
                    className="text-[12.5px] text-[#B42318] bg-[#FDECEA] border border-[#F3C5C0] px-3 py-2.5"
                  >
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy || code.length !== 6}
                  className="tc-btn font-semibold text-[13.5px] py-3 inline-flex items-center justify-center gap-2 focus-ring disabled:opacity-60"
                >
                  <Icon name={busy ? "Loader2" : "ShieldCheck"} size={16} className={busy ? "spin" : ""} />
                  {tr("Activar y entrar al backoffice")}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </EnvironmentFrame>
  );
}
