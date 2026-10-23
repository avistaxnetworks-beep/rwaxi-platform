// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useEffect } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { useI18n } from "@/app/_i18n/provider";

export function Modal({ title: e, onClose: a, children: t, wide: o }) {
  const { tr } = useI18n();
  return (
    useEffect(() => {
      const n = (l) => l.key === "Escape" && a();
      return window.addEventListener("keydown", n), () => window.removeEventListener("keydown", n);
    }, [a]),
    (
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#190A36]/60 modal-pad"
        onMouseDown={(n) => n.target === n.currentTarget && a()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={e}
          className={`bg-white w-full ${o ? "max-w-[720px]" : "max-w-[520px]"} max-h-[88vh] overflow-y-auto border border-line shadow-2xl`}
        >
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-line sticky top-0 bg-white">
            <h3 className="font-display font-semibold text-[24px] text-rxPurple leading-tight">{e}</h3>
            <button
              onClick={a}
              className="p-1.5 text-muted hover:text-rxPurple focus-ring"
              aria-label={tr("Cerrar")}
            >
              <Icon name="X" size={18} />
            </button>
          </div>
          <div className="px-6 py-5">{t}</div>
        </div>
      </div>
    )
  );
}
