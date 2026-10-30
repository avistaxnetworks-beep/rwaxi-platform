"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { canonicalJson } from "@rwaxi/blockchain-sdk/canonical";
import { PAYOUT_CURRENCIES, isStablecoin, prorataCents, type PayoutCurrency } from "@rwaxi/blockchain-sdk/distribution";
import { Icon } from "@/app/_components/ui/icon";
import { fieldCls } from "@/app/_components/ui/form";
import { nf, onColor, shortHash } from "@/app/_lib/format";
import { balancesAt, bogotaToday, recordInstant } from "@/app/_lib/distribution-snapshot";
import { uploadToVault } from "@/app/_lib/vault-upload";
import { useI18n } from "@/app/_i18n/provider";
import type { Translate } from "@/app/_i18n/translate";
import { executeChainTransaction, registerOfficerTransaction } from "../chain-actions";
import { declareDistribution, instructDistributionPayout } from "../distribution-actions";
import type {
  DistributionOfferingRow,
  DistributionPayoutBatchRow,
  DistributionRow,
  DistributionsDeskData,
  DistributionsDeskResult,
} from "../_lib/types";
import { AuditTrail, utc } from "./audit-trail";
import { DeskAccess, SessionLine, useCanAct } from "./desk-access";
import { WalletSign } from "./wallet-sign";

type Toast = (message: string) => void;
type Result = { ok: true; message: string } | { ok: false; error: string };
type Run = (id: string, action: () => Promise<Result>, onOk?: () => void) => void;
interface Support {
  name: string;
  sha256: string;
  sizeBytes: number;
  receipt: string;
}

const brandVars = (color: string) => ({ "--tc": color, "--tc-on": onColor(color) }) as CSSProperties;
const label = "text-[11px] font-semibold tracking-[0.06em] uppercase text-muted";
const pct = (units: number, total: number) => `${nf(2).format(total ? (units / total) * 100 : 0)} %`;
/** Distributions are committed in hundredths of their payment currency (Merkle leaves): always shown exactly. */
const amountIn = (currency: string, n: number) => `${currency} ${nf(2).format(n)}`;
const kb = (bytes: number) => `${nf(0).format(Math.max(1, Math.round(bytes / 1024)))} KB`;
/** A distribution declared before the payment currency (v1) committed USD cents. */
const paidIn = (d: DistributionRow): string => (d.leafVersion >= 2 ? d.currency : "USD");
const totalOf = (d: DistributionRow) => (d.leafVersion >= 2 ? d.amountDeclared : d.totalUsd);

/** Previous calendar quarter, the default period of a new distribution (e.g. 2026-Q3). */
function lastQuarter(now = new Date()): string {
  const q = Math.floor(now.getUTCMonth() / 3);
  return q === 0 ? `${now.getUTCFullYear() - 1}-Q4` : `${now.getUTCFullYear()}-Q${q}`;
}

function saveFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface InstructionLine {
  name?: string;
  wallet?: string;
  units?: number;
  amount?: string;
  baseUnits?: string;
  reason?: string;
}

/** The instruction for the fiduciary's banking tools: one row per cleared payee. */
function instructionCsv(batch: DistributionPayoutBatchRow, currency: string): string {
  const doc = (batch.instruction ?? {}) as { payees?: InstructionLine[] };
  const stable = isStablecoin(currency as PayoutCurrency);
  const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["beneficiario", "wallet", "tokens", "monto", "moneda", ...(stable ? ["unidades_base_6_decimales"] : [])];
  const rows = (doc.payees ?? []).map((p) =>
    [p.name, p.wallet, p.units, p.amount, currency, ...(stable ? [p.baseUnits] : [])].map(quote).join(","),
  );
  return [header.join(","), ...rows].join("\r\n") + "\r\n";
}

/** "Distribuciones y Rendimientos" tab: pro-rata yield at a record date, committed in a Merkle tree, paid by instruction. */
export function DistributionsDesk({ desk, toast }: { desk: DistributionsDeskResult; toast: Toast }) {
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
      <DeskView data={desk.data} toast={toast} />
    </DeskAccess>
  );
}

