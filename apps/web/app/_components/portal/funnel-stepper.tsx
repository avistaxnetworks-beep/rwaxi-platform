// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { Icon } from "@/app/_components/ui/icon";
import { REGIMES } from "@/app/_lib/data/kyc";

export function FunnelStepper({ journey: e, active: a, setActive: t, minted: o, regime: n }) {
  const l = e.kyc.status,
    r = [
      [
        "FileSignature",
        "Firma de NDA digital",
        e.nda ? "done" : "open",
        e.nda ? "ConsentRecord registrado" : "Requerido para ver detalles reservados",
      ],
      [
        "ShieldCheck",
        `KYC/AML + ${REGIMES[n].short}`,
        l === "aprobado"
          ? "done"
          : e.nda
            ? l === "pendiente"
              ? "wait"
              : l === "rechazado"
                ? "fail"
                : "open"
            : "locked",
        l === "aprobado"
          ? "Aprobado por el desarrollador"
          : l === "pendiente"
            ? "En revisión del Oficial de Cumplimiento"
            : l === "rechazado"
              ? "Requiere corrección"
              : "Identidad, biometría y origen de fondos",
      ],
      [
        "FolderLock",
        "Data Room desbloqueado",
        e.grant ? "done" : "locked",
        e.grant ? "AccessGrant vigente" : "Se habilita con NDA + KYC aprobado",
      ],
      [
        "Coins",
        "Suscripción y portafolio",
        e.holdings.length ? "done" : e.grant ? "open" : "locked",
        e.holdings.length
          ? `${e.holdings.length} suscripción(es)`
          : o
            ? "Firma del contrato del vehículo"
            : "Reserva hasta la emisión de tokens",
      ],
    ],
    i = {
      done: "text-aquaInk",
      open: "tc-text",
      wait: "text-goldInk",
      fail: "text-[#B42318]",
      locked: "text-muted",
    },
    s = {
      done: "Completado",
      open: "Disponible",
      wait: "En revisión",
      fail: "Corregir",
      locked: "Bloqueado",
    };
  return (
    <ol
      className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line"
      aria-label="Embudo legal y de cumplimiento"
    >
      {r.map(([c, d, p, m], u) => (
        <li key={d}>
          <button
            id={`funnel-${u + 1}`}
            onClick={() => t(u)}
            aria-pressed={a === u}
            className={`w-full h-full text-left p-4 flex gap-3 items-start focus-ring transition-colors ${a === u ? "bg-white shadow-[inset_0_-3px_0_var(--tc)]" : "bg-cloud hover:bg-white"}`}
          >
            <span
              className={`w-9 h-9 shrink-0 grid place-items-center ${p === "done" ? "bg-aquaTint text-aquaInk" : p === "locked" ? "bg-white text-muted border border-line" : "tc-bg-soft tc-text"}`}
            >
              <Icon name={p === "done" ? "Check" : p === "locked" ? "Lock" : c} size={17} />
            </span>
            <span className="min-w-0">
              <span className="font-mono text-[10.5px] text-muted">
                {"PASO "}
                {u + 1}
              </span>
              <span className="block text-[13.5px] font-semibold text-rxPurple leading-snug">{d}</span>
              <span className="block text-[11.5px] text-muted mt-0.5">{m}</span>
              <span
                className={`block text-[10.5px] font-semibold tracking-[0.08em] uppercase mt-1.5 ${i[p]}`}
              >
                {s[p]}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
