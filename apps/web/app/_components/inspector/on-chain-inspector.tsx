// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useEffect } from "react";
import { ChainQueueTab } from "@/app/_components/inspector/chain-queue-tab";
import { LogTab } from "@/app/_components/inspector/log-tab";
import { SimTab } from "@/app/_components/inspector/sim-tab";
import { StateTab } from "@/app/_components/inspector/state-tab";
import { Icon } from "@/app/_components/ui/icon";
import { chainStateFor, t_net } from "@/app/_lib/chain/simulator";
import { PROJECTS, byId } from "@/app/_lib/data/projects";
import { nf } from "@/app/_lib/format";
import { useI18n } from "@/app/_i18n/provider";

export function OnChainInspector({
  open: e,
  onClose: a,
  tenants: t,
  journeys: o,
  chainX: n,
  setChainX: l,
  chainLog: r,
  emit: i,
  tenantId: s,
  setTenantId: c,
  tab: d,
  setTab: p,
  toast: m,
  // Executing the persisted queue is a backoffice decision (environment-frame passes env === "backoffice").
  canExecute: x,
  // Session that may unlock the contracts' source (backoffice / console); none in the vitrina and the portal.
  sourceSession: q,
}) {
  const { tr, lang } = useI18n();
  if (
    (useEffect(() => {
      if (!e) return;
      const b = (y) => y.key === "Escape" && a();
      return (window.addEventListener("keydown", b), () => window.removeEventListener("keydown", b));
    }, [e, a]),
    !e)
  )
    return null;
  const u = byId(s),
    v = chainStateFor(u, t, o, n, tr),
    h = [
      ["state", tr("Contract State Explorer")],
      ["log", tr("Live Calldata & Event Log")],
      ["sim", tr("Compliance Simulator")],
      ["db", tr("Cola PostgreSQL · ChainTransaction")],
    ];
  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={tr("Inspector On-Chain")}
      lang={lang}
      dir="ltr"
    >
      <div className="absolute inset-0 bg-[#0B0518]/60" onClick={a} />
      <aside
        className="relative w-full max-w-[940px] h-full bg-rxDeep text-white flex flex-col border-l border-white/15 insp-in"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <header className="px-5 py-3.5 border-b border-white/10 flex flex-wrap items-center gap-3">
          <Icon name="Link" size={18} className="text-rxAqua" />
          <div className="min-w-0">
            <p className="font-mono text-[13.5px] font-semibold">
              {tr("Inspector On-Chain (OpenZeppelin v5)")}
            </p>
            <p className="font-mono text-[10.5px] text-[#A79FC0]">
              {"ITokenizationAdapter → EVM · "}
              {t_net(t, s)}
              {" · "}
              {tr("bloque")} {nf(0).format(r.length ? Math.max(...r.map((b) => b.block)) : 0)}
            </p>
          </div>
          <label htmlFor="insp-tenant" className="sr-only">
            Organization
          </label>
          <select
            id="insp-tenant"
            value={s}
            onChange={(b) => c(b.target.value)}
            className="ml-auto bg-[#1D1236] border border-white/15 text-white font-mono text-[11.5px] px-2 py-1.5 focus-ring"
          >
            {PROJECTS.map((b) => (
              <option key={b.id} value={b.id}>
                {t[b.id].displayName}
              </option>
            ))}
          </select>
          <button
            onClick={a}
            aria-label={tr("Cerrar inspector")}
            className="p-1.5 text-[#A79FC0] hover:text-white focus-ring"
          >
            <Icon name="X" size={18} />
          </button>
        </header>
        <div className="px-5 flex overflow-x-auto border-b border-white/10" role="tablist">
          {h.map(([b, y], f) => (
            <button
              key={b}
              role="tab"
              aria-selected={d === b}
              onClick={() => p(b)}
              className={`shrink-0 mr-6 py-2.5 font-mono text-[11.5px] border-b-2 focus-ring ${d === b ? "border-rxAqua text-white" : "border-transparent text-[#A79FC0] hover:text-white"}`}
            >
              <span className="text-rxAqua mr-1.5">{f + 1}</span>
              {y}
              {b === "log" && <span className="ml-1.5 text-[10px] bg-white/10 px-1.5">{r.length}</span>}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {d === "state" && <StateTab s={v} toast={m} />}
          {d === "log" && <LogTab log={r} tenants={t} tenantId={s} toast={m} />}
          {d === "sim" && <SimTab s={v} emit={i} setChainX={l} toast={m} sourceSession={q} />}
          {d === "db" && (
            <ChainQueueTab
              selectedSlug={t[s].slug}
              selectedName={t[s].displayName}
              toast={m}
              canExecute={!!x}
            />
          )}
        </div>
        <footer className="px-5 py-2.5 border-t border-white/10 font-mono text-[10.5px] text-[#A79FC0]">
          {d === "db"
            ? tr(
                "Datos reales de PostgreSQL (ChainTransaction, aislado por RLS). El calldata se codifica con los ABI compilados de RwaxiComplianceRegistry y RwaxiPropertyToken. «Firmar y ejecutar» respeta la prelación (approveInvestor antes del mint) y las invariantes de los contratos; en modo simulación firma con OPERATOR_PRIVATE_KEY sin difundir a la red.",
              )
            : tr(
                "Simulación determinista del estado de los contratos; el código fuente es real y compila con solc 0.8.24. Direcciones y hashes de transacción son de demostración; los hashes SHA-256 de documentos, NDA y KYC se calculan en tu navegador.",
              )}
        </footer>
      </aside>
    </div>
  );
}
