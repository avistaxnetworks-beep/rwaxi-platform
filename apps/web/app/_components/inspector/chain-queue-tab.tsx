"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { Mono } from "@/app/_components/ui/primitives";
import { msg } from "@/app/_i18n/marks";
import { useI18n } from "@/app/_i18n/provider";
import { copyText, shortHash } from "@/app/_lib/format";
import type { ChainQueueItem, ChainQueueResponse } from "@/app/_lib/chain-queue-types";
import {
  executeChainTransaction,
  processChainQueue,
  registerOfficerTransaction,
} from "@/app/tenant/[slug]/backoffice/chain-actions";

const POLL_MS = 10_000;

const short = (v: string) => (/^0x[0-9a-fA-F]{24,}$/.test(v) ? `0x${shortHash(v.slice(2), 10, 6)}` : v);
const utc = (iso: string) => `${iso.slice(0, 19).replace("T", " ")} UTC`;

const STATUS: Record<ChainQueueItem["status"], [string, string]> = {
  PENDING: [msg("⏳ PENDING · en cola"), "bg-[#3a2a08] text-[#D9A24A]"],
  CONFIRMED: ["✓ CONFIRMED", "bg-[#0c3a2c] text-[#6EE7B7]"],
  REVERTED: ["✗ REVERTED", "bg-[#3a1018] text-[#FF8A80]"],
};

const REGISTRY_KINDS = new Set(["INVESTOR_WHITELISTED", "INVESTOR_REVOKED", "INVESTOR_FREEZE_UPDATED"]);
/** RPC mode: calls the tenant signs with its own wallet (officer: registry; issuer: distribution roots). */
const TENANT_SIGNED_KINDS = new Set([...REGISTRY_KINDS, "DISTRIBUTION_ROOT_ANCHORED"]);

type Run = (
  busyId: string,
  action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>,
) => void;

/**
 * Inspector tab 4: ChainTransaction rows of the host tenant, read from PostgreSQL (RLS).
 * From the backoffice (canExecute) PENDING rows can be signed and executed, one by one or in order.
 */
