"use client";

import { useEffect } from "react";
import { EnvironmentFrame } from "@/app/_components/shell/environment-frame";
import { useDemo } from "@/app/_components/shell/demo-provider";
import { Portal } from "@/app/_components/portal/portal";
import { byId } from "@/app/_lib/data/projects";
import { nowISO } from "@/app/_lib/format";

export function PortalScreen() {
  const d = useDemo();
  const tenant = d.tenants[d.tenantId];
  const project = byId(d.tenantId);
  const journey = d.journeys[d.tenantId];

  // LeadReferral hand-off from the vitrina: ?ref=ref_rwx_… attributes the visit to RWAXI.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (!ref) return;
    d.setJourney((j: any) => (j.lead ? j : { ...j, lead: { token: ref, at: nowISO(), source: "RWAXI" } }));
    params.delete("ref");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on landing
  }, []);

  return (
    <EnvironmentFrame env="portal">
      <Portal
        t={tenant}
        p={project}
        journey={journey}
        setJourney={d.setJourney}
        currency={d.currency}
        setCurrency={d.setCurrency}
        photosFor={d.photosFor}
        onUpload={d.uploadPhotos}
        toast={d.toast}
        openDoc={(doc: unknown) => d.setModal({ type: "doc", doc })}
        startSub={(draft: unknown) => d.setModal({ type: "subscribe", draft })}
        toBackoffice={() => {
          d.setBackofficeTab("cumplimiento");
          d.navigate("backoffice");
        }}
      />
    </EnvironmentFrame>
  );
}
