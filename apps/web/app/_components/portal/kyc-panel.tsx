// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { LegalText } from "@/app/_components/legal/legal-text";
import { LockedNote } from "@/app/_components/portal/data-room-panel";
import { Wizard } from "@/app/_components/portal/kyc/wizard";
import { Icon } from "@/app/_components/ui/icon";
import { legalVars } from "@/app/_lib/data/legal";
import { WALLET } from "@/app/_lib/data/projects";
import { shortHash } from "@/app/_lib/format";
import { sha256Hex } from "@/app/_lib/hash";

export function KycPanel({ t: e, p: a, journey: t, setJourney: o, currency: n, toBackoffice: l }) {
  const r = t.kyc,
    i = (s) =>
      o((c) => ({
        ...c,
        kyc: s(c.kyc),
      }));
  return t.nda ? (
    r.stage === "form" ? (
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] text-inkBody bg-cloud border border-line px-4 py-3 flex gap-2 items-start">
          <Icon name="Scale" size={16} className="tc-text shrink-0 mt-0.5" />
          {"Responsable del tratamiento y la debida diligencia: "}
          <strong className="font-semibold">{e.legalName}</strong>
          {" · NIT "}
          {e.nit}
          {" · Oficial de Cumplimiento del desarrollador."}
        </p>
        <Wizard
          auth={{
            method: "email",
            email: t.nda.email,
          }}
          data={r.data}
          setData={(s) =>
            i((c) => ({
              ...c,
              data: typeof s == "function" ? s(c.data) : s,
            }))
          }
          step={r.step}
          setStep={(s) =>
            i((c) => ({
              ...c,
              step: s,
            }))
          }
          currency={n}
          entity={e.legalName}
          sarlaftText={<LegalText tpl={e.complianceTpl[e.regime]} vars={legalVars(e, a)} compact={true} />}
          regime={e.regime}
          onSubmit={async () => {
            const s = r.data,
              c = await sha256Hex(
                JSON.stringify({
                  tenant: e.slug,
                  nit: e.nit,
                  regime: e.regime,
                  ndaHash: t.nda.hash,
                  fullName: s.fullName,
                  docType: s.docType,
                  docNumber: s.docNumber,
                  country: s.country,
                  activity: s.activity,
                  activityOther: s.activityOther,
                  income: s.income,
                  risk: s.risk,
                  docFront: s.docFront && s.docFront.name,
                  docBack: s.docBack && s.docBack.name,
                  liveness: s.liveness,
                  declarations: [s.noPep, s.dataPolicy, s.terms, s.sarlaft, s.ptee, s.listas],
                }),
              );
            i((d) => ({
              ...d,
              stage: "status",
              status: "pendiente",
              reason: null,
              dossierHash: c,
            }));
          }}
        />
      </div>
    ) : r.status === "pendiente" ? (
      <div className="flex flex-col gap-4 max-w-[760px]">
        <p className="inline-flex items-center gap-2 text-goldInk font-semibold text-[14px]">
          <Icon name="Clock" size={18} />
          Pendiente
        </p>
        <p className="text-[15px] text-inkBody leading-[1.65]">
          {"Tus datos se encuentran en revisión por el Oficial de Cumplimiento de "}
          {e.legalName}
          {" (Auditoría estimada: 15 minutos)."}
        </p>
        <div className="border border-dashed border-[#C9C4D6] p-4 flex flex-wrap items-center gap-3 justify-between">
          <span className="text-[12.5px] text-muted">
            Simulación: la aprobación ocurre en el Backoffice aislado del desarrollador.
          </span>
          <button
            onClick={l}
            className="border border-line bg-white px-3.5 py-2 text-[12.5px] font-semibold text-rxBlue inline-flex items-center gap-1.5 focus-ring"
          >
            <Icon name="ArrowUpRight" size={14} />
            Abrir Bandeja de Cumplimiento
          </button>
        </div>
      </div>
    ) : r.status === "rechazado" ? (
      <div className="flex flex-col gap-4 max-w-[760px]">
        <div className="border border-[#F3C5BF] bg-[#FDF6F5] p-4" role="alert">
          <p className="text-[12px] font-semibold tracking-[0.06em] uppercase text-[#B42318]">
            {"Motivo del rechazo · "}
            {e.legalName}
          </p>
          <p className="text-[14px] text-inkBody leading-[1.6] mt-1.5">{r.reason}</p>
        </div>
        <button
          onClick={() =>
            i((s) => ({
              ...s,
              stage: "form",
              step: 2,
              status: null,
              data: {
                ...s.data,
                docFront: null,
                docBack: null,
              },
            }))
          }
          className="self-start tc-btn font-semibold text-[13px] px-5 py-3 inline-flex items-center gap-2 focus-ring"
        >
          <Icon name="RefreshCw" size={15} />
          Corregir documentación
        </button>
      </div>
    ) : (
      <div className="flex flex-col gap-3 max-w-[820px]">
        <p className="inline-flex items-center gap-2 text-aquaInk font-semibold text-[14px]">
          <Icon name="BadgeCheck" size={18} />
          Aprobado · Inversionista Elegible
        </p>
        <p className="text-[15px] text-inkBody leading-[1.65]">
          {"¡Verificación exitosa! Tu perfil ha sido aprobado por "}
          {e.legalName}
          {" y tu billetera ha sido vinculada a la Whitelist On-Chain ("}
          <span className="font-mono text-aquaInk">{WALLET}</span>).
        </p>
        {r.whitelistTx && (
          <p className="text-[12px] text-muted">
            {"Transacción de whitelist: "}
            <span className="font-mono text-aquaInk">{shortHash(r.whitelistTx, 12, 8)}</span>
          </p>
        )}
      </div>
    )
  ) : (
    <LockedNote text="Firma primero el NDA (Paso 1) para iniciar tu verificación." />
  );
}
