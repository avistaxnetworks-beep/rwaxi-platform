"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { prorataCents } from "@rwaxi/blockchain-sdk/distribution";
import { Icon } from "@/app/_components/ui/icon";
import { fieldCls } from "@/app/_components/ui/form";
import { nf, onColor, shortHash } from "@/app/_lib/format";
import { useI18n } from "@/app/_i18n/provider";
import type { Translate } from "@/app/_i18n/translate";
import { executeChainTransaction, registerOfficerTransaction } from "../chain-actions";
import { declareDistribution } from "../distribution-actions";
import type { DistributionOfferingRow, DistributionRow, DistributionsDeskData, DistributionsDeskResult } from "../_lib/types";
import { AuditTrail, utc } from "./audit-trail";

type Currency = "COP" | "USD";
type Toast = (message: string) => void;
type Result = { ok: true; message: string } | { ok: false; error: string };

const brandVars = (color: string) => ({ "--tc": color, "--tc-on": onColor(color) }) as CSSProperties;
const label = "text-[11px] font-semibold tracking-[0.06em] uppercase text-muted";
const pct = (units: number, total: number) => `${nf(2).format(total ? (units / total) * 100 : 0)} %`;
/** Distributions are committed in USD cents (Merkle leaves): always shown exactly, never at the demo TRM. */
const usd = (n: number) => `USD ${nf(2).format(n)}`;
const declaredCop = (d: { amountDeclared: number; fxRate: number | null }, tr: Translate) =>
  tr("declarada en COP {amount} a {rate} COP/USD", { amount: nf(2).format(d.amountDeclared), rate: nf(2).format(d.fxRate ?? 0) });

/** Previous calendar quarter, the default period of a new distribution (e.g. 2026-Q3). */
function lastQuarter(now = new Date()): string {
  const q = Math.floor(now.getUTCMonth() / 3);
  return q === 0 ? `${now.getUTCFullYear() - 1}-Q4` : `${now.getUTCFullYear()}-Q${q}`;
}

/** "Distribuciones y Rendimientos" tab: pro-rata yield over MINTED tokens, committed in a Merkle tree. */
export function DistributionsDesk({ desk, toast }: { desk: DistributionsDeskResult; toast: Toast }) {
  if (!desk.ok) {
    return (
      <div role="alert" className="bg-white border border-[#F3C5C0] px-5 py-4 text-[13px] text-[#B42318] flex gap-2">
        <Icon name="AlertTriangle" size={16} className="mt-0.5 shrink-0" />
        <span>{desk.error}</span>
      </div>
    );
  }
  return <DeskView data={desk.data} toast={toast} />;
}

