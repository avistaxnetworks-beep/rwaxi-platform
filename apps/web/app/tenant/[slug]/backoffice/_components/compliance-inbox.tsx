"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { Modal } from "@/app/_components/ui/modal";
import { fieldCls } from "@/app/_components/ui/form";
import { INCOME, KYC_LABEL, REGIMES, REJECT_REASONS, RISK, incomeLabel } from "@/app/_lib/data/kyc";
import { onColor, shortHash } from "@/app/_lib/format";
import { useI18n } from "@/app/_i18n/provider";
import { approveInvestor, rejectInvestor } from "../actions";
import type { ComplianceInboxData, ComplianceInboxResult, ComplianceRow } from "../_lib/types";
import { AuditTrail, utc } from "./audit-trail";

type Currency = "COP" | "USD";
type Toast = (message: string) => void;

const brandVars = (color: string) => ({ "--tc": color, "--tc-on": onColor(color) }) as CSSProperties;

/** "Cumplimiento y Leads" tab, backed by Investor / KycCase through forTenant (RLS). */
export function ComplianceInbox({ inbox, currency, toast }: { inbox: ComplianceInboxResult; currency: Currency; toast: Toast }) {
  if (!inbox.ok) {
    return (
      <div role="alert" className="bg-white border border-[#F3C5C0] px-5 py-4 text-[13px] text-[#B42318] flex gap-2">
        <Icon name="AlertTriangle" size={16} className="mt-0.5 shrink-0" />
        <span>{inbox.error}</span>
      </div>
    );
  }
  return <InboxView data={inbox.data} currency={currency} toast={toast} />;
}

