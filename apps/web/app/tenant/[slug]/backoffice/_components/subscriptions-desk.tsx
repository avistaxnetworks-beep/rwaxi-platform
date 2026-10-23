"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { Modal } from "@/app/_components/ui/modal";
import { fieldCls } from "@/app/_components/ui/form";
import { money, onColor, shortHash } from "@/app/_lib/format";
import type { ChainQueueItem } from "@/app/_lib/chain-queue-types";
import { executeChainTransaction, processChainQueue, registerOfficerTransaction } from "../chain-actions";
import { confirmPayment } from "../payment-actions";
import type { SubscriptionRow, SubscriptionsDeskData, SubscriptionsDeskResult } from "../_lib/types";
import { AuditTrail, utc } from "./audit-trail";

type Currency = "COP" | "USD";
type Toast = (message: string) => void;
type Busy = { id: string; kind: "pay" | "exec" | "queue" } | null;

const brandVars = (color: string) => ({ "--tc": color, "--tc-on": onColor(color) }) as CSSProperties;
const hash = (h: string) => shortHash(h, 12, 6);
const REGISTRY_KINDS = new Set(["INVESTOR_WHITELISTED", "INVESTOR_REVOKED", "INVESTOR_FREEZE_UPDATED"]);

const STATUS: Record<SubscriptionRow["status"], [string, string]> = {
  RESERVED: ["Reserva pre-venta", "bg-cloud text-muted"],
  PAYMENT_PENDING: ["Pago pendiente", "bg-goldTint text-goldInk"],
  MINT_PENDING: ["Mint en cola", "bg-[#E8F0FA] text-rxBlue"],
  MINTED: ["En wallet", "bg-aquaTint text-aquaInk"],
  CANCELLED: ["Cancelada", "bg-cloud text-muted"],
};

/** "Suscripciones y Pagos" tab: fiduciary reconciliation and ordered execution of the outbox. */
export function SubscriptionsDesk({ desk, currency, toast }: { desk: SubscriptionsDeskResult; currency: Currency; toast: Toast }) {
  if (!desk.ok) {
    return (
      <div role="alert" className="bg-white border border-[#F3C5C0] px-5 py-4 text-[13px] text-[#B42318] flex gap-2">
        <Icon name="AlertTriangle" size={16} className="mt-0.5 shrink-0" />
        <span>{desk.error}</span>
      </div>
    );
  }
  return <DeskView data={desk.data} currency={currency} toast={toast} />;
}