export function ChainQueueTab({
  selectedSlug,
  selectedName,
  toast,
  canExecute,
}: {
  selectedSlug: string;
  selectedName: string;
  toast: (message: string) => void;
  canExecute: boolean;
}) {
  const { tr } = useI18n();
  const [scope, setScope] = useState<"pending" | "all">("pending");
  const [res, setRes] = useState<ChainQueueResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/chain/transactions?scope=${scope}`, { cache: "no-store" });
      setRes((await r.json()) as ChainQueueResponse);
    } catch {
      setRes({ ok: false, error: tr("No se pudo contactar el servidor.") });
    } finally {
      setLoading(false);
    }
  }, [scope, tr]);

  useEffect(() => {
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const run: Run = (busyId, action) => {
    if (busy) return;
    setBusy(busyId);
    setError(null);
    startTransition(async () => {
      const result = await action();
      setBusy(null);
      if (result.ok) toast(result.message);
      else setError(result.error);
      await load();
    });
  };
  // RPC mode: the tenant's own calls (registry, distribution roots) are signed by its wallets, so the queue run never sends them.
  const runnable = res?.ok
    ? res.items.filter(
        (t) =>
          t.status === "PENDING" &&
          !t.blockedReason &&
          !(res.execution.mode === "RPC" && TENANT_SIGNED_KINDS.has(t.kind)),
      ).length
    : 0;

  return (
    <div className="flex flex-col gap-3" data-chain-queue>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex border border-white/15 p-0.5" role="group" aria-label={tr("Estado")}>
          {(
            [
              ["pending", tr("Pendientes")],
              ["all", tr("Todas")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setScope(key)}
              aria-pressed={scope === key}
              className={`px-3 py-1.5 font-mono text-[11px] focus-ring ${scope === key ? "bg-white text-rxDeep" : "text-white hover:bg-white/10"}`}
            >
              {label}
              {res?.ok && key === "pending" && ` (${res.counts.pending})`}
              {res?.ok && key === "all" && ` (${res.counts.total})`}
            </button>
          ))}
        </div>
        <button
          onClick={() => void load()}
          className="font-mono text-[11px] text-rxAqua border border-white/15 px-2.5 py-1.5 inline-flex items-center gap-1.5 focus-ring"
        >
          <Icon name="RefreshCw" size={13} className={loading ? "spin" : ""} />
          {tr("Refrescar")}
        </button>
      </div>

      {res?.ok && (
        <Mono className="text-[11px] text-[#A79FC0]">
          {tr("PostgreSQL · ChainTransaction · RLS {tenant} · {n} transacción(es) · {order}", {
            tenant: res.tenant.displayName,
            n: res.items.length,
            count: res.items.length,
            order:
              res.scope === "pending"
                ? tr("orden de ejecución (más antigua primero)")
                : tr("más reciente primero"),
          })}
        </Mono>
      )}
      {res?.ok && (
        <div
          className="border border-white/15 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2"
          data-execution-mode={res.execution.mode}
        >
          <span
            className={`font-mono text-[10.5px] px-2 py-0.5 ${
              res.execution.mode === "SIMULATION"
                ? "bg-[#2a1f4a] text-[#C4B5FD]"
                : "bg-[#0c3a2c] text-[#6EE7B7]"
            }`}
          >
            {res.execution.mode === "SIMULATION"
              ? tr("SIMULACIÓN · firmada, sin difundir")
              : tr("RPC · nodo configurado")}
          </span>
          <Mono className="text-[11px] text-[#A79FC0]">
            {res.execution.operator
              ? tr("operador {address}", { address: short(res.execution.operator) })
              : tr("OPERATOR_PRIVATE_KEY no configurada")}
          </Mono>
          {canExecute ? (
            <button
              disabled={!!busy || res.counts.pending === 0}
              onClick={() => run("queue", processChainQueue)}
              className="ml-auto font-mono text-[11px] bg-rxAqua text-rxDeep px-2.5 py-1.5 inline-flex items-center gap-1.5 focus-ring disabled:opacity-50"
            >
              <Icon
                name={busy === "queue" ? "Loader2" : "Play"}
                size={13}
                className={busy === "queue" ? "spin" : ""}
              />
              {tr("Procesar cola en orden") +
                (scope === "pending" ? ` (${runnable}/${res.counts.pending})` : "")}
            </button>
          ) : (
            <Mono className="ml-auto text-[10.5px] text-[#A79FC0]">
              {tr("La ejecución se autoriza desde el Backoffice del tenant.")}
            </Mono>
          )}
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="font-mono text-[11.5px] text-[#FF8A80] border border-[#FF8A80]/40 px-3 py-2"
        >
          {error}
        </p>
      )}
      {res?.ok && res.tenant.slug !== selectedSlug && (
        <p className="font-mono text-[11.5px] text-[#D9A24A] border border-[#D9A24A]/40 px-3 py-2">
          {tr("El selector muestra {selected}, pero desde este host RLS sólo permite consultar {tenant}.", {
            selected: selectedName,
            tenant: res.tenant.displayName,
          })}
        </p>
      )}

      {!res && <p className="font-mono text-[12px] text-[#A79FC0]">{tr("Consultando ChainTransaction…")}</p>}
      {res && !res.ok && (
        <p
          role="alert"
          className="font-mono text-[12px] text-[#A79FC0] border border-white/15 px-4 py-6 text-center"
        >
          {res.error}
          <span className="block mt-1">
            {tr("La cola persistida se consulta desde el portal o el backoffice de un tenant ({host}).", {
              host: "{slug}.rwaxi.com",
            })}
          </span>
        </p>
      )}
      {res?.ok &&
        res.items.map((tx) => (
          <QueueCard
            key={tx.id}
            tx={tx}
            toast={toast}
            mode={res.execution.mode}
            canExecute={canExecute}
            busy={busy}
            run={run}
          />
        ))}
      {res?.ok && !res.items.length && (
        <p className="font-mono text-[12px] text-[#A79FC0] border border-white/15 px-4 py-6 text-center">
          {scope === "pending"
            ? tr("No hay transacciones pendientes para este tenant.")
            : tr("Sin transacciones para este tenant.")}
        </p>
      )}
    </div>
  );
}

function QueueCard({
  tx,
  toast,
  mode,
  canExecute,
  busy,
  run,
}: {
  tx: ChainQueueItem;
  toast: (message: string) => void;
  mode: "RPC" | "SIMULATION";
  canExecute: boolean;
  busy: string | null;
  run: Run;
}) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [officerHash, setOfficerHash] = useState("");
  const [label, cls] = STATUS[tx.status];
  // RPC mode: RWAXI never signs the tenant's calls; the officer's or issuer's own signed tx is registered by hash.
  const officerSigned = mode === "RPC" && TENANT_SIGNED_KINDS.has(tx.kind);
  return (
    <article data-chain-tx={tx.status} className="border border-white/15 bg-[#120726]">
      <header className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10">
        <span className={`font-mono text-[10.5px] px-2 py-0.5 ${cls}`}>{tr(label)}</span>
        <Mono className="text-[11px] text-[#A79FC0]">{tx.network}</Mono>
        <Mono className="text-[11px] text-[#A79FC0]">{utc(tx.createdAt)}</Mono>
        {(tx.investorName || tx.offeringCode) && (
          <span className="text-[11px] text-[#C9C1E3]">
            {[tx.investorName, tx.offeringCode].filter(Boolean).join(" · ")}
          </span>
        )}
        <Mono className="text-[11px] text-[#A79FC0] ml-auto">
          {tx.txHash ? `tx ${shortHash(tx.txHash.slice(2), 8, 6)}` : tr("sin tx hash · no enviada")}
          {tx.blockNumber && ` · block ${tx.blockNumber}`}
        </Mono>
      </header>
      <div className="px-4 py-3 flex flex-col gap-2">
        <p className="font-mono text-[12.5px] leading-[1.6] break-words">
          <span className="text-[#C4B5FD]">{tx.contract}</span>
          <span className="text-[#A79FC0]">.</span>
          <span className="text-rxAqua">{tx.fn}</span>
          <span className="text-[#A79FC0]">(</span>
          {tx.args.map((a, i) => (
            <span key={a.name}>
              <span className="text-[#A79FC0]">{`${a.type} ${a.name}: `}</span>
              <span className="text-white" title={a.value}>
                {short(a.value)}
              </span>
              {i < tx.args.length - 1 && <span className="text-[#A79FC0]">{", "}</span>}
            </span>
          ))}
          <span className="text-[#A79FC0]">)</span>
        </p>
        <p className="font-mono text-[10.5px] text-[#A79FC0] break-words">
          {tr("firma requerida: {role} → {contract} @ {address}", {
            role: tx.signerRole,
            contract: tx.contract,
            address: short(tx.contractAddress),
          })}
        </p>
        {tx.note && <p className="font-mono text-[10.5px] text-[#D9A24A] break-words">{`⚠ ${tx.note}`}</p>}
        {tx.status === "PENDING" && (
          <p
            data-blocked={tx.blockedReason ? "true" : "false"}
            className={`font-mono text-[10.5px] break-words ${tx.blockedReason ? "text-[#FF8A80]" : "text-[#6EE7B7]"}`}
          >
            {tx.blockedReason
              ? `⛔ ${tx.blockedReason}`
              : "✓ " + tr("ejecutable: prelación e invariantes del contrato verificadas")}
          </p>
        )}
        {tx.execution && (
          <p
            className="font-mono text-[10.5px] text-[#A79FC0] break-words"
            data-execution={tx.execution.mode}
          >
            {`${tx.execution.mode === "SIMULATION" ? tr("simulación determinista · firmada sin difundir") : "RPC"} · signer ${
              tx.execution.signer ? short(tx.execution.signer) : "—"
            } · nonce ${tx.execution.nonce ?? "—"}${tx.execution.executedAt ? ` · ${utc(tx.execution.executedAt)}` : ""}`}
          </p>
        )}
        {canExecute && tx.status === "PENDING" && !officerSigned && (
          <button
            disabled={!!busy || !!tx.blockedReason}
            onClick={() => run(tx.id, () => executeChainTransaction(tx.id))}
            className="self-start font-mono text-[11px] bg-white text-rxDeep px-2.5 py-1.5 inline-flex items-center gap-1.5 focus-ring disabled:opacity-40"
          >
            <Icon
              name={busy === tx.id ? "Loader2" : "Play"}
              size={13}
              className={busy === tx.id ? "spin" : ""}
            />
            {tr("Firmar y ejecutar")}
          </button>
        )}
        {canExecute && tx.status === "PENDING" && officerSigned && (
          <div className="flex flex-wrap gap-2 items-center">
            <label htmlFor={`officer-${tx.id}`} className="font-mono text-[10.5px] text-[#A79FC0]">
              {REGISTRY_KINDS.has(tx.kind)
                ? tr("tx hash firmado por el Oficial de Cumplimiento")
                : tr("tx hash firmado por el emisor")}
            </label>
            <input
              id={`officer-${tx.id}`}
              value={officerHash}
              onChange={(ev) => setOfficerHash(ev.target.value)}
              placeholder="0x…"
              className="flex-1 min-w-[220px] bg-[#0B0518] border border-white/15 text-white font-mono text-[11px] px-2 py-1.5"
            />
            <button
              disabled={!!busy || !!tx.blockedReason || !/^0x[0-9a-fA-F]{64}$/.test(officerHash.trim())}
              onClick={() => run(tx.id, () => registerOfficerTransaction(tx.id, officerHash))}
              className="font-mono text-[11px] bg-white text-rxDeep px-2.5 py-1.5 focus-ring disabled:opacity-40"
            >
              {tr("Registrar tx")}
            </button>
          </div>
        )}
        {tx.expectedEvent && (
          <div className="border-l-2 border-[#D9A24A] pl-3">
            <p className="font-mono text-[11.5px]">
              <span className="text-[#D9A24A]">{tx.status === "PENDING" ? tr("emitirá") : "emit"}</span>{" "}
              <span className="text-white">{tx.expectedEvent.signature}</span>
            </p>
            <p className="font-mono text-[10px] text-[#A79FC0]">
              {"topic0 "}
              {shortHash(tx.expectedEvent.topic0.slice(2), 12, 8)}
            </p>
          </div>
        )}
        {tx.calldata ? (
          <>
            <button
              onClick={() => setOpen(!open)}
              className="self-start font-mono text-[11px] text-rxAqua focus-ring"
            >
              {open ? "▾" : "▸"}
              {` calldata (${(tx.calldata.length - 2) / 2} bytes) · selector ${tx.selector}`}
            </button>
            {open && (
              <div className="flex flex-col gap-1.5">
                <p className="font-mono text-[10.5px] text-[#A79FC0]">{tx.signature}</p>
                <pre className="font-mono text-[10.5px] leading-[1.6] text-white bg-[#0B0518] border border-white/10 p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  <span className="text-[#D9A24A]">{tx.selector}</span>
                  {(tx.calldata.slice(10).match(/.{1,64}/g) ?? []).map((word, i) => (
                    <span key={i}>{`\n${word}`}</span>
                  ))}
                </pre>
                <button
                  onClick={() =>
                    copyText(tx.calldata!, (ok: boolean) =>
                      toast(ok ? tr("Calldata copiado") : tr("Selecciona el texto para copiarlo")),
                    )
                  }
                  className="self-start font-mono text-[11px] text-rxAqua border border-white/15 px-2 py-1 focus-ring"
                >
                  {tr("Copiar calldata")}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="font-mono text-[10.5px] text-[#A79FC0]">
            {`${tx.signature} · ${tr("argumentos de registro (sin calldata reconstruible)")}`}
          </p>
        )}
      </div>
    </article>
  );
}
