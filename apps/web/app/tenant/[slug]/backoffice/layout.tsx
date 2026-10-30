import type { ReactNode } from "react";
import { I18nProvider } from "@/app/_i18n/provider";
import { requestI18n } from "@/app/_i18n/server";

/**
 * {slug}.rwaxirealestate.com/backoffice — the developer's internal panel, in es · en · pt only (rwaxi_backoffice_lang;
 * without a choice of its own it follows the portal of the host when that is one of the three). Nested inside the
 * portal's provider, it overrides its language for the backoffice, its login and its account activation.
 */
export default async function BackofficeLayout({ children }: { children: ReactNode }) {
  const { locale, catalog } = await requestI18n("backoffice");
  return (
    <I18nProvider scope="backoffice" locale={locale} catalog={catalog}>
      {children}
    </I18nProvider>
  );
}
