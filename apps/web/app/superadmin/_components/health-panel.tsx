"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { nf } from "@/app/_lib/format";
import { checkOnchainCensus, type OnchainCensusResult } from "../actions";
import type { HealthAlert, PlatformHealthReport } from "../_lib/health";
import type { PlatformMetricsResult } from "../_lib/types";

const utc = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;
const short = (h: string | null) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : "—");
const SEVERITY: Record<HealthAlert["severity"], [string, string]> = {
  critical: ["CRÍTICA", "bg-[#FDECEA] text-[#B42318]"],
  warning: ["ATENCIÓN", "bg-goldTint text-goldInk"],
  info: ["INFO", "bg-cloud text-muted"],
};
const AREA: Record<HealthAlert["area"], string> = { chain: "Cola on-chain", census: "Censo de tokens", mail: "Cola de correo" };
const MODE = (m: string | null) => (m === "RPC" ? "en red (RPC)" : m === "SIMULATION" ? "simulación firmada" : "dato ilustrativo del seed");
const STATUS: Record<string, string> = {
  DEPLOYED: "Desplegado",
  PAUSED: "Pausado por el emisor",
  DEPLOYING: "Desplegando",
  NOT_DEPLOYED: "Sin desplegar",
  PENDING: "Despliegue en cola",
  REVERTED: "Despliegue revertido",
  DEFERRED: "Diferido · faltan las wallets",
};

/**
 * Module G · operational health: the ERC-3643 contracts of every developer, the census of issued tokens (the platform's
 * register against the confirmed mints, and on demand in RPC mode the token's own totalSupply) and the alerts of the
 * chain queue (failed attempts, reverts, receipts awaited, rows stuck) and of the mail queue.
 */
export function HealthPanel({ metrics }: { metrics: PlatformMetricsResult }) {
  if (!metrics.ok) return null; // the overview already shows the error
  return <HealthView report={metrics.data.health} />;
}

