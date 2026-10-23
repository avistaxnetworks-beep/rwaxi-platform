// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
export function LegalText({ tpl: e, vars: a, className: t = "", compact: o }) {
  const n = e.split(/\n\s*\n/);
  return (
    <div className={`flex flex-col ${o ? "gap-2" : "gap-3"} text-[12.5px] leading-[1.7] text-inkBody ${t}`}>
      {n.map((l, r) => {
        const i = l.split(/(\{\{[A-Z_]+\}\})/g),
          s = r === 0 && l === l.toUpperCase() && l.length < 140;
        return (
          <p key={r} className={s ? "font-semibold text-rxPurple tracking-[0.02em]" : ""}>
            {i.map((c, d) => {
              const p = /^\{\{([A-Z_]+)\}\}$/.exec(c);
              if (!p) return <span key={d}>{c}</span>;
              const m = a[p[1]];
              return (
                <mark
                  key={d}
                  title={`{{${p[1]}}}`}
                  className={`legal-var ${/MERKLE/.test(p[1]) ? "font-mono break-all text-[11.5px]" : ""}`}
                >
                  {m === undefined ? c : String(m)}
                </mark>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}
