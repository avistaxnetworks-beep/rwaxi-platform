"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { Mono } from "@/app/_components/ui/primitives";
import { copyText, shortHash } from "@/app/_lib/format";
import type { ChainQueueItem, ChainQueueResponse } from "@/app/_lib/chain-queue-types";

const POLL_MS = 10_000;

const short = (v: string) => (/^0x[0-9a-fA-F]{24,}$/.test(v) ? `0x${shortHash(v.slice(2), 10, 6)}` : v);
const utc = (iso: string) => `${iso.slice(0, 19).replace("T", " ")} UTC`;

const STATUS: Record<ChainQueueItem["status"], [string, string]> = {
  PENDING: ["⏳ PENDING · en cola", "bg-[#3a2a08] text-[#D9A24A]"],
  CONFIRMED: ["✓ CONFIRMED", "bg-[#0c3a2c] text-[#6EE7B7]"],
  REVERTED: ["✗ REVERTED", "bg-[#3a1018] text-[#FF8A80]"],
};

/** Inspector tab 4: ChainTransaction rows of the host tenant, read from PostgreSQL (RLS). */
export function ChainQueueTab({
  selectedSlug,
  selectedName,
  toast,
}: {
  selectedSlug: string;
  selectedName: string;
  toast: (message: string) => void;
}) {
  const [scope, setScope] = useState<"pending" | "all">("pending");
  const [res, setRes] = useState<ChainQueueResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/chain/transactions?scope=${scope}`, { cache: "no-store" });
      setRes((await r.json()) as ChainQueueResponse);
    } catch {
      setRes({ ok: false, error: "No se pudo contactar el servidor." });
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="flex flex-col gap-3" data-chain-queue>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex border border-white/15 p-0.5" role="group" aria-label="Estado">
          {(
            [
              ["pending", "Pendientes"],
              ["all", "Todas"],
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
          Refrescar
        </button>
      </div>

      {res?.ok && (
        <Mono className="text-[11px] text-[#A79FC0]">
          {`PostgreSQL · ChainTransaction · RLS ${res.tenant.displayName} · ${res.items.length} transacción(es) · más reciente primero`}
        </Mono>
      )}
      {res?.ok && res.tenant.slug !== selectedSlug && (
        <p className="font-mono text-[11.5px] text-[#D9A24A] border border-[#D9A24A]/40 px-3 py-2">
          {`El selector muestra ${selectedName}, pero desde este host RLS sólo permite consultar ${res.tenant.displayName}.`}
        </p>
      )}

      {!res && <p className="font-mono text-[12px] text-[#A79FC0]">Consultando ChainTransaction…</p>}
      {res && !res.ok && (
        <p role="alert" className="font-mono text-[12px] text-[#A79FC0] border border-white/15 px-4 py-6 text-center">
          {res.error}
          <span className="block mt-1">
            La cola persistida se consulta desde el portal o el backoffice de un tenant ({"{slug}"}.rwaxi.com).
          </span>
        </p>
      )}
      {res?.ok && res.items.map((tx) => <QueueCard key={tx.id} tx={tx} toast={toast} />)}
      {res?.ok && !res.items.length && (
        <p className="font-mono text-[12px] text-[#A79FC0] border border-white/15 px-4 py-6 text-center">
          {scope === "pending" ? "No hay transacciones pendientes para este tenant." : "Sin transacciones para este tenant."}
        </p>
      )}
    </div>
  );
}

function QueueCard({ tx, toast }: { tx: ChainQueueItem; toast: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [label, cls] = STATUS[tx.status];
  return (
    <article data-chain-tx={tx.status} className="border border-white/15 bg-[#120726]">
      <header className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10">
        <span className={`font-mono text-[10.5px] px-2 py-0.5 ${cls}`}>{label}</span>
        <Mono className="text-[11px] text-[#A79FC0]">{tx.network}</Mono>
        <Mono className="text-[11px] text-[#A79FC0]">{utc(tx.createdAt)}</Mono>
        {(tx.investorName || tx.offeringCode) && (
          <span className="text-[11px] text-[#C9C1E3]">{[tx.investorName, tx.offeringCode].filter(Boolean).join(" · ")}</span>
        )}
        <Mono className="text-[11px] text-[#A79FC0] ml-auto">
          {tx.txHash ? `tx ${shortHash(tx.txHash.slice(2), 8, 6)}` : "sin tx hash · no enviada"}
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
          {`firma requerida: ${tx.signerRole} → ${tx.contract} @ ${short(tx.contractAddress)}`}
        </p>
        {tx.expectedEvent && (
          <div className="border-l-2 border-[#D9A24A] pl-3">
            <p className="font-mono text-[11.5px]">
              <span className="text-[#D9A24A]">{tx.status === "PENDING" ? "emitirá" : "emit"}</span>{" "}
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
            <button onClick={() => setOpen(!open)} className="self-start font-mono text-[11px] text-rxAqua focus-ring">
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
                  onClick={() => copyText(tx.calldata!, (ok: boolean) => toast(ok ? "Calldata copiado" : "Selecciona el texto para copiarlo"))}
                  className="self-start font-mono text-[11px] text-rxAqua border border-white/15 px-2 py-1 focus-ring"
                >
                  Copiar calldata
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="font-mono text-[10.5px] text-[#A79FC0]">{`${tx.signature} · argumentos de registro (sin calldata reconstruible)`}</p>
        )}
      </div>
    </article>
  );
}
