import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ClientOnly } from "@/app/_components/shell/client-only";
import { DemoProvider } from "@/app/_components/shell/demo-provider";
import { findTenant } from "./_lib/directory";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const tenant = findTenant((await params).slug);
  return tenant ? { title: `${tenant.displayName} · Portal de inversión` } : {};
}

/**
 * {slug}.rwaxi.com (or the tenant's verified domain) — White Label portal and, under
 * /backoffice, the developer's backoffice. Both share one DemoProvider so the investor
 * journey and the compliance review stay in sync during client navigation.
 */
export default async function TenantLayout({ children, params }: { children: ReactNode; params: Params }) {
  const { slug } = await params;
  if (!findTenant(slug)) notFound();
  return (
    <ClientOnly>
      <DemoProvider tenantSlug={slug}>{children}</DemoProvider>
    </ClientOnly>
  );
}