function HealthView({ report }: { report: PlatformHealthReport }) {
  const [onchain, setOnchain] = useState<OnchainCensusResult | null>(null);
  const [checking, startCheck] = useTransition();
  const [openTenant, setOpenTenant] = useState<string | null>(null);
  const critical = report.alerts.filter((a) => a.severity === "critical").length;
  const warning = report.alerts.filter((a) => a.severity === "warning").length;
  const registries = report.contracts.filter((c) => c.kind === "registry" && c.status === "DEPLOYED").length;
  const tokens = report.contracts.filter((c) => c.kind === "token" && (c.status === "DEPLOYED" || c.status === "PAUSED")).length;
  const pending = report.queue.reduce((s, q) => s + q.pending, 0);
  const retrying = report.queue.reduce((s, q) => s + q.withFailedAttempts, 0);
  const check = () =>
    startCheck(async () => {
      setOnchain(await checkOnchainCensus());
    });

  return (
    <div className="flex flex-col gap-6" data-health-panel data-mode={report.mode}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-line border border-line">
        {(
          [
            ["alerts", "Alertas", `${critical} · ${warning}`, "críticas · de atención", critical ? "text-[#B42318]" : "text-rxPurple"],
            ["contracts", "Contratos ERC-3643", `${registries} · ${tokens}`, "registros · tokens desplegados", "text-rxPurple"],
            [
              "census",
              "Censo de tokens",
              `${report.census.filter((c) => c.consistent).length}/${report.census.length}`,
              "tokens cuyo registro cuadra con sus emisiones",
              report.census.some((c) => !c.consistent) ? "text-[#B42318]" : "text-rxPurple",
            ],
            ["queue", "Cola on-chain", String(pending), `${retrying} con reintentos fallidos`, retrying ? "text-goldInk" : "text-rxPurple"],
            ["mail", "Cola de correo", `${report.mail.pending} · ${report.mail.failed}`, `pendientes · fallidos (${report.mail.retrying} reintentándose)`, "text-rxPurple"],
          ] as const
        ).map(([id, title, value, sub, color]) => (
          <div key={id} className="bg-white p-4 min-w-0" data-kpi={`health-${id}`} data-value={value}>
            <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{title}</p>
            <p className={`font-mono text-[22px] tnum mt-1 ${color}`}>{value}</p>
            <p className="text-[11px] text-muted mt-1 leading-snug">{sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-line">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-2 items-center">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Alertas operativas</p>
          <p className="text-[11px] text-muted font-mono">{`${report.mode === "RPC" ? "Ejecución en red (RPC)" : "Ejecución en simulación"} · ${utc(report.generatedAt)}`}</p>
        </div>
        {report.alerts.length === 0 ? (
          <p className="px-5 py-5 text-[12.5px] text-aquaInk inline-flex items-center gap-2">
            <Icon name="ShieldCheck" size={14} />
            Sin alertas: contratos, censo y colas en orden.
          </p>
        ) : (
          <ul>
            {report.alerts.map((a, i) => {
              const [text, cls] = SEVERITY[a.severity];
              return (
                <li key={`${a.title}-${i}`} className="px-5 py-2.5 border-b border-line last:border-b-0 text-[12px] flex flex-wrap gap-x-4 gap-y-1" data-health-alert={a.area} data-severity={a.severity}>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 self-start ${cls}`}>{text}</span>
                  <span className="text-muted w-[120px]">{AREA[a.area]}</span>
                  <span className="font-semibold text-inkBody">{a.tenant ?? "RWAXI"}</span>
                  <span className="text-inkBody flex-1 min-w-[260px]">
                    <strong>{a.title}</strong>
                    <span className="block text-muted break-all">{a.detail}</span>
                  </span>
                  <span className="font-mono text-[11px] text-muted">{utc(a.at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="bg-white border border-line overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Censo de tokens en circulación</p>
          {report.mode === "RPC" ? (
            <button
              onClick={check}
              disabled={checking}
              data-check-onchain
              className="border border-line px-3 py-1.5 text-[12px] font-semibold text-rxBlue inline-flex items-center gap-1.5 focus-ring disabled:opacity-50"
            >
              <Icon name={checking ? "Loader2" : "RefreshCw"} size={13} className={checking ? "spin" : ""} />
              Consultar totalSupply en la red
            </button>
          ) : (
            <p className="text-[11.5px] text-muted">Simulación: las transacciones firmadas no se difunden, no hay red que consultar.</p>
          )}
        </div>
        {onchain && !onchain.ok && (
          <p role="alert" className="px-5 py-2 text-[12px] text-[#B42318]">
            {onchain.error}
          </p>
        )}
        <table className="w-full min-w-[1000px] text-[12px]">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
              <th className="font-semibold px-5 py-3">Desarrollador · oferta</th>
              <th className="font-semibold px-3 py-3">Token</th>
              <th className="font-semibold px-3 py-3 text-right">Tope</th>
              <th className="font-semibold px-3 py-3 text-right">Registro (MINTED)</th>
              <th className="font-semibold px-3 py-3 text-right">Emisiones confirmadas</th>
              <th className="font-semibold px-3 py-3 text-right">totalSupply on-chain</th>
              <th className="font-semibold px-3 py-3 text-right">Por emitir · reservado</th>
              <th className="font-semibold px-5 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {report.census.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-4 text-muted">
                  Ningún token desplegado todavía.
                </td>
              </tr>
            )}
            {report.census.map((c) => {
              const read = onchain?.ok ? onchain.supplies[c.address.toLowerCase()] : undefined;
              const supply = read && "supply" in read ? read.supply : null;
              const onchainOk = supply === null || supply === c.outboxMinted;
              return (
                <tr
                  key={c.address}
                  className="border-b border-line last:border-b-0"
                  data-census-row={c.offeringCode}
                  data-consistent={c.consistent && onchainOk ? "true" : "false"}
                  data-db-minted={c.dbMinted}
                  data-outbox-minted={c.outboxMinted}
                >
                  <td className="px-5 py-2.5">
                    <p className="font-semibold text-inkBody">{c.tenant}</p>
                    <p className="text-[10.5px] text-muted">{c.offeringCode}</p>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px]">
                    <p>{`${c.symbol} · ${short(c.address)}`}</p>
                    <p className="text-muted">{`${c.network} · ${MODE(c.deployMode)}`}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{nf(0).format(c.maxSupply)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{nf(0).format(c.dbMinted)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{nf(0).format(c.outboxMinted)}</td>
                  <td className="px-3 py-2.5 text-right font-mono" data-onchain-supply={supply ?? ""}>
                    {report.mode !== "RPC" ? (
                      <span className="text-muted">simulación</span>
                    ) : !read ? (
                      <span className="text-muted">—</span>
                    ) : "supply" in read ? (
                      nf(0).format(read.supply)
                    ) : (
                      <span className="text-[#B42318]" title={read.error}>
                        sin lectura
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-muted">{`${nf(0).format(c.mintPending)} · ${nf(0).format(c.reserved)}`}</td>
                  <td className="px-5 py-2.5 text-[11.5px]">
                    {c.consistent && onchainOk ? (
                      <span className="text-aquaInk font-semibold">✓ cuadra</span>
                    ) : (
                      <span className="text-[#B42318] font-semibold">✗ descuadre</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-line overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-line">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Contratos ERC-3643 desplegados</p>
          <p className="text-[11.5px] text-muted mt-0.5 font-mono">
            {report.factories.length
              ? `RwaxiTenantFactory: ${report.factories.map((f) => `${short(f.address)} (${f.network}${f.configured ? ", RWAXI_FACTORY_ADDRESS" : ""})`).join(" · ")}`
              : "Sin factoría registrada todavía."}
          </p>
        </div>
        <table className="w-full min-w-[960px] text-[12px]">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
              <th className="font-semibold px-5 py-3">Desarrollador</th>
              <th className="font-semibold px-3 py-3">Contrato</th>
              <th className="font-semibold px-3 py-3">Dirección · red</th>
              <th className="font-semibold px-3 py-3">Estado</th>
              <th className="font-semibold px-3 py-3">Ejecución</th>
              <th className="font-semibold px-5 py-3">Comisión fija</th>
            </tr>
          </thead>
          <tbody>
            {report.contracts.map((c, i) => (
              <tr key={`${c.slug}-${c.kind}-${i}`} className="border-b border-line last:border-b-0" data-contract={c.kind} data-contract-status={c.status}>
                <td className="px-5 py-2.5 font-semibold text-inkBody">{c.tenant}</td>
                <td className="px-3 py-2.5">{c.label}</td>
                <td className="px-3 py-2.5 font-mono text-[11px]">{c.address ? `${short(c.address)} · ${c.network ?? "—"}` : "—"}</td>
                <td className="px-3 py-2.5">
                  <span className={c.status === "DEPLOYED" ? "text-aquaInk" : c.status === "REVERTED" ? "text-[#B42318]" : "text-goldInk"}>
                    {STATUS[c.status] ?? c.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[11px] text-muted">{c.address ? MODE(c.mode) : "—"}</td>
                <td className="px-5 py-2.5 font-mono">{c.platformFeeBps === null ? "—" : `${c.platformFeeBps} pb`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-line overflow-x-auto">
        <p className="px-5 py-3.5 border-b border-line font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Cola de transacciones on-chain por desarrollador</p>
        <table className="w-full min-w-[960px] text-[12px]">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
              <th className="font-semibold px-5 py-3">Desarrollador</th>
              <th className="font-semibold px-3 py-3 text-right">En cola</th>
              <th className="font-semibold px-3 py-3 text-right">Bloqueadas</th>
              <th className="font-semibold px-3 py-3 text-right">Con reintentos</th>
              <th className="font-semibold px-3 py-3 text-right">Esperando recibo</th>
              <th className="font-semibold px-3 py-3 text-right">Revertidas</th>
              <th className="font-semibold px-3 py-3 text-right">Confirmadas · retiradas</th>
              <th className="font-semibold px-5 py-3">Más antigua</th>
            </tr>
          </thead>
          <tbody>
            {report.queue.map((q) => (
              <QueueRows key={q.slug} q={q} report={report} open={openTenant === q.slug} toggle={() => setOpenTenant(openTenant === q.slug ? null : q.slug)} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-line px-5 py-3.5 text-[12px] text-muted flex flex-wrap gap-x-6 gap-y-1" data-mail-queue>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="Mail" size={13} className="text-rxGold" />
          Cola de correo
        </span>
        <span>{`${report.mail.pending} pendiente(s)`}</span>
        <span>{`${report.mail.retrying} reintentándose`}</span>
        <span>{`${report.mail.failed} sin entregar (FAILED)`}</span>
        <span>{report.mail.oldestPendingAt ? `el más antiguo desde ${utc(report.mail.oldestPendingAt)}` : "sin pendientes"}</span>
      </div>
    </div>
  );
}

function QueueRows({ q, report, open, toggle }: { q: PlatformHealthReport["queue"][number]; report: PlatformHealthReport; open: boolean; toggle: () => void }) {
  const rows = report.pending.filter((p) => p.slug === q.slug);
  return (
    <>
      <tr className="border-b border-line" data-queue-tenant={q.slug}>
        <td className="px-5 py-2.5">
          <button onClick={toggle} disabled={!rows.length} className="font-semibold text-inkBody focus-ring disabled:cursor-default" aria-expanded={open}>
            {q.tenant}
            {rows.length > 0 && <span className="text-rxBlue text-[11px] ml-2">{open ? "ocultar" : "ver pendientes"}</span>}
          </button>
        </td>
        <td className="px-3 py-2.5 text-right font-mono">{q.pending}</td>
        <td className="px-3 py-2.5 text-right font-mono">{q.blocked}</td>
        <td className={`px-3 py-2.5 text-right font-mono ${q.withFailedAttempts ? "text-goldInk font-semibold" : ""}`}>{q.withFailedAttempts}</td>
        <td className="px-3 py-2.5 text-right font-mono">{q.awaitingReceipt}</td>
        <td className={`px-3 py-2.5 text-right font-mono ${q.reverted ? "text-[#B42318] font-semibold" : ""}`}>{q.reverted}</td>
        <td className="px-3 py-2.5 text-right font-mono text-muted">{`${q.confirmed} · ${q.cancelled}`}</td>
        <td className="px-5 py-2.5 font-mono text-[11px] text-muted">{q.oldestPendingAt ? utc(q.oldestPendingAt) : "—"}</td>
      </tr>
      {open &&
        rows.map((p) => (
          <tr key={p.id} className="border-b border-line bg-cloud" data-pending-row={p.id} data-attempts={p.attempts}>
            <td className="px-5 py-2 text-[11px] font-mono" colSpan={2}>
              {`${p.kind} · ${p.method}`}
              <span className="block text-muted">{`${p.network} · en cola desde ${utc(p.createdAt)}`}</span>
            </td>
            <td className="px-3 py-2 text-[11px]" colSpan={6}>
              {p.attempts > 0 && <p className="text-goldInk font-semibold">{`${p.attempts} intento(s) fallido(s) · último ${p.lastAttemptAt ? utc(p.lastAttemptAt) : "—"}`}</p>}
              {p.error && <p className="text-muted break-all">{p.error}</p>}
              {p.awaitingReceipt ? (
                <p className="text-inkBody">{`Enviada a la red · esperando recibo (tx ${short(p.txHash)})`}</p>
              ) : p.blockedReason ? (
                <p className="text-inkBody">{`Bloqueada: ${p.blockedReason}`}</p>
              ) : (
                <p className="text-aquaInk">Ejecutable: lista para su firmante.</p>
              )}
            </td>
          </tr>
        ))}
    </>
  );
}
