"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { Modal } from "@/app/_components/ui/modal";
import { fieldCls } from "@/app/_components/ui/form";
import { money, onColor, shortHash } from "@/app/_lib/format";
import { msg } from "@/app/_i18n/marks";
import { useI18n } from "@/app/_i18n/provider";
import { WALLET_SIGNER_ROLE, type ChainQueueItem } from "@/app/_lib/chain-queue-types";
import { executeChainTransaction, processChainQueue, registerOfficerTransaction, requestIssuerMinterRole } from "../chain-actions";
import { confirmPayment } from "../payment-actions";
import { setOfferingStatus } from "../offering-actions";
import type {
  DeskSession,
  IssuerMintPanel,
  IssuerMinterState,
  OfferingRaisingRow,
  SubscriptionRow,
  SubscriptionsDeskData,
  SubscriptionsDeskResult,
} from "../_lib/types";
import { AuditTrail, utc } from "./audit-trail";
import { DeskAccess, SessionLine, useCanAct } from "./desk-access";
import { WalletSign } from "./wallet-sign";

type Currency = "COP" | "USD";
type Toast = (message: string) => void;
type Busy = { id: string; kind: "pay" | "exec" | "queue" | "grant" | "status" } | null;

const brandVars = (color: string) => ({ "--tc": color, "--tc-on": onColor(color) }) as CSSProperties;
const hash = (h: string) => shortHash(h, 12, 6);
const REGISTRY_KINDS = new Set(["INVESTOR_WHITELISTED", "INVESTOR_REVOKED", "INVESTOR_FREEZE_UPDATED"]);
/** RPC mode: calls the tenant signs with its own wallet (officer: registry; issuer: roots and its own MINTER_ROLE). */
const TENANT_SIGNED_KINDS = new Set([...REGISTRY_KINDS, "DISTRIBUTION_ROOT_ANCHORED", "DATA_ROOM_ROOT_ANCHORED", "MINTER_ROLE_GRANTED"]);
/** Role that executes a queued call (chain-actions.ts roleFor): the officer the registry, the admin the rest. */
const SIGNER_ROLE = (kind: string) => (REGISTRY_KINDS.has(kind) ? "COMPLIANCE_OFFICER" : "TENANT_ADMIN");
const ROLE_NAME = { COMPLIANCE_OFFICER: msg("Oficial de Cumplimiento"), TENANT_ADMIN: msg("Administrador") } as const;

const STATUS: Record<SubscriptionRow["status"], [string, string]> = {
  RESERVED: [msg("Reserva pre-venta"), "bg-cloud text-muted"],
  PAYMENT_PENDING: [msg("Pago pendiente"), "bg-goldTint text-goldInk"],
  MINT_PENDING: [msg("Mint en cola"), "bg-[#E8F0FA] text-rxBlue"],
  MINTED: [msg("En wallet"), "bg-aquaTint text-aquaInk"],
  CANCELLED: [msg("Cancelada"), "bg-cloud text-muted"],
};
/** Why a subscription was cancelled (Subscription.cancellationReason). */
const CANCELLATION: Record<string, string> = {
  KYC_REVOKED: msg("Revocación del KYC por cumplimiento: unidades liberadas"),
};
const MINTER_STATE: Record<IssuerMinterState, [string, string]> = {
  minter: [msg("Tu wallet tiene MINTER_ROLE: puedes firmar los mint de este token con ella (EIP-1193)."), "text-aquaInk"],
  grantable: [msg("Tu wallet tiene DEFAULT_ADMIN_ROLE y aún no MINTER_ROLE: puedes otorgártelo."), "text-inkBody"],
  pending: [msg("grantRole(MINTER_ROLE) en cola: fírmalo con tu wallet en la cola on-chain."), "text-goldInk"],
  "not-admin": [msg("Tu wallet no tiene DEFAULT_ADMIN_ROLE en este token: los mint los envía el operador RWAXI."), "text-muted"],
  unreadable: [msg("No se pudo leer el token en la red."), "text-[#B42318]"],
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
  return (
    <DeskAccess session={desk.data.session} required="TENANT_ADMIN">
      <DeskView data={desk.data} currency={currency} toast={toast} />
    </DeskAccess>
  );
}

