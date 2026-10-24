"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/app/_i18n/provider";
import { CONTRACTS, INVARIANTS, RUNTIME_SIZES, type ContractName } from "@/app/_lib/chain/contracts";
import { highlightSol } from "@/app/_lib/chain/highlight";
import { copyText, nf } from "@/app/_lib/format";

type Param = { name?: string; type: string; indexed?: boolean };
type AbiEntry = {
  type: string;
  name?: string;
  inputs?: readonly Param[];
  outputs?: readonly Param[];
  stateMutability?: string;
};
/** The session that may unlock the Solidity source here (the vitrina and the portal have none). */
export type SourceSession = "backoffice" | "platform" | null;

const signature = (list: readonly Param[] = []) =>
  list.map((p) => [p.type, p.indexed ? "indexed" : "", p.name ?? ""].filter(Boolean).join(" ")).join(", ");

/**
 * Contracts of the On-Chain Inspector. Everyone sees their public interface (from the compiled ABIs) and the
 * security invariants they enforce; the Solidity source, proprietary and confidential, only with an authorized
 * session or the technical-demo flag (the server decides: /api/inspector/sources).
 */
export function CodeViewer({ toast, session }: { toast: (message: string) => void; session: SourceSession }) {
  const { tr } = useI18n();
  const [name, setName] = useState<ContractName>("RwaxiPropertyToken");
  const [sources, setSources] = useState<Record<ContractName, string> | null>(null);
  const [view, setView] = useState<"interface" | "source">("interface");
  const [abis, setAbis] = useState<Record<ContractName, readonly AbiEntry[]> | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/inspector/sources${session ? `?as=${session}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { ok?: boolean; sources?: Record<ContractName, string> } | null) => {
        if (live && body?.ok && body.sources) {
          setSources(body.sources);
          setView("source");
        }
      })
      .catch(() => {});
    void import("@rwaxi/blockchain-sdk/abi").then((m) => {
      if (live) {
        setAbis({
          RwaxiTenantFactory: m.rwaxiTenantFactoryAbi,
          RwaxiComplianceRegistry: m.rwaxiComplianceRegistryAbi,
          RwaxiPropertyToken: m.rwaxiPropertyTokenAbi,
        });
      }
    });
    return () => {
      live = false;
    };
  }, [session]);

  const lines: string[] = useMemo(
    () => (sources && view === "source" ? highlightSol(sources[name]) : []),
    [sources, view, name],
  );
  const abi = abis?.[name] ?? [];
  const entries = (type: string) => abi.filter((x) => x.type === type);
  const sections: [string, string[]][] = [
    [
      tr("Funciones"),
      entries("function").map(
        (f) =>
          `${f.name}(${signature(f.inputs)})${f.outputs?.length ? ` → ${signature(f.outputs)}` : ""} · ${f.stateMutability}`,
      ),
    ],
    [tr("Eventos"), entries("event").map((e) => `${e.name}(${signature(e.inputs)})`)],
    [tr("Errores"), entries("error").map((e) => `${e.name}(${signature(e.inputs)})`)],
  ];

  return (
    <div
      className="border border-white/15 bg-[#0B0518]"
      data-code-view={view}
      data-source-access={sources ? "granted" : "restricted"}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 p-1">
        {CONTRACTS.map((c) => (
          <button
            key={c}
            onClick={() => setName(c)}
            aria-pressed={name === c}
            className={`px-2.5 py-1.5 font-mono text-[11px] focus-ring ${name === c ? "bg-[#1D1236] text-rxAqua" : "text-[#A79FC0] hover:text-white"}`}
          >
            {view === "source" ? `${c}.sol` : c}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {sources && (
            <div className="flex border border-white/15 p-0.5" role="group" aria-label={tr("Vista")}>
              {(
                [
                  ["interface", tr("Interfaz pública")],
                  ["source", tr("Código fuente")],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  aria-pressed={view === key}
                  className={`px-2 py-1 font-mono text-[10.5px] focus-ring ${view === key ? "bg-white text-rxDeep" : "text-[#A79FC0] hover:text-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {view === "source" && sources && (
            <button
              onClick={() =>
                copyText(sources[name], (ok: boolean) =>
                  toast(
                    ok
                      ? tr("{file} copiado", { file: `${name}.sol` })
                      : tr("Selecciona el texto para copiarlo"),
                  ),
                )
              }
              className="px-2.5 py-1.5 font-mono text-[11px] text-rxAqua focus-ring"
            >
              {tr("Copiar")}
            </button>
          )}
        </div>
      </div>
      <p className="px-3 py-1.5 font-mono text-[10.5px] text-[#A79FC0] border-b border-white/10">
        {"solc 0.8.24 · OpenZeppelin Contracts 5.6.1 · optimizer 200 · runtime "}
        {nf(0).format(RUNTIME_SIZES[name])}
        {" bytes"}
      </p>
      {view === "source" && sources ? (
        <div className="overflow-auto max-h-[420px]">
          <table className="font-mono text-[11px] leading-[1.65]">
            <tbody>
              {lines.map((l, r) => (
                <tr key={r}>
                  <td className="select-none text-right pr-3 pl-3 text-[#5E5873] align-top">{r + 1}</td>
                  <td
                    className="pr-4 text-[#E6E1F5] whitespace-pre"
                    dangerouslySetInnerHTML={{ __html: l || " " }}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-auto max-h-[420px] px-3 py-3 flex flex-col gap-3">
          {!sources && (
            <p className="font-mono text-[10.5px] leading-[1.6] text-[#D9A24A]" data-source-restricted>
              {tr(
                "Código fuente propietario y confidencial: visible con sesión del backoffice del desarrollador o de la consola RWAXI, o con la demo técnica habilitada.",
              )}
            </p>
          )}
          <section>
            <p className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-rxAqua mb-1.5">
              {tr("Invariantes de seguridad")}
            </p>
            <ul className="flex flex-col gap-1">
              {INVARIANTS[name].map((item) => (
                <li key={item} className="text-[11.5px] leading-[1.55] text-[#E6E1F5]">
                  {"✓ "}
                  {tr(item)}
                </li>
              ))}
            </ul>
          </section>
          {sections.map(([title, items]) => (
            <section key={title}>
              <p className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-[#A79FC0] mb-1.5">
                {title} · {items.length}
              </p>
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => (
                  <li key={item} className="font-mono text-[11px] leading-[1.55] text-[#C9C1E3] break-all">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
