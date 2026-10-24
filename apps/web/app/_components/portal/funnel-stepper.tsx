"use client";
import { Icon } from "@/app/_components/ui/icon";
import { useI18n } from "@/app/_i18n/provider";
import { REGIMES } from "@/app/_lib/data/kyc";
import type { PortalJourney, RegimeKey } from "./portal-types";

type StepState = "done" | "open" | "wait" | "fail" | "revoked" | "locked";

/**
 * The investor's funnel, in order: 1 NDA → 2 Data Room (every document opens with the NDA) → 3 KYC/AML (what
 * investing requires, not reading) → 4 subscription, fiduciary payment and portfolio.
 */
export function FunnelStepper({
  journey: e,
  active: a,
  setActive: t,
  minted: o,
  regime: n,
}: {
  journey: PortalJourney;
  active: number;
  setActive: (step: number) => void;
  minted: boolean;
  regime: RegimeKey;
}) {
  const { tr } = useI18n();
  const l = e.kyc.status,
    revoked = l === "revocado",
    r: [string, string, StepState, string][] = [
      [
        "FileSignature",
        tr("Firma de NDA digital"),
        e.nda ? "done" : "open",
        e.nda ? tr("ConsentRecord registrado") : tr("Requerido para ver detalles reservados"),
      ],
      [
        "FolderOpen",
        tr("Data Room inmobiliario"),
        revoked ? "revoked" : e.nda ? "open" : "locked",
        revoked
          ? tr("Acceso retirado por cumplimiento")
          : e.nda
            ? tr("100 % de los documentos con tu NDA")
            : tr("Se desbloquea al firmar el NDA"),
      ],
      [
        "ShieldCheck",
        tr("KYC/AML + {regime}", { regime: REGIMES[n].short }),
        l === "aprobado"
          ? "done"
          : l === "pendiente"
            ? "wait"
            : l === "rechazado"
              ? "fail"
              : revoked
                ? "revoked"
                : e.nda
                  ? "open"
                  : "locked",
        l === "aprobado"
          ? tr("Aprobado por el desarrollador")
          : l === "pendiente"
            ? tr("En revisión del Oficial de Cumplimiento")
            : l === "rechazado"
              ? tr("Requiere corrección")
              : revoked
                ? tr("Revocada por cumplimiento")
                : tr("Requisito para invertir: identidad, biometría y origen de fondos"),
      ],
      [
        "Coins",
        tr("Suscripción y portafolio"),
        e.holdings.length ? "done" : l === "aprobado" ? "open" : "locked",
        e.holdings.length
          ? tr("{n} suscripción(es)", { n: e.holdings.length, count: e.holdings.length })
          : l !== "aprobado"
            ? tr("Se habilita con tu KYC aprobado")
            : o
              ? tr("Firma del contrato del vehículo")
              : tr("Reserva hasta la emisión de tokens"),
      ],
    ],
    i: Record<StepState, string> = {
      done: "text-aquaInk",
      open: "tc-text",
      wait: "text-goldInk",
      fail: "text-[#B42318]",
      revoked: "text-[#B42318]",
      locked: "text-muted",
    },
    s: Record<StepState, string> = {
      done: tr("Completado"),
      open: tr("Disponible"),
      wait: tr("En revisión"),
      fail: tr("Corregir"),
      revoked: tr("Revocado"),
      locked: tr("Bloqueado"),
    };
  return (
    <ol
      className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line"
      aria-label={tr("Embudo legal y de cumplimiento")}
    >
      {r.map(([c, d, p, m], u) => (
        <li key={c}>
          <button
            id={`funnel-${u + 1}`}
            data-step-state={p}
            onClick={() => t(u)}
            aria-pressed={a === u}
            className={`w-full h-full text-start p-4 flex gap-3 items-start focus-ring transition-colors ${a === u ? "bg-white shadow-[inset_0_-3px_0_var(--tc)]" : "bg-cloud hover:bg-white"}`}
          >
            <span
              className={`w-9 h-9 shrink-0 grid place-items-center ${p === "done" ? "bg-aquaTint text-aquaInk" : p === "locked" || p === "revoked" ? "bg-white text-muted border border-line" : "tc-bg-soft tc-text"}`}
            >
              <Icon name={p === "done" ? "Check" : p === "locked" || p === "revoked" ? "Lock" : c} size={17} />
            </span>
            <span className="min-w-0">
              <span className="font-mono text-[10.5px] text-muted">{tr("PASO {n}", { n: u + 1 })}</span>
              <span className="block text-[13.5px] font-semibold text-rxPurple leading-snug">{d}</span>
              <span className="block text-[11.5px] text-muted mt-0.5">{m}</span>
              <span className={`block text-[10.5px] font-semibold tracking-[0.08em] uppercase mt-1.5 ${i[p]}`}>
                {s[p]}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
