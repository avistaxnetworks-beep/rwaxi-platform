import type { Metadata } from "next";
import { tenantDisplayName } from "../_lib/tenant-view";
import { loadComplianceInbox } from "./_lib/queries";
import { loadDistributionsDesk } from "./_lib/distributions-desk";
import { loadSubscriptionsDesk } from "./_lib/subscriptions-desk";
import { BackofficeScreen } from "./_components/backoffice-screen";

// Compliance, payments and distributions are per-request and tenant-scoped: never prerender or cache them.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const name = await tenantDisplayName((await params).slug);
  return { title: `Backoffice · ${name ?? "RWAXI"}`, robots: { index: false, follow: false } };
}

export default async function BackofficePage() {
  const [compliance, subscriptions, distributions] = await Promise.all([
    loadComplianceInbox(),
    loadSubscriptionsDesk(),
    loadDistributionsDesk(),
  ]);
  return <BackofficeScreen compliance={compliance} subscriptions={subscriptions} distributions={distributions} />;
}
