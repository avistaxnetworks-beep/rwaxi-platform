// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useEffect, useRef, useState } from "react";
import { CodeViewer } from "@/app/_components/inspector/code-viewer";
import { Mono } from "@/app/_components/ui/primitives";
import {
  DEAD_WALLET,
  RECOVERY_WALLET,
  REVERT_FROZEN,
  REVERT_RECEIVER,
  TX,
  adminOf,
  makeTx,
  shortAddr,
} from "@/app/_lib/chain/simulator";
import { shortHash } from "@/app/_lib/format";
import { seededHex, sha256Hex } from "@/app/_lib/hash";
import { useI18n } from "@/app/_i18n/provider";

export function SimTab({ s: e, emit: a, setChainX: t, toast: o, sourceSession: q }) {
  const { tr } = useI18n();
  const { t: n, p: l, token: r } = e,
    i = Object.entries(e.bal)
      .filter(([, k]) => k > 0)
      .map(([k]) => k),
    [s, c] = useState(i[0] || ""),
    [d, p] = useState(DEAD_WALLET),
    [m, u] = useState(10),
    [v, h] = useState(null),
    [b, y] = useState(i[0] || ""),
    [f, N] = useState(RECOVERY_WALLET),
    [x, g] = useState(0),
    [w, A] = useState(""),
    [P, z] = useState(""),
    [G, U] = useState(null),
    E = useRef();
  (useEffect(() => {
    (c(i[0] || ""), y(i[0] || ""), h(null), U(null));
  }, [l.id]),
    useEffect(() => {
      (i.includes(s) || c(i[0] || ""), i.includes(b) || y(i[0] || ""));
    }, [i.join()]),
    useEffect(() => {
      g(e.bal[b] || 0);
    }, [b, e.bal[b]]),
    useEffect(() => {
      let k = true;
      return (
        w.trim() ? sha256Hex(w.trim()).then((D) => k && z(D)) : z(""),
        () => {
          k = false;
        }
      );
    }, [w]));
  const I = (k) =>
    t((D) => ({
      ...D,
      [l.id]: k(
        D[l.id] || {
          frozen: {},
          extra: {},
          moves: [],
        },
      ),
    }));
  if (!r)
    return (
      <div className="flex flex-col gap-4">
        <p className="font-mono text-[12px] text-[#C9C1E3] border border-white/15 px-4 py-6">
          {tr(
            "El token de {asset} aún no está desplegado. Emítelo desde Backoffice → Data Room y Minting para probar las reglas.",
            { asset: l.asset },
          )}
        </p>
        <CodeViewer toast={o} session={q ?? null} />
      </div>
    );
  const $ = () => {
      const k = Math.max(1, Math.floor(+m || 0)),
        D = [["ERC20.transfer(to, value) → _update(from, to, value)", "ok"]];
      let F = null;
      if (e.paused) (D.push(["ERC20Pausable: whenNotPaused", "fail"]), (F = "EnforcedPause()"));
      else {
        const V = e.eligible(d);
        (D.push([`complianceRegistry.isEligible(${shortAddr(d)}) → ${V}`, V ? "ok" : "fail"]),
          V
            ? e.frozen(s)
              ? (D.push([`complianceRegistry.isFrozen(${shortAddr(s)}) → true`, "fail"]),
                (F = `Error("${REVERT_FROZEN}")`))
              : (e.bal[s] || 0) < k
                ? (D.push(["balanceOf(from) ≥ value", "fail"]),
                  (F = `ERC20InsufficientBalance(${shortAddr(s)}, ${e.bal[s] || 0}, ${k})`))
                : D.push([tr("super._update(): saldo actualizado"), "ok"])
            : (F = `Error("${REVERT_RECEIVER}")`));
      }
      const M = makeTx({
        tenantId: l.id,
        contract: "RwaxiPropertyToken",
        address: r,
        fn: "transfer",
        values: [d, k],
        from: s,
        status: F ? "reverted" : "success",
        revert: F,
        events: F
          ? []
          : [
              {
                name: "Transfer",
                args: [
                  ["from", s],
                  ["to", d],
                  ["value", k],
                ],
              },
            ],
      });
      (a(M),
        F ||
          I((V) => ({
            ...V,
            moves: [
              ...V.moves,
              {
                from: s,
                to: d,
                amount: k,
              },
            ],
          })),
        h({
          steps: D,
          revert: F,
        }));
    },
    _ = (k, D) => {
      (I((F) => ({
        ...F,
        frozen: {
          ...F.frozen,
          [k]: D,
        },
      })),
        a(TX.freeze(n, l.id, k, D)),
        o(`setFrozen(${shortAddr(k)}, ${D})`));
    },
    B = () => {
      const k =
        (e.investors.find((D) => D.wallet === b) || {}).dossier || "0x" + seededHex("dossier-recovery", 64);
      (I((D) => ({
        ...D,
        extra: {
          ...D.extra,
          [RECOVERY_WALLET]: {
            label: tr("Nueva wallet de {name}", { name: e.labelOf(b) }),
            dossier: k,
          },
        },
      })),
        a(TX.approve(n, l.id, RECOVERY_WALLET, k)),
        o(tr("approveInvestor(nueva wallet del titular) ejecutado")));
    },
    T = () => {
      const k = Math.max(0, Math.floor(+x || 0)),
        D = P ? "0x" + P : "0x" + "0".repeat(64),
        F = [["onlyRole(LEGAL_ENFORCEMENT_ROLE) · caller = tenantAdmin", "ok"]];
      let M = null;
      P
        ? (F.push([`legalActHash = 0x${shortHash(P, 8, 6)}`, "ok"]),
          F.push(["_forcedRecovery = true → _update(from, to, amount)", "ok"]),
          e.paused
            ? (F.push(["ERC20Pausable: whenNotPaused", "fail"]), (M = "EnforcedPause()"))
            : e.eligible(f)
              ? (F.push([`complianceRegistry.isEligible(${shortAddr(f)}) → true`, "ok"]),
                F.push([
                  tr("isFrozen(from) omitido en recuperación forzosa") +
                    (e.frozen(b) ? " " + tr("(origen congelado)") : ""),
                  "ok",
                ]),
                (e.bal[b] || 0) < k || k === 0
                  ? (F.push(["balanceOf(from) ≥ amount > 0", "fail"]),
                    (M = `ERC20InsufficientBalance(${shortAddr(b)}, ${e.bal[b] || 0}, ${k})`))
                  : F.push(["emit ForcedRecoveryExecuted", "ok"]))
              : (F.push([`complianceRegistry.isEligible(${shortAddr(f)}) → false`, "fail"]),
                (M = `Error("${REVERT_RECEIVER}")`)))
        : (F.push(["legalActHash != bytes32(0)", "fail"]), (M = "LegalActHashRequired()"));
      const V = makeTx({
        tenantId: l.id,
        contract: "RwaxiPropertyToken",
        address: r,
        fn: "forcedTransfer",
        values: [b, f, k, D],
        from: adminOf(n.slug),
        status: M ? "reverted" : "success",
        revert: M,
        events: [
          {
            name: "Transfer",
            args: [
              ["from", b],
              ["to", f],
              ["value", k],
            ],
          },
          {
            name: "ForcedRecoveryExecuted",
            args: [
              ["from", b],
              ["to", f],
              ["amount", k],
              ["legalActHash", D],
            ],
          },
        ],
      });
      (a(V),
        M ||
          (I((Z) => ({
            ...Z,
            moves: [
              ...Z.moves,
              {
                from: b,
                to: f,
                amount: k,
              },
            ],
          })),
          o(
            tr("Recuperación ejecutada: {n} {symbol} → {wallet}", {
              n: k,
              symbol: n.mint.symbol,
              wallet: shortAddr(f),
            }),
          )),
        U({
          steps: F,
          revert: M,
        }));
    },
    C = "bg-[#0B0518] border border-white/20 text-white font-mono text-[11.5px] px-2 py-2 focus-ring w-full",
    S = ({ tr: k }) =>
      k && (
        <div className="bg-[#0B0518] border border-white/10 p-3 flex flex-col gap-1">
          {k.steps.map(([D, F], M) => (
            <p
              key={M}
              className={`font-mono text-[11px] ${F === "ok" ? "text-[#C9C1E3]" : "text-[#FF8A80]"}`}
            >
              {F === "ok" ? "✓" : "✗"} {D}
            </p>
          ))}
          <p
            className={`font-mono text-[12px] mt-1.5 px-2 py-1.5 ${k.revert ? "bg-[#3a1018] text-[#FF8A80]" : "bg-[#0c2a3a] text-rxAqua"}`}
          >
            {k.revert ? tr("Revert On-Chain: {reason}", { reason: k.revert }) : tr("Transacción exitosa")}
          </p>
        </div>
      );
  return (
    <div className="flex flex-col gap-5">
      <section className="border border-white/15 bg-[#120726] p-4 flex flex-col gap-3">
        <p className="font-mono text-[12.5px] text-white font-semibold">
          {tr("1 · Bloqueo en mercado secundario")}{" "}
          <span className="text-[#A79FC0] font-normal">(hook _update)</span>
        </p>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10.5px] text-[#A79FC0]">{tr("from (titular)")}</span>
            <select id="sim-from" value={s} onChange={(k) => c(k.target.value)} className={C}>
              {i.map((k) => (
                <option key={k} value={k}>
                  {shortAddr(k)}
                  {" · "}
                  {e.labelOf(k)}
                  {" · "}
                  {e.bal[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10.5px] text-[#A79FC0]">to</span>
            <select id="sim-to" value={d} onChange={(k) => p(k.target.value)} className={C}>
              <option value={DEAD_WALLET}>0xDead…Beef · {tr("externa no verificada")}</option>
              {e.investors
                .filter((k) => k.wallet !== s)
                .map((k) => (
                  <option key={k.wallet} value={k.wallet}>
                    {shortAddr(k.wallet)}
                    {" · "}
                    {k.label}
                    {" (whitelist)"}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10.5px] text-[#A79FC0]">value</span>
            <input
              id="sim-amt"
              type="number"
              min="1"
              value={m}
              onChange={(k) => u(k.target.value)}
              className={C}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={$}
            disabled={!s}
            className="bg-rxAqua text-rxDeep font-mono font-semibold text-[12px] px-4 py-2 focus-ring disabled:opacity-40"
          >
            {tr("Ejecutar transfer()")}
          </button>
          {s && (
            <button
              onClick={() => _(s, !e.frozen(s))}
              className="border border-white/20 text-white font-mono text-[11.5px] px-3 py-2 focus-ring"
            >
              {e.frozen(s) ? "setFrozen(from, false)" : "setFrozen(from, true)"}
            </button>
          )}
        </div>
        <S tr={v} />
      </section>
      <section className="border border-white/15 bg-[#120726] p-4 flex flex-col gap-3">
        <p className="font-mono text-[12.5px] text-white font-semibold">
          {tr("2 · Recuperación regulatoria / orden judicial")}{" "}
          <span className="text-[#A79FC0] font-normal">(forcedTransfer · LEGAL_ENFORCEMENT_ROLE)</span>
        </p>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10.5px] text-[#A79FC0]">
              {tr("from (extraviada / embargada)")}
            </span>
            <select id="claw-from" value={b} onChange={(k) => y(k.target.value)} className={C}>
              {i.map((k) => (
                <option key={k} value={k}>
                  {shortAddr(k)}
                  {" · "}
                  {e.labelOf(k)}
                  {e.frozen(k) ? " · " + tr("congelada") : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10.5px] text-[#A79FC0]">
              {tr("to (nueva wallet del titular)")}
            </span>
            <select id="claw-to" value={f} onChange={(k) => N(k.target.value)} className={C}>
              <option value={RECOVERY_WALLET}>
                {shortAddr(RECOVERY_WALLET)}
                {" · "}
                {tr("nueva wallet")} {e.eligible(RECOVERY_WALLET) ? "(whitelist)" : tr("(no aprobada)")}
              </option>
              <option value={DEAD_WALLET}>0xDead…Beef · {tr("externa no verificada")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10.5px] text-[#A79FC0]">amount</span>
            <input
              id="claw-amt"
              type="number"
              min="0"
              value={x}
              onChange={(k) => g(k.target.value)}
              className={C}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10.5px] text-[#A79FC0]">
            {tr("Acta o sentencia (texto o archivo) → legalActHash = SHA-256")}
          </span>
          <textarea
            id="claw-act"
            rows={2}
            value={w}
            onChange={(k) => A(k.target.value)}
            placeholder={tr(
              "Ej. Juzgado 12 Civil del Circuito de Bogotá, auto 2026-0457: restitución de unidades al titular…",
            )}
            className={C + " font-sans"}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={E}
            id="claw-file"
            type="file"
            className="sr-only"
            onChange={async (k) => {
              const D = k.target.files[0];
              if (!D) return;
              const F = await sha256Hex(await D.arrayBuffer());
              (A(tr("[archivo] {name}", { name: D.name })), z(F), (k.target.value = ""));
            }}
          />
          <button
            onClick={() => E.current.click()}
            className="border border-white/20 text-white font-mono text-[11.5px] px-3 py-2 focus-ring"
          >
            {tr("Cargar acta (PDF)")}
          </button>
          <Mono className="text-[11px] text-rxAqua break-all">
            {P ? `0x${P}` : "legalActHash = 0x000…000"}
          </Mono>
        </div>
        <div className="flex flex-wrap gap-2">
          {!e.eligible(RECOVERY_WALLET) && (
            <button
              onClick={B}
              disabled={!b}
              className="border border-rxAqua text-rxAqua font-mono text-[11.5px] px-3 py-2 focus-ring disabled:opacity-40"
            >
              {tr("approveInvestor(nueva wallet, 170, dossier)")}
            </button>
          )}
          {b && (
            <button
              onClick={() => _(b, !e.frozen(b))}
              className="border border-white/20 text-white font-mono text-[11.5px] px-3 py-2 focus-ring"
            >
              {e.frozen(b) ? "setFrozen(from, false)" : "setFrozen(from, true) · " + tr("embargo")}
            </button>
          )}
          <button
            onClick={T}
            disabled={!b}
            className="bg-[#D9A24A] text-rxDeep font-mono font-semibold text-[12px] px-4 py-2 focus-ring disabled:opacity-40"
          >
            {tr("Ejecutar forcedTransfer()")}
          </button>
        </div>
        <S tr={G} />
      </section>
      <CodeViewer toast={o} session={q ?? null} />
    </div>
  );
}