function DeskView({ data, currency, toast }: { data: SubscriptionsDeskData; currency: Currency; toast: Toast }) {
  const { rich, tr } = useI18n();
  const canAct = useCanAct();
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
  const grantMinter = (offeringId: string) => run({ id: offeringId, kind: "grant" }, () => requestIssuerMinterRole(offeringId));
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
    ["payment-pending", tr("Pagos por conciliar"), String(awaiting.length), money(sum(awaiting), currency, true)],
    ["mint-pending", tr("Mint en cola"), String(minting.length), money(sum(minting), currency, true)],
    [
      "minted",
      tr("Emitidas en wallet"),
      String(minted.length),
      tr("{n} unidades", { n: minted.reduce((s, r) => s + r.units, 0), count: minted.reduce((s, r) => s + r.units, 0) }),
    ],
    ["reserved", tr("Reservas pre-venta"), String(reserved.length), money(sum(reserved), currency, true)],
    [
      "fee",
      tr("Fee RWAXI devengado"),
      money(data.fees.accruedUsd, currency, true),
      tr("{pct}% · {n} asiento(s)", { pct: (org.platformFeeBps / 100).toFixed(2), n: data.fees.entries, count: data.fees.entries }),
    ],
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

      <RaisingPanel
        raising={data.raising}
        busy={busy}
        canAct={canAct}
        onChange={(offeringId, status, reason) =>
          run({ id: offeringId, kind: "status" }, () => setOfferingStatus(offeringId, status, reason))
        }
      />

      {error && !paying && (
        <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
          {error}
        </p>
      )}

      <div className="bg-white border border-line">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
            {tr("Suscripciones · conciliación fiduciaria")}
            {" · "}
            {org.legalName}
          </p>
          <p className="text-[11.5px] text-muted inline-flex items-center gap-1.5">
            <Icon name="Database" size={13} className="tc-text" />
            <SessionLine slug={org.slug} email={data.admin.email} session={data.session} admin />
          </p>
        </div>
        {subs.length === 0 ? (
          <p className="px-5 py-6 text-[12.5px] text-muted">{tr("Aún no hay suscripciones firmadas en este portal.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px] text-[12.5px]">
              <thead>
                <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                  <th className="font-semibold px-5 py-3">{tr("Inversionista")}</th>
                  <th className="font-semibold px-3 py-3">{tr("Oferta")}</th>
                  <th className="font-semibold px-3 py-3">{tr("Unidades · capital")}</th>
                  <th className="font-semibold px-3 py-3">{tr("Estado")}</th>
                  <th className="font-semibold px-3 py-3">{tr("Pago y evidencia")}</th>
                  <th className="font-semibold px-5 py-3">{tr("Acciones")}</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr
                    key={s.id}
                    data-subscription={s.id}
                    data-sub-status={s.status}
                    className={`border-b border-line last:border-b-0 align-top ${s.status === "CANCELLED" ? "bg-cloud/60" : ""}`}
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
                      <span className={`text-[10.5px] font-semibold px-2 py-0.5 ${STATUS[s.status][1]}`}>{tr(STATUS[s.status][0])}</span>
                      {s.status === "MINT_PENDING" && s.mint?.blockedReason && (
                        <p className="text-[10.5px] text-goldInk mt-1 max-w-[220px]" data-mint-blocked>
                          {s.mint.blockedReason}
                        </p>
                      )}
                      {s.paymentBlocker && <p className="text-[10.5px] text-[#B42318] mt-1 max-w-[220px]">{s.paymentBlocker}</p>}
                      {s.cancellation && (
                        <p className="text-[10.5px] text-muted mt-1 max-w-[240px]" data-cancellation={s.cancellation.reason ?? ""}>
                          {s.cancellation.reason && CANCELLATION[s.cancellation.reason] ? tr(CANCELLATION[s.cancellation.reason]) : tr("Cancelada")}
                          {` · ${utc(s.cancellation.at)}`}
                        </p>
                      )}
                      {s.cancellation?.refundDue && (
                        <p className="text-[10.5px] text-[#B42318] font-semibold mt-1 max-w-[240px]" data-refund-due="true">
                          {tr("Pago ya conciliado: reembolso pendiente al inversionista, fuera de la plataforma.")}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3.5 font-mono text-[10.5px] text-muted">
                      {s.status === "RESERVED" && <span className="font-sans text-[11px]">{tr("Sin cobro hasta desplegar el token")}</span>}
                      {s.status === "PAYMENT_PENDING" && s.paymentCode && (
                        <p>
                          {tr("Ref. esperada")}{" "}
                          <span className="text-goldInk font-semibold">{s.paymentCode}</span>
                        </p>
                      )}
                      {s.paymentReference && (
                        <p>
                          {tr("Comprobante")}{" "}
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
                          disabled={!!busy || !canAct || !!s.paymentBlocker}
                          onClick={() => {
                            setPayId(s.id);
                            setReference("");
                            setError(null);
                          }}
                          className="tc-btn px-2.5 py-1.5 text-[11.5px] font-semibold inline-flex items-center gap-1.5 focus-ring disabled:opacity-50"
                        >
                          <Icon name="FileCheck" size={13} />
                          {tr("Confirmar Pago Fiduciario")}
                        </button>
                      )}
                      {s.status === "MINT_PENDING" && s.mint?.status === "PENDING" && (
                        <button
                          disabled={!!busy || !canAct || !!s.mint.blockedReason}
                          onClick={() => execute(s.mint!.chainTxId)}
                          className="border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-rxBlue inline-flex items-center gap-1.5 focus-ring disabled:opacity-40"
                        >
                          <Icon
                            name={spinning(s.mint.chainTxId, "exec") ? "Loader2" : "Play"}
                            size={13}
                            className={spinning(s.mint.chainTxId, "exec") ? "spin" : ""}
                          />
                          {tr("Firmar y ejecutar mint")}
                        </button>
                      )}
                      {s.status === "MINTED" && (
                        <span className="inline-flex items-center gap-1 text-aquaInk text-[11.5px]">
                          <Icon name="CheckCircle2" size={14} />
                          {tr("Tokens emitidos")}
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

      {data.issuerMint && (
        <IssuerMint panel={data.issuerMint} busy={busy} canAct={canAct} spinning={(id) => spinning(id, "grant")} onGrant={grantMinter} />
      )}

      <QueuePanel
        session={data.session}
        queue={queue}
        recent={recent}
        execution={execution}
        busy={busy}
        skipped={skipped}
        onExecute={execute}
        onRegister={registerHash}
        onProcess={processAll}
        onWalletDone={toast}
      />

      <AuditTrail entries={data.audit} empty={tr("Aún no hay suscripciones, pagos ni emisiones registradas.")} />

      {paying && (
        <Modal title={tr("Confirmar Pago Fiduciario · {name}", { name: paying.investorName })} onClose={() => setPayId(null)} wide={true}>
          <div style={brandVars(org.brandColor)} className="flex flex-col gap-4">
            <dl className="grid sm:grid-cols-2 gap-px bg-line border border-line text-[12.5px]">
              {(
                [
                  [tr("Oferta"), `${paying.offeringCode} · ${paying.assetName}`],
                  [tr("Unidades"), String(paying.units)],
                  [tr("Capital"), money(paying.capitalUsd, currency, false)],
                  [tr("Referencia esperada en la transferencia"), paying.paymentCode ?? "—"],
                  [tr("SHA-256 del contrato firmado"), paying.agreementHash ? hash(paying.agreementHash) : "—"],
                  [tr("Wallet del inversionista"), paying.wallet ? shortHash(paying.wallet, 10, 8) : "—"],
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
                {tr("Referencia del comprobante fiduciario")}
              </label>
              <input
                id="pay-ref"
                value={reference}
                onChange={(ev) => setReference(ev.target.value)}
                placeholder={tr("p. ej. {example}", { example: "FID-2026-004512" })}
                maxLength={64}
                autoComplete="off"
                className={fieldCls(false) + " font-mono text-[13px]"}
              />
            </div>
            <p className="text-[12px] text-muted leading-relaxed">
              {rich(
                "Al confirmar, la suscripción pasa a {status}, se calcula {ref} (SHA-256 canónico del contrato firmado y de esta referencia) y se encola {call}. Se devenga la comisión de infraestructura RWAXI ({pct}% del capital).",
                {
                  status: <span className="font-mono text-rxPurple">MINT_PENDING</span>,
                  ref: <span className="font-mono text-rxPurple">paymentEvidenceRef</span>,
                  call: <span className="font-mono text-rxPurple">mintSubscription(subscriptionId, investor, amount, paymentEvidenceRef)</span>,
                  pct: ((paying?.platformFeeBps ?? org.platformFeeBps) / 100).toFixed(2),
                },
              )}
            </p>
            {error && (
              <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
                {error}
              </p>
            )}
            <button
              disabled={!!busy || !canAct || reference.trim().length < 4}
              onClick={() => pay(paying)}
              className="tc-btn font-semibold inline-flex items-center justify-center text-[13px] py-3 gap-2 focus-ring disabled:opacity-60"
            >
              <Icon name={spinning(paying.id, "pay") ? "Loader2" : "BadgeCheck"} size={15} className={spinning(paying.id, "pay") ? "spin" : ""} />
              {tr("Confirmar Pago Fiduciario")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function QueuePanel({
  session,
  queue,
  recent,
  execution,
  busy,
  skipped,
  onExecute,
  onRegister,
  onProcess,
  onWalletDone,
}: {
  /** the queue is shared by both roles: each row is executed by the role that signs it, whatever this desk's role */
  session: DeskSession;
  queue: ChainQueueItem[];
  recent: ChainQueueItem[];
  execution: SubscriptionsDeskData["execution"];
  busy: Busy;
  skipped: { id: string; reason: string }[];
  onExecute: (chainTxId: string) => void;
  onRegister: (chainTxId: string, txHash: string) => void;
  onProcess: () => void;
  onWalletDone: (message: string) => void;
}) {
  const { tr } = useI18n();
  // RPC mode: RWAXI never signs the tenant's calls; the officer or the issuer signs them and their hash is registered here.
  const officerSigned = (q: ChainQueueItem) => execution.mode === "RPC" && TENANT_SIGNED_KINDS.has(q.kind);
  // RPC mode: the role that signs a call may do it in its browser wallet (EIP-1193); a row its wallet already sent
  // (claimed by that hash, not by RWAXI's operator) waits for its receipt.
  const walletSigned = (q: ChainQueueItem) => execution.mode === "RPC" && !!WALLET_SIGNER_ROLE[q.kind];
  const walletClaim = (q: ChainQueueItem) =>
    q.execution?.mode === "RPC" && q.txHash && q.execution.signer?.toLowerCase() !== execution.operator?.toLowerCase() ? q.txHash : null;
  // The demo session holds both roles; a signed-in user runs only the rows of their own role.
  const canRun = (q: ChainQueueItem) => session.demo || session.role === SIGNER_ROLE(q.kind);
  const ready = queue.filter((q) => !q.blockedReason && !officerSigned(q) && canRun(q)).length;
  // Processing also explains every row it cannot run (blocked, signed by the tenant, another role): only the
  // read-only analyst has nothing to process.
  const canProcess = session.demo || session.role !== "TENANT_ANALYST";
  return (
    <div className="bg-white border border-line" data-chain-desk>
      <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{tr("Cola on-chain · orden de ejecución")}</p>
          <p className="text-[11.5px] text-muted mt-0.5" data-execution-mode={execution.mode}>
            {execution.mode === "SIMULATION"
              ? tr("Simulación determinista: firma EIP-1559 con OPERATOR_PRIVATE_KEY, sin difundir a la red")
              : tr("RPC: RWAXI envía mintSubscription; el Oficial firma el registro y el emisor las raíces de distribución con sus wallets")}
            {execution.operator && <span className="font-mono">{` · ${tr("operador")} ${shortHash(execution.operator, 8, 6)}`}</span>}
          </p>
        </div>
        <button
          disabled={!!busy || !canProcess || queue.length === 0}
          onClick={onProcess}
          className="bg-rxDeep text-white text-[12px] font-mono px-3 py-2 inline-flex items-center gap-1.5 focus-ring disabled:opacity-50"
        >
          <Icon name={busy?.kind === "queue" ? "Loader2" : "Play"} size={14} className={busy?.kind === "queue" ? "spin text-rxAqua" : "text-rxAqua"} />
          {tr("Procesar cola en orden ({ready}/{total} ejecutables)", { ready, total: queue.length })}
        </button>
      </div>
      {queue.length === 0 ? (
        <p className="px-5 py-4 text-[12.5px] text-muted">{tr("No hay transacciones pendientes para este tenant.")}</p>
      ) : (
        <ol>
          {queue.map((q, i) => {
            const note =
              skipped.find((s) => s.id === q.id)?.reason ??
              q.blockedReason ??
              (canRun(q) ? null : tr("La firma el rol {role}: inicia sesión con ese rol para ejecutarla.", { role: tr(ROLE_NAME[SIGNER_ROLE(q.kind)]) }));
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
                  <p className="text-[10.5px] text-muted font-mono">{`${utc(q.createdAt)} · ${tr("firma:")} ${q.signerRole}`}</p>
                  {note ? (
                    <p className="text-[11px] text-goldInk mt-0.5">{note}</p>
                  ) : (
                    <p className="text-[11px] text-aquaInk mt-0.5">{tr("Lista para ejecutar: precedencia e invariantes verificadas.")}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {walletSigned(q) && (
                    <WalletSign
                      chainTxId={q.id}
                      pendingHash={walletClaim(q)}
                      disabled={!!busy || !canRun(q) || (!walletClaim(q) && !!q.blockedReason)}
                      onDone={onWalletDone}
                    />
                  )}
                  {officerSigned(q) ? (
                    <OfficerHashForm
                      id={q.id}
                      signer={REGISTRY_KINDS.has(q.kind) ? "Oficial" : "emisor"}
                      disabled={!!busy || !canRun(q) || !!q.blockedReason}
                      onSubmit={(txHash) => onRegister(q.id, txHash)}
                    />
                  ) : (
                    <button
                      disabled={!!busy || !canRun(q) || !!q.blockedReason}
                      onClick={() => onExecute(q.id)}
                      className="border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-rxBlue inline-flex items-center gap-1.5 focus-ring disabled:opacity-40"
                    >
                      <Icon
                        name={busy?.id === q.id ? "Loader2" : "Play"}
                        size={13}
                        className={busy?.id === q.id ? "spin" : ""}
                      />
                      {walletSigned(q) ? tr("Firmar y ejecutar (operador RWAXI)") : tr("Firmar y ejecutar")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {recent.length > 0 && (
        <div className="border-t border-line">
          <p className="px-5 pt-3 pb-1 font-mono text-[10.5px] tracking-[0.12em] text-muted uppercase">{tr("Últimas confirmadas")}</p>
          <ul>
            {recent.map((r) => (
              <li key={r.id} data-confirmed-item={r.id} className="px-5 py-2 text-[11.5px] flex flex-wrap gap-x-3 gap-y-0.5 font-mono">
                <span className="text-aquaInk">{`✓ ${r.fn}()`}</span>
                {r.investorName && <span className="font-sans text-inkBody">{r.investorName}</span>}
                <span className="text-muted" title={r.txHash ?? ""}>
                  {r.txHash ? `tx ${hash(r.txHash)}` : tr("sin tx hash")}
                </span>
                <span className="text-muted">
                  {r.execution
                    ? `${r.execution.mode === "SIMULATION" ? tr("simulación") : "RPC"} · nonce ${r.execution.nonce ?? "—"}`
                    : tr("histórico (seed)")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * RPC mode, optional: by default RWAXI's operator sends the mints with its MINTER_ROLE; the issuer may instead grant
 * MINTER_ROLE to its administrator's registered wallet (signed by that same wallet, DEFAULT_ADMIN_ROLE of the token)
 * and sign its own mints with it. RWAXI never receives a role.
 */
function IssuerMint({
  panel,
  busy,
  canAct,
  spinning,
  onGrant,
}: {
  panel: IssuerMintPanel;
  busy: Busy;
  canAct: boolean;
  spinning: (offeringId: string) => boolean;
  onGrant: (offeringId: string) => void;
}) {
  const { rich, tr } = useI18n();
  return (
    <div className="bg-white border border-line" data-issuer-mint>
      <div className="px-5 py-3.5 border-b border-line">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{tr("Firma de mint del emisor · opcional")}</p>
        <p className="text-[11.5px] text-muted mt-1 leading-relaxed max-w-[880px]">
          {rich(
            "Por defecto el operador RWAXI envía {mint} con su MINTER_ROLE. Si el emisor lo prefiere, otorga {role} a la wallet registrada de su Administrador y firma sus propios mint con ella (EIP-1193). La concesión la firma esa misma wallet con {admin} del token: RWAXI no recibe ningún rol nuevo.",
            {
              mint: <span className="font-mono text-rxPurple">mintSubscription</span>,
              role: <span className="font-mono text-rxPurple">MINTER_ROLE</span>,
              admin: <span className="font-mono text-rxPurple">DEFAULT_ADMIN_ROLE</span>,
            },
          )}
        </p>
      </div>
      {!panel.wallet ? (
        <p className="px-5 py-4 text-[12.5px] text-goldInk" data-issuer-wallet="none">
          {tr("Tu usuario no tiene una wallet registrada en este tenant: no hay una cuenta a la que otorgar MINTER_ROLE.")}
        </p>
      ) : panel.tokens.length === 0 ? (
        <p className="px-5 py-4 text-[12.5px] text-muted">{tr("Ninguna oferta tiene su token desplegado todavía.")}</p>
      ) : (
        <ul>
          {panel.tokens.map((t) => (
            <li
              key={t.offeringId}
              data-issuer-token={t.offeringCode}
              data-minter-state={t.state}
              className="px-5 py-3 border-b border-line last:border-b-0 flex flex-wrap gap-x-4 gap-y-2 items-center justify-between"
            >
              <div className="min-w-0">
                <p className="font-mono text-[12px] text-rxPurple break-words">
                  {t.offeringCode}
                  <span className="text-muted">{` · RwaxiPropertyToken ${shortHash(t.token, 8, 6)} · ${t.network}`}</span>
                </p>
                <p className={`text-[11px] mt-0.5 ${MINTER_STATE[t.state][1]}`}>
                  {tr(MINTER_STATE[t.state][0])}
                  {t.detail && ` (${t.detail})`}
                </p>
              </div>
              {t.state === "grantable" && (
                <button
                  data-grant-minter={t.offeringId}
                  disabled={!!busy || !canAct}
                  onClick={() => onGrant(t.offeringId)}
                  className="tc-btn px-2.5 py-1.5 text-[11.5px] font-semibold inline-flex items-center gap-1.5 focus-ring disabled:opacity-50"
                >
                  <Icon name={spinning(t.offeringId) ? "Loader2" : "KeyRound"} size={13} className={spinning(t.offeringId) ? "spin" : ""} />
                  {tr("Habilitar MINTER_ROLE para mi wallet")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {panel.wallet && (
        <p className="px-5 py-2.5 border-t border-line text-[10.5px] text-muted flex items-center gap-1.5">
          <Icon name="Wallet" size={12} />
          {tr("Wallet registrada del Administrador")}
          <span className="font-mono text-rxPurple">{shortHash(panel.wallet, 10, 8)}</span>
        </p>
      )}
    </div>
  );
}

/** RPC mode: hash of the call the compliance officer (registry) or the issuer (distribution root) signed with their own wallet. */
function OfficerHashForm({
  id,
  signer,
  disabled,
  onSubmit,
}: {
  id: string;
  signer: "Oficial" | "emisor";
  disabled: boolean;
  onSubmit: (txHash: string) => void;
}) {
  const { tr } = useI18n();
  const [value, setValue] = useState("");
  const valid = /^0x[0-9a-fA-F]{64}$/.test(value.trim());
  return (
    <div className="flex flex-wrap items-center gap-2" data-officer-form={id}>
      <label htmlFor={`officer-tx-${id}`} className="sr-only">
        {signer === "Oficial" ? tr("Tx hash firmado por el Oficial de Cumplimiento") : tr("Tx hash firmado por el emisor")}
      </label>
      <input
        id={`officer-tx-${id}`}
        value={value}
        onChange={(ev) => setValue(ev.target.value)}
        placeholder={signer === "Oficial" ? tr("tx hash del Oficial (0x…)") : tr("tx hash del emisor (0x…)")}
        autoComplete="off"
        className={fieldCls(false) + " font-mono text-[11.5px] w-[300px] max-w-full py-1.5"}
      />
      <button
        disabled={disabled || !valid}
        onClick={() => onSubmit(value.trim())}
        className="border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-rxBlue focus-ring disabled:opacity-40"
      >
        {signer === "Oficial" ? tr("Registrar tx del Oficial") : tr("Registrar tx del emisor")}
      </button>
    </div>
  );
}

type RaisingStatus = OfferingRaisingRow["status"];
const RAISING: Record<RaisingStatus, [string, string]> = {
  STRUCTURING: [msg("En estructuración · próximamente"), "bg-rxDeep text-lav"],
  ACTIVE: [msg("Captación abierta"), "bg-aquaTint text-aquaInk"],
  FUNDED: [msg("Captación completada"), "bg-cloud text-muted"],
};
/** Transitions offered per status (offering-actions.ts enforces the same list). */
const RAISING_NEXT: Record<RaisingStatus, [RaisingStatus, string][]> = {
  STRUCTURING: [["ACTIVE", msg("Abrir captación")]],
  ACTIVE: [
    ["FUNDED", msg("Marcar captación completada")],
    ["STRUCTURING", msg("Volver a estructuración")],
  ],
  FUNDED: [["ACTIVE", msg("Reabrir captación")]],
};

/**
 * "Estado de captación": the developer decides when each offering raises capital (Offering.status). Only ACTIVE
 * takes subscriptions; STRUCTURING is listed in the vitrina as "coming soon". Leaving ACTIVE needs a reason.
 */
function RaisingPanel({
  raising,
  busy,
  canAct,
  onChange,
}: {
  raising: SubscriptionsDeskData["raising"];
  busy: Busy;
  canAct: boolean;
  onChange: (offeringId: string, status: RaisingStatus, reason: string) => void;
}) {
  const { tr } = useI18n();
  const [pending, setPending] = useState<{ offering: OfferingRaisingRow; to: RaisingStatus } | null>(null);
  const [reason, setReason] = useState("");
  const needsReason = pending?.offering.status === "ACTIVE";
  const reasonOk = !needsReason || (reason.trim().length >= 10 && reason.trim().length <= 300);

  return (
    <div className="bg-white border border-line" data-raising-panel>
      <div className="px-5 py-3.5 border-b border-line">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{tr("Estado de captación")}</p>
        <p className="text-[11.5px] text-muted mt-1 leading-relaxed max-w-[880px]">
          {tr(
            "Sólo una oferta con la captación abierta (ACTIVE) recibe suscripciones. En estructuración, la vitrina la muestra como «próximamente» y el portal no permite suscribir; las suscripciones ya firmadas siguen su curso.",
          )}
        </p>
      </div>
      {raising.gaps.length > 0 && (
        <div className="px-5 py-3 border-b border-line text-[12px] text-goldInk flex gap-2 items-start" data-raising-gaps={raising.gaps.length}>
          <Icon name="AlertTriangle" size={14} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{tr("La captación no puede abrirse todavía:")}</p>
            <ul className="mt-1 list-disc ps-4">
              {raising.gaps.map((g) => (
                <li key={g} data-raising-gap>
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <ul>
        {raising.offerings.map((o) => (
          <li
            key={o.id}
            data-raising-offering={o.code}
            data-offering-status={o.status}
            className="px-5 py-3 border-b border-line last:border-b-0 flex flex-wrap gap-x-4 gap-y-2 items-center justify-between"
          >
            <div className="min-w-0">
              <p className="font-mono text-[12px] text-rxPurple break-words">
                {o.code}
                <span className="text-muted">{` · ${o.assetName}`}</span>
              </p>
              <p className="text-[11px] text-muted mt-0.5 font-mono tnum">
                {tr("{committed} / {total} unidades", { committed: o.unitsSubscribed, total: o.totalUnits, count: o.totalUnits })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[10.5px] font-semibold px-2 py-0.5 ${RAISING[o.status][1]}`}>{tr(RAISING[o.status][0])}</span>
              {RAISING_NEXT[o.status].map(([to, label]) => {
                const blocked = to === "ACTIVE" && raising.gaps.length > 0;
                return (
                  <button
                    key={to}
                    data-set-status={`${o.code}:${to}`}
                    disabled={!!busy || !canAct || blocked}
                    onClick={() => {
                      setReason("");
                      setPending({ offering: o, to });
                    }}
                    className={`${to === "ACTIVE" ? "tc-btn" : "border border-line text-rxBlue"} px-2.5 py-1.5 text-[11.5px] font-semibold inline-flex items-center gap-1.5 focus-ring disabled:opacity-50`}
                  >
                    {busy?.id === o.id && busy.kind === "status" && <Icon name="Loader2" size={13} className="spin" />}
                    {tr(label)}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      {pending && (
        <Modal
          title={tr("{code} · {from} → {to}", { code: pending.offering.code, from: pending.offering.status, to: pending.to })}
          onClose={() => setPending(null)}
          wide={false}
        >
          <div className="flex flex-col gap-4">
            <p className="text-[12.5px] text-inkBody leading-relaxed">
              {pending.to === "ACTIVE"
                ? tr("La oferta empezará a recibir suscripciones en el portal y la vitrina enlazará a él.")
                : pending.to === "FUNDED"
                  ? tr("La oferta dejará de recibir suscripciones: la vitrina la mostrará con la captación completada.")
                  : tr("La oferta dejará de recibir suscripciones: la vitrina la mostrará como «próximamente».")}
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="raising-reason" className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted">
                {needsReason ? tr("Motivo (obligatorio, 10 a 300 caracteres)") : tr("Motivo (opcional)")}
              </label>
              <textarea
                id="raising-reason"
                rows={3}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={fieldCls(false)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPending(null)} className="border border-line px-3.5 py-2 text-[12.5px] font-semibold text-inkBody focus-ring">
                {tr("Cancelar")}
              </button>
              <button
                data-confirm-status
                disabled={!reasonOk || !!busy}
                onClick={() => {
                  onChange(pending.offering.id, pending.to, reason);
                  setPending(null);
                }}
                className="tc-btn px-3.5 py-2 text-[12.5px] font-semibold focus-ring disabled:opacity-50"
              >
                {tr(RAISING_NEXT[pending.offering.status].find(([to]) => to === pending.to)![1])}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
