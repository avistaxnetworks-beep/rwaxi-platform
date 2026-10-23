import { loadInvestorJourney } from "./_lib/journey";
import { PortalScreen } from "./_components/portal-screen";

// The investor journey is per-visitor (session cookie) and tenant-scoped: never cache it.
export const dynamic = "force-dynamic";

export default async function PortalPage({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }) {
  const { ref } = await searchParams;
  const persisted = await loadInvestorJourney(typeof ref === "string" ? ref : undefined);
  return <PortalScreen persisted={persisted} />;
}
