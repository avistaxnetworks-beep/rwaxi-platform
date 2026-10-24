import { redirect } from "next/navigation";
import { platformActor } from "@/app/_lib/server/staff-auth";
import { loadPlatformMetrics } from "./_lib/metrics";
import { SuperAdminScreen } from "./_components/super-admin-screen";

// Consolidated, cross-tenant data read per request with the platform role: never cache it.
export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  // The signed-in SUPER_ADMIN (password + TOTP), or the demo session outside production; anyone else signs in.
  const actor = await platformActor();
  if (!actor) redirect("/login");
  const metrics = await loadPlatformMetrics();
  return (
    <SuperAdminScreen
      metrics={metrics}
      account={{
        demo: actor.demo,
        name: actor.user.fullName,
        email: actor.user.email,
        role: "Dirección RWAXI",
      }}
    />
  );
}