function DeskView({ data, toast }: { data: DistributionsDeskData; toast: Toast }) {
  const { tr } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const run = (id: string, action: () => Promise<Result>, onOk?: () => void) => {
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
  const kpis: [string, string, string, string][] = [
    ["offerings", tr("Ofertas con token emitido"), String(data.offerings.length), data.offerings.map((o) => o.token.symbol).join(" · ") || "—"],
    [
      "holders",
      tr("Tenedores (MINTED)"),
      String(data.offerings.reduce((s, o) => s + o.holders.length, 0)),
      tr("{n} tokens", { n: nf(0).format(data.offerings.reduce((s, o) => s + o.mintedUnits, 0)) }),
    ],
    ["declared", tr("Distribuido declarado"), usd(all.reduce((s, d) => s + d.totalUsd, 0)), tr("{n} distribución(es)", { n: all.length, count: all.length })],
    ["anchored", tr("Raíces ancladas"), `${all.filter((d) => d.status === "ANCHORED").length}/${all.length}`, "anchorDistributionRoot()"],
  ];

  return (
    <div className="flex flex-col gap-6" data-distributions-desk style={brandVars(data.organization.brandColor)}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line">
        {kpis.map(([key, title, value, sub]) => (
          <div key={key} className="bg-white p-4 min-w-0" data-kpi={key}>
            <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{title}</p>
            <p className="font-mono text-[26px] text-rxPurple tnum mt-1 break-words">{value}</p>
            <p className="text-[11px] text-muted mt-0.5 break-words">{sub}</p>
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
          {error}
        </p>
      )}

      {data.offerings.length === 0 ? (
        <div className="bg-white border border-line px-5 py-6 text-[13px] text-muted">
          {tr(
            "Ninguna oferta de este tenant tiene su token emitido todavía: las distribuciones se calculan sobre los tokens MINTED en wallets de inversionistas.",
          )}
        </div>
      ) : (
        data.offerings.map((o) => (
          <OfferingPanel key={o.id} offering={o} data={data} busy={busy} run={run} />
        ))
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
}: {
  offering: DistributionOfferingRow;
  data: DistributionsDeskData;
  busy: string | null;
  run: (id: string, action: () => Promise<Result>, onOk?: () => void) => void;
}) {
  const { tr } = useI18n();
  const [period, setPeriod] = useState(lastQuarter);
  const [declared, setDeclared] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [fxRate, setFxRate] = useState(String(data.fxRate));
  const [open, setOpen] = useState<string | null>(null);

  // Preview of the split the server will commit (same largest-remainder rule, in cents).
  const preview = useMemo(() => {
    const value = Number(amount.replace(",", "."));
    const fx = Number(fxRate.replace(",", "."));
    const usd = declared === "COP" ? (fx > 0 ? Math.round((value / fx) * 100) / 100 : 0) : value;
    const cents = Math.round(usd * 100);
    if (!Number.isSafeInteger(cents) || cents < 100 || !o.holders.length) return null;
    const split = prorataCents(cents, o.holders.map((h) => ({ key: h.investorId, units: h.units })));
    return { usd, split };
  }, [amount, fxRate, declared, o.holders]);

  const declare = () =>
    run(
      `declare-${o.id}`,
      () => declareDistribution({ offeringId: o.id, period, currency: declared, amount, fxRate: declared === "COP" ? fxRate : undefined }),
      () => setAmount(""),
    );

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
          {tr("PostgreSQL · RLS tnt_{slug} · sesión demo: {email} (Administrador)", { slug: data.organization.slug, email: data.admin.email })}
        </p>
      </div>

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-px bg-line">
        <div className="bg-white">
          <p className="px-5 pt-4 pb-2 text-[12px] font-semibold text-inkBody">
            {tr("Snapshot de tenedores · {n} tokens MINTED", { n: nf(0).format(o.mintedUnits) })}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[12px]">
              <thead>
                <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                  <th className="font-semibold px-5 py-2">{tr("Inversionista")}</th>
                  <th className="font-semibold px-3 py-2">Wallet</th>
                  <th className="font-semibold px-3 py-2 text-right">Tokens</th>
                  <th className="font-semibold px-3 py-2 text-right">{tr("Participación")}</th>
                  <th className="font-semibold px-5 py-2 text-right">{tr("Asignación")}</th>
                </tr>
              </thead>
              <tbody>
                {o.holders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-3 text-muted">
                      {tr("Sin tokens MINTED en wallets de inversionistas.")}
                    </td>
                  </tr>
                )}
                {o.holders.map((h) => {
                  const cents = preview?.split.get(h.investorId);
                  return (
                    <tr key={h.investorId} className="border-b border-line last:border-b-0" data-holder={h.wallet}>
                      <td className="px-5 py-2 text-inkBody">{h.name}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted" title={h.wallet}>
                        {shortHash(h.wallet, 8, 6)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tnum">{nf(0).format(h.units)}</td>
                      <td className="px-3 py-2 text-right font-mono tnum">{pct(h.units, o.mintedUnits)}</td>
                      <td className="px-5 py-2 text-right font-mono tnum" data-preview-cents={cents ?? ""}>
                        {cents === undefined ? "—" : usd(cents / 100)}
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
              <label htmlFor={`dist-currency-${o.id}`} className={label}>
                {tr("Moneda declarada")}
              </label>
              <select id={`dist-currency-${o.id}`} value={declared} onChange={(e) => setDeclared(e.target.value as Currency)} className={fieldCls(false)}>
                <option value="USD">USD</option>
                <option value="COP">COP</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`dist-amount-${o.id}`} className={label}>
                {tr("Monto total ({currency})", { currency: declared })}
              </label>
              <input id={`dist-amount-${o.id}`} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={declared === "USD" ? "10000" : "41000000"} className={fieldCls(false) + " font-mono"} />
            </div>
            {declared === "COP" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`dist-fx-${o.id}`} className={label}>
                  {tr("Tasa COP/USD")}
                </label>
                <input id={`dist-fx-${o.id}`} value={fxRate} onChange={(e) => setFxRate(e.target.value)} inputMode="decimal" className={fieldCls(false) + " font-mono"} />
              </div>
            )}
          </div>
          <p className="text-[11.5px] text-muted leading-relaxed">
            {preview
              ? tr(
                  "Se repartirán {amount} entre {holders} tenedor(es) en proporción a sus tokens (centavos exactos, método del mayor residuo). Cada asignación será una hoja del árbol de Merkle (SHA-256) y la raíz se anclará con anchorDistributionRoot().",
                  {
                    amount:
                      usd(preview.usd) +
                      (declared === "COP"
                        ? ` (COP ${nf(2).format(Number(amount.replace(",", ".")))} @ ${nf(2).format(Number(fxRate.replace(",", ".")))})`
                        : ""),
                    holders: o.holders.length,
                    count: o.holders.length,
                  },
                )
              : tr("Indica el monto: el cálculo prorrata se muestra antes de declarar y el servidor lo recalcula sobre el snapshot de PostgreSQL.")}
          </p>
          <button
            disabled={!!busy || !preview}
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
                onExecute={(id) => run(id, () => executeChainTransaction(id))}
                onRegister={(id, txHash) => run(id, () => registerOfficerTransaction(id, txHash))}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DistributionItem({
  d,
  mode,
  busy,
  open,
  toggle,
  onExecute,
  onRegister,
}: {
  d: DistributionRow;
  mode: "SIMULATION" | "RPC";
  busy: string | null;
  open: boolean;
  toggle: () => void;
  onExecute: (chainTxId: string) => void;
  onRegister: (chainTxId: string, txHash: string) => void;
}) {
  const { tr } = useI18n();
  const [txHash, setTxHash] = useState("");
  const anchor = d.anchor;
  const pending = anchor?.status === "PENDING";
  return (
    <li className="px-5 py-3 border-t border-line first:border-t-0 text-[12.5px]" data-distribution={d.period} data-distribution-status={d.status}>
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-start">
        <div className="min-w-0 flex-1">
          <p className="text-inkBody">
            <span className="font-mono font-semibold text-rxPurple">{d.period}</span>
            {` · ${usd(d.totalUsd)}`}
            {d.currency === "COP" && <span className="text-muted">{` (${declaredCop(d, tr)})`}</span>}
            {` · ${tr("{n} tenedor(es)", { n: d.holders, count: d.holders })} · ${tr("{n} tokens", { n: nf(0).format(d.totalUnits) })}`}
          </p>
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
              disabled={!!busy || !!anchor.blockedReason}
              onClick={() => onExecute(anchor.chainTxId)}
              data-anchor-execute={anchor.chainTxId}
              className="border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-rxBlue inline-flex items-center gap-1.5 focus-ring disabled:opacity-40"
            >
              <Icon name={busy === anchor.chainTxId ? "Loader2" : "Play"} size={13} className={busy === anchor.chainTxId ? "spin" : ""} />
              {tr("Firmar y ejecutar")}
            </button>
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
                disabled={!!busy || !/^0x[0-9a-fA-F]{64}$/.test(txHash.trim())}
                onClick={() => onRegister(anchor.chainTxId, txHash.trim())}
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
      {open && (
        <div className="overflow-x-auto mt-3 border border-line">
          <table className="w-full min-w-[640px] text-[11.5px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                <th className="font-semibold px-3 py-2">{tr("Inversionista")}</th>
                <th className="font-semibold px-3 py-2">Wallet</th>
                <th className="font-semibold px-3 py-2 text-right">Tokens</th>
                <th className="font-semibold px-3 py-2 text-right">{tr("Monto")}</th>
                <th className="font-semibold px-3 py-2">{tr("Hoja (SHA-256)")}</th>
                <th className="font-semibold px-3 py-2 text-right">{tr("Prueba")}</th>
              </tr>
            </thead>
            <tbody>
              {d.allocations.map((a) => (
                  <tr key={a.wallet} className="border-b border-line last:border-b-0" data-allocation={a.wallet}>
                    <td className="px-3 py-2 text-inkBody">{a.investorName}</td>
                    <td className="px-3 py-2 font-mono text-muted" title={a.wallet}>
                      {shortHash(a.wallet, 8, 6)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum">{nf(0).format(a.units)}</td>
                    <td className="px-3 py-2 text-right font-mono tnum">{usd(a.amountUsd)}</td>
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
