import type { Metadata } from "next";
import { findTenant } from "../_lib/directory";
import { loadComplianceInbox } from "./_lib/queries";
import { loadSubscriptionsDesk } from "./_lib/subscriptions-desk";
import { BackofficeScreen } from "./_components/backoffice-screen";

// Compliance and payments data are per-request and tenant-scoped: never prerender or cache them.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const tenant = findTenant((await params).slug);
  return { title: `Backoffice · ${tenant?.displayName ?? "RWAXI"}`, robots: { index: false, follow: false } };
}

export default async function BackofficePage() {
  const [compliance, subscriptions] = await Promise.all([loadComplianceInbox(), loadSubscriptionsDesk()]);
  return <BackofficeScreen compliance={compliance} subscriptions={subscriptions} />;
}
