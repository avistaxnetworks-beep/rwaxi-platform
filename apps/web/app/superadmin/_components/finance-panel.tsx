"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { Modal } from "@/app/_components/ui/modal";
import { fieldCls } from "@/app/_components/ui/form";
import { nf } from "@/app/_lib/format";
import { platformFeePercent } from "@rwaxi/blockchain-sdk/platform-fee";
import { issueInvoice, recordInvoicePayment } from "../actions";
import type { FinanceInvoiceRow, FinanceTenantRow, PlatformFinanceReport } from "../_lib/finance";
import type { PlatformActionResult, PlatformMetricsResult } from "../_lib/types";

type Toast = (message: string) => void;
type Dialog =
  | { kind: "cycle"; tenant: FinanceTenantRow; cycle: string; entryIds: string[]; usd: number }
  | { kind: "payment"; invoice: FinanceInvoiceRow };

/** The invoice action takes at most this many entries (superadmin/actions.ts MAX_INVOICE_ENTRIES). */
const MAX_ENTRIES = 50;
const usd = (n: number) => `USD ${nf(2).format(n)}`;
const today = () => new Date().toISOString().slice(0, 10);
const label = "text-[11px] font-semibold tracking-[0.06em] uppercase text-muted";
const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const cycleLabel = (c: string) => `${MONTH[Number(c.slice(5, 7)) - 1]} ${c.slice(0, 4)}`;
const BUCKET: Record<FinanceInvoiceRow["bucket"], [string, string]> = {
  pagada: ["Pagada", "bg-aquaTint text-aquaInk"],
  "0-30": ["0–30 días", "bg-cloud text-inkBody"],
  "31-60": ["31–60 días", "bg-goldTint text-goldInk"],
  "61-90": ["61–90 días", "bg-goldTint text-goldInk"],
  "+90": ["+90 días", "bg-[#FDECEA] text-[#B42318]"],
};

/**
 * Module F · B2B fees per developer at its agreed basis points (and the ones fixed in each token), reconciled with what
 * each mint declared on-chain (PlatformFeeAccrued); monthly billing cycles ready to invoice and the invoices' tracking.
 * The investors' capital stays with the issuer's fiduciary vehicle: it appears only as the base of the platform fee.
 */
export function FinancePanel({ metrics, toast }: { metrics: PlatformMetricsResult; toast: Toast }) {
  if (!metrics.ok) return null; // the overview already shows the error
  return <FinanceView report={metrics.data.finance} canAct={!!metrics.data.admin} toast={toast} />;
}

