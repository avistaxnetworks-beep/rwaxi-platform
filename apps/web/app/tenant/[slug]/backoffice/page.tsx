import type { Metadata } from "next";
import { findTenant } from "../_lib/directory";
import { loadComplianceInbox } from "./_lib/queries";
import { BackofficeScreen } from "./_components/backoffice-screen";

// Compliance data is per-request and tenant-scoped: never prerender or cache it.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const tenant = findTenant((await params).slug);
  return { title: `Backoffice · ${tenant?.displayName ?? "RWAXI"}`, robots: { index: false, follow: false } };
}

export default async function BackofficePage() {
  const compliance = await loadComplianceInbox();
  return <BackofficeScreen compliance={compliance} />;
}
