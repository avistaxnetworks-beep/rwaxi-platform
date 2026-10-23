"use client";

import { useState } from "react";
import { EnvironmentFrame } from "@/app/_components/shell/environment-frame";
import { useDemo } from "@/app/_components/shell/demo-provider";
import { SuperAdmin } from "@/app/_components/superadmin/super-admin";
import { OnboardTenantModal } from "@/app/_components/superadmin/onboard-tenant-modal";
import { Icon } from "@/app/_components/ui/icon";
import { TX } from "@/app/_lib/chain/simulator";
import type { PlatformMetricsResult } from "../_lib/types";
import { PlatformGovernance } from "./governance-panel";
import { PlatformLedger } from "./ledger-panel";
import { PlatformAttribution, PlatformOverview } from "./platform-panels";

/* eslint-disable @typescript-eslint/no-explicit-any -- the onboarding demo state comes from the untyped prototype */
/** Developer onboarding (KYB) is still the prototype's demo: it creates nothing in the database. */
function DemoOnboarding() {
  const d = useDemo();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {d.orgs.length > 0 && (
        <span className="text-[11px] text-goldInk font-semibold">{`${d.orgs.length} alta(s) en curso · demo, sin persistir`}</span>
      )}
      <button onClick={() => setOpen(true)} className="tc-btn px-3.5 py-2 text-[12.5px] font-semibold inline-flex items-center gap-1.5 focus-ring">
        <Icon name="Plus" size={15} />
        Dar de Alta Nuevo Desarrollador (Onboarding Tenant)
      </button>
      {open && (
        <OnboardTenantModal
          onClose={() => setOpen(false)}
          existing={[...Object.values(d.tenants).map((t: any) => t.nit), ...d.orgs.map((o: any) => o.nit)]}
          onCreate={(f: any) => {
            d.emit(TX.registry(f));
            d.setOrgs((prev: any[]) => [...prev, f]);
            setOpen(false);
            d.toast(`${f.legalName} dado de alta (demo) · portal ${f.slug}.rwaxi.com en revisión`);
          }}
        />
      )}
    </div>
  );
}

/** The consolidated header and modules A, B and C read and write PostgreSQL (platform role). */
export function SuperAdminScreen({ metrics }: { metrics: PlatformMetricsResult }) {
  const d = useDemo();
  return (
    <EnvironmentFrame env="superadmin">
      <SuperAdmin
        emit={d.emit}
        openInspector={d.openInspector}
        tenants={d.tenants}
        setTenants={d.setTenants}
        journeys={d.journeys}
        orgs={d.orgs}
        setOrgs={d.setOrgs}
        feeRules={d.feeRules}
        setFeeRules={d.setFeeRules}
        overrides={d.overrides}
        setOverrides={d.setOverrides}
        currency={d.currency}
        setCurrency={d.setCurrency}
        tab={d.superAdminTab}
        setTab={d.setSuperAdminTab}
        toast={d.toast}
        openTenant={(id: string) => d.navigate("portal", id)}
        overviewSlot={<PlatformOverview metrics={metrics} currency={d.currency} />}
        governanceSlot={<PlatformGovernance metrics={metrics} currency={d.currency} toast={d.toast} onboarding={<DemoOnboarding />} />}
        attributionSlot={<PlatformAttribution metrics={metrics} currency={d.currency} />}
        feesSlot={<PlatformLedger metrics={metrics} currency={d.currency} toast={d.toast} />}
      />
    </EnvironmentFrame>
  );
}
