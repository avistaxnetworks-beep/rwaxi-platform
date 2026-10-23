import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClientOnly } from "@/app/_components/shell/client-only";
import { DemoProvider } from "@/app/_components/shell/demo-provider";

export const metadata: Metadata = {
  title: "Consola Super-Admin · RWAXI",
  robots: { index: false, follow: false },
};

/** admin.rwaxi.com — RWAXI direction console (tenant governance, attribution, fees). */
export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return (
    <ClientOnly>
      <DemoProvider>{children}</DemoProvider>
    </ClientOnly>
  );
}
