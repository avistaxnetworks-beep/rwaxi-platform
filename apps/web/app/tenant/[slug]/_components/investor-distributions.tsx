"use client";

import { useState } from "react";
import { allocationLeaf, verifyAllocation } from "@rwaxi/blockchain-sdk/distribution";
import { Icon } from "@/app/_components/ui/icon";
import { CopyChip } from "@/app/_components/ui/primitives";
import { useI18n } from "@/app/_i18n/provider";
import { nf, shortHash } from "@/app/_lib/format";
import type { PersistedDistribution } from "../_lib/journey-types";

type Check = { ok: boolean; leaf: string };

/** Allocations are committed in USD cents (Merkle leaves): shown exactly, never at the demo TRM. */
const usd = (n: number) => `USD ${nf(2).format(n)}`;

/**
 * Portfolio · yield distributions allocated to the investor (PostgreSQL), each with its Merkle
 * proof. "Verificar prueba" recomputes the leaf from the allocation and folds the proof up to the
 * root in this browser (@rwaxi/blockchain-sdk/distribution): no server is trusted for the check.
 */
export function InvestorDistributions({ distributions, toast }: { distributions: PersistedDistribution[]; toast: (message: string) => void }) {
  const { tr } = useI18n();
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [open, setOpen] = useState<string | null>(null);
  if (!distributions.length) return null;

  const total = distributions.reduce((s, d) => s + d.amount, 0);
  const verify = (d: PersistedDistribution) => {
    const claim = { distributionId: d.distributionId, wallet: d.wallet, units: d.units, amountCents: d.amountCents };
    let leaf = "";
    try {
      leaf = allocationLeaf(claim);
    } catch {
      /* malformed allocation: reported as not verified */
    }
    setChecks((c) => ({ ...c, [d.id]: { ok: verifyAllocation(claim, d.proof, d.merkleRoot), leaf } }));
  };

  return (
    <div className="flex flex-col gap-3 mt-2" data-investor-distributions>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{tr("Distribuciones de rendimientos")}</p>
        <p className="text-[12px] text-inkBody">
          {tr("Asignado:")}{" "}
          <span className="font-mono" data-distributions-total={total.toFixed(2)}>
            {usd(total)}
          </span>
        </p>
      </div>
      <ul className="border border-line">
        {distributions.map((d) => {
          const check = checks[d.id];
          return (
            <li key={d.id} className="px-4 py-3 border-b border-line last:border-b-0 text-[12.5px]" data-distribution-allocation={d.period} data-status={d.status}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-inkBody">
                    <span className="font-mono font-semibold text-rxPurple">{d.period}</span>
                    {` · ${usd(d.amount)}`}
                    <span className="text-muted">
                      {" · "}
                      {tr("{units} de {total} tokens", { units: nf(0).format(d.units), total: nf(0).format(d.totalUnits), count: d.totalUnits })}
                      {" · "}
                      {tr("{n} tenedor(es)", { n: d.holders, count: d.holders })}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted">
                    {tr("Distribución total {amount}", { amount: usd(d.totalUsd) })}
                    {d.currency === "COP" &&
                      ` (${tr("declarada en COP {amount} a {rate} COP/USD", { amount: nf(2).format(d.amountDeclared), rate: nf(2).format(d.fxRate ?? 0) })})`}
                  </p>
                </div>
                <span className={`text-[10.5px] font-semibold px-2 py-0.5 ${d.status === "ANCHORED" ? "bg-aquaTint text-aquaInk" : "bg-goldTint text-goldInk"}`}>
                  {d.status === "ANCHORED" ? tr("Raíz anclada") : tr("Raíz en cola")}
                </span>
              </div>
              <p className="font-mono text-[10.5px] text-muted mt-1 break-all">{`Merkle root ${d.merkleRoot}`}</p>
              {d.status === "ANCHORED" && d.anchorTxHash ? (
                <p className="text-[11px] text-aquaInk mt-0.5 flex flex-wrap items-center gap-1.5">
                  {"anchorDistributionRoot() · "}
                  <CopyChip text={d.anchorTxHash} display={shortHash(d.anchorTxHash, 10, 6)} toast={toast} className="text-[11px]" />
                  {d.anchorMode === "RPC" ? ` · ${tr("confirmada en red")}` : ` · ${tr("simulación firmada (sin difundir)")}`}
                </p>
              ) : (
                <p className="text-[11px] text-goldInk mt-0.5">{tr("El emisor aún no ancla la raíz en el token (anchorDistributionRoot en cola).")}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <button
                  onClick={() => verify(d)}
                  data-verify-proof={d.id}
                  className="border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-rxBlue inline-flex items-center gap-1.5 focus-ring"
                >
                  <Icon name="ShieldCheck" size={13} />
                  {tr("Verificar prueba de Merkle")}
                </button>
                <button onClick={() => setOpen(open === d.id ? null : d.id)} className="text-[11.5px] font-semibold text-rxBlue focus-ring" aria-expanded={open === d.id}>
                  {open === d.id ? tr("Ocultar prueba") : d.proof.length === 1 ? tr("Ver prueba (1 hash)") : tr("Ver prueba ({n} hashes)", { n: d.proof.length, count: d.proof.length })}
                </button>
                {check && (
                  <span role="status" data-proof-check={check.ok ? "valid" : "invalid"} className={`text-[11.5px] font-semibold ${check.ok ? "text-aquaInk" : "text-[#B42318]"}`}>
                    {check.ok ? tr("✓ La prueba reconstruye la raíz") : tr("✗ La prueba no corresponde a la raíz")}
                  </span>
                )}
              </div>
              {open === d.id && (
                <div className="mt-2 bg-cloud border border-line px-3 py-2.5 font-mono text-[10.5px] text-inkBody flex flex-col gap-1 break-all">
                  <p className="text-muted">{tr("hoja = SHA-256(JSON canónico de la asignación: v, kind, distributionId, wallet, units, amountCents)")}</p>
                  <p>{`distributionId ${d.distributionId}`}</p>
                  <p>{`wallet ${d.wallet} · units ${d.units} · amountCents ${d.amountCents}`}</p>
                  <p>{`${tr("hoja")} ${check?.leaf || d.leafHash}`}</p>
                  {d.proof.length === 0 ? (
                    <p className="text-muted">{tr("Única asignación: la hoja es la raíz.")}</p>
                  ) : (
                    d.proof.map((h, i) => <p key={h + i}>{`${i + 1}. ${h}`}</p>)
                  )}
                  <p className="text-muted">{`token ${d.token.address ?? "—"} · ${d.token.network}`}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
