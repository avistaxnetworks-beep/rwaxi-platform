"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { Modal } from "@/app/_components/ui/modal";
import { useI18n } from "@/app/_i18n/provider";
import { requestSessionCode, verifySessionCode } from "../recovery-actions";

const field =
  "w-full border border-line bg-white px-3.5 py-3 text-[14px] text-inkBody focus:outline-none focus:border-rxBlue focus-ring";

/**
 * «Recuperar mi sesión»: an investor who signed the NDA on another browser or device gets a one-time code by
 * email and, with it, their signed session in this portal (investor-recovery.ts). Shown only without a session.
 */
export function SessionRecovery() {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setStep("email");
    setCode("");
    setNotice(null);
    setError(null);
  };
  const sendCode = (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestSessionCode(email);
      if (!result.ok) return setError(result.error);
      setNotice(result.message);
      setCode("");
      setStep("code");
    });
  };
  const verify = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifySessionCode(email, code);
      // The server renders the recovered journey (NDA, KYC, portfolio) from the new session cookie.
      if (result.ok) return window.location.reload();
      setError(result.error);
      setCode("");
    });
  };

  return (
    <>
      <div className="border border-line bg-cloud px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <p className="text-[12.5px] text-inkBody leading-[1.55] flex gap-2.5 items-start">
          <Icon name="KeyRound" size={16} className="tc-text shrink-0 mt-0.5" />
          {tr(
            "¿Ya firmaste el NDA en otro navegador o dispositivo? Recupera tu sesión con un código enviado a tu correo.",
          )}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-recovery-open
          className="shrink-0 border border-line bg-white font-semibold text-[12.5px] px-4 py-2.5 tc-text inline-flex items-center justify-center gap-2 focus-ring"
        >
          <Icon name="Mail" size={15} />
          {tr("Recuperar mi sesión")}
        </button>
      </div>

      {open && (
        <Modal title={tr("Recuperar mi sesión")} onClose={close} wide={false}>
          <div data-recovery-step={step}>
            {step === "email" ? (
              <form onSubmit={sendCode} className="flex flex-col gap-4">
                <p className="text-[12.5px] text-muted leading-[1.55]">
                  {tr(
                    "Escribe el correo con el que firmaste el NDA. Te enviaremos un código de 6 dígitos de un solo uso.",
                  )}
                </p>
                <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-inkBody">
                  {tr("Correo electrónico")}
                  <input
                    id="recovery-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                  <Icon name={busy ? "Loader2" : "Mail"} size={16} className={busy ? "spin" : ""} />
                  {tr("Enviar código")}
                </button>
              </form>
            ) : (
              <form onSubmit={verify} className="flex flex-col gap-4">
                {notice && (
                  <p
                    className="text-[12.5px] text-inkBody bg-cloud border border-line px-3 py-2.5 leading-[1.55]"
                    data-recovery-notice
                  >
                    {notice}
                  </p>
                )}
                <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-inkBody">
                  {tr("Código de verificación")}
                  <input
                    id="recovery-code"
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
                  {tr("Verificar y continuar")}
                </button>
                <div className="flex justify-between gap-3 text-[12px]">
                  <button
                    type="button"
                    onClick={() => sendCode()}
                    disabled={busy}
                    className="text-rxBlue underline focus-ring"
                  >
                    {tr("Enviar otro código")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setStep("email");
                    }}
                    className="text-rxBlue underline focus-ring"
                  >
                    {tr("Cambiar correo")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
