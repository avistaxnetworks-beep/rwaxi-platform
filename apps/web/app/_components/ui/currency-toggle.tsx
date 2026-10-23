// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
export function CurrencyToggle({ currency: e, setCurrency: a, dark: t, label: o = true }) {
  return (
    <div className="flex items-center gap-2">
      {o && (
        <span
          className={`text-[10.5px] font-semibold tracking-[0.08em] uppercase ${t ? "text-[#A79FC0]" : "text-muted"}`}
        >
          Ver cifras en
        </span>
      )}
      <div
        className={`flex items-center p-0.5 border ${t ? "border-white/20" : "border-line bg-white"}`}
        role="group"
        aria-label="Moneda"
      >
        {[
          ["COP", "Pesos"],
          ["USD", "Dólares"],
        ].map(([n, l]) => (
          <button
            key={n}
            onClick={() => a(n)}
            aria-pressed={e === n}
            title={n === "COP" ? "Pesos colombianos" : "Dólares estadounidenses"}
            className={`px-2.5 py-1 font-mono text-[11.5px] focus-ring ${e === n ? (t ? "bg-white text-rxDeep" : "bg-rxPurple text-white") : t ? "text-white hover:bg-white/10" : "text-inkBody hover:bg-cloud"}`}
          >
            {n}
            <span className="hidden sm:inline font-sans text-[10.5px] ml-1 opacity-80">{l}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
