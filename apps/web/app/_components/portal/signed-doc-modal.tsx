// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/app/_components/ui/modal";
import { CopyChip } from "@/app/_components/ui/primitives";
import { WALLET } from "@/app/_lib/data/projects";
import { nf, shortHash } from "@/app/_lib/format";
import { seededHex } from "@/app/_lib/hash";
import { folderLabel } from "@/app/_components/portal/data-room-panel";
import { useI18n } from "@/app/_i18n/provider";

export function SignedDocModal({ doc: e, onClose: a, toast: t }) {
  const { rich, tr } = useI18n();
  const [o, n] = useState(900);
  useEffect(() => {
    const s = setInterval(() => n((c) => Math.max(0, c - 1)), 1e3);
    return () => clearInterval(s);
  }, []);
  const l = useMemo(() => seededHex("sig" + e.name + Date.now(), 40), [e.name]),
    r = `https://dataroom.rwaxi.com/${e.tenant.slug}/${e.hash.slice(0, 16)}?X-Expires=900&X-Signature=${l}`,
    i = `${String(Math.floor(o / 60)).padStart(2, "0")}:${String(o % 60).padStart(2, "0")}`;
  return (
    <Modal title={tr(e.name)} onClose={a}>
      <div className="flex flex-col gap-4">
        <div className="bg-stone border border-line p-5">
          <p className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-muted">
            {folderLabel(e.folder, tr)}
            {" · "}
            {e.project.code}
          </p>
          <p className="font-display font-semibold text-[22px] text-rxPurple mt-2 leading-tight">
            {e.project.asset}
          </p>
          <p className="text-[12.5px] text-inkBody mt-1">
            {e.tenant.legalName}
            {" · NIT "}
            {e.tenant.nit}
          </p>
          {e.holding && (
            <p className="text-[12.5px] text-inkBody mt-3">
              {rich(
                "Titular: wallet {wallet} · {units} unidades",
                {
                  wallet: <span className="font-mono">{WALLET}</span>,
                  units: nf(0).format(e.holding.units),
                },
                e.holding.units,
              )}
            </p>
          )}
          <div className="mt-4 space-y-1.5" aria-hidden="true">
            {[92, 100, 84, 96, 60].map((s, c) => (
              <div
                key={c}
                className="h-2 bg-[#E6E1D6]"
                style={{
                  width: `${s}%`,
                }}
              />
            ))}
          </div>
        </div>
        {e.signed && (
          <div className="text-[12px]">
            <p className="text-muted uppercase tracking-[0.06em] font-semibold text-[10.5px] flex justify-between">
              <span>{tr("Signed URL temporal")}</span>
              <span className={`font-mono ${o < 120 ? "text-[#B42318]" : "text-aquaInk"}`}>
                {tr("Expira en {time}", { time: i })}
              </span>
            </p>
            <p className="font-mono text-[11px] text-inkBody break-all bg-cloud border border-line px-3 py-2 mt-1">
              {r}
            </p>
          </div>
        )}
        <div className="text-[12px]">
          <p className="text-muted uppercase tracking-[0.06em] font-semibold text-[10.5px]">
            {tr("Hash SHA-256 del documento")}
          </p>
          <CopyChip
            text={e.hash}
            display={shortHash(e.hash, 20, 12)}
            toast={t}
            className="text-[12px] mt-1"
          />
        </div>
        <p className="text-[11.5px] text-muted">
          {tr(
            "Vista previa de demostración. En producción el archivo se sirve solo a través de la Signed URL y cada acceso queda registrado en el AccessGrant.",
          )}
        </p>
      </div>
    </Modal>
  );
}