function InboxView({ data, currency, toast }: { data: ComplianceInboxData; currency: Currency; toast: Toast }) {
  const { tr } = useI18n();
  const { organization: org, rows, audit, reviewer } = data;
  const regime = REGIMES[org.regime];
  const [openId, setOpenId] = useState<string | null>(null);
  const [reasonIdx, setReasonIdx] = useState(0);
  const [busy, setBusy] = useState<{ investorId: string; kind: "approve" | "reject" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const decide = (row: ComplianceRow, kind: "approve" | "reject") => {
    const kycCaseId = row.kycCaseId;
    if (!kycCaseId || busy) return;
    setError(null);
    setBusy({ investorId: row.investorId, kind });
    startTransition(async () => {
      const result = kind === "approve" ? await approveInvestor(kycCaseId) : await rejectInvestor(kycCaseId, reasonIdx);
      setBusy(null);
      if (result.ok) {
        setOpenId(null);
        toast(result.message);
      } else {
        setError(result.error);
      }
    });
  };

  const kpis: [string, number][] = [
    [tr("Leads totales"), rows.length],
    [tr("Referidos por RWAXI"), rows.filter((r) => r.source === "RWAXI").length],
    [tr("NDA firmados"), rows.filter((r) => r.nda).length],
    [tr("KYC pendientes"), rows.filter((r) => r.kyc === "pendiente").length],
    [tr("En whitelist"), rows.filter((r) => r.kyc === "aprobado").length],
  ];
  const open = openId ? rows.find((r) => r.investorId === openId) : undefined;
  const approving = (r: ComplianceRow) => busy?.investorId === r.investorId && busy.kind === "approve";

  const approveButton = (row: ComplianceRow, large = false) => (
    <button
      disabled={!!busy}
      onClick={() => decide(row, "approve")}
      className={`tc-btn font-semibold inline-flex items-center justify-center focus-ring disabled:opacity-60 ${
        large ? "text-[13px] py-3 gap-2" : "px-2.5 py-1.5 text-[11.5px] gap-1.5"
      }`}
    >
      <Icon name={approving(row) ? "Loader2" : "BadgeCheck"} size={large ? 15 : 13} className={approving(row) ? "spin" : ""} />
      {tr("Aprobar Inversionista y Añadir a Whitelist On-Chain")}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-line border border-line">
        {kpis.map(([label, value]) => (
          <div key={label} className="bg-white p-4">
            <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{label}</p>
            <p className="font-mono text-[26px] text-rxPurple tnum mt-1">{value}</p>
          </div>
        ))}
      </div>

      {error && !open && (
        <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
          {error}
        </p>
      )}

      <div className="bg-white border border-line">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
            {tr("Bandeja de cumplimiento")}
            {" · "}
            {org.legalName}
          </p>
          <p className="text-[11.5px] text-muted inline-flex items-center gap-1.5">
            <Icon name="Database" size={13} className="tc-text" />
            {tr("PostgreSQL · RLS tnt_{slug} · sesión demo: {email}", { slug: org.slug, email: reviewer.email })}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                <th className="font-semibold px-5 py-3">{tr("Inversionista")}</th>
                <th className="font-semibold px-3 py-3">LeadReferral</th>
                <th className="font-semibold px-3 py-3">NDA</th>
                <th className="font-semibold px-3 py-3">{regime.short}</th>
                <th className="font-semibold px-3 py-3">{tr("Listas restrictivas")}</th>
                <th className="font-semibold px-5 py-3">{tr("Acciones")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.investorId} data-investor={r.investorId} className="border-b border-line last:border-b-0 align-top">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-rxPurple">{r.name}</p>
                    <p className="font-mono text-[11px] text-muted">
                      {r.doc}
                      {" · "}
                      {r.at}
                    </p>
                  </td>
                  <td className="px-3 py-3.5">
                    <p className={`text-[11px] font-semibold ${r.source === "RWAXI" ? "text-aquaInk" : "text-muted"}`}>
                      {r.source === "RWAXI" ? tr("Vitrina RWAXI") : tr("Directo")}
                    </p>
                    <p className="font-mono text-[10.5px] text-muted">{r.token ? r.token.slice(0, 16) + "…" : "—"}</p>
                  </td>
                  <td className="px-3 py-3.5">
                    {r.nda ? (
                      <span className="inline-flex items-center gap-1 text-aquaInk">
                        <Icon name="CheckCircle2" size={14} />
                        {tr("Firmado")}
                      </span>
                    ) : (
                      <span className="text-muted">{tr("Pendiente")}</span>
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    <span data-kyc={r.kyc} className={`text-[10.5px] font-semibold px-2 py-0.5 ${KYC_LABEL[r.kyc][1]}`}>
                      {tr(KYC_LABEL[r.kyc][0])}
                    </span>
                    {r.ptee && <p className="text-[10.5px] text-muted mt-1">{tr("PTEE aceptado")}</p>}
                    {r.whitelist?.status === "PENDING" && (
                      <p className="text-[10.5px] text-goldInk mt-1">{tr("Whitelist on-chain en cola")}</p>
                    )}
                  </td>
                  <td
                    className={`px-3 py-3.5 text-[11.5px] ${/revisar/.test(r.lists) ? "text-goldInk font-semibold" : "text-inkBody"}`}
                  >
                    {tr(r.lists)}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={r.kyc === "no_iniciado"}
                        onClick={() => {
                          setOpenId(r.investorId);
                          setReasonIdx(0);
                          setError(null);
                        }}
                        className="border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-rxBlue disabled:opacity-40 focus-ring"
                      >
                        {tr("Revisar formulario")}
                      </button>
                      {r.kyc === "pendiente" && approveButton(r)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AuditTrail entries={audit} />

      {open && (
        <Modal title={tr("Formulario {regime} · {name}", { regime: regime.short, name: open.name })} onClose={() => setOpenId(null)} wide={true}>
          <div style={brandVars(org.brandColor)} className="flex flex-col gap-4">
            <dl className="grid sm:grid-cols-2 gap-px bg-line border border-line text-[12.5px]">
              {(
                [
                  [tr("Documento"), open.doc],
                  [tr("Origen"), open.source === "RWAXI" && open.token ? `LeadReferral ${open.token.slice(0, 16)}…` : tr("Directo")],
                  [tr("Actividad económica"), open.activity ? tr(open.activity) : "—"],
                  [
                    tr("Ingresos anuales"),
                    open.incomeBracket === null
                      ? "—"
                      : incomeLabel(INCOME[open.incomeBracket] as [number | null, number | null], currency, tr),
                  ],
                  [tr("Perfil de riesgo"), tr(String((RISK.find((x) => x[0] === open.risk) ?? [null, "—"])[1]))],
                  [
                    tr("Declaración PEP"),
                    open.kyc === "no_iniciado" ? "—" : open.isPep ? tr("Persona Expuesta Políticamente") : tr("No es PEP"),
                  ],
                  ["PTEE", open.ptee ? tr("Aceptado") : "—"],
                  [tr("Listas restrictivas"), tr(open.lists)],
                  [tr("Wallet declarada"), open.wallet ? shortHash(open.wallet, 10, 8) : "—"],
                  [tr("SHA-256 del expediente"), open.dossierHash ? shortHash(open.dossierHash, 14, 8) : "—"],
                  [tr("Prueba de vida"), open.liveness ?? "—"],
                  [tr("Estado"), tr(KYC_LABEL[open.kyc][0])],
                  [tr("Revisado por"), open.reviewedBy && open.reviewedAt ? `${open.reviewedBy} · ${utc(open.reviewedAt)}` : "—"],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label} className="bg-white px-4 py-2.5">
                  <dt className="text-[10.5px] font-semibold tracking-[0.06em] uppercase text-muted">{label}</dt>
                  <dd className="text-inkBody mt-0.5 break-words">{value}</dd>
                </div>
              ))}
            </dl>
            {open.documents.length > 0 && (
              <div className="border border-line">
                <p className="px-4 py-2 border-b border-line bg-cloud font-mono text-[10.5px] tracking-[0.12em] text-muted uppercase">
                  {tr("Documentos del expediente · SHA-256 calculado en el navegador del inversionista")}
                </p>
                <ul>
                  {open.documents.map((doc) => (
                    <li
                      key={doc.kind + doc.sha256}
                      className="px-4 py-2 border-b border-line last:border-b-0 text-[12px] flex flex-wrap justify-between gap-2"
                    >
                      <span className="text-inkBody">
                        {doc.kind === "front" ? `${tr("Frente")} · ` : doc.kind === "back" ? `${tr("Reverso")} · ` : ""}
                        {doc.name}
                      </span>
                      <span className="font-mono text-[11px] text-muted">{shortHash(doc.sha256, 14, 8)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {open.rejectionReason && (
              <p className="text-[12px] text-[#B42318]">
                {tr("Motivo del rechazo:")}{" "}
                {tr(open.rejectionReason)}
              </p>
            )}
            {open.whitelist?.txHash && (
              <p className="text-[12px] text-muted">
                {tr("Tx whitelist:")}{" "}
                <span className="font-mono text-aquaInk">{shortHash(open.whitelist.txHash, 14, 8)}</span>
              </p>
            )}
            {open.whitelist?.status === "PENDING" && (
              <p className="text-[12px] text-goldInk">
                {tr(
                  "Whitelist on-chain en cola: ChainTransaction PENDING, a la espera de la firma del Oficial de Cumplimiento en RwaxiComplianceRegistry.approveInvestor().",
                )}
              </p>
            )}
            {error && (
              <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
                {error}
              </p>
            )}
            {open.kyc === "pendiente" && (
              <div className="flex flex-col gap-3 border-t border-line pt-4">
                {approveButton(open, true)}
                <div className="flex flex-col sm:flex-row gap-2">
                  <label htmlFor="rej-reason" className="sr-only">
                    {tr("Motivo del rechazo")}
                  </label>
                  <select
                    id="rej-reason"
                    value={reasonIdx}
                    onChange={(ev) => setReasonIdx(Number(ev.target.value))}
                    className={fieldCls(false) + " text-[12.5px]"}
                  >
                    {(REJECT_REASONS as string[]).map((reason, i) => (
                      <option key={i} value={i}>
                        {tr(reason).slice(0, 80)}…
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!!busy}
                    onClick={() => decide(open, "reject")}
                    className="shrink-0 border border-[#B42318] text-[#B42318] px-4 py-2.5 text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 focus-ring disabled:opacity-60"
                  >
                    {busy?.kind === "reject" && <Icon name="Loader2" size={13} className="spin" />}
                    {tr("Rechazar con motivo")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
