// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useState } from "react";
import { LegalText } from "@/app/_components/legal/legal-text";
import { fieldCls } from "@/app/_components/ui/form";
import { useI18n } from "@/app/_i18n/provider";

/** Editor of a tenant legal template: the chrome follows the language, the template stays in its Spanish original. */
export function LegalEditor({ id: e, label: a, value: t, onChange: o, onReset: n, vars: l, isDefault: r }) {
  const { tr } = useI18n();
  const [i, s] = useState("plantilla"),
    c = Array.from(new Set((t.match(/\{\{([A-Z_]+)\}\}/g) || []).map((d) => d.slice(2, -2))));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={e} className="text-[12px] font-semibold text-inkBody">
          {a}
        </label>
        <div className="flex items-center gap-2">
          {!r && (
            <button type="button" onClick={n} className="text-[11.5px] text-rxBlue underline focus-ring">
              {tr("Restaurar plantilla oficial")}
            </button>
          )}
          <div
            className="flex border border-line p-0.5 text-[11px] font-semibold"
            role="group"
            aria-label={tr("Vista")}
          >
            {[
              ["plantilla", tr("Plantilla")],
              ["vista", tr("Vista previa")],
            ].map(([d, p]) => (
              <button
                key={d}
                type="button"
                onClick={() => s(d)}
                aria-pressed={i === d}
                className={`px-2.5 py-1 focus-ring ${i === d ? "tc-btn" : "text-inkBody hover:bg-cloud"}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
      {i === "plantilla" ? (
        <textarea
          id={e}
          rows={10}
          value={t}
          onChange={(d) => o(d.target.value)}
          lang="es"
          className={fieldCls() + " font-mono text-[11.5px] leading-[1.6]"}
        />
      ) : (
        <div lang="es" className="border border-line bg-stone p-4 max-h-[320px] overflow-y-auto">
          <LegalText tpl={t} vars={l} />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {c.map((d) => {
          var p, m;
          return (
            <span
              key={d}
              className="font-mono text-[10.5px] bg-cloud border border-line px-1.5 py-0.5"
              title={String(l[d])}
            >
              {`{{${d}}}`}
              <span className="text-muted">
                {" = "}
                {String((p = l[d]) != null ? p : tr("sin valor")).slice(0, 28)}
                {String((m = l[d]) != null ? m : "").length > 28 ? "…" : ""}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
