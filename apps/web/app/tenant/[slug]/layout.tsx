import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ClientOnly } from "@/app/_components/shell/client-only";
import { DemoProvider } from "@/app/_components/shell/demo-provider";
import { I18nProvider } from "@/app/_i18n/provider";
import { requestI18n, requestTranslate } from "@/app/_i18n/server";
import { makeTranslate } from "@/app/_i18n/translate";
import { findTenant } from "./_lib/directory";
import { loadDbTenantView, tenantDisplayName } from "./_lib/tenant-view";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const name = await tenantDisplayName((await params).slug);
  if (!name) return {};
  const tr = await requestTranslate("portal");
  return { title: tr("{name} · Portal de inversión", { name }) };
}

/**
 * {slug}.rwaxirealestate.com (or the tenant's verified domain) — White Label portal and, under
 * /backoffice, the developer's backoffice. Both share one DemoProvider so the investor
 * journey and the compliance review stay in sync during client navigation.
 * The prototype's demo developers render from its seed; any other tenant (onboarded from the
 * Super-Admin console) is read from PostgreSQL under RLS and registered in the demo store.
 * The portal speaks the platform's 10 languages (rwaxi_portal_lang, inherited from the vitrina with ?lang=); the
 * backoffice nests its own provider in es · en · pt (backoffice/layout.tsx).
 */
export default async function TenantLayout({ children, params }: { children: ReactNode; params: Params }) {
  const { slug } = await params;
  const dbTenant = findTenant(slug) ? null : await loadDbTenantView(slug);
  if (!findTenant(slug) && !dbTenant) notFound();
  const { locale, catalog } = await requestI18n("portal");
  const tr = makeTranslate(locale, catalog);
  return (
    <ClientOnly label={tr("RWAXI · CARGANDO PLATAFORMA")}>
      <I18nProvider scope="portal" locale={locale} catalog={catalog}>
        <DemoProvider tenantSlug={slug} dbTenant={dbTenant}>
          {children}
        </DemoProvider>
      </I18nProvider>
    </ClientOnly>
  );
}
