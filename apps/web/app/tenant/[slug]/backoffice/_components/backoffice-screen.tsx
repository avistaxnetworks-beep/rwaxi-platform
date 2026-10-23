"use client";

import { EnvironmentFrame } from "@/app/_components/shell/environment-frame";
import { useDemo } from "@/app/_components/shell/demo-provider";
import { Backoffice } from "@/app/_components/backoffice/backoffice";
import { byId } from "@/app/_lib/data/projects";

export function BackofficeScreen() {
  const d = useDemo();
  const project = byId(d.tenantId);
  return (
    <EnvironmentFrame env="backoffice">
      <Backoffice
        emit={d.emit}
        openInspector={() => d.openInspector()}
        photos={d.photosFor(project)}
        t={d.tenants[d.tenantId]}
        p={project}
        setTenant={d.setTenant}
        journey={d.journeys[d.tenantId]}
        setJourney={d.setJourney}
        currency={d.currency}
        toast={d.toast}
        tab={d.backofficeTab}
        setTab={d.setBackofficeTab}
        toPortal={() => d.navigate("portal")}
      />
    </EnvironmentFrame>
  );
}
