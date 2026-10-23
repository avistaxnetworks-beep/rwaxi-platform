"use client";

import { useMemo } from "react";
import { EnvironmentFrame } from "@/app/_components/shell/environment-frame";
import { useDemo } from "@/app/_components/shell/demo-provider";
import { VitrinaNav } from "@/app/_components/vitrina/vitrina-nav";
import { Hero } from "@/app/_components/vitrina/hero";
import { Catalog } from "@/app/_components/vitrina/catalog";
import { HowItWorks } from "@/app/_components/vitrina/how-it-works";
import { LegalFrontier } from "@/app/_components/vitrina/legal-frontier";
import { Icon } from "@/app/_components/ui/icon";
import { PROJECTS } from "@/app/_lib/data/projects";
import { issueReferral } from "../actions";
import type { PublicCatalogResult } from "../_lib/catalog";
import { projectIdOf, toVitrinaDeveloper, toVitrinaProject } from "@/app/_lib/offering-view";

/* eslint-disable @typescript-eslint/no-explicit-any -- the prototype components are untyped */
export function VitrinaScreen({ catalog }: { catalog: PublicCatalogResult }) {
  const d = useDemo();

  // Live catalogue: projects and developers come from rwaxi_public_offerings(); the
  // prototype data is only a fallback when the database cannot be reached.
  const { projects, developers } = useMemo(() => {
    if (!catalog.ok) return { projects: PROJECTS as any[], developers: d.tenants };
    const live: Record<string, any> = {};
    for (const o of catalog.offerings) live[projectIdOf(o)] = toVitrinaDeveloper(o, d.tenants[projectIdOf(o)]);
    return { projects: catalog.offerings.map(toVitrinaProject), developers: { ...d.tenants, ...live } };
  }, [catalog, d.tenants]);

  // Every click to a developer portal carries a referral signed on the server (HMAC-SHA256).
  const openPortal = async (projectId: string) => {
    const developer = developers[projectId];
    const result = await issueReferral(developer.slug);
    if (!result.ok) {
      d.toast(result.error);
      return;
    }
    d.openLead(projectId, result, {
      slug: developer.slug,
      tenant: developer,
      project: projects.find((p) => p.id === projectId),
    });
  };

  return (
    <EnvironmentFrame env="vitrina">
      <VitrinaNav currency={d.currency} setCurrency={d.setCurrency} toBackoffice={() => d.navigate("backoffice")} />
      {!catalog.ok && (
        <div role="alert" className="bg-goldTint text-goldInk border-b border-line">
          <p className="gutter max-w-[1240px] mx-auto py-3 text-[12.5px] flex gap-2 items-center">
            <Icon name="AlertTriangle" size={15} />
            {catalog.error}
          </p>
        </div>
      )}
      <Hero view="catalogo" go={() => {}} currency={d.currency} setCurrency={d.setCurrency} projects={projects} />
      <main className="flex-1">
        <div id="oportunidades" className="scroll-mt-20" data-live-catalog={catalog.ok ? "neon" : "prototipo"}>
          <Catalog
            photosFor={d.photosFor}
            filter={d.filter}
            setFilter={d.setFilter}
            currency={d.currency}
            setCurrency={d.setCurrency}
            onOpen={openPortal}
            tenants={developers}
            projects={projects}
          />
        </div>
        <HowItWorks />
        <LegalFrontier tenants={d.tenants} />
      </main>
      <footer className="bg-white border-t border-line">
        <div className="gutter max-w-[1240px] mx-auto py-6 flex flex-wrap gap-4 justify-between items-center text-[11.5px] text-muted">
          <span className="font-semibold tracking-[0.2em] text-goldInk text-[10px]">
            ACTIVOS REALES · INVERSIONES DIGITALES
          </span>
          <span className="max-w-[80ch]">
            RWAXI actúa como canal de descubrimiento y proveedor de infraestructura tecnológica. Cada oferta,
            vehículo y proceso de cumplimiento es responsabilidad del desarrollador. Proyectos, cifras y entidades
            son ilustrativos.
          </span>
        </div>
      </footer>
    </EnvironmentFrame>
  );
}
