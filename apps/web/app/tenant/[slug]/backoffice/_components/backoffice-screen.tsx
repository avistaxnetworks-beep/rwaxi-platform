"use client";

import { AccountBadge } from "@/app/_components/auth/account-badge";
import type { AccountView } from "@/app/_components/auth/types";
import { EnvironmentFrame } from "@/app/_components/shell/environment-frame";
import { useDemo } from "@/app/_components/shell/demo-provider";
import { Backoffice } from "@/app/_components/backoffice/backoffice";
import { byId } from "@/app/_lib/data/projects";
import type {
  ComplianceInboxResult,
  DataRoomDeskResult,
  DistributionsDeskResult,
  SubscriptionsDeskResult,
} from "../_lib/types";
import { ComplianceInbox } from "./compliance-inbox";
import { DataRoomDesk } from "./data-room-desk";
import { DistributionsDesk } from "./distributions-desk";
import { SubscriptionsDesk } from "./subscriptions-desk";
import { backofficeLogout } from "../auth-actions";

/**
 * Config and token issuance still run on the prototype demo state; compliance, payments, distributions and the
 * Data Room (DocumentVault) read the database.
 */
export function BackofficeScreen({
  account,
  compliance,
  subscriptions,
  distributions,
  dataRoom,
}: {
  account: AccountView;
  compliance: ComplianceInboxResult;
  subscriptions: SubscriptionsDeskResult;
  distributions: DistributionsDeskResult;
  dataRoom: DataRoomDeskResult;
}) {
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
        subscriptionsSlot={<SubscriptionsDesk desk={subscriptions} currency={d.currency} toast={d.toast} />}
        distributionsSlot={<DistributionsDesk desk={distributions} toast={d.toast} />}
        dataRoomSlot={<DataRoomDesk desk={dataRoom} toast={d.toast} />}
        accountSlot={
          <AccountBadge account={account} logout={backofficeLogout} loginHref="/backoffice/login" />
        }
      />
    </EnvironmentFrame>
  );
}
