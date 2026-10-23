"use client";

import { EnvironmentFrame } from "@/app/_components/shell/environment-frame";
import { useDemo } from "@/app/_components/shell/demo-provider";
import { SuperAdmin } from "@/app/_components/superadmin/super-admin";
import type { PlatformMetricsResult } from "../_lib/types";
import { PlatformGovernance } from "./governance-panel";
import { PlatformLedger } from "./ledger-panel";
import { OnboardingWizard } from "./onboarding-wizard";
import { PlatformAttribution, PlatformOverview } from "./platform-panels";

/** The consolidated header, the onboarding and modules A, B and C read and write PostgreSQL (platform role). */
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
        governanceSlot={<PlatformGovernance metrics={metrics} currency={d.currency} toast={d.toast} onboarding={<OnboardingWizard metrics={metrics} toast={d.toast} />} />}
        attributionSlot={<PlatformAttribution metrics={metrics} currency={d.currency} />}
        feesSlot={<PlatformLedger metrics={metrics} currency={d.currency} toast={d.toast} />}
      />
    </EnvironmentFrame>
  );
}
