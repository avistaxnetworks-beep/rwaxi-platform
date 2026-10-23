// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { CurrencyToggle } from "@/app/_components/ui/currency-toggle";
import { SectionHead } from "@/app/_components/ui/primitives";
import { ProjectCard } from "@/app/_components/vitrina/project-card";
import { Num } from "@/app/_i18n/num";
import { useI18n } from "@/app/_i18n/provider";
import { PROJECTS, STAGES, TRM } from "@/app/_lib/data/projects";
import { nf } from "@/app/_lib/format";

export function Catalog({
  filter: e,
  setFilter: a,
  currency: t,
  setCurrency: o,
  onOpen: n,
  photosFor: l,
  tenants: r,
  // Live catalogue from PostgreSQL (rwaxi_public_offerings); the prototype list is the fallback.
  projects: P,
}) {
  const { tr } = useI18n();
  const i = (P || PROJECTS).filter((d) => r[d.id] && r[d.id].published),
    s = i.filter((d) => e === "todos" || d.stage === e),
    c = [
      ["todos", tr("Todos")],
      ["operacion", tr(STAGES.operacion.label)],
      ["estructuracion", tr(STAGES.estructuracion.label)],
      ["preventa", tr(STAGES.preventa.label)],
    ];
  return (
    <section className="gutter max-w-[1240px] mx-auto py-12">
      <SectionHead
        n={tr("01 / Oportunidades estructuradas")}
        title={tr("Proyectos publicados por desarrolladores")}
      >
        <CurrencyToggle currency={t} setCurrency={o} />
      </SectionHead>
      <div className="flex flex-wrap gap-2 mb-8" role="group" aria-label={tr("Filtrar por etapa")}>
        {c.map(([d, p]) => {
          const m = d === "todos" ? i.length : i.filter((u) => u.stage === d).length;
          return (
            <button
              key={d}
              data-stage-filter={d}
              onClick={() => a(d)}
              aria-pressed={e === d}
              className={`px-3.5 py-2 text-[12.5px] font-medium border transition-colors focus-ring ${e === d ? "bg-rxPurple border-rxPurple text-white" : "bg-white border-line text-inkBody hover:border-rxPurple"}`}
            >
              {p} <Num className={`font-mono ms-1 ${e === d ? "text-[#C9C1E3]" : "text-muted"}`}>{m}</Num>
            </button>
          );
        })}
      </div>
      <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {s.map((d) => (
          <ProjectCard key={d.id} p={d} currency={t} onOpen={n} photos={l(d)} dev={r[d.id]} />
        ))}
      </div>
      {!s.length && (
        <p className="text-[13.5px] text-muted bg-white border border-line px-5 py-8 text-center">
          {e === "todos"
            ? tr("No hay proyectos publicados en la vitrina en este momento.")
            : tr("No hay proyectos publicados en esta etapa en este momento.")}
        </p>
      )}
      <p className="text-[11.5px] text-muted mt-6 max-w-[90ch]">
        {tr(
          "TIR, distribuciones y valorización son escenarios estimados con base en el modelo financiero de cada vehículo; el desempeño real puede ser inferior y el capital invertido está sujeto a riesgo. Valores en COP calculados con TRM de referencia de COP {trm} / USD.",
          { trm: nf(0).format(TRM) },
        )}
      </p>
    </section>
  );
}
