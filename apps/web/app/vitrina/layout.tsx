import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClientOnly } from "@/app/_components/shell/client-only";
import { DemoProvider } from "@/app/_components/shell/demo-provider";
import { I18nProvider } from "@/app/_i18n/provider";
import { requestI18n, requestTranslate } from "@/app/_i18n/server";
import { makeTranslate } from "@/app/_i18n/translate";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await requestTranslate("vitrina");
  return {
    description: tr(
      "Activos reales · Inversiones digitales. Infraestructura de tokenización inmobiliaria White Label.",
    ),
  };
}

/** www.rwaxirealestate.com — public showcase under the RWAXI brand, in the visitor's language (rwaxi_vitrina_lang). */
export default async function VitrinaLayout({ children }: { children: ReactNode }) {
  const { locale, catalog } = await requestI18n("vitrina");
  const tr = makeTranslate(locale, catalog);
  return (
    <ClientOnly label={tr("RWAXI · CARGANDO PLATAFORMA")}>
      <I18nProvider scope="vitrina" locale={locale} catalog={catalog}>
        <DemoProvider>{children}</DemoProvider>
      </I18nProvider>
    </ClientOnly>
  );
}
