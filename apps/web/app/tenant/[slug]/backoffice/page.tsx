import type { Metadata } from "next";
import { findTenant } from "../_lib/directory";
import { BackofficeScreen } from "./_components/backoffice-screen";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const tenant = findTenant((await params).slug);
  return { title: `Backoffice · ${tenant?.displayName ?? "RWAXI"}`, robots: { index: false, follow: false } };
}

export default function BackofficePage() {
  return <BackofficeScreen />;
}
