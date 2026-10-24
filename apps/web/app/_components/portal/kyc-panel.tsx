// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useState } from "react";
import { LegalText } from "@/app/_components/legal/legal-text";
import { LockedNote } from "@/app/_components/portal/data-room-panel";
import { Wizard } from "@/app/_components/portal/kyc/wizard";
import { Icon } from "@/app/_components/ui/icon";
import { legalVars } from "@/app/_lib/data/legal";
import { WALLET } from "@/app/_lib/data/projects";
import { shortHash } from "@/app/_lib/format";
import { sha256Hex } from "@/app/_lib/hash";
import { useI18n } from "@/app/_i18n/provider";

export function KycPanel({ t: e, p: a, journey: t, setJourney: o, currency: n, toBackoffice: l, persist: g }) {
  const { locale, rich, tr } = useI18n();
  const [w, A] = useState(null),
    [P, z] = useState(false);
  const r = t.kyc,
    i = (s) =>
      o((c) => ({
        ...c,
        kyc: s(c.kyc),
      }));
  return t.nda ? (
    r.stage === "form" ? (
      <div className="flex flex-col gap-4">
        {w && (
          <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
            {w}
          </p>
        )}
        {P && (
          <p role="status" className="text-[12.5px] text-muted inline-flex items-center gap-2">
            <Icon name="Loader2" size={14} className="spin" />
            {tr("Enviando tu expediente al Oficial de Cumplimiento…")}
          </p>
        )}
        <p className="text-[12.5px] text-inkBody bg-cloud border border-line px-4 py-3 flex gap-2 items-start">
          <Icon name="Scale" size={16} className="tc-text shrink-0 mt-0.5" />
          <span>
            {rich("Responsable del tratamiento y la debida diligencia: {name} · NIT {nit} · Oficial de Cumplimiento del desarrollador.", {
              name: <strong className="font-semibold">{e.legalName}</strong>,
              nit: e.nit,
            })}
          </span>
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
          sarlaftText={
            <div className="flex flex-col gap-2">
              {locale !== "es" && (
                <p className="text-[11.5px] text-muted" data-legal-original>
                  {tr("Texto legal del desarrollador en su idioma original (español): es la versión vinculante que aceptas.")}
                </p>
              )}
              <div lang="es">
                <LegalText tpl={e.complianceTpl[e.regime]} vars={legalVars(e, a)} compact={true} />
              </div>
            </div>
          }
          regime={e.regime}
          onSubmit={async () => {
            if (g) {
              // Persisted path: the server validates, hashes the canonical dossier and creates the KycCase.
              if (P) return;
              A(null), z(true);
              const s = await g(r.data);
              z(false);
              if (!s.ok) {
                A(s.error), window.scrollTo({ top: 0, behavior: "smooth" });
                return;
              }
              i((c) => ({
                ...c,
                stage: "status",
                status: s.kyc.status,
                reason: null,
                dossierHash: s.kyc.dossierHash,
                kycCaseId: s.kyc.kycCaseId,
                wallet: s.kyc.wallet,
                whitelistTx: null,
                whitelistQueued: false,
              }));
              return;
            }
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
          {tr("Pendiente")}
        </p>
        <p className="text-[15px] text-inkBody leading-[1.65]">
          {tr("Tus datos se encuentran en revisión por el Oficial de Cumplimiento de {name} (Auditoría estimada: 15 minutos).", {
            name: e.legalName,
          })}
        </p>
        <div className="border border-dashed border-[#C9C4D6] p-4 flex flex-wrap items-center gap-3 justify-between">
          <span className="text-[12.5px] text-muted">
            {g
              ? tr("Tu expediente quedó registrado en la bandeja de cumplimiento del desarrollador.")
              : tr("Simulación: la aprobación ocurre en el Backoffice aislado del desarrollador.")}
            {r.dossierHash && (
              <span className="block font-mono text-[11px] mt-1">
                {tr("SHA-256 del expediente")}{" "}
                {shortHash(r.dossierHash, 14, 8)}
              </span>
            )}
          </span>
          <button
            onClick={l}
            className="border border-line bg-white px-3.5 py-2 text-[12.5px] font-semibold text-rxBlue inline-flex items-center gap-1.5 focus-ring"
          >
            <Icon name="ArrowUpRight" size={14} />
            {tr("Abrir Bandeja de Cumplimiento")}
          </button>
        </div>
      </div>
    ) : r.status === "revocado" ? (
      // Revoked after approval: the investor is never told why (no tipping-off under SAGRILAFT/SARLAFT).
      <div className="flex flex-col gap-4 max-w-[760px]" data-kyc-revoked>
        <div className="border border-[#F3C5BF] bg-[#FDF6F5] p-4" role="status">
          <p className="text-[12px] font-semibold tracking-[0.06em] uppercase text-[#B42318]">
            {tr("Verificación revocada")}
            {" · "}
            {e.legalName}
          </p>
          <p className="text-[14px] text-inkBody leading-[1.6] mt-1.5">
            {tr(
              "El Oficial de Cumplimiento de {name} revocó tu verificación: no se reciben nuevas suscripciones y el acceso reservado del Data Room quedó cerrado. Para más información, comunícate directamente con el desarrollador.",
              { name: e.legalName },
            )}
          </p>
        </div>
      </div>
    ) : r.status === "rechazado" ? (
      <div className="flex flex-col gap-4 max-w-[760px]">
        <div className="border border-[#F3C5BF] bg-[#FDF6F5] p-4" role="alert">
          <p className="text-[12px] font-semibold tracking-[0.06em] uppercase text-[#B42318]">
            {tr("Motivo del rechazo")}
            {" · "}
            {e.legalName}
          </p>
          <p className="text-[14px] text-inkBody leading-[1.6] mt-1.5">{r.reason ? tr(r.reason) : r.reason}</p>
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
          {tr("Corregir documentación")}
        </button>
      </div>
    ) : (
      <div className="flex flex-col gap-3 max-w-[820px]">
        <p className="inline-flex items-center gap-2 text-aquaInk font-semibold text-[14px]">
          <Icon name="BadgeCheck" size={18} />
          {tr("Aprobado · Inversionista Elegible")}
        </p>
        <p className="text-[15px] text-inkBody leading-[1.65]">
          {rich(
            r.whitelistQueued
              ? "¡Verificación exitosa! Tu perfil ha sido aprobado por {name} y tu billetera está en cola para la Whitelist On-Chain ({wallet})."
              : "¡Verificación exitosa! Tu perfil ha sido aprobado por {name} y tu billetera ha sido vinculada a la Whitelist On-Chain ({wallet}).",
            { name: e.legalName, wallet: <span className="font-mono text-aquaInk">{r.wallet ? shortHash(r.wallet, 8, 6) : WALLET}</span> },
          )}
        </p>
        {r.whitelistQueued && (
          <p className="text-[12px] text-goldInk">
            {tr("ChainTransaction PENDING: approveInvestor() espera la firma del Oficial de Cumplimiento en RwaxiComplianceRegistry.")}
          </p>
        )}
        {r.whitelistTx && (
          <p className="text-[12px] text-muted">
            {tr("Transacción de whitelist:")}{" "}
            <span className="font-mono text-aquaInk">{shortHash(r.whitelistTx, 12, 8)}</span>
          </p>
        )}
      </div>
    )
  ) : (
    <LockedNote text={tr("Firma primero el NDA (Paso 1) para iniciar tu verificación.")} />
  );
}
