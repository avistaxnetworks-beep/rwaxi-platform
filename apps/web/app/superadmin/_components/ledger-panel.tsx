"use client";

import { useMemo, useState, useTransition } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { Modal } from "@/app/_components/ui/modal";
import { fieldCls } from "@/app/_components/ui/form";
import { FEE_STATUS } from "@/app/_lib/data/fees";
import { money, pct, shortHash } from "@/app/_lib/format";
import { issueInvoice, recordInvoicePayment, updateFeeTerms } from "../actions";
import type {
  FeeKindKey,
  FeeStatusKey,
  InvoiceRow,
  PlatformActionResult,
  PlatformMetrics,
  PlatformMetricsResult,
  PlatformTenantRow,
} from "../_lib/types";

type Currency = "COP" | "USD";
type Toast = (message: string) => void;
type Dialog = { kind: "terms"; tenant: PlatformTenantRow } | { kind: "invoice" } | { kind: "payment"; invoice: InvoiceRow };

const KIND_LABEL: Record<FeeKindKey, string> = {
  ONBOARDING_SETUP: "Setup / Onboarding",
  MONTHLY_SAAS: "Suscripción SaaS mensual",
  INFRASTRUCTURE_USAGE: "Uso de infraestructura",
};
const KINDS = Object.keys(KIND_LABEL) as FeeKindKey[];
const STATUSES: FeeStatusKey[] = ["ACCRUED", "INVOICED", "PAID"];
const today = () => new Date().toISOString().slice(0, 10);
const label = "text-[11px] font-semibold tracking-[0.06em] uppercase text-muted";

/** Module C: RWAXI B2B fee ledger (FeeLedgerEntry), agreed fee terms and the invoice → payment cycle. */
export function PlatformLedger({ metrics, currency, toast }: { metrics: PlatformMetricsResult; currency: Currency; toast: Toast }) {
  if (!metrics.ok) return null; // PlatformOverview already shows the error
  return <LedgerView data={metrics.data} currency={currency} toast={toast} />;
}

