// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { LegalText } from "@/app/_components/legal/legal-text";
import { SectionHead } from "@/app/_components/ui/primitives";
import { useI18n } from "@/app/_i18n/provider";
import { LEGAL_FRONTIER, LEGAL_FRONTIER_TENANT, legalVars } from "@/app/_lib/data/legal";
import { PROJECTS } from "@/app/_lib/data/projects";

export function LegalFrontier({ tenants: e }) {
  const { tr } = useI18n();
  const a = PROJECTS.filter((t) => e[t.id].published);
  return (
    <section id="frontera-legal" className="gutter max-w-[1240px] mx-auto py-12">
      <SectionHead
        n={tr("03 / Frontera legal")}
        title={tr("Quién ofrece, quién responde y qué hace RWAXI")}
      />
      <div className="grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6 items-start">
        <div className="bg-white border border-line p-6">
          <LegalText tpl={tr(LEGAL_FRONTIER)} vars={{}} />
        </div>
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
            {tr("Oferentes publicados")}
          </p>
          {a.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-line p-4"
              style={{
                borderInlineStart: `3px solid ${e[t.id].color}`,
              }}
            >
              <p className="text-[13px] font-semibold text-rxPurple mb-1">{t.asset}</p>
              <LegalText
                tpl={tr(LEGAL_FRONTIER_TENANT)}
                vars={{ ...legalVars(e[t.id], t), LEGAL_WRAPPER_TYPE: tr(t.wrapper) }}
                compact={true}
                className="text-[12px]"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
