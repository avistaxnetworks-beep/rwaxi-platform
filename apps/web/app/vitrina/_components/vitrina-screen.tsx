"use client";

import { EnvironmentFrame } from "@/app/_components/shell/environment-frame";
import { useDemo } from "@/app/_components/shell/demo-provider";
import { VitrinaNav } from "@/app/_components/vitrina/vitrina-nav";
import { Hero } from "@/app/_components/vitrina/hero";
import { Catalog } from "@/app/_components/vitrina/catalog";
import { HowItWorks } from "@/app/_components/vitrina/how-it-works";
import { LegalFrontier } from "@/app/_components/vitrina/legal-frontier";

export function VitrinaScreen() {
  const d = useDemo();
  return (
    <EnvironmentFrame env="vitrina">
      <VitrinaNav currency={d.currency} setCurrency={d.setCurrency} toBackoffice={() => d.navigate("backoffice")} />
      <Hero view="catalogo" go={() => {}} currency={d.currency} setCurrency={d.setCurrency} />
      <main className="flex-1">
        <div id="oportunidades" className="scroll-mt-20">
          <Catalog
            photosFor={d.photosFor}
            filter={d.filter}
            setFilter={d.setFilter}
            currency={d.currency}
            setCurrency={d.setCurrency}
            onOpen={d.openLead}
            tenants={d.tenants}
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
