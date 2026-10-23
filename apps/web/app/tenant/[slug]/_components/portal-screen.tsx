"use client";

import { useEffect, useRef, useState } from "react";
import { EnvironmentFrame } from "@/app/_components/shell/environment-frame";
import { useDemo } from "@/app/_components/shell/demo-provider";
import { Portal } from "@/app/_components/portal/portal";
import { Icon } from "@/app/_components/ui/icon";
import { byId } from "@/app/_lib/data/projects";
import { EMPTY_KYC } from "@/app/_lib/data/kyc";
import { signNda, submitKyc } from "../actions";
import { toKycSubmission } from "../_lib/kyc-submission";
import type { NdaSubmission, PersistedJourney, PersistedJourneyResult } from "../_lib/journey-types";

/* eslint-disable @typescript-eslint/no-explicit-any -- the journey shape comes from the untyped prototype */
const freshKyc = () => ({ stage: "form", step: 0, data: { ...EMPTY_KYC }, status: null, reason: null, whitelistTx: null });

/**
 * PostgreSQL is the source of truth for lead, NDA, KYC status and Data Room grant. The demo
 * journey of the prototype is discarded; only state the database does not hold yet survives:
 * an in-progress KYC form for the same NDA, and in-session subscriptions (holdings).
 */
function applyPersisted(j: any, p: PersistedJourney | null, firstApply: boolean): any {
  if (!p) return { ...j, lead: null, nda: null, kyc: freshKyc(), grant: null, holdings: [] };
  const sameNda = !!p.nda && j.nda?.id === p.nda.id;
  const kyc = p.kyc
    ? {
        ...(sameNda ? j.kyc : freshKyc()),
        stage: "status",
        status: p.kyc.status,
        reason: p.kyc.reason,
        dossierHash: p.kyc.dossierHash,
        whitelistTx: p.kyc.whitelistTx,
        whitelistQueued: p.kyc.whitelistQueued,
        wallet: p.kyc.wallet,
        kycCaseId: p.kyc.kycCaseId,
      }
    : sameNda && !firstApply && j.kyc?.stage === "form"
      ? j.kyc
      : freshKyc();
  return {
    ...j,
    lead: p.lead,
    nda: p.nda,
    kyc,
    grant: p.grant,
    holdings: !firstApply && p.kyc?.status === "aprobado" ? j.holdings : [],
  };
}

export function PortalScreen({ persisted }: { persisted: PersistedJourneyResult }) {
  const d = useDemo();
  const [ready, setReady] = useState(false);
  const applied = useRef(false);
  const tenant = d.tenants[d.tenantId];
  const project = byId(d.tenantId);
  const journey = d.journeys[d.tenantId];

  // Hydrate before the portal mounts, so it never renders the prototype's demo journey.
  useEffect(() => {
    d.setJourney((j: any) => applyPersisted(j, persisted.ok ? persisted.data : null, !applied.current));
    applied.current = true;
    setReady(true);
    // The referral is now held by the rwaxi_ref cookie (middleware.ts): tidy the address bar.
    const params = new URLSearchParams(window.location.search);
    if (params.has("ref")) {
      params.delete("ref");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-apply only when the server sends new data
  }, [persisted]);

  const persistNda = async (input: NdaSubmission) => {
    const result = await signNda(input);
    if (result.ok) d.setJourney((j: any) => ({ ...j, lead: result.lead }));
    return result;
  };

  const persistKyc = async (data: unknown) => {
    try {
      return await submitKyc(await toKycSubmission(data));
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "No se pudo preparar tu expediente." };
    }
  };

  return (
    <EnvironmentFrame env="portal">
      {!persisted.ok && (
        <div role="alert" className="bg-[#FDECEA] text-[#B42318] border-b border-[#F3C5C0]">
          <p className="gutter max-w-[1240px] mx-auto py-3 text-[12.5px] flex gap-2 items-center">
            <Icon name="AlertTriangle" size={15} />
            {persisted.error}
          </p>
        </div>
      )}
      {ready ? (
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
          persistNda={persistNda}
          persistKyc={persistKyc}
        />
      ) : (
        <div className="boot">RWAXI · CARGANDO TU PROCESO</div>
      )}
    </EnvironmentFrame>
  );
}