function DeskView({ data, currency, toast }: { data: SubscriptionsDeskData; currency: Currency; toast: Toast }) {
  const { organization: org, subscriptions: subs, queue, recent, execution } = data;
  const [payId, setPayId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ id: string; reason: string }[]>([]);
  const [, startTransition] = useTransition();

  const run = (next: NonNullable<Busy>, action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) => {
    if (busy) return;
    setError(null);
    setBusy(next);
    startTransition(async () => {
      const result = await action();
      setBusy(null);
      if (result.ok) {
        if (next.kind === "pay") setPayId(null);
        toast(result.message);
      } else {
        setError(result.error);
      }
    });
  };

  const pay = (row: SubscriptionRow) => run({ id: row.id, kind: "pay" }, () => confirmPayment(row.id, reference));
  const execute = (chainTxId: string) => run({ id: chainTxId, kind: "exec" }, () => executeChainTransaction(chainTxId));
  const registerHash = (chainTxId: string, txHash: string) =>
    run({ id: chainTxId, kind: "exec" }, () => registerOfficerTransaction(chainTxId, txHash));
  const processAll = () =>
    run({ id: "queue", kind: "queue" }, async () => {
      const result = await processChainQueue();
      setSkipped(result.ok ? result.skipped : []);
      return result;
    });

  const sum = (rows: SubscriptionRow[]) => rows.reduce((s, r) => s + r.capitalUsd, 0);
  const awaiting = subs.filter((s) => s.status === "PAYMENT_PENDING");
  const minting = subs.filter((s) => s.status === "MINT_PENDING");
  const minted = subs.filter((s) => s.status === "MINTED");
  const reserved = subs.filter((s) => s.status === "RESERVED");
  const kpis: [string, string, string, string][] = [
    ["payment-pending", "Pagos por conciliar", String(awaiting.length), money(sum(awaiting), currency, true)],
    ["mint-pending", "Mint en cola", String(minting.length), money(sum(minting), currency, true)],
    ["minted", "Emitidas en wallet", String(minted.length), `${minted.reduce((s, r) => s + r.units, 0)} unidades`],
    ["reserved", "Reservas pre-venta", String(reserved.length), money(sum(reserved), currency, true)],
    ["fee", "Fee RWAXI devengado", money(data.fees.accruedUsd, currency, true), `${org.feeUsagePct}% · ${data.fees.entries} asiento(s)`],
  ];
  const paying = payId ? subs.find((s) => s.id === payId) : undefined;
  const spinning = (id: string, kind: NonNullable<Busy>["kind"]) => busy?.id === id && busy.kind === kind;

  return (
    <div className="flex flex-col gap-6" data-subscriptions-desk>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-line border border-line">
        {kpis.map(([key, label, value, sub]) => (
          <div key={key} className="bg-white p-4" data-kpi={key}>
            <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{label}</p>
            <p className="font-mono text-[26px] text-rxPurple tnum mt-1">{value}</p>
            <p className="text-[11px] text-muted mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {error && !paying && (
        <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
          {error}
        </p>
      )}

      <div className="bg-white border border-line">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
            {"Suscripciones · conciliación fiduciaria · "}
            {org.legalName}
          </p>
          <p className="text-[11.5px] text-muted inline-flex items-center gap-1.5">
            <Icon name="Database" size={13} className="tc-text" />
            {`PostgreSQL · RLS tnt_${org.slug} · sesión demo: ${data.admin.email} (Administrador)`}
          </p>
        </div>
        {subs.length === 0 ? (
          <p className="px-5 py-6 text-[12.5px] text-muted">Aún no hay suscripciones firmadas en este portal.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px] text-[12.5px]">
              <thead>
                <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                  <th className="font-semibold px-5 py-3">Inversionista</th>
                  <th className="font-semibold px-3 py-3">Oferta</th>
                  <th className="font-semibold px-3 py-3">Unidades · capital</th>
                  <th className="font-semibold px-3 py-3">Estado</th>
                  <th className="font-semibold px-3 py-3">Pago y evidencia</th>
                  <th className="font-semibold px-5 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr
                    key={s.id}
                    data-subscription={s.id}
                    data-sub-status={s.status}
                    className="border-b border-line last:border-b-0 align-top"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-rxPurple">{s.investorName}</p>
                      <p className="font-mono text-[11px] text-muted">
                        {s.doc}
                        {" · "}
                        {s.createdAt.slice(0, 10)}
                      </p>
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="font-mono text-[11.5px] text-rxPurple">{s.offeringCode}</p>
                      <p className="text-[11px] text-muted">{s.assetName}</p>
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="font-mono tnum text-rxPurple">{s.units}</p>
                      <p className="text-[11px] text-muted">{money(s.capitalUsd, currency, false)}</p>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`text-[10.5px] font-semibold px-2 py-0.5 ${STATUS[s.status][1]}`}>{STATUS[s.status][0]}</span>
                      {s.status === "MINT_PENDING" && s.mint?.blockedReason && (
                        <p className="text-[10.5px] text-goldInk mt-1 max-w-[220px]" data-mint-blocked>
                          {s.mint.blockedReason}
                        </p>
                      )}
                      {s.paymentBlocker && <p className="text-[10.5px] text-[#B42318] mt-1 max-w-[220px]">{s.paymentBlocker}</p>}
                    </td>
                    <td className="px-3 py-3.5 font-mono text-[10.5px] text-muted">
                      {s.status === "RESERVED" && <span className="font-sans text-[11px]">Sin cobro hasta desplegar el token</span>}
                      {s.status === "PAYMENT_PENDING" && s.paymentCode && (
                        <p>
                          {"Ref. esperada "}
                          <span className="text-goldInk font-semibold">{s.paymentCode}</span>
                        </p>
                      )}
                      {s.paymentReference && (
                        <p>
                          {"Comprobante "}
                          <span className="text-rxPurple">{s.paymentReference}</span>
                        </p>
                      )}
                      {s.paymentEvidenceRef && s.status !== "RESERVED" && (
                        <p title={s.paymentEvidenceRef}>{`evidenceRef ${hash(s.paymentEvidenceRef)}`}</p>
                      )}
                      {s.mintTxHash && (
                        <p className="text-aquaInk" title={s.mintTxHash}>
                          {`tx mint ${hash(s.mintTxHash)}`}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {s.status === "PAYMENT_PENDING" && (
                        <button
                          disabled={!!busy || !!s.paymentBlocker}
                          onClick={() => {
                            setPayId(s.id);
                            setReference("");
                            setError(null);
                          }}
                          className="tc-btn px-2.5 py-1.5 text-[11.5px] font-semibold inline-flex items-center gap-1.5 focus-ring disabled:opacity-50"
                        >
                          <Icon name="FileCheck" size={13} />
                          Confirmar Pago Fiduciario
                        </button>
                      )}
                      {s.status === "MINT_PENDING" && s.mint?.status === "PENDING" && (
                        <button
                          disabled={!!busy || !!s.mint.blockedReason}
                          onClick={() => execute(s.mint!.chainTxId)}
                          className="border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-rxBlue inline-flex items-center gap-1.5 focus-ring disabled:opacity-40"
                        >
                          <Icon
                            name={spinning(s.mint.chainTxId, "exec") ? "Loader2" : "Play"}
                            size={13}
                            className={spinning(s.mint.chainTxId, "exec") ? "spin" : ""}
                          />
                          Firmar y ejecutar mint
                        </button>
                      )}
                      {s.status === "MINTED" && (
                        <span className="inline-flex items-center gap-1 text-aquaInk text-[11.5px]">
                          <Icon name="CheckCircle2" size={14} />
                          Tokens emitidos
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <QueuePanel
        queue={queue}
        recent={recent}
        execution={execution}
        busy={busy}
        skipped={skipped}
        onExecute={execute}
        onRegister={registerHash}
        onProcess={processAll}
      />

      <AuditTrail entries={data.audit} empty="Aún no hay suscripciones, pagos ni emisiones registradas." />

      {paying && (
        <Modal title={`Confirmar Pago Fiduciario · ${paying.investorName}`} onClose={() => setPayId(null)} wide={true}>
          <div style={brandVars(org.brandColor)} className="flex flex-col gap-4">
            <dl className="grid sm:grid-cols-2 gap-px bg-line border border-line text-[12.5px]">
              {(
                [
                  ["Oferta", `${paying.offeringCode} · ${paying.assetName}`],
                  ["Unidades", String(paying.units)],
                  ["Capital", money(paying.capitalUsd, currency, false)],
                  ["Referencia esperada en la transferencia", paying.paymentCode ?? "—"],
                  ["SHA-256 del contrato firmado", paying.agreementHash ? hash(paying.agreementHash) : "—"],
                  ["Wallet del inversionista", paying.wallet ? shortHash(paying.wallet, 10, 8) : "—"],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label} className="bg-white px-4 py-2.5">
                  <dt className="text-[10.5px] font-semibold tracking-[0.06em] uppercase text-muted">{label}</dt>
                  <dd className="text-inkBody mt-0.5 break-words font-mono text-[12px]">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pay-ref" className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted">
                Referencia del comprobante fiduciario
              </label>
              <input
                id="pay-ref"
                value={reference}
                onChange={(ev) => setReference(ev.target.value)}
                placeholder="p. ej. FID-2026-004512"
                maxLength={64}
                autoComplete="off"
                className={fieldCls(false) + " font-mono text-[13px]"}
              />
            </div>
            <p className="text-[12px] text-muted leading-relaxed">
              {"Al confirmar, la suscripción pasa a "}
              <span className="font-mono text-rxPurple">MINT_PENDING</span>
              {", se calcula "}
              <span className="font-mono text-rxPurple">paymentEvidenceRef</span>
              {" (SHA-256 canónico del contrato firmado y de esta referencia) y se encola "}
              <span className="font-mono text-rxPurple">mintSubscription(subscriptionId, investor, amount, paymentEvidenceRef)</span>
              {`. Se devenga la comisión de infraestructura RWAXI (${org.feeUsagePct}% del capital).`}
            </p>
            {error && (
              <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
                {error}
              </p>
            )}
            <button
              disabled={!!busy || reference.trim().length < 4}
              onClick={() => pay(paying)}
              className="tc-btn font-semibold inline-flex items-center justify-center text-[13px] py-3 gap-2 focus-ring disabled:opacity-60"
            >
              <Icon name={spinning(paying.id, "pay") ? "Loader2" : "BadgeCheck"} size={15} className={spinning(paying.id, "pay") ? "spin" : ""} />
              Confirmar Pago Fiduciario
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function QueuePanel({
  queue,
  recent,
  execution,
  busy,
  skipped,
  onExecute,
  onRegister,
  onProcess,
}: {
  queue: ChainQueueItem[];
  recent: ChainQueueItem[];
  execution: SubscriptionsDeskData["execution"];
  busy: Busy;
  skipped: { id: string; reason: string }[];
  onExecute: (chainTxId: string) => void;
  onRegister: (chainTxId: string, txHash: string) => void;
  onProcess: () => void;
}) {
  // RPC mode: RWAXI never signs registry calls; the officer signs them and their hash is registered here.
  const officerSigned = (q: ChainQueueItem) => execution.mode === "RPC" && REGISTRY_KINDS.has(q.kind);
  const ready = queue.filter((q) => !q.blockedReason && !officerSigned(q)).length;
  return (
    <div className="bg-white border border-line" data-chain-desk>
      <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Cola on-chain · orden de ejecución</p>
          <p className="text-[11.5px] text-muted mt-0.5" data-execution-mode={execution.mode}>
            {execution.mode === "SIMULATION"
              ? "Simulación determinista: firma EIP-1559 con OPERATOR_PRIVATE_KEY, sin difundir a la red"
              : "RPC: RWAXI envía mintSubscription; el Oficial de Cumplimiento firma el registro con su wallet"}
            {execution.operator && <span className="font-mono">{` · operador ${shortHash(execution.operator, 8, 6)}`}</span>}
          </p>
        </div>
        <button
          disabled={!!busy || queue.length === 0}
          onClick={onProcess}
          className="bg-rxDeep text-white text-[12px] font-mono px-3 py-2 inline-flex items-center gap-1.5 focus-ring disabled:opacity-50"
        >
          <Icon name={busy?.kind === "queue" ? "Loader2" : "Play"} size={14} className={busy?.kind === "queue" ? "spin text-rxAqua" : "text-rxAqua"} />
          {`Procesar cola en orden (${ready}/${queue.length} ejecutables)`}
        </button>
      </div>
      {queue.length === 0 ? (
        <p className="px-5 py-4 text-[12.5px] text-muted">No hay transacciones pendientes para este tenant.</p>
      ) : (
        <ol>
          {queue.map((q, i) => {
            const note = skipped.find((s) => s.id === q.id)?.reason ?? q.blockedReason;
            return (
              <li
                key={q.id}
                data-queue-item={q.id}
                data-kind={q.kind}
                data-blocked={q.blockedReason ? "true" : "false"}
                className="px-5 py-3 border-b border-line last:border-b-0 flex flex-wrap gap-x-4 gap-y-2 items-start"
              >
                <span className="font-mono text-[11px] text-muted w-6 pt-0.5">{`#${i + 1}`}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[12px] break-words">
                    <span className="text-rxPurple">{q.contract}</span>
                    <span className="text-muted">.</span>
                    <span className="text-rxBlue font-semibold">{q.fn}</span>
                    <span className="text-muted">{"()"}</span>
                    {(q.investorName || q.offeringCode) && (
                      <span className="font-sans text-[11.5px] text-inkBody">{` · ${[q.investorName, q.offeringCode].filter(Boolean).join(" · ")}`}</span>
                    )}
                  </p>
                  <p className="text-[10.5px] text-muted font-mono">{`${utc(q.createdAt)} · firma: ${q.signerRole}`}</p>
                  {note ? (
                    <p className="text-[11px] text-goldInk mt-0.5">{note}</p>
                  ) : (
                    <p className="text-[11px] text-aquaInk mt-0.5">Lista para ejecutar: precedencia e invariantes verificadas.</p>
                  )}
                </div>
                {officerSigned(q) ? (
                  <OfficerHashForm id={q.id} disabled={!!busy || !!q.blockedReason} onSubmit={(txHash) => onRegister(q.id, txHash)} />
                ) : (
                  <button
                    disabled={!!busy || !!q.blockedReason}
                    onClick={() => onExecute(q.id)}
                    className="border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-rxBlue inline-flex items-center gap-1.5 focus-ring disabled:opacity-40"
                  >
                    <Icon
                      name={busy?.id === q.id ? "Loader2" : "Play"}
                      size={13}
                      className={busy?.id === q.id ? "spin" : ""}
                    />
                    Firmar y ejecutar
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {recent.length > 0 && (
        <div className="border-t border-line">
          <p className="px-5 pt-3 pb-1 font-mono text-[10.5px] tracking-[0.12em] text-muted uppercase">Últimas confirmadas</p>
          <ul>
            {recent.map((r) => (
              <li key={r.id} data-confirmed-item={r.id} className="px-5 py-2 text-[11.5px] flex flex-wrap gap-x-3 gap-y-0.5 font-mono">
                <span className="text-aquaInk">{`✓ ${r.fn}()`}</span>
                {r.investorName && <span className="font-sans text-inkBody">{r.investorName}</span>}
                <span className="text-muted" title={r.txHash ?? ""}>
                  {r.txHash ? `tx ${hash(r.txHash)}` : "sin tx hash"}
                </span>
                <span className="text-muted">
                  {r.execution
                    ? `${r.execution.mode === "SIMULATION" ? "simulación" : "RPC"} · nonce ${r.execution.nonce ?? "—"}`
                    : "histórico (seed)"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** RPC mode: hash of the registry call the compliance officer signed with their own wallet. */
function OfficerHashForm({ id, disabled, onSubmit }: { id: string; disabled: boolean; onSubmit: (txHash: string) => void }) {
  const [value, setValue] = useState("");
  const valid = /^0x[0-9a-fA-F]{64}$/.test(value.trim());
  return (
    <div className="flex flex-wrap items-center gap-2" data-officer-form={id}>
      <label htmlFor={`officer-tx-${id}`} className="sr-only">
        Tx hash firmado por el Oficial de Cumplimiento
      </label>
      <input
        id={`officer-tx-${id}`}
        value={value}
        onChange={(ev) => setValue(ev.target.value)}
        placeholder="tx hash del Oficial (0x…)"
        autoComplete="off"
        className={fieldCls(false) + " font-mono text-[11.5px] w-[300px] max-w-full py-1.5"}
      />
      <button
        disabled={disabled || !valid}
        onClick={() => onSubmit(value.trim())}
        className="border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-rxBlue focus-ring disabled:opacity-40"
      >
        Registrar tx del Oficial
      </button>
    </div>
  );
}
