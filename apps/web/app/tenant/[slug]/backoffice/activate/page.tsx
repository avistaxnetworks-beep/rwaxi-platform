import type { Metadata } from "next";
import { forTenant } from "@rwaxi/database";
import { requestTranslate } from "@/app/_i18n/server";
import { requireHostTenant } from "@/app/_lib/server/tenant-context";
import { AccountActivation } from "../_components/account-activation";

// The invitation token travels in the URL fragment, read by the browser: nothing here depends on it.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await requestTranslate("tenant");
  const tenant = await requireHostTenant().catch(() => null);
  return {
    title: tr("Activar cuenta · Backoffice · {name}", { name: tenant?.displayName ?? "RWAXI" }),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/** {slug}.rwaxirealestate.com/backoffice/activate#token=… — an invited staff member sets password and TOTP. */
export default async function ActivatePage() {
  const tenant = await requireHostTenant();
  const org = await forTenant(tenant.id).organization.findUnique({
    where: { id: tenant.id },
    select: { displayName: true, legalName: true, brandColor: true },
  });
  return (
    <AccountActivation
      brand={{
        name: org?.displayName ?? tenant.displayName,
        legalName: org?.legalName ?? "",
        color: org?.brandColor ?? "#2F145F",
      }}
    />
  );
}