function LedgerView({ data, currency, toast }: { data: PlatformMetrics; currency: Currency; toast: Toast }) {
  const { totals, tenants, ledger, invoices } = data;
  const [kind, setKind] = useState<"todos" | FeeKindKey>("todos");
  const [tenant, setTenant] = useState("todos");
  const [status, setStatus] = useState<"todos" | FeeStatusKey>("todos");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const canAct = !!data.admin;

  const rows = ledger.filter(
    (e) => (kind === "todos" || e.kind === kind) && (tenant === "todos" || e.tenant.slug === tenant) && (status === "todos" || e.status === status),
  );
  const chosen = useMemo(() => ledger.filter((e) => selected.has(e.id)), [ledger, selected]);
  const chosenOrgs = new Set(chosen.map((e) => e.organizationId));
  const chosenTotal = chosen.reduce((s, e) => s + e.amountUsd, 0);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const openDialog = (d: Dialog, initial: Record<string, string>) => {
    setDialog(d);
    setForm(initial);
    setError(null);
  };
  const run = (action: () => Promise<PlatformActionResult>, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await action();
      setBusy(false);
      if (result.ok) {
        setDialog(null);
        after?.();
        toast(result.message);
      } else setError(result.error);
    });
  };
  const submit = () => {
    if (!dialog) return;
    if (dialog.kind === "terms") {
      run(() => updateFeeTerms(dialog.tenant.id, { setupUsd: form.setup, monthlyUsd: form.monthly, usagePct: form.usage }));
    } else if (dialog.kind === "invoice") {
      run(
        () => issueInvoice([...selected], form.number ?? ""),
        () => setSelected(new Set()),
      );
    } else {
      run(() => recordInvoicePayment(dialog.invoice.id, form.paidOn ?? "", form.receipt ?? ""));
    }
  };
  const field = (key: string) => ({ value: form[key] ?? "", onChange: (ev: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: ev.target.value })) });

  return (
    <div className="flex flex-col gap-6" data-platform-ledger>
      {!canAct && (
        <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
          No hay un usuario SUPER_ADMIN activo: la facturación y las tarifas están en solo lectura.
        </p>
      )}
      {error && !dialog && (
        <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
          {error}
        </p>
      )}

      <div className="bg-white border border-line overflow-x-auto">
        <table className="w-full min-w-[720px] text-[12.5px] tnum">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
              <th className="font-semibold px-5 py-3">Tipo de comisión</th>
              {STATUSES.map((s) => (
                <th key={s} className="font-semibold px-3 py-3 text-right">
                  {FEE_STATUS[s][2]}
                </th>
              ))}
              <th className="font-semibold px-5 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {KINDS.map((k) => (
              <tr key={k} data-fee-kind={k} data-total={totals.fees[k].total} className="border-b border-line">
                <td className="px-5 py-3">
                  <p className="font-semibold text-rxPurple">{KIND_LABEL[k]}</p>
                  <p className="font-mono text-[10.5px] text-muted">{k}</p>
                </td>
                {STATUSES.map((s) => (
                  <td key={s} className="px-3 py-3 text-right font-mono">
                    {money(totals.fees[k][s], currency, false)}
                  </td>
                ))}
                <td className="px-5 py-3 text-right font-mono font-semibold">{money(totals.fees[k].total, currency, false)}</td>
              </tr>
            ))}
            <tr className="bg-cloud" data-fee-totals={JSON.stringify(totals.feesAll)}>
              <td className="px-5 py-3 font-semibold">Total RWAXI</td>
              {STATUSES.map((s) => (
                <td key={s} className="px-3 py-3 text-right font-mono">
                  {money(totals.feesAll[s], currency, false)}
                </td>
              ))}
              <td className="px-5 py-3 text-right font-mono font-semibold">{money(totals.feesAll.total, currency, false)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-line overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-2">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Tarifas pactadas por tenant · Organization</p>
          <p className="text-[11.5px] text-muted">Un cambio aplica a los próximos devengos; los asientos existentes no cambian.</p>
        </div>
        <table className="w-full min-w-[720px] text-[12.5px] tnum">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
              <th className="font-semibold px-5 py-3">Desarrollador</th>
              <th className="font-semibold px-3 py-3 text-right">Setup</th>
              <th className="font-semibold px-3 py-3 text-right">SaaS mensual</th>
              <th className="font-semibold px-3 py-3 text-right">Uso de infraestructura</th>
              <th className="font-semibold px-5 py-3">
                <span className="sr-only">Editar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.slug} data-fee-terms={t.slug} className="border-b border-line last:border-b-0">
                <td className="px-5 py-3">{t.legalName}</td>
                <td className="px-3 py-3 text-right font-mono">{money(t.feeRules.setupUsd, currency, false)}</td>
                <td className="px-3 py-3 text-right font-mono">{money(t.feeRules.monthlyUsd, currency, false)}</td>
                <td className="px-3 py-3 text-right font-mono">{`${pct(t.feeRules.usagePct, 2)} del capital emitido`}</td>
                <td className="px-5 py-3 text-right">
                  <button
                    disabled={!canAct}
                    onClick={() =>
                      openDialog(
                        { kind: "terms", tenant: t },
                        { setup: String(t.feeRules.setupUsd), monthly: String(t.feeRules.monthlyUsd), usage: String(t.feeRules.usagePct) },
                      )
                    }
                    className="text-rxBlue font-semibold text-[12px] inline-flex items-center gap-1 focus-ring disabled:opacity-40"
                  >
                    <Icon name="Settings2" size={13} />
                    Editar tarifas
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-line overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap items-center gap-2">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase mr-auto">Libro mayor · FeeLedgerEntry</p>
          <select aria-label="Tipo de comisión" value={kind} onChange={(ev) => setKind(ev.target.value as "todos" | FeeKindKey)} className="border border-line bg-white px-2 py-1.5 text-[12px] focus-ring">
            <option value="todos">Todos los tipos</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <select aria-label="Estado" value={status} onChange={(ev) => setStatus(ev.target.value as "todos" | FeeStatusKey)} className="border border-line bg-white px-2 py-1.5 text-[12px] focus-ring">
            <option value="todos">Todos los estados</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {FEE_STATUS[s][2]}
              </option>
            ))}
          </select>
          <select aria-label="Tenant" value={tenant} onChange={(ev) => setTenant(ev.target.value)} className="border border-line bg-white px-2 py-1.5 text-[12px] focus-ring">
            <option value="todos">Todos los tenants</option>
            {tenants.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.displayName}
              </option>
            ))}
          </select>
          <button
            disabled={!canAct || chosen.length === 0 || chosenOrgs.size !== 1}
            onClick={() => openDialog({ kind: "invoice" }, { number: "" })}
            className="tc-btn px-3 py-1.5 text-[12px] font-semibold inline-flex items-center gap-1.5 focus-ring disabled:opacity-40"
          >
            <Icon name="FileText" size={13} />
            {`Facturar seleccionadas (${chosen.length})`}
          </button>
        </div>
        {chosenOrgs.size > 1 && (
          <p className="px-5 py-2 text-[11.5px] text-[#B42318] border-b border-line">Una factura agrupa asientos de un solo desarrollador.</p>
        )}
        <table className="w-full min-w-[1040px] text-[12.5px] tnum">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
              <th className="font-semibold pl-5 pr-2 py-3">
                <span className="sr-only">Seleccionar</span>
              </th>
              <th className="font-semibold px-3 py-3">Fecha</th>
              <th className="font-semibold px-3 py-3">Tenant</th>
              <th className="font-semibold px-3 py-3">Tipo</th>
              <th className="font-semibold px-3 py-3 text-right">Base</th>
              <th className="font-semibold px-3 py-3 text-right">Importe</th>
              <th className="font-semibold px-3 py-3">Estado · factura</th>
              <th className="font-semibold px-5 py-3">Evidencia</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} data-ledger-row={e.kind} data-entry-id={e.id} data-entry-status={e.status} className="border-b border-line last:border-b-0 align-top">
                <td className="pl-5 pr-2 py-3">
                  {e.status === "ACCRUED" && (
                    <input
                      type="checkbox"
                      data-select-entry={e.id}
                      aria-label={`Seleccionar asiento ${e.period ?? e.accruedOn} de ${e.tenant.displayName}`}
                      checked={selected.has(e.id)}
                      disabled={!canAct}
                      onChange={() => toggle(e.id)}
                      className="mt-0.5"
                    />
                  )}
                </td>
                <td className="px-3 py-3 font-mono text-[11.5px]">{e.period ?? e.accruedOn}</td>
                <td className="px-3 py-3">{e.tenant.displayName}</td>
                <td className="px-3 py-3">
                  <p>{KIND_LABEL[e.kind]}</p>
                  <p className="font-mono text-[10px] text-muted">{e.kind}</p>
                </td>
                <td className="px-3 py-3 text-right font-mono">{e.baseUsd === null ? "—" : money(e.baseUsd, currency, false)}</td>
                <td className="px-3 py-3 text-right font-mono font-semibold">{money(e.amountUsd, currency, false)}</td>
                <td className="px-3 py-3">
                  <span className={`text-[10.5px] font-semibold px-2 py-0.5 ${FEE_STATUS[e.status][1]}`}>{FEE_STATUS[e.status][2]}</span>
                  {e.invoice && <p className="font-mono text-[10.5px] text-muted mt-1">{e.invoice.number}</p>}
                </td>
                <td className="px-5 py-3 font-mono text-[10.5px] text-muted break-all max-w-[300px]">
                  {/^0x[0-9a-f]{64}$/i.test(e.evidence) ? shortHash(e.evidence, 12, 8) : e.evidence}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="px-5 py-6 text-center text-muted">
                  Sin asientos para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-line overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-2">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Facturas RWAXI · FeeInvoice</p>
          <p className="text-[11.5px] text-muted">Registrar el pago (fecha y comprobante) marca sus asientos como pagados.</p>
        </div>
        <table className="w-full min-w-[900px] text-[12.5px] tnum">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
              <th className="font-semibold px-5 py-3">Factura</th>
              <th className="font-semibold px-3 py-3">Tenant</th>
              <th className="font-semibold px-3 py-3">Emitida</th>
              <th className="font-semibold px-3 py-3 text-right">Asientos</th>
              <th className="font-semibold px-3 py-3 text-right">Total</th>
              <th className="font-semibold px-3 py-3">Estado</th>
              <th className="font-semibold px-5 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id} data-invoice={i.number} data-invoice-status={i.paidOn ? "PAID" : "INVOICED"} className="border-b border-line last:border-b-0 align-top">
                <td className="px-5 py-3 font-mono text-[11.5px] text-rxPurple">{i.number}</td>
                <td className="px-3 py-3">{i.tenant.displayName}</td>
                <td className="px-3 py-3 font-mono text-[11.5px]">{i.issuedOn}</td>
                <td className="px-3 py-3 text-right font-mono">{i.entries}</td>
                <td className="px-3 py-3 text-right font-mono font-semibold">{money(i.totalUsd, currency, false)}</td>
                <td className="px-3 py-3">
                  <span className={`text-[10.5px] font-semibold px-2 py-0.5 ${FEE_STATUS[i.paidOn ? "PAID" : "INVOICED"][1]}`}>
                    {FEE_STATUS[i.paidOn ? "PAID" : "INVOICED"][2]}
                  </span>
                  {i.paidOn && <p className="font-mono text-[10.5px] text-muted mt-1">{`${i.paidOn} · ${i.paymentReceipt}`}</p>}
                </td>
                <td className="px-5 py-3 text-right">
                  {!i.paidOn && (
                    <button
                      disabled={!canAct}
                      onClick={() => openDialog({ kind: "payment", invoice: i }, { paidOn: today(), receipt: "" })}
                      className="text-rxBlue font-semibold text-[12px] inline-flex items-center gap-1 focus-ring disabled:opacity-40"
                    >
                      <Icon name="BadgeCheck" size={13} />
                      Registrar pago
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!invoices.length && (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-muted">
                  Aún no hay facturas emitidas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {dialog && (
        <Modal
          title={
            dialog.kind === "terms"
              ? `Tarifas pactadas · ${dialog.tenant.displayName}`
              : dialog.kind === "invoice"
                ? "Emitir factura RWAXI"
                : `Registrar pago · ${dialog.invoice.number}`
          }
          onClose={() => !busy && setDialog(null)}
          wide={true}
        >
          <div className="flex flex-col gap-4" data-billing-dialog={dialog.kind}>
            {dialog.kind === "terms" && (
              <>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="fee-setup" className={label}>
                      Setup (USD)
                    </label>
                    <input id="fee-setup" inputMode="decimal" {...field("setup")} className={fieldCls(false) + " font-mono"} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="fee-monthly" className={label}>
                      SaaS mensual (USD)
                    </label>
                    <input id="fee-monthly" inputMode="decimal" {...field("monthly")} className={fieldCls(false) + " font-mono"} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="fee-usage" className={label}>
                      Uso de infraestructura (%)
                    </label>
                    <input id="fee-usage" inputMode="decimal" {...field("usage")} className={fieldCls(false) + " font-mono"} />
                  </div>
                </div>
                <p className="text-[12px] text-muted leading-relaxed">
                  El % de uso se aplica al capital de cada suscripción al conciliar su pago fiduciario; el SaaS mensual y el setup, a los
                  próximos devengos. Rango del % de uso: 0 a 10.
                </p>
              </>
            )}
            {dialog.kind === "invoice" && (
              <>
                <dl className="grid sm:grid-cols-3 gap-px bg-line border border-line text-[12.5px]">
                  {(
                    [
                      ["Desarrollador", chosen[0]?.tenant.legalName ?? "—"],
                      ["Asientos", String(chosen.length)],
                      ["Total", money(chosenTotal, "USD", false)],
                    ] as [string, string][]
                  ).map(([k, v]) => (
                    <div key={k} className="bg-white px-4 py-2.5">
                      <dt className="text-[10.5px] font-semibold tracking-[0.06em] uppercase text-muted">{k}</dt>
                      <dd className="text-inkBody mt-0.5 font-mono text-[12px]">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="invoice-number" className={label}>
                    Número / referencia de la factura
                  </label>
                  <input id="invoice-number" placeholder="p. ej. RWX-AVI-2026-0101" maxLength={40} autoComplete="off" {...field("number")} className={fieldCls(false) + " font-mono"} />
                </div>
              </>
            )}
            {dialog.kind === "payment" && (
              <>
                <p className="text-[12.5px] text-inkBody">{`${dialog.invoice.tenant.legalName} · ${dialog.invoice.entries} asiento(s) · ${money(dialog.invoice.totalUsd, "USD", false)} · emitida ${dialog.invoice.issuedOn}`}</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="pay-date" className={label}>
                      Fecha del pago
                    </label>
                    <input id="pay-date" type="date" min={dialog.invoice.issuedOn} max={today()} {...field("paidOn")} className={fieldCls(false) + " font-mono"} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="pay-receipt" className={label}>
                      Comprobante de pago
                    </label>
                    <input id="pay-receipt" placeholder="p. ej. TRF-2026-10-0042" maxLength={64} autoComplete="off" {...field("receipt")} className={fieldCls(false) + " font-mono"} />
                  </div>
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setDialog(null)}
                disabled={busy}
                className="border border-line px-4 py-2.5 text-[12.5px] font-semibold text-inkBody focus-ring disabled:opacity-50"
              >
                Cancelar
              </button>
              <button onClick={submit} disabled={busy} className="tc-btn px-4 py-2.5 text-[12.5px] font-semibold inline-flex items-center gap-2 focus-ring disabled:opacity-50">
                {busy && <Icon name="Loader2" size={14} className="spin" />}
                {dialog.kind === "terms" ? "Guardar tarifas" : dialog.kind === "invoice" ? "Emitir factura" : "Registrar pago"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
