import type { ReactNode } from "react";
import { ClientOnly } from "@/app/_components/shell/client-only";
import { DemoProvider } from "@/app/_components/shell/demo-provider";

/** www.rwaxi.com — public showcase under the RWAXI brand. */
export default function VitrinaLayout({ children }: { children: ReactNode }) {
  return (
    <ClientOnly>
      <DemoProvider>{children}</DemoProvider>
    </ClientOnly>
  );
}