function DeskView({ data, toast }: { data: DistributionsDeskData; toast: Toast }) {
  const { tr } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const run: Run = (id, action, onOk) => {
    if (busy) return;
    setError(null);
    setBusy(id);
    startTransition(async () => {
      const result = await action();
      setBusy(null);
      if (result.ok) {
        onOk?.();
        toast(result.message);
      } else setError(result.error);
    });
  };

  const all = data.offerings.flatMap((o) => o.distributions);
  const v2 = all.filter((d) => d.leafVersion >= 2);
  const instructed = v2.reduce((s, d) => s + d.allocations.filter((a) => a.payout).length, 0);
  const kpis: [string, string, string, string][] = [
    ["offerings", tr("Ofertas con token emitido"), String(data.offerings.length), data.offerings.map((o) => o.token.symbol).join(" · ") || "—"],
    [
      "holders",
      tr("Tenedores hoy"),
      String(data.offerings.reduce((s, o) => s + o.holders.length, 0)),
      tr("{n} tokens", { n: nf(0).format(data.offerings.reduce((s, o) => s + o.mintedUnits, 0)) }),
    ],
    [
      "declared",
      tr("Distribuido declarado (equiv. USD)"),
      amountIn("USD", all.reduce((s, d) => s + d.totalUsd, 0)),
      tr("{n} distribución(es) · {anchored} raíz(ces) ancladas", {
        n: all.length,
        count: all.length,
        anchored: all.filter((d) => d.status === "ANCHORED").length,
      }),
    ],
    [
      "payouts",
      tr("Pagos instruidos"),
      `${instructed}/${v2.reduce((s, d) => s + d.allocations.length, 0)}`,
      tr("{n} instrucción(es) de pago", { n: v2.reduce((s, d) => s + d.payoutBatches.length, 0), count: v2.reduce((s, d) => s + d.payoutBatches.length, 0) }),
    ],
  ];

  return (
    <div className="flex flex-col gap-6" data-distributions-desk style={brandVars(data.organization.brandColor)}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line">
        {kpis.map(([key, title, value, sub]) => (
          <div key={key} className="bg-white p-4 min-w-0" data-kpi={key}>
            <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{title}</p>
            <p className="font-mono text-[24px] text-rxPurple tnum mt-1 break-words">{value}</p>
            <p className="text-[11px] text-muted mt-0.5 break-words">{sub}</p>
          </div>
        ))}
      </div>

      <p className="text-[12px] text-muted leading-relaxed bg-white border border-line px-5 py-3">
        {tr(
          "El emisor declara y paga sus distribuciones: RWAXI calcula la prorrata, la compromete en un árbol de Merkle y verifica la whitelist, pero no custodia ni mueve los fondos. Cada tenedor a la fecha de corte conserva su asignación; el pago solo se instruye a wallets que la whitelist de cumplimiento habilita en ese momento.",
        )}
      </p>

      {error && (
        <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
          {error}
        </p>
      )}

      {data.offerings.length === 0 ? (
        <div className="bg-white border border-line px-5 py-6 text-[13px] text-muted">
          {tr(
            "Ninguna oferta de este tenant tiene su token emitido todavía: las distribuciones se calculan sobre los tokens emitidos en wallets de inversionistas.",
          )}
        </div>
      ) : (
        data.offerings.map((o) => <OfferingPanel key={o.id} offering={o} data={data} busy={busy} run={run} toast={toast} />)
      )}

      <AuditTrail entries={data.audit} empty={tr("Aún no hay distribuciones declaradas para este tenant.")} />
    </div>
  );
}

