"use client";

import { useState } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { nf } from "@/app/_lib/format";
import type { PlatformDistributionRow, PlatformMetricsResult } from "../_lib/types";

const utc = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;
const short = (h: string, a = 10, b = 6) => `${h.slice(0, a)}…${h.slice(-b)}`;
const amountIn = (currency: string, n: number) => `${currency} ${nf(2).format(n)}`;
const kb = (bytes: number) => `${nf(0).format(Math.max(1, Math.round(bytes / 1024)))} KB`;
const MODE: Record<string, string> = { RPC: "en red", SIMULATION: "simulación firmada, no difundida" };

/**
 * Module D · supervision of every developer's yield distributions (read-only). The issuer declares them, anchors their
 * root (DISTRIBUTION_ROLE) and pays them through its fiduciary or its treasury; RWAXI follows the trace: the record
 * date and how the register was checked, the supporting document by its SHA-256, the anchored root and every payment
 * instruction validated against the compliance whitelist.
 */
export function PlatformDistributions({ metrics }: { metrics: PlatformMetricsResult }) {
  const [tenant, setTenant] = useState("todos");
  if (!metrics.ok) {
    return (
      <div role="alert" className="bg-white border border-[#F3C5C0] px-5 py-4 text-[13px] text-[#B42318] flex gap-2 mb-8">
        <Icon name="AlertTriangle" size={16} className="mt-0.5 shrink-0" />
        <span>{metrics.error}</span>
      </div>
    );
  }
  const { distributions, distributionEvents, tenants } = metrics.data;
  const rows = distributions.filter((d) => tenant === "todos" || d.slug === tenant);
  const withheld = rows.reduce((s, d) => s + (d.batches.at(-1)?.withheld ?? 0), 0);
  const kpis: [string, string, string, string][] = [
    ["declared", "Distribuciones declaradas", String(rows.length), `${rows.filter((d) => d.leafVersion >= 2).length} con fecha de corte y soporte documental`],
    ["anchored", "Raíces ancladas", `${rows.filter((d) => d.status === "ANCHORED").length}/${rows.length}`, "anchorDistributionRoot() firmado por el emisor"],
    ["usd", "Volumen declarado (equiv. USD)", amountIn("USD", rows.reduce((s, d) => s + d.totalUsd, 0)), "COP a la tasa declarada; USDC/USDT 1:1"],
    [
      "payouts",
      "Asignaciones con instrucción de pago",
      `${rows.reduce((s, d) => s + d.instructed, 0)}/${rows.reduce((s, d) => s + d.allocations, 0)}`,
      `${rows.reduce((s, d) => s + d.batches.length, 0)} instrucción(es) · ${withheld} retenida(s) en la última de cada distribución`,
    ],
  ];
  return (
    <div className="flex flex-col gap-6" data-platform-distributions>
      <div className="bg-white border border-line px-5 py-3.5 text-[12px] text-muted leading-relaxed flex gap-2">
        <Icon name="ShieldCheck" size={15} className="text-rxGold mt-0.5 shrink-0" />
        <p>
          Solo lectura. Cada desarrollador declara sus distribuciones, ancla la raíz con su propia wallet (DISTRIBUTION_ROLE) y
          paga por su fiduciaria o su tesorería: RWAXI no custodia ni mueve los fondos ni tiene ese rol. Aquí se supervisa la
          trazabilidad: fecha de corte, SHA-256 del soporte documental, raíz anclada e instrucciones de pago validadas contra la
          whitelist de cumplimiento.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted mr-1">Tenant</span>
        {[["todos", "Todos"], ...tenants.map((t) => [t.slug, t.displayName])].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTenant(key!)}
            aria-pressed={tenant === key}
            className={`px-3 py-1.5 text-[12px] font-medium border focus-ring ${tenant === key ? "bg-rxPurple border-rxPurple text-white" : "bg-white border-line text-inkBody hover:border-rxPurple"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line">
        {kpis.map(([id, label, value, sub]) => (
          <div key={id} className="bg-white p-4 min-w-0" data-kpi={`dist-${id}`}>
            <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{label}</p>
            <p className="font-mono text-[22px] text-rxPurple tnum mt-1 break-words">{value}</p>
            <p className="text-[11px] text-muted mt-1 leading-snug">{sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-line overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-line">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Distribuciones de rendimientos · todos los desarrolladores</p>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-5 text-[12.5px] text-muted">Ningún desarrollador ha declarado distribuciones todavía.</p>
        ) : (
          <table className="w-full min-w-[1120px] text-[12px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                <th className="font-semibold px-5 py-3">Desarrollador · oferta</th>
                <th className="font-semibold px-3 py-3">Fecha de corte</th>
                <th className="font-semibold px-3 py-3 text-right">Monto</th>
                <th className="font-semibold px-3 py-3 text-right">Tenedores</th>
                <th className="font-semibold px-3 py-3">Soporte documental</th>
                <th className="font-semibold px-3 py-3">Raíz de Merkle</th>
                <th className="font-semibold px-5 py-3">Pagos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <Row key={d.id} d={d} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white border border-line">
        <p className="px-5 py-3.5 border-b border-line font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
          Trazabilidad · últimos eventos de distribución (AuditEvent, inmutable)
        </p>
        {distributionEvents.length === 0 ? (
          <p className="px-5 py-4 text-[12.5px] text-muted">Sin eventos.</p>
        ) : (
          <ul>
            {distributionEvents.map((e) => (
              <li key={e.id} className="px-5 py-2.5 border-b border-line last:border-b-0 text-[12px] flex flex-wrap gap-x-4 gap-y-1" data-distribution-event={e.action}>
                <span className="font-mono text-[11px] text-muted">{utc(e.at)}</span>
                <span className="font-semibold text-inkBody">{e.tenant}</span>
                <span className="text-inkBody flex-1 min-w-[280px]">{e.summary}</span>
                <span className="text-muted">{e.actorEmail}</span>
                {e.subjectHash && <span className="font-mono text-[10.5px] text-muted">{short(e.subjectHash)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({ d }: { d: PlatformDistributionRow }) {
  const last = d.batches.at(-1);
  return (
    <tr className="border-b border-line last:border-b-0 align-top" data-platform-distribution={d.id} data-status={d.status} data-period={d.period}>
      <td className="px-5 py-3">
        <p className="font-semibold text-inkBody">{d.tenant}</p>
        <p className="font-mono text-[11px] text-muted">{`${d.offeringCode} · ${d.period} · ${d.network}`}</p>
        <p className="text-[10.5px] text-muted">{`${utc(d.declaredAt)} · ${d.declaredBy ?? "—"}`}</p>
      </td>
      <td className="px-3 py-3 text-[11.5px]">
        {d.recordDate ? (
          <>
            <p className="font-mono text-inkBody">{d.recordDate}</p>
            <p className="text-muted">
              {d.snapshotMode === "RPC" ? "cotejada con balanceOfAt / totalSupplyAt" : "réplica de emisiones confirmadas (simulación)"}
            </p>
          </>
        ) : (
          <p className="text-muted">{`snapshot al declarar · ${utc(d.snapshotAt)}`}</p>
        )}
      </td>
      <td className="px-3 py-3 text-right font-mono tnum">
        <p className="text-inkBody" data-amount={d.amount}>
          {amountIn(d.currency, d.amount)}
        </p>
        {d.currency !== "USD" && <p className="text-[10.5px] text-muted">{`≈ ${amountIn("USD", d.totalUsd)}`}</p>}
      </td>
      <td className="px-3 py-3 text-right font-mono tnum">
        <p>{d.holders}</p>
        <p className="text-[10.5px] text-muted">{`${nf(0).format(d.totalUnits)} tokens`}</p>
      </td>
      <td className="px-3 py-3 text-[11px]">
        {d.support ? (
          <>
            <p className="text-inkBody break-all">{`${d.support.fileName} · ${kb(d.support.sizeBytes)}`}</p>
            <p className="font-mono text-muted" data-support-sha256={d.support.sha256}>{`SHA-256 ${short(d.support.sha256, 12, 8)}`}</p>
            <a href={`/api/vault/distribution/${d.id}`} target="_blank" rel="noreferrer" className="text-rxBlue font-semibold" data-support-link={d.id}>
              Ver soporte (re-hasheado y auditado)
            </a>
          </>
        ) : (
          <p className="text-muted">Sin soporte (versión anterior del módulo)</p>
        )}
      </td>
      <td className="px-3 py-3 text-[11px]">
        <p className="font-mono text-muted">{short(d.merkleRoot)}</p>
        {d.status === "ANCHORED" && d.anchor.txHash ? (
          <p className="text-aquaInk">{`Anclada · tx ${short(d.anchor.txHash)} · ${d.anchor.mode ? MODE[d.anchor.mode] : "dato ilustrativo del seed"}`}</p>
        ) : (
          <p className="text-goldInk">anchorDistributionRoot() en cola · la firma el emisor</p>
        )}
      </td>
      <td className="px-5 py-3 text-[11px]" data-payouts-instructed={d.instructed}>
        {d.leafVersion < 2 ? (
          <p className="text-muted">Sin instrucciones (versión anterior)</p>
        ) : (
          <>
            <p className="text-inkBody">{`${d.instructed}/${d.allocations} asignaciones instruidas`}</p>
            {d.batches.map((b) => (
              <p key={b.sequence} className="text-muted" data-console-batch={b.sequence}>
                {`#${b.sequence} · ${utc(b.createdAt)} · ${amountIn(d.currency, b.total)} · ${b.payees} wallet(s)${b.withheld ? ` · ${b.withheld} retenida(s)` : ""} · whitelist ${b.registryMode === "RPC" ? "on-chain" : "cola confirmada"} · SHA-256 ${short(b.instructionHash)}`}
              </p>
            ))}
            {!last && d.status === "ANCHORED" && <p className="text-goldInk">Raíz anclada · sin instrucción de pago todavía</p>}
          </>
        )}
      </td>
    </tr>
  );
}
