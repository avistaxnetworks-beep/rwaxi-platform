// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { useI18n } from "@/app/_i18n/provider";

export function Liveness({ state: e, onChange: a, error: t }) {
  const { tr } = useI18n();
  const o = [
      tr("Centra tu rostro en el óvalo"),
      tr("Gira la cabeza a la izquierda"),
      tr("Parpadea dos veces"),
      tr("Analizando correspondencia con el documento"),
    ],
    [n, l] = useState(0),
    r = useRef([]);
  return (
    useEffect(() => () => r.current.forEach(clearTimeout), []),
    (
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-inkBody">{tr("Prueba biométrica facial")}</span>
        <div
          className={`border ${t ? "border-[#B42318]" : "border-line"} bg-rxDeep text-white p-5 grid sm:grid-cols-[160px_minmax(0,1fr)] gap-5 items-center`}
        >
          <div className="relative mx-auto w-[140px] h-[170px]">
            <div
              className={`absolute inset-0 rounded-[50%] border-2 ${e === "done" ? "border-rxAqua" : "border-dashed border-[#C4B5FD]"} ${e === "running" ? "scan" : ""}`}
            />
            <div className="absolute inset-[22px] rounded-[50%] bg-white/5 grid place-items-center">
              <Icon
                name={e === "done" ? "CheckCircle2" : "ScanFace"}
                size={46}
                className={e === "done" ? "text-rxAqua" : "text-[#C4B5FD]"}
              />
            </div>
            {e === "running" && <div className="absolute left-2 right-2 h-[2px] bg-rxAqua scan-line" />}
          </div>
          <div className="min-w-0 flex flex-col gap-3">
            {e === "done" ? (
              <p className="text-[14px] font-semibold text-rxAqua" role="status">
                {tr("Verificación de vida completada con éxito ✓")}
              </p>
            ) : e === "running" ? (
              <>
                <p className="font-mono text-[11px] tracking-[0.12em] text-[#A79FC0]">
                  {tr("PASO {n} / 4", { n: n + 1 })}
                </p>
                <p className="text-[15px] font-semibold" role="status">
                  {o[n]}
                </p>
                <div className="h-[3px] bg-white/10">
                  <div
                    className="h-full bg-rxAqua transition-all duration-700"
                    style={{
                      width: `${((n + 1) / 4) * 100}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-[13.5px] text-[#C9C1E3] leading-[1.6]">
                  {tr("Comparamos tu rostro con la foto del documento y confirmamos que eres una persona real frente a la cámara.")}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    a("running"),
                      l(0),
                      [1, 2, 3].forEach((s) => r.current.push(setTimeout(() => l(s), 1100 * s))),
                      r.current.push(setTimeout(() => a("done"), 1100 * 4 + 300));
                  }}
                  className="self-start bg-white text-rxDeep font-semibold text-[12.5px] px-4 py-2.5 inline-flex items-center gap-2 focus-ring"
                >
                  <Icon name="Camera" size={15} />
                  {tr("Iniciar prueba de vida (simulada)")}
                </button>
              </>
            )}
          </div>
        </div>
        {t && (
          <p className="text-[12px] text-[#B42318]" role="alert">
            {t}
          </p>
        )}
      </div>
    )
  );
}
