// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useState } from "react";
import { Mono, Pill } from "@/app/_components/ui/primitives";
import { shortAddr } from "@/app/_lib/chain/simulator";
import { copyText, nf, shortHash } from "@/app/_lib/format";

export function TxCard({ tx: e, tenants: a, fresh: t, toast: o }) {
  const [n, l] = useState(false),
    r = e.tenantId ? a[e.tenantId].displayName : "RWAXI",
    i = (s) =>
      Array.isArray(s)
        ? `(${s.map((c) => (typeof c == "string" ? `"${c.length > 24 ? c.slice(0, 22) + "…" : c}"` : String(c))).join(", ")})`
        : typeof s == "string" && s.startsWith("0x") && s.length > 20
          ? shortHash(s.slice(2), 10, 6).replace(/^/, "0x")
          : String(s);
  return (
    <article
      className={`border ${e.status === "reverted" ? "border-[#7a2030]" : "border-white/15"} bg-[#120726] ${t ? "tx-fresh" : ""}`}
    >
      <header className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10">
        <Pill ok={e.status === "success"}>{e.status === "success" ? "✓ success" : "✗ reverted"}</Pill>
        <Mono className="text-[11px] text-[#A79FC0]">
          {"block "}
          {nf(0).format(e.block)}
        </Mono>
        <Mono className="text-[11px] text-[#A79FC0]">{e.ts.replace("T", " ").replace("Z", " UTC")}</Mono>
        <span className="text-[11px] text-[#C9C1E3]">{r}</span>
        <Mono className="text-[11px] text-[#A79FC0] ml-auto">
          {"tx "}
          {shortHash(e.hash.slice(2), 8, 6)}
        </Mono>
      </header>
      <div className="px-4 py-3 flex flex-col gap-2">
        <p className="font-mono text-[12.5px] leading-[1.6] break-words">
          <span className="text-[#C4B5FD]">{e.contract}</span>
          <span className="text-[#A79FC0]">.</span>
          <span className="text-rxAqua">{e.fn}</span>
          <span className="text-[#A79FC0]">(</span>
          {e.args.map(([s, , c], d) => (
            <span key={s}>
              <span className="text-[#A79FC0]">
                {s}
                {": "}
              </span>
              <span className="text-white">{i(c)}</span>
              {d < e.args.length - 1 && <span className="text-[#A79FC0]">{", "}</span>}
            </span>
          ))}
          <span className="text-[#A79FC0]">)</span>
        </p>
        <p className="font-mono text-[10.5px] text-[#A79FC0]">
          {"from "}
          {shortAddr(e.from)}
          {" → "}
          {e.contract}
          {" @ "}
          {shortAddr(e.address)}
        </p>
        {e.status === "reverted" && (
          <p className="font-mono text-[12px] text-[#FF8A80] bg-[#3a1018] px-3 py-2">
            {"execution reverted: "}
            {e.revert}
          </p>
        )}
        {e.events.map((s, c) => (
          <div key={c} className="border-l-2 border-rxAqua pl-3">
            <p className="font-mono text-[11.5px]">
              <span className="text-[#D9A24A]">emit</span> <span className="text-white">{s.name}</span>
              <span className="text-[#A79FC0]">({s.args.map(([d, p]) => `${d}: ${i(p)}`).join(", ")})</span>
            </p>
            <p className="font-mono text-[10px] text-[#A79FC0]">
              {"topic0 "}
              {shortHash(s.topic.slice(2), 12, 8)}
            </p>
          </div>
        ))}
        <button onClick={() => l(!n)} className="self-start font-mono text-[11px] text-rxAqua focus-ring">
          {n ? "▾" : "▸"}
          {" calldata ("}
          {(e.calldata.length - 2) / 2}
          {" bytes) · selector "}
          {e.sel}
        </button>
        {n && (
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-[10.5px] text-[#A79FC0]">{e.sig}</p>
            <pre className="font-mono text-[10.5px] leading-[1.6] text-white bg-[#0B0518] border border-white/10 p-3 overflow-x-auto whitespace-pre-wrap break-all">
              <span className="text-[#D9A24A]">{e.sel}</span>
              {(e.calldata.slice(10).match(/.{1,64}/g) || []).map((s, c) => (
                <span key={c}>
                  {`
`}
                  {s}
                </span>
              ))}
            </pre>
            <button
              onClick={() =>
                copyText(e.calldata, (s) => o(s ? "Calldata copiado" : "Selecciona el texto para copiarlo"))
              }
              className="self-start font-mono text-[11px] text-rxAqua border border-white/15 px-2 py-1 focus-ring"
            >
              Copiar calldata
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
