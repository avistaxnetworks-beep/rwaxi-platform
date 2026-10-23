"use client";

import { EnvironmentFrame } from "@/app/_components/shell/environment-frame";
import { useDemo } from "@/app/_components/shell/demo-provider";
import { SuperAdmin } from "@/app/_components/superadmin/super-admin";

export function SuperAdminScreen() {
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
      />
    </EnvironmentFrame>
  );
}