function OfferingPanel({
  offering: o,
  data,
  busy,
  run,
  toast,
}: {
  offering: DistributionOfferingRow;
  data: DistributionsDeskData;
  busy: string | null;
  run: Run;
  toast: Toast;
}) {
  const { tr } = useI18n();
  const canAct = useCanAct();
  const today = bogotaToday();
  const [period, setPeriod] = useState(lastQuarter);
  const [recordDate, setRecordDate] = useState(today);
  const [currency, setCurrency] = useState<PayoutCurrency>("COP");
  const [amount, setAmount] = useState("");
  const [fxRate, setFxRate] = useState(String(data.fxRate));
  const [support, setSupport] = useState<Support | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // The register at the record date: the token's confirmed mints replayed up to its instant (the server does the same,
  // and in RPC mode checks it against the token's balanceOfAt / totalSupplyAt).
  const instant = useMemo(() => recordInstant(recordDate), [recordDate]);
  const register = useMemo(() => {
    if (!instant) return [];
    const who = new Map(o.movements.map((m) => [m.wallet, m]));
    return [...balancesAt(o.movements, instant.seconds)]
      .map(([wallet, units]) => ({ wallet, units, investorId: who.get(wallet)?.investorId ?? wallet, name: who.get(wallet)?.name ?? wallet }))
      .sort((a, b) => b.units - a.units || (a.wallet < b.wallet ? -1 : 1));
  }, [instant, o.movements]);
  const supply = register.reduce((s, h) => s + h.units, 0);
  const whitelist = useMemo(() => new Map(o.holders.map((h) => [h.wallet, h.withhold])), [o.holders]);

  // Preview of the split the server will commit (same largest-remainder rule, in hundredths of the payment currency).
  const preview = useMemo(() => {
    const value = Number(amount.replace(",", "."));
    const cents = Math.round(value * 100);
    if (!Number.isSafeInteger(cents) || cents < 100 || !register.length) return null;
    const fx = Number(fxRate.replace(",", "."));
    const usd = currency === "COP" ? (fx > 0 ? Math.round((value / fx) * 100) / 100 : 0) : value;
    return { value, usd, split: prorataCents(cents, register.map((h) => ({ key: h.investorId, units: h.units }))) };
  }, [amount, fxRate, currency, register]);
  const withheldNow = register.filter((h) => whitelist.get(h.wallet)).length;

  const attach = async (file: File | undefined) => {
    if (!file) return;
    setSupport(null);
    setUploadError(null);
    setUploading(true);
    const uploaded = await uploadToVault(file, file.name, "distribution", { offeringId: o.id });
    setUploading(false);
    if (uploaded.ok && uploaded.receipt) {
      setSupport({ name: file.name, sha256: uploaded.sha256, sizeBytes: uploaded.sizeBytes, receipt: uploaded.receipt });
    } else {
      setUploadError(uploaded.ok ? tr("No se pudo verificar el archivo; vuelve a adjuntarlo.") : (uploaded.error ?? tr("No se pudo verificar el archivo; vuelve a adjuntarlo.")));
    }
  };

  const declare = () =>
    run(
      `declare-${o.id}`,
      () =>
        declareDistribution({
          offeringId: o.id,
          period,
          recordDate,
          currency,
          amount,
          fxRate: currency === "COP" ? fxRate : undefined,
          support: support ? { receipt: support.receipt, sha256: support.sha256, sizeBytes: support.sizeBytes, fileName: support.name } : { receipt: "", sha256: "", sizeBytes: 0, fileName: "" },
        }),
      () => {
        setAmount("");
        setSupport(null);
      },
    );

  const CURRENCY_LABEL: Record<PayoutCurrency, string> = {
    COP: tr("COP · fiduciaria"),
    USD: tr("USD · fiduciaria"),
    USDC: tr("USDC · tesorería del emisor"),
    USDT: tr("USDT · tesorería del emisor"),
  };

  return (
    <div className="bg-white border border-line" data-distribution-offering={o.code}>
      <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{`${tr("Distribuciones")} · ${o.code} · ${o.assetName}`}</p>
          <p className="text-[11.5px] text-muted mt-0.5 font-mono break-words">
            {`RwaxiPropertyToken ${o.token.symbol} ${shortHash(o.token.address, 8, 6)} · ${o.network}`}
            {o.token.status === "PAUSED" && ` · ${tr("pausado por el emisor")}`}
          </p>
        </div>
        <p className="text-[11.5px] text-muted inline-flex items-center gap-1.5">
          <Icon name="Database" size={13} className="tc-text" />
          <SessionLine slug={data.organization.slug} email={data.admin.email} session={data.session} admin />
        </p>
      </div>

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-px bg-line">
        <div className="bg-white">
          <p className="px-5 pt-4 pb-2 text-[12px] font-semibold text-inkBody" data-register-supply={supply}>
            {instant
              ? tr("Tenedores a la fecha de corte {date} · {n} tokens", { date: recordDate, n: nf(0).format(supply) })
              : tr("Elige una fecha de corte válida que no sea futura.")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12px]">
              <thead>
                <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                  <th className="font-semibold px-5 py-2">{tr("Inversionista")}</th>
                  <th className="font-semibold px-3 py-2">Wallet</th>
                  <th className="font-semibold px-3 py-2 text-right">Tokens</th>
                  <th className="font-semibold px-3 py-2 text-right">{tr("Participación")}</th>
                  <th className="font-semibold px-3 py-2 text-right">{tr("Asignación")}</th>
                  <th className="font-semibold px-5 py-2">{tr("Whitelist hoy")}</th>
                </tr>
              </thead>
              <tbody>
                {register.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-3 text-muted">
                      {tr("Sin tokens emitidos en wallets de inversionistas a esa fecha.")}
                    </td>
                  </tr>
                )}
                {register.map((h) => {
                  const cents = preview?.split.get(h.investorId);
                  const withhold = whitelist.get(h.wallet) ?? null;
                  return (
                    <tr key={h.wallet} className="border-b border-line last:border-b-0" data-holder={h.wallet} data-holder-units={h.units}>
                      <td className="px-5 py-2 text-inkBody">{h.name}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted" title={h.wallet}>
                        {shortHash(h.wallet, 8, 6)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tnum">{nf(0).format(h.units)}</td>
                      <td className="px-3 py-2 text-right font-mono tnum">{pct(h.units, supply)}</td>
                      <td className="px-3 py-2 text-right font-mono tnum" data-preview-cents={cents ?? ""}>
                        {cents === undefined ? "—" : amountIn(currency, cents / 100)}
                      </td>
                      <td className="px-5 py-2 text-[11px]" data-holder-withhold={withhold?.code ?? "CLEARED"}>
                        {withhold ? <span className="text-goldInk">{withhold.label}</span> : <span className="text-aquaInk">{tr("Pagable")}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-5 flex flex-col gap-3">
          <p className="text-[12px] font-semibold text-inkBody">{tr("Declarar distribución de rendimientos")}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`dist-period-${o.id}`} className={label}>
                {tr("Periodo")}
              </label>
              <input id={`dist-period-${o.id}`} value={period} onChange={(e) => setPeriod(e.target.value.toUpperCase())} placeholder="2026-Q3" className={fieldCls(false) + " font-mono"} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`dist-record-${o.id}`} className={label}>
                {tr("Fecha de corte")}
              </label>
              <input
                id={`dist-record-${o.id}`}
                type="date"
                value={recordDate}
                max={today}
                onChange={(e) => setRecordDate(e.target.value)}
                className={fieldCls(!instant) + " font-mono"}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`dist-currency-${o.id}`} className={label}>
                {tr("Moneda de pago")}
              </label>
              <select id={`dist-currency-${o.id}`} value={currency} onChange={(e) => setCurrency(e.target.value as PayoutCurrency)} className={fieldCls(false)}>
                {PAYOUT_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {CURRENCY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`dist-amount-${o.id}`} className={label}>
                {tr("Monto total ({currency})", { currency })}
              </label>
              <input
                id={`dist-amount-${o.id}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder={currency === "COP" ? "41000000" : "10000"}
                className={fieldCls(false) + " font-mono"}
              />
            </div>
            {currency === "COP" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`dist-fx-${o.id}`} className={label}>
                  {tr("Tasa COP/USD")}
                </label>
                <input id={`dist-fx-${o.id}`} value={fxRate} onChange={(e) => setFxRate(e.target.value)} inputMode="decimal" className={fieldCls(false) + " font-mono"} />
              </div>
            )}
            <div className="flex flex-col gap-1.5 col-span-2">
              <label htmlFor={`dist-support-${o.id}`} className={label}>
                {tr("Soporte documental (certificación fiduciaria o comprobante)")}
              </label>
              <input
                id={`dist-support-${o.id}`}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                disabled={uploading || !canAct}
                onChange={(e) => {
                  void attach(e.target.files?.[0]);
                  e.target.value = "";
                }}
                data-support-input={o.id}
                className="text-[12px] file:mr-3 file:border file:border-line file:bg-cloud file:px-3 file:py-1.5 file:text-[12px] file:font-semibold"
              />
              {uploading && <p className="text-[11.5px] text-muted">{tr("Verificando el archivo y guardándolo en la bóveda…")}</p>}
              {support && (
                <p className="text-[11.5px] text-aquaInk break-all" data-support-verified={support.sha256}>
                  {tr("{name} · {size} · SHA-256 {hash} verificado por el servidor", {
                    name: support.name,
                    size: kb(support.sizeBytes),
                    hash: shortHash(support.sha256, 12, 8),
                  })}
                </p>
              )}
              {uploadError && (
                <p role="alert" className="text-[11.5px] text-[#B42318]">
                  {uploadError}
                </p>
              )}
            </div>
          </div>
          <p className="text-[11.5px] text-muted leading-relaxed">
            {preview
              ? tr(
                  "Se repartirán {amount} entre {holders} tenedor(es) a la fecha de corte, en proporción a sus tokens (centésimas exactas, método del mayor residuo). Cada asignación será una hoja del árbol de Merkle (SHA-256) y la raíz se anclará con anchorDistributionRoot(), que verifica on-chain la oferta total a esa fecha y registra el SHA-256 del soporte.",
                  {
                    amount:
                      amountIn(currency, preview.value) +
                      (currency === "COP" ? ` (≈ ${amountIn("USD", preview.usd)} @ ${nf(2).format(Number(fxRate.replace(",", ".")))})` : ""),
                    holders: register.length,
                    count: register.length,
                  },
                )
              : tr("Indica el monto: el cálculo prorrata se muestra antes de declarar y el servidor lo recalcula sobre el registro de tenedores a la fecha de corte.")}
            {preview && withheldNow > 0 && ` ${tr("Hoy la whitelist retendría el pago de {n} tenedor(es): conservan su asignación y se pagan cuando queden habilitados.", { n: withheldNow, count: withheldNow })}`}
          </p>
          <button
            disabled={!!busy || !canAct || !preview || !support || uploading}
            onClick={declare}
            data-declare-distribution={o.id}
            className="tc-btn self-start px-4 py-2.5 text-[12.5px] font-semibold inline-flex items-center gap-2 focus-ring disabled:opacity-50"
          >
            <Icon name={busy === `declare-${o.id}` ? "Loader2" : "Calculator"} size={14} className={busy === `declare-${o.id}` ? "spin" : ""} />
            {tr("Declarar y encolar raíz de Merkle")}
          </button>
        </div>
      </div>

      <div className="border-t border-line">
        <p className="px-5 pt-3 pb-1 font-mono text-[10.5px] tracking-[0.12em] text-muted uppercase">{tr("Distribuciones declaradas")}</p>
        {o.distributions.length === 0 ? (
          <p className="px-5 pb-4 text-[12.5px] text-muted">{tr("Esta oferta aún no tiene distribuciones.")}</p>
        ) : (
          <ul>
            {o.distributions.map((d) => (
              <DistributionItem
                key={d.id}
                d={d}
                mode={data.execution.mode}
                busy={busy}
                open={open === d.id}
                toggle={() => setOpen(open === d.id ? null : d.id)}
                run={run}
                onWalletDone={toast}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function snapshotLine(d: DistributionRow, tr: Translate): string {
  if (!d.recordDate) return tr("Snapshot al declarar · {at}", { at: utc(d.snapshotAt) });
  return tr("Fecha de corte {date} · instante de registro {at} · {mode}", {
    date: d.recordDate,
    at: utc(d.snapshotAt),
    mode: d.snapshotMode === "RPC" ? tr("cotejado con balanceOfAt / totalSupplyAt on-chain") : tr("réplica de las emisiones confirmadas (simulación)"),
  });
}

function DistributionItem({
  d,
  mode,
  busy,
  open,
  toggle,
  run,
  onWalletDone,
}: {
  d: DistributionRow;
  mode: "SIMULATION" | "RPC";
  busy: string | null;
  open: boolean;
  toggle: () => void;
  run: Run;
  onWalletDone: (message: string) => void;
}) {
  const { tr } = useI18n();
  const canAct = useCanAct();
  const [txHash, setTxHash] = useState("");
  const anchor = d.anchor;
  const pending = anchor?.status === "PENDING";
  // RWAXI's operator never sends this call in RPC mode: a hash on the PENDING row is the issuer's wallet's.
  const claimed = anchor?.mode === "RPC" && anchor.txHash ? anchor.txHash : null;
  const currency = paidIn(d);
  const v2 = d.leafVersion >= 2;
  return (
    <li
      className="px-5 py-3 border-t border-line first:border-t-0 text-[12.5px]"
      data-distribution={d.period}
      data-distribution-status={d.status}
      data-currency={currency}
      data-record-date={d.recordDate ?? ""}
    >
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-start">
        <div className="min-w-0 flex-1">
          <p className="text-inkBody">
            <span className="font-mono font-semibold text-rxPurple">{d.period}</span>
            {` · ${amountIn(currency, totalOf(d))}`}
            {v2 && d.currency === "COP" && <span className="text-muted">{` (≈ ${amountIn("USD", d.totalUsd)} @ ${nf(2).format(d.fxRate ?? 0)})`}</span>}
            {!v2 && d.currency === "COP" && (
              <span className="text-muted">{` (${tr("declarada en COP {amount} a {rate} COP/USD", { amount: nf(2).format(d.amountDeclared), rate: nf(2).format(d.fxRate ?? 0) })})`}</span>
            )}
            {` · ${tr("{n} tenedor(es)", { n: d.holders, count: d.holders })} · ${tr("{n} tokens", { n: nf(0).format(d.totalUnits) })}`}
          </p>
          <p className="text-[11px] text-muted">{snapshotLine(d, tr)}</p>
          {d.support ? (
            <p className="text-[11px] text-muted break-all" data-support-sha256={d.support.sha256}>
              {tr("Soporte: {name} · {size} · SHA-256 {hash}", { name: d.support.fileName, size: kb(d.support.sizeBytes), hash: shortHash(d.support.sha256, 12, 8) })}{" "}
              <a href={`/api/vault/distribution/${d.id}`} target="_blank" rel="noreferrer" className="text-rxBlue font-semibold" data-support-link={d.id}>
                {tr("Ver soporte")}
              </a>
            </p>
          ) : (
            <p className="text-[11px] text-muted">{tr("Declarada sin soporte documental (versión anterior del módulo).")}</p>
          )}
          <p className="font-mono text-[10.5px] text-muted break-all" data-merkle-root={d.merkleRoot}>{`Merkle root ${d.merkleRoot}`}</p>
          <p className="font-mono text-[10.5px] text-muted break-all">{`distributionId ${d.onchainId}`}</p>
          <p className="font-mono text-[10.5px] text-muted">{`${utc(d.declaredAt)} · ${d.declaredBy ?? "—"}`}</p>
          {d.status === "ANCHORED" && d.anchorTxHash ? (
            <p className="text-[11px] text-aquaInk mt-0.5" data-anchor-tx={d.anchorTxHash}>
              {tr("Raíz anclada · tx {hash} · {mode}", {
                hash: shortHash(d.anchorTxHash, 12, 6),
                mode: anchor?.mode === "RPC" ? tr("confirmada en red") : tr("simulación firmada (sin difundir)"),
              })}
            </p>
          ) : anchor?.blockedReason ? (
            <p className="text-[11px] text-goldInk mt-0.5">{anchor.blockedReason}</p>
          ) : (
            <p className="text-[11px] text-goldInk mt-0.5">{tr("anchorDistributionRoot() en cola · la firma el emisor (DISTRIBUTION_ROLE)")}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`text-[10.5px] font-semibold px-2 py-0.5 ${d.status === "ANCHORED" ? "bg-aquaTint text-aquaInk" : "bg-goldTint text-goldInk"}`}>
            {d.status === "ANCHORED" ? tr("Raíz anclada") : tr("Declarada · raíz en cola")}
          </span>
          {pending && anchor && mode === "SIMULATION" && (
            <button
              disabled={!!busy || !canAct || !!anchor.blockedReason}
              onClick={() => run(anchor.chainTxId, () => executeChainTransaction(anchor.chainTxId))}
              data-anchor-execute={anchor.chainTxId}
              className="border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-rxBlue inline-flex items-center gap-1.5 focus-ring disabled:opacity-40"
            >
              <Icon name={busy === anchor.chainTxId ? "Loader2" : "Play"} size={13} className={busy === anchor.chainTxId ? "spin" : ""} />
              {tr("Firmar y ejecutar")}
            </button>
          )}
          {pending && anchor && mode === "RPC" && (
            <WalletSign chainTxId={anchor.chainTxId} pendingHash={claimed} disabled={!!busy || !canAct || (!claimed && !!anchor.blockedReason)} onDone={onWalletDone} />
          )}
          {pending && anchor && mode === "RPC" && (
            <div className="flex flex-wrap items-center gap-2 justify-end" data-issuer-form={anchor.chainTxId}>
              <label htmlFor={`issuer-tx-${anchor.chainTxId}`} className="sr-only">
                {tr("Tx hash firmado por el emisor")}
              </label>
              <input
                id={`issuer-tx-${anchor.chainTxId}`}
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder={tr("tx hash del emisor (0x…)")}
                autoComplete="off"
                className={fieldCls(false) + " font-mono text-[11.5px] w-[300px] max-w-full py-1.5"}
              />
              <button
                disabled={!!busy || !canAct || !/^0x[0-9a-fA-F]{64}$/.test(txHash.trim())}
                onClick={() => run(anchor.chainTxId, () => registerOfficerTransaction(anchor.chainTxId, txHash.trim()))}
                className="border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-rxBlue focus-ring disabled:opacity-40"
              >
                {tr("Registrar tx del emisor")}
              </button>
            </div>
          )}
          <button onClick={toggle} className="text-[11.5px] font-semibold text-rxBlue focus-ring" aria-expanded={open}>
            {open ? tr("Ocultar asignaciones") : tr("Ver asignaciones y pruebas")}
          </button>
        </div>
      </div>

      {v2 && <PayoutPanel d={d} busy={busy} run={run} />}

      {open && (
        <div className="overflow-x-auto mt-3 border border-line">
          <table className="w-full min-w-[760px] text-[11.5px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                <th className="font-semibold px-3 py-2">{tr("Inversionista")}</th>
                <th className="font-semibold px-3 py-2">Wallet</th>
                <th className="font-semibold px-3 py-2 text-right">Tokens</th>
                <th className="font-semibold px-3 py-2 text-right">{tr("Monto")}</th>
                <th className="font-semibold px-3 py-2">{tr("Pago")}</th>
                <th className="font-semibold px-3 py-2">{tr("Hoja (SHA-256)")}</th>
                <th className="font-semibold px-3 py-2 text-right">{tr("Prueba")}</th>
              </tr>
            </thead>
            <tbody>
              {d.allocations.map((a) => (
                <tr
                  key={a.wallet}
                  className="border-b border-line last:border-b-0"
                  data-allocation={a.wallet}
                  data-allocation-payout={a.payout ? `instructed-${a.payout.sequence}` : a.withhold ? `withheld-${a.withhold.code}` : v2 ? "payable" : "n/a"}
                >
                  <td className="px-3 py-2 text-inkBody">{a.investorName}</td>
                  <td className="px-3 py-2 font-mono text-muted" title={a.wallet}>
                    {shortHash(a.wallet, 8, 6)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tnum">{nf(0).format(a.units)}</td>
                  <td className="px-3 py-2 text-right font-mono tnum">{amountIn(currency, a.amount)}</td>
                  <td className="px-3 py-2">
                    {!v2 ? (
                      <span className="text-muted">—</span>
                    ) : a.payout ? (
                      <span className="text-aquaInk">{tr("Instruido · #{n}", { n: a.payout.sequence })}</span>
                    ) : a.withhold ? (
                      <span className="text-goldInk">{tr("Retenido · {reason}", { reason: a.withhold.label })}</span>
                    ) : (
                      <span className="text-inkBody">{tr("Pendiente · pagable hoy")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted" title={a.leafHash}>
                    {shortHash(a.leafHash, 10, 6)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted">{tr("{n} hash(es)", { n: a.proofLength, count: a.proofLength })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

/** Payment instructions of a v2 distribution: issued after its root is anchored, only to wallets the whitelist clears. */
function PayoutPanel({ d, busy, run }: { d: DistributionRow; busy: string | null; run: Run }) {
  const { tr } = useI18n();
  const canAct = useCanAct();
  const currency = paidIn(d);
  const instructed = d.allocations.filter((a) => a.payout).length;
  const { allocations: pendingCount, payable } = d.pendingPayouts;
  return (
    <div className="mt-3 border border-line bg-cloud px-3 py-2.5 flex flex-col gap-2" data-payouts={d.id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] text-inkBody">
          <span className="font-semibold">{tr("Pagos")}</span>
          {" · "}
          {tr("{done}/{total} asignaciones con instrucción de pago", { done: instructed, total: d.allocations.length })}
          {pendingCount > 0 && ` · ${tr("{n} pendiente(s), {payable} pagable(s) hoy", { n: pendingCount, payable, count: pendingCount })}`}
        </p>
        {d.status === "ANCHORED" ? (
          pendingCount > 0 && (
            <button
              disabled={!!busy || !canAct || payable === 0}
              onClick={() => run(`payout-${d.id}`, () => instructDistributionPayout(d.id))}
              data-payout-instruct={d.id}
              className="tc-btn px-3 py-1.5 text-[11.5px] font-semibold inline-flex items-center gap-1.5 focus-ring disabled:opacity-50"
            >
              <Icon name={busy === `payout-${d.id}` ? "Loader2" : "FileCheck"} size={13} className={busy === `payout-${d.id}` ? "spin" : ""} />
              {tr("Emitir instrucción de pago")}
            </button>
          )
        ) : (
          <span className="text-[11px] text-muted">{tr("La instrucción de pago se emite cuando la raíz quede anclada en el token.")}</span>
        )}
      </div>
      {d.payoutBatches.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {d.payoutBatches.map((b) => (
            <li key={b.id} className="text-[11px] text-muted flex flex-wrap items-center gap-x-3 gap-y-1" data-payout-batch={b.sequence} data-instruction-hash={b.instructionHash}>
              <span className="text-inkBody font-semibold">{tr("Instrucción #{n}", { n: b.sequence })}</span>
              <span>{`${utc(b.createdAt)} · ${b.createdBy ?? "—"}`}</span>
              <span className="font-mono">{amountIn(currency, b.total)}</span>
              <span>
                {tr("{n} wallet(s)", { n: b.payees, count: b.payees })}
                {b.withheld > 0 && ` · ${tr("{n} retenida(s)", { n: b.withheld, count: b.withheld })}`}
              </span>
              <span>{b.registryMode === "RPC" ? tr("whitelist leída on-chain") : tr("whitelist según la cola confirmada")}</span>
              <span className="font-mono break-all">{`SHA-256 ${shortHash(b.instructionHash, 12, 8)}`}</span>
              <button
                onClick={() => saveFile(`instruccion-pago-${d.period}-${b.sequence}.json`, canonicalJson(b.instruction), "application/json")}
                className="text-rxBlue font-semibold focus-ring"
                data-instruction-json={b.sequence}
              >
                {tr("JSON (SHA-256 verificable)")}
              </button>
              <button
                onClick={() => saveFile(`instruccion-pago-${d.period}-${b.sequence}.csv`, instructionCsv(b, currency), "text/csv")}
                className="text-rxBlue font-semibold focus-ring"
              >
                CSV
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
