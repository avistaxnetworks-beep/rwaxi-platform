import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { tenantDisplayName } from "../_lib/tenant-view";
import { loadComplianceInbox } from "./_lib/queries";
import { loadDistributionsDesk } from "./_lib/distributions-desk";
import { ROLE_LABEL, backofficeIdentity } from "./_lib/session";
import { loadSubscriptionsDesk } from "./_lib/subscriptions-desk";
import { BackofficeScreen } from "./_components/backoffice-screen";

// Compliance, payments and distributions are per-request and tenant-scoped: never prerender or cache them.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const name = await tenantDisplayName((await params).slug);
  return { title: `Backoffice · ${name ?? "RWAXI"}`, robots: { index: false, follow: false } };
}

export default async function BackofficePage() {
  // A signed-in staff member of this tenant, or the demo session where it is enabled; anyone else signs in.
  const identity = await backofficeIdentity().catch(() => null);
  if (!identity) redirect("/backoffice/login");
  const [compliance, subscriptions, distributions] = await Promise.all([
    loadComplianceInbox(),
    loadSubscriptionsDesk(),
    loadDistributionsDesk(),
  ]);
  return (
    <BackofficeScreen
      account={{ demo: identity.demo, name: identity.name, email: identity.email, role: identity.role ? ROLE_LABEL[identity.role] : null }}
      compliance={compliance}
      subscriptions={subscriptions}
      distributions={distributions}
    />
  );
}
