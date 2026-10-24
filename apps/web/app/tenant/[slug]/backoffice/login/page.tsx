import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { forTenant } from "@rwaxi/database";
import { requestTranslate } from "@/app/_i18n/server";
import { currentStaff } from "@/app/_lib/server/staff-auth";
import { requireHostTenant } from "@/app/_lib/server/tenant-context";
import { BackofficeLogin } from "../_components/backoffice-login";

// Per-request: the session cookie decides between the form and the backoffice.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await requestTranslate("tenant");
  const tenant = await requireHostTenant().catch(() => null);
  return {
    title: tr("Acceso · Backoffice · {name}", { name: tenant?.displayName ?? "RWAXI" }),
    robots: { index: false, follow: false },
  };
}

/** {slug}.rwaxi.com/backoffice/login — staff sign-in of the developer (password + TOTP). */
export default async function BackofficeLoginPage() {
  const tenant = await requireHostTenant();
  if (await currentStaff("TENANT", tenant.id)) redirect("/backoffice");
  const org = await forTenant(tenant.id).organization.findUnique({
    where: { id: tenant.id },
    select: { displayName: true, legalName: true, brandColor: true },
  });
  return (
    <BackofficeLogin
      brand={{
        name: org?.displayName ?? tenant.displayName,
        legalName: org?.legalName ?? "",
        color: org?.brandColor ?? "#2F145F",
      }}
    />
  );
}
