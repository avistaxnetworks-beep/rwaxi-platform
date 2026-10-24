"use client";

import type { ReactNode } from "react";
import { ArchBar } from "@/app/_components/shell/arch-bar";
import { OnChainInspector } from "@/app/_components/inspector/on-chain-inspector";
import { LeadOverlay } from "@/app/_components/vitrina/lead-overlay";
import { PortalSubscribeModal } from "@/app/_components/portal/subscribe-modal";
import { SignedDocModal } from "@/app/_components/portal/signed-doc-modal";
import { Icon } from "@/app/_components/ui/icon";
import { TenantLanguages, useI18n } from "@/app/_i18n/provider";
import { byId } from "@/app/_lib/data/projects";
import { useDemo, type EnvId } from "./demo-provider";

/* eslint-disable @typescript-eslint/no-explicit-any -- the subscription draft comes from the untyped prototype */
/** Persisted subscription flow, provided by the portal (Server Action) instead of the demo store. */
export interface SubscriptionHandler {
  persist: (draft: any) => Promise<{ ok: true } | { ok: false; error: string }>;
  onPersisted: (result: any) => void;
}

/**
 * Chrome shared by the 4 environments: architecture bar, on-chain inspector, modals and toast.
 * Its root carries the language of the environment (lang, and dir="rtl" for Arabic in the vitrina).
 */
export function EnvironmentFrame({
  env,
  children,
  subscription,
}: {
  env: EnvId;
  children: ReactNode;
  subscription?: SubscriptionHandler;
}) {
  const d = useDemo();
  const { lang, dir } = useI18n();
  const tenant = d.tenants[d.tenantId];
  const project = byId(d.tenantId);

  return (
    <div className="min-h-full flex flex-col" lang={lang} dir={dir} data-env={env}>
      <ArchBar
        env={env}
        setEnv={(next: EnvId) => d.navigate(next)}
        tenantId={d.tenantId}
        setTenantId={(id: string) =>
          env === "portal" || env === "backoffice" ? d.navigate(env, id) : d.setTenantId(id)
        }
        tenants={d.tenants}
        openInspector={d.openInspector}
      />
      {children}
      <TenantLanguages active={d.inspector.open}>
        <OnChainInspector
          open={d.inspector.open}
          onClose={d.closeInspector}
          tenants={d.tenants}
          journeys={d.journeys}
          chainX={d.chainX}
          setChainX={d.setChainX}
          chainLog={d.chainLog}
          emit={d.emit}
          tenantId={d.tenantId}
          setTenantId={d.setTenantId}
          tab={d.inspector.tab}
          setTab={d.setInspectorTab}
          toast={d.toast}
          canExecute={env === "backoffice"}
          sourceSession={env === "backoffice" ? "backoffice" : env === "superadmin" ? "platform" : null}
        />
      </TenantLanguages>
      {d.leadOverlay && (
        <LeadOverlay
          lead={d.leadOverlay.lead}
          tenant={d.leadOverlay.tenant ?? d.tenants[d.leadOverlay.id]}
          project={d.leadOverlay.project ?? byId(d.leadOverlay.id)}
        />
      )}
      {d.modal?.type === "subscribe" && (
        <PortalSubscribeModal
          t={tenant}
          p={project}
          draft={d.modal.draft}
          currency={d.currency}
          onClose={() => d.setModal(null)}
          onConfirm={subscription ? subscription.onPersisted : d.confirmSubscription}
          persist={subscription?.persist}
        />
      )}
      {d.modal?.type === "doc" && (
        <SignedDocModal doc={d.modal.doc} onClose={() => d.setModal(null)} toast={d.toast} />
      )}
      <div className="toast-wrap" aria-live="polite">
        {d.toastMessage && (
          <div className="bg-rxDeep text-white text-[12.5px] px-4 py-3 shadow-xl inline-flex items-center gap-2">
            <Icon name="Check" size={15} className="text-rxAqua" />
            {d.toastMessage}
          </div>
        )}
      </div>
    </div>
  );
}