function FinanceView({ report, canAct, toast }: { report: PlatformFinanceReport; canAct: boolean; toast: Toast }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [, startTransition] = useTransition();
  const cycles = report.cycles.slice(0, 6);
  const t = report.totals;

  const run = (action: () => Promise<PlatformActionResult>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await action();
      setBusy(false);
      if (result.ok) {
        setDialog(null);
        toast(result.message);
      } else setError(result.error);
    });
  };
  const openCycle = (tenant: FinanceTenantRow, cycle: string) => {
    const cell = report.matrix[cycle]?.[tenant.id];
    if (!cell?.accrued.entryIds.length) return;
    setDialog({ kind: "cycle", tenant, cycle, entryIds: cell.accrued.entryIds, usd: cell.accrued.usd });
    setForm({ number: `RWX-${tenant.slug.toUpperCase()}-${cycle.replace("-", "")}` });
    setError(null);
  };
  const exportCsv = async (cycle?: string) => {
    setExporting(true);
    setError(null);
    try {
      const r = await fetch(`/api/platform/finance?format=csv${cycle ? `&cycle=${cycle}` : ""}`, { cache: "no-store" });
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo exportar.");
      const sha = r.headers.get("x-content-sha256") ?? "";
      const rows = r.headers.get("x-report-rows") ?? "0";
      const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "comisiones-b2b-rwaxi.csv";
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`Libro de comisiones exportado · ${rows} asiento(s) · SHA-256 ${sha.slice(0, 18)}… (queda auditado)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      setExporting(false);
    }
  };
  const field = (key: string) => ({ value: form[key] ?? "", onChange: (ev: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: ev.target.value })) });

  return (
    <div className="flex flex-col gap-6" data-finance-panel>
      <div className="bg-white border border-line px-5 py-3.5 text-[12px] text-muted leading-relaxed flex gap-2">
        <Icon name="Database" size={15} className="text-rxGold mt-0.5 shrink-0" />
        <p>
          Ingresos B2B de RWAXI: setup, SaaS y la comisión de plataforma de cada emisión, facturados al desarrollador. El capital de los
          inversionistas lo recibe el vehículo fiduciario del emisor y nunca pasa por RWAXI: aquí aparece solo como <strong>base de cálculo</strong>{" "}
          de la comisión, separado de toda cifra de ingreso. La comisión de cada token queda fija en su contrato (platformFeeBps) y cada mint la
          declara on-chain (PlatformFeeAccrued).
        </p>
      </div>

      {!canAct && (
        <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
          No hay un usuario SUPER_ADMIN activo: la facturación está en solo lectura.
        </p>
      )}
      {error && !dialog && (
        <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-line border border-line">
        {(
          [
            ["accrued", "Devengado por facturar", usd(t.ACCRUED), `${usd(t.currentCycleAccruedUsd)} en el ciclo actual`],
            ["outstanding", "Facturado por cobrar", usd(t.outstandingUsd), `${report.invoices.filter((i) => !i.paidOn).length} factura(s) abierta(s)`],
            ["paid", "Cobrado", usd(t.PAID), `${report.invoices.filter((i) => i.paidOn).length} factura(s) pagada(s)`],
            ["voided", "Anulado", usd(t.VOIDED), "emisiones que no ocurrieron"],
            ["base", "Base fiduciaria (no es ingreso)", usd(t.fiduciaryBaseUsd), `capital de ${t.mints} emisión(es) en la fiducia del emisor`],
          ] as const
        ).map(([id, title, value, sub]) => (
          <div key={id} className={`p-4 min-w-0 ${id === "base" ? "bg-cloud" : "bg-white"}`} data-kpi={`finance-${id}`}>
            <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{title}</p>
            <p className={`font-mono text-[20px] tnum mt-1 break-words ${id === "base" ? "text-muted" : "text-rxPurple"}`}>{value}</p>
            <p className="text-[11px] text-muted mt-1 leading-snug">{sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-line overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Comisiones por desarrollador · puntos básicos vigentes</p>
          <button
            onClick={() => exportCsv()}
            disabled={exporting}
            data-finance-export
            className="border border-line px-3 py-1.5 text-[12px] font-semibold text-rxBlue inline-flex items-center gap-1.5 focus-ring disabled:opacity-50"
          >
            <Icon name={exporting ? "Loader2" : "Download"} size={13} className={exporting ? "spin" : ""} />
            Exportar libro de comisiones (CSV)
          </button>
        </div>
        <table className="w-full min-w-[1180px] text-[12px]">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
              <th className="font-semibold px-5 py-3">Desarrollador</th>
              <th className="font-semibold px-3 py-3">Comisión pactada</th>
              <th className="font-semibold px-3 py-3">Tokens (fija on-chain)</th>
              <th className="font-semibold px-3 py-3 text-right">Emisiones</th>
              <th className="font-semibold px-3 py-3 text-right">Base fiduciaria</th>
              <th className="font-semibold px-3 py-3 text-right">Comisión devengada</th>
              <th className="font-semibold px-3 py-3 text-right">Por facturar</th>
              <th className="font-semibold px-3 py-3 text-right">Por cobrar</th>
              <th className="font-semibold px-3 py-3 text-right">Cobrado</th>
              <th className="font-semibold px-5 py-3">Cotejo PlatformFeeAccrued</th>
            </tr>
          </thead>
          <tbody>
            {report.tenants.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-b-0 align-top" data-finance-tenant={r.slug}>
                <td className="px-5 py-2.5">
                  <p className="font-semibold text-inkBody">{r.name}</p>
                  <p className="text-[10.5px] text-muted">{r.portalStatus}</p>
                </td>
                <td className="px-3 py-2.5" data-agreed-bps={r.agreedBps}>
                  <p className="font-mono">{`${r.agreedBps} pb · ${platformFeePercent(r.agreedBps)}`}</p>
                  <p className="text-[10.5px] text-muted">{r.agreement ? `acuerdo ${r.agreement.reference} · ${r.agreement.signedOn}` : "sin acuerdo registrado"}</p>
                </td>
                <td className="px-3 py-2.5 text-[11px]">
                  {r.tokens.length === 0
                    ? "—"
                    : r.tokens.map((k) => (
                        <p key={k.offeringCode} className="font-mono">
                          {`${k.symbol} (${k.offeringCode}) · ${k.bps === null ? "sin fijar" : `${k.bps} pb`} · ${k.status}`}
                        </p>
                      ))}
                </td>
                <td className="px-3 py-2.5 text-right font-mono">{r.usage.mints}</td>
                <td className="px-3 py-2.5 text-right font-mono text-muted">{usd(r.usage.baseUsd)}</td>
                <td className="px-3 py-2.5 text-right font-mono" data-usage-fee={r.usage.feeUsd}>
                  <p>{usd(r.usage.feeUsd)}</p>
                  <p className="text-[10.5px] text-muted">{r.usage.effectiveBps === null ? "—" : `${nf(2).format(r.usage.effectiveBps)} pb efectivos`}</p>
                </td>
                <td className="px-3 py-2.5 text-right font-mono" data-accrued={r.totals.ACCRUED}>
                  {usd(r.totals.ACCRUED)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono">{usd(r.outstandingUsd)}</td>
                <td className="px-3 py-2.5 text-right font-mono">{usd(r.totals.PAID)}</td>
                <td className="px-5 py-2.5 text-[11px]" data-reconciliation={r.reconciliation.mismatched ? "mismatch" : "ok"}>
                  {r.reconciliation.mints === 0 ? (
                    <span className="text-muted">sin emisiones auditadas</span>
                  ) : (
                    <>
                      <p className={r.reconciliation.mismatched ? "text-[#B42318] font-semibold" : "text-aquaInk"}>
                        {r.reconciliation.mismatched
                          ? `${r.reconciliation.mismatched} mint(s) con otra tasa que el libro`
                          : `${r.reconciliation.matched}/${r.reconciliation.mints} mint(s) cuadran con el libro`}
                      </p>
                      <p className="text-muted">
                        {r.reconciliation.observedOnChain ? `${r.reconciliation.observedOnChain} leído(s) del recibo en red` : "declarado por el token (simulación)"}
                      </p>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-line overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-line">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Ciclos de facturación · mes de devengo</p>
          <p className="text-[11.5px] text-muted mt-0.5">
            Cada celda: lo devengado sin facturar del desarrollador en el ciclo, listo para su factura B2B; debajo, lo ya facturado y cobrado.
          </p>
        </div>
        {cycles.length === 0 ? (
          <p className="px-5 py-5 text-[12.5px] text-muted">Aún no hay asientos devengados.</p>
        ) : (
          <table className="w-full min-w-[900px] text-[12px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                <th className="font-semibold px-5 py-3">Desarrollador</th>
                {cycles.map((c) => (
                  <th key={c} className="font-semibold px-3 py-3 text-right">
                    {cycleLabel(c)}
                    <button
                      onClick={() => exportCsv(c)}
                      disabled={exporting}
                      className="ml-1.5 text-rxBlue normal-case tracking-normal font-semibold focus-ring disabled:opacity-50"
                      title={`Exportar el libro del ciclo ${c}`}
                    >
                      CSV
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.tenants.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-b-0 align-top">
                  <td className="px-5 py-2.5 font-semibold text-inkBody">{r.name}</td>
                  {cycles.map((c) => {
                    const cell = report.matrix[c]?.[r.id];
                    return (
                      <td key={c} className="px-3 py-2.5 text-right" data-cycle-cell={`${r.slug}:${c}`} data-accrued={cell?.accrued.usd ?? 0}>
                        {!cell ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <>
                            {cell.accrued.usd > 0 ? (
                              <>
                                <p className="font-mono text-inkBody">{usd(cell.accrued.usd)}</p>
                                <button
                                  onClick={() => openCycle(r, c)}
                                  disabled={!canAct || busy}
                                  data-invoice-cycle={`${r.slug}:${c}`}
                                  className="text-[11px] font-semibold text-rxBlue focus-ring disabled:opacity-40"
                                >
                                  {`Facturar ciclo (${cell.accrued.entryIds.length})`}
                                </button>
                              </>
                            ) : (
                              <p className="text-[11px] text-aquaInk">sin pendientes</p>
                            )}
                            {(cell.invoicedUsd > 0 || cell.paidUsd > 0) && (
                              <p className="text-[10.5px] text-muted">{`facturado ${usd(cell.invoicedUsd)} · cobrado ${usd(cell.paidUsd)}`}</p>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white border border-line overflow-x-auto">
        <p className="px-5 py-3.5 border-b border-line font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Seguimiento de facturas B2B</p>
        {report.invoices.length === 0 ? (
          <p className="px-5 py-5 text-[12.5px] text-muted">Aún no hay facturas.</p>
        ) : (
          <table className="w-full min-w-[900px] text-[12px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                <th className="font-semibold px-5 py-3">Factura</th>
                <th className="font-semibold px-3 py-3">Desarrollador</th>
                <th className="font-semibold px-3 py-3">Emisión</th>
                <th className="font-semibold px-3 py-3 text-right">Total</th>
                <th className="font-semibold px-3 py-3 text-right">Asientos</th>
                <th className="font-semibold px-3 py-3">Antigüedad</th>
                <th className="font-semibold px-5 py-3">Pago</th>
              </tr>
            </thead>
            <tbody>
              {report.invoices.map((i) => {
                const [text, cls] = BUCKET[i.bucket];
                return (
                  <tr key={i.id} className="border-b border-line last:border-b-0" data-invoice-row={i.number} data-bucket={i.bucket}>
                    <td className="px-5 py-2.5 font-mono font-semibold text-rxPurple">{i.number}</td>
                    <td className="px-3 py-2.5">{i.tenant}</td>
                    <td className="px-3 py-2.5 font-mono">{i.issuedOn}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{usd(i.totalUsd)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{i.entries}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10.5px] font-semibold px-2 py-0.5 ${cls}`}>{text}</span>
                      <span className="text-[11px] text-muted ml-2">{`${i.ageDays} día(s)`}</span>
                    </td>
                    <td className="px-5 py-2.5 text-[11.5px]">
                      {i.paidOn ? (
                        <span className="text-aquaInk">{`${i.paidOn} · ${i.paymentReceipt ?? ""}`}</span>
                      ) : (
                        <button
                          onClick={() => {
                            setDialog({ kind: "payment", invoice: i });
                            setForm({ paidOn: today(), receipt: "" });
                            setError(null);
                          }}
                          disabled={!canAct || busy}
                          data-pay-invoice={i.number}
                          className="text-rxBlue font-semibold focus-ring disabled:opacity-40"
                        >
                          Registrar pago
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {dialog && (
        <Modal title={dialog.kind === "cycle" ? "Facturar ciclo" : "Registrar pago de factura"} onClose={() => setDialog(null)} wide={false}>
          <div className="flex flex-col gap-3 text-[12.5px]" data-finance-dialog={dialog.kind}>
            {dialog.kind === "cycle" ? (
              <>
                <p className="text-inkBody">
                  {`${dialog.tenant.name} · ciclo ${cycleLabel(dialog.cycle)} · ${dialog.entryIds.length} asiento(s) devengado(s) · ${usd(dialog.usd)}`}
                </p>
                {dialog.entryIds.length > MAX_ENTRIES && (
                  <p className="text-goldInk">{`Una factura agrupa hasta ${MAX_ENTRIES} asientos: se facturan los ${MAX_ENTRIES} más antiguos del ciclo; el resto queda para otra factura.`}</p>
                )}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="finance-invoice-number" className={label}>
                    Número de factura
                  </label>
                  <input id="finance-invoice-number" {...field("number")} className={fieldCls(false) + " font-mono"} />
                </div>
              </>
            ) : (
              <>
                <p className="text-inkBody">{`${dialog.invoice.number} · ${dialog.invoice.tenant} · ${usd(dialog.invoice.totalUsd)}`}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="finance-paid-on" className={label}>
                      Fecha de pago
                    </label>
                    <input id="finance-paid-on" type="date" max={today()} {...field("paidOn")} className={fieldCls(false) + " font-mono"} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="finance-receipt" className={label}>
                      Comprobante
                    </label>
                    <input id="finance-receipt" {...field("receipt")} placeholder="TRF-2026-…" className={fieldCls(false) + " font-mono"} />
                  </div>
                </div>
              </>
            )}
            <p className="text-[11.5px] text-muted">
              Se cobra al desarrollador fuera de la cadena (facturación B2B): ningún token transfiere valor a RWAXI. Queda en la auditoría.
            </p>
            {error && (
              <p role="alert" className="text-[#B42318]">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDialog(null)} className="border border-line px-3 py-2 text-[12.5px] font-semibold focus-ring">
                Cancelar
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  dialog.kind === "cycle"
                    ? run(() => issueInvoice(dialog.entryIds.slice(0, MAX_ENTRIES), form.number ?? ""))
                    : run(() => recordInvoicePayment(dialog.invoice.id, form.paidOn ?? "", form.receipt ?? ""))
                }
                className="tc-btn px-3 py-2 text-[12.5px] font-semibold inline-flex items-center gap-1.5 focus-ring disabled:opacity-50"
              >
                <Icon name={busy ? "Loader2" : "FileCheck"} size={13} className={busy ? "spin" : ""} />
                {dialog.kind === "cycle" ? "Emitir factura" : "Registrar pago"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
