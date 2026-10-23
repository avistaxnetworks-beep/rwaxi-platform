"use client";

import { EnvironmentFrame } from "@/app/_components/shell/environment-frame";
import { useDemo } from "@/app/_components/shell/demo-provider";
import { Backoffice } from "@/app/_components/backoffice/backoffice";
import { byId } from "@/app/_lib/data/projects";
import type { ComplianceInboxResult } from "../_lib/types";
import { ComplianceInbox } from "./compliance-inbox";

/** Config and Data Room tabs still run on the prototype demo state; compliance reads the database. */
export function BackofficeScreen({ compliance }: { compliance: ComplianceInboxResult }) {
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
        complianceSlot={<ComplianceInbox inbox={compliance} currency={d.currency} toast={d.toast} />}
      />
    </EnvironmentFrame>
  );
}
