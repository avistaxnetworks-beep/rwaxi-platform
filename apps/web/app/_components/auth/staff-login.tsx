"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { useI18n } from "@/app/_i18n/provider";
import type { LoginActionResult, MfaActionResult } from "./types";

type Step = { kind: "password" } | { kind: "mfa" } | { kind: "enroll"; secret: string; uri: string };

const field =
  "w-full border border-line bg-white px-3.5 py-3 text-[14px] text-inkBody focus:outline-none focus:border-rxBlue focus-ring";

/**
 * Staff sign-in (developer backoffice and RWAXI console): email + password, then the 6-digit TOTP code of an
 * authenticator app — or, on a first sign-in, its enrolment. Every check happens on the server (staff-auth.ts).
 */
export function StaffLogin({
  brand,
  title,
  subtitle,
  login,
  verify,
  next,
  aside,
}: {
  brand: ReactNode;
  title: string;
  subtitle: string;
  login: (email: string, password: string) => Promise<LoginActionResult>;
  verify: (code: string) => Promise<MfaActionResult>;
  /** where the browser goes once signed in */
  next: string;
  /** e.g. the language toggle of the backoffice */
  aside?: ReactNode;
}) {
  const { tr } = useI18n();
  const [step, setStep] = useState<Step>({ kind: "password" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await login(email, password);
      if (!result.ok) return setError(result.error);
      setPassword("");
      setCode("");
      setStep(
        result.step === "enroll"
          ? { kind: "enroll", secret: result.secret, uri: result.uri }
          : { kind: "mfa" },
      );
    });
  };
  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verify(code);
      if (result.ok) return window.location.assign(next);
      setError(result.error);
      setCode("");
      if (result.restart) setStep({ kind: "password" });
    });
  };

  return (
    <div className="min-h-[70vh] grid place-items-center gutter py-12 bg-cloud">
      <div className="w-full max-w-[440px] bg-white border border-line shadow-sm" data-login-step={step.kind}>
        <div className="px-7 pt-7 pb-5 border-b border-line flex items-start justify-between gap-4">
          <div className="min-w-0">
            {brand}
            <h1 className="font-display font-semibold text-[26px] leading-tight text-rxPurple mt-3">
              {title}
            </h1>
            <p className="text-[12.5px] text-muted mt-1">{subtitle}</p>
          </div>
          {aside}
        </div>

        {step.kind === "password" ? (
          <form onSubmit={submitPassword} className="px-7 py-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-inkBody">
              {tr("Correo corporativo")}
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-inkBody">
              {tr("Contraseña")}
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={field}
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
              disabled={busy}
              className="tc-btn font-semibold text-[13.5px] py-3 inline-flex items-center justify-center gap-2 focus-ring disabled:opacity-60"
            >
              <Icon name={busy ? "Loader2" : "LogIn"} size={16} className={busy ? "spin" : ""} />
              {tr("Continuar")}
            </button>
            <p className="text-[11.5px] text-muted inline-flex items-center gap-1.5">
              <Icon name="ShieldCheck" size={13} className="text-aquaInk" />
              {tr("Acceso con contraseña y código de verificación de dos pasos (TOTP).")}
            </p>
          </form>
        ) : (
          <form onSubmit={submitCode} className="px-7 py-6 flex flex-col gap-4">
            {step.kind === "enroll" ? (
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
            ) : (
              <p className="text-[12.5px] text-muted leading-[1.55]">
                {tr("Escribe el código de 6 dígitos que muestra tu app de autenticación.")}
              </p>
            )}
            <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-inkBody">
              {tr("Código de verificación")}
              <input
                id="login-code"
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
              <Icon name={busy ? "Loader2" : "KeyRound"} size={16} className={busy ? "spin" : ""} />
              {step.kind === "enroll" ? tr("Confirmar y entrar") : tr("Verificar e ingresar")}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep({ kind: "password" });
              }}
              className="text-[12px] text-rxBlue underline self-center focus-ring"
            >
              {tr("Usar otra cuenta")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
