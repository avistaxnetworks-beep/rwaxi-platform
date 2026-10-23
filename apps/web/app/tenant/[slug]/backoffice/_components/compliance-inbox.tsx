"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { Modal } from "@/app/_components/ui/modal";
import { fieldCls } from "@/app/_components/ui/form";
import { INCOME, KYC_LABEL, REGIMES, REJECT_REASONS, RISK, incomeLabel } from "@/app/_lib/data/kyc";
import { onColor, shortHash } from "@/app/_lib/format";
import { approveInvestor, rejectInvestor } from "../actions";
import type { AuditEntry, ComplianceInboxData, ComplianceInboxResult, ComplianceRow } from "../_lib/types";

type Currency = "COP" | "USD";
type Toast = (message: string) => void;

const brandVars = (color: string) => ({ "--tc": color, "--tc-on": onColor(color) }) as CSSProperties;
const utc = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;

const AUDIT_LABEL: Record<AuditEntry["action"], string> = {
  KYC_APPROVED: "KYC aprobado",
  KYC_REJECTED: "KYC rechazado",
};

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
    ["Leads totales", rows.length],
    ["Referidos por RWAXI", rows.filter((r) => r.source === "RWAXI").length],
    ["NDA firmados", rows.filter((r) => r.nda).length],
    ["KYC pendientes", rows.filter((r) => r.kyc === "pendiente").length],
    ["En whitelist", rows.filter((r) => r.kyc === "aprobado").length],
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
      Aprobar Inversionista y Añadir a Whitelist On-Chain
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
            {"Bandeja de cumplimiento · "}
            {org.legalName}
          </p>
          <p className="text-[11.5px] text-muted inline-flex items-center gap-1.5">
            <Icon name="Database" size={13} className="tc-text" />
            {`PostgreSQL · RLS tnt_${org.slug} · sesión demo: ${reviewer.email}`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                <th className="font-semibold px-5 py-3">Inversionista</th>
                <th className="font-semibold px-3 py-3">LeadReferral</th>
                <th className="font-semibold px-3 py-3">NDA</th>
                <th className="font-semibold px-3 py-3">{regime.short}</th>
                <th className="font-semibold px-3 py-3">Listas restrictivas</th>
                <th className="font-semibold px-5 py-3">Acciones</th>
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
                      {r.source === "RWAXI" ? "Vitrina RWAXI" : "Directo"}
                    </p>
                    <p className="font-mono text-[10.5px] text-muted">{r.token ? r.token.slice(0, 16) + "…" : "—"}</p>
                  </td>
                  <td className="px-3 py-3.5">
                    {r.nda ? (
                      <span className="inline-flex items-center gap-1 text-aquaInk">
                        <Icon name="CheckCircle2" size={14} />
                        Firmado
                      </span>
                    ) : (
                      <span className="text-muted">Pendiente</span>
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    <span data-kyc={r.kyc} className={`text-[10.5px] font-semibold px-2 py-0.5 ${KYC_LABEL[r.kyc][1]}`}>
                      {KYC_LABEL[r.kyc][0]}
                    </span>
                    {r.ptee && <p className="text-[10.5px] text-muted mt-1">PTEE aceptado</p>}
                    {r.whitelist?.status === "PENDING" && (
                      <p className="text-[10.5px] text-goldInk mt-1">Whitelist on-chain en cola</p>
                    )}
                  </td>
                  <td
                    className={`px-3 py-3.5 text-[11.5px] ${/revisar/.test(r.lists) ? "text-goldInk font-semibold" : "text-inkBody"}`}
                  >
                    {r.lists}
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
                        Revisar formulario
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
        <Modal title={`Formulario ${regime.short} · ${open.name}`} onClose={() => setOpenId(null)} wide={true}>
          <div style={brandVars(org.brandColor)} className="flex flex-col gap-4">
            <dl className="grid sm:grid-cols-2 gap-px bg-line border border-line text-[12.5px]">
              {(
                [
                  ["Documento", open.doc],
                  ["Origen", open.source === "RWAXI" && open.token ? `LeadReferral ${open.token.slice(0, 16)}…` : "Directo"],
                  ["Actividad económica", open.activity || "—"],
                  [
                    "Ingresos anuales",
                    open.incomeBracket === null
                      ? "—"
                      : incomeLabel(INCOME[open.incomeBracket] as [number | null, number | null], currency),
                  ],
                  ["Perfil de riesgo", (RISK.find((x) => x[0] === open.risk) ?? [null, "—"])[1]],
                  ["Declaración PEP", open.kyc === "no_iniciado" ? "—" : open.isPep ? "Persona Expuesta Políticamente" : "No es PEP"],
                  ["PTEE", open.ptee ? "Aceptado" : "—"],
                  ["Listas restrictivas", open.lists],
                  ["Wallet declarada", open.wallet ? shortHash(open.wallet, 10, 8) : "—"],
                  ["SHA-256 del expediente", open.dossierHash ? shortHash(open.dossierHash, 14, 8) : "—"],
                  ["Prueba de vida", open.liveness ?? "—"],
                  ["Estado", KYC_LABEL[open.kyc][0]],
                  ["Revisado por", open.reviewedBy && open.reviewedAt ? `${open.reviewedBy} · ${utc(open.reviewedAt)}` : "—"],
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
                  Documentos del expediente · SHA-256 calculado en el navegador del inversionista
                </p>
                <ul>
                  {open.documents.map((doc) => (
                    <li
                      key={doc.kind + doc.sha256}
                      className="px-4 py-2 border-b border-line last:border-b-0 text-[12px] flex flex-wrap justify-between gap-2"
                    >
                      <span className="text-inkBody">
                        {doc.kind === "front" ? "Frente · " : doc.kind === "back" ? "Reverso · " : ""}
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
                {"Motivo del rechazo: "}
                {open.rejectionReason}
              </p>
            )}
            {open.whitelist?.txHash && (
              <p className="text-[12px] text-muted">
                {"Tx whitelist: "}
                <span className="font-mono text-aquaInk">{shortHash(open.whitelist.txHash, 14, 8)}</span>
              </p>
            )}
            {open.whitelist?.status === "PENDING" && (
              <p className="text-[12px] text-goldInk">
                Whitelist on-chain en cola: ChainTransaction PENDING, a la espera de la firma del Oficial de Cumplimiento
                en RwaxiComplianceRegistry.approveInvestor().
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
                    Motivo del rechazo
                  </label>
                  <select
                    id="rej-reason"
                    value={reasonIdx}
                    onChange={(ev) => setReasonIdx(Number(ev.target.value))}
                    className={fieldCls(false) + " text-[12.5px]"}
                  >
                    {(REJECT_REASONS as string[]).map((reason, i) => (
                      <option key={i} value={i}>
                        {reason.slice(0, 80)}…
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!!busy}
                    onClick={() => decide(open, "reject")}
                    className="shrink-0 border border-[#B42318] text-[#B42318] px-4 py-2.5 text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 focus-ring disabled:opacity-60"
                  >
                    {busy?.kind === "reject" && <Icon name="Loader2" size={13} className="spin" />}
                    Rechazar con motivo
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

function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="bg-white border border-line">
      <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Registro de auditoría · append-only</p>
        <p className="text-[11.5px] text-muted">AuditEvent · sin edición ni borrado</p>
      </div>
      {entries.length === 0 ? (
        <p className="px-5 py-4 text-[12.5px] text-muted">Aún no hay decisiones registradas para este tenant.</p>
      ) : (
        <ul>
          {entries.map((e) => (
            <li key={e.id} data-audit={e.action} className="px-5 py-3 border-b border-line last:border-b-0 text-[12.5px]">
              <p className="font-mono text-[11px] text-muted">
                {utc(e.at)}
                {" · "}
                <span className={e.action === "KYC_APPROVED" ? "text-aquaInk" : "text-[#B42318]"}>{AUDIT_LABEL[e.action]}</span>
              </p>
              <p className="text-inkBody mt-0.5">
                {e.investorName}
                <span className="text-muted">{` · por ${e.actorEmail}`}</span>
              </p>
              <p className="font-mono text-[10.5px] text-muted mt-0.5 break-words">
                {`SHA-256 expediente ${e.subjectHash ? shortHash(e.subjectHash, 14, 8) : "—"}`}
                {e.detail && ` · ${e.detail}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
