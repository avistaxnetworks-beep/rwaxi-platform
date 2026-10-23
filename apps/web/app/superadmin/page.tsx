import { loadPlatformMetrics } from "./_lib/metrics";
import { SuperAdminScreen } from "./_components/super-admin-screen";

// Consolidated, cross-tenant data read per request with the platform role: never cache it.
export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const metrics = await loadPlatformMetrics();
  return <SuperAdminScreen metrics={metrics} />;
}
