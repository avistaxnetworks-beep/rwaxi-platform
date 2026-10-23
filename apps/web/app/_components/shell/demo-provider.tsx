"use client";

/**
 * Client state of the ported prototype (formerly the root `App` component).
 *
 * One provider per environment layout. Portal ↔ Backoffice share it because both live under
 * app/tenant/[slug]/layout.tsx on the same host; Vitrina and Super-Admin are separate hosts,
 * so each starts from the seed state. This is a demo store until screens read from
 * @rwaxi/database through server actions.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { envHref, type EnvId } from "@/app/_lib/hosts";
import { PROJECTS, byId } from "@/app/_lib/data/projects";
import { initJourneys, initTenants } from "@/app/_lib/data/tenants";
import { registerDbTenant, type DbTenantView } from "@/app/_lib/data/db-tenants";
import { initFeeRules } from "@/app/_lib/data/fees";
import { DEMO_WALLET, TX, initChainLog, subIdOf, tokenAddrOf, txHash } from "@/app/_lib/chain/simulator";
import { projectPhotos, renderCache } from "@/app/_lib/renders";
import { seededHex } from "@/app/_lib/hash";
import { nf, nowISO } from "@/app/_lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any -- prototype state is untyped until it moves to Prisma models */
type Tenant = any;
type Journey = any;
type ChainTx = any;
type Updater<T> = (prev: T) => T;
type ModalState = { type: "subscribe"; draft: any } | { type: "doc"; doc: any } | null;

export type { EnvId };

interface DemoState {
  tenantId: string;
  setTenantId: (id: string) => void;
  tenants: Record<string, Tenant>;
  setTenants: (u: Updater<Record<string, Tenant>>) => void;
  journeys: Record<string, Journey>;
  setJourneys: (u: Updater<Record<string, Journey>>) => void;
  /** Updaters bound to the current tenant (prototype `ie` / `ee`). */
  setTenant: (u: Updater<Tenant>) => void;
  setJourney: (u: Updater<Journey>) => void;
  chainLog: ChainTx[];
  emit: (tx: ChainTx) => void;
  chainX: Record<string, any>;
  setChainX: (u: any) => void;
  inspector: { open: boolean; tab: string };
  openInspector: (tab?: unknown) => void;
  closeInspector: () => void;
  setInspectorTab: (tab: string) => void;
  currency: "COP" | "USD";
  setCurrency: (c: "COP" | "USD") => void;
  filter: string;
  setFilter: (f: string) => void;
  backofficeTab: string;
  setBackofficeTab: (t: string) => void;
  superAdminTab: string;
  setSuperAdminTab: (t: string) => void;
  orgs: any[];
  setOrgs: (u: any) => void;
  feeRules: Record<string, any>;
  setFeeRules: (u: any) => void;
  overrides: Record<string, any>;
  setOverrides: (u: any) => void;
  modal: ModalState;
  setModal: (m: ModalState) => void;
  leadOverlay: { id: string; lead: any; tenant: any; project: any } | null;
  toastMessage: string | null;
  toast: (msg: string) => void;
  photosFor: (project: any) => any;
  uploadPhotos: (projectId: string, files: FileList | File[] | null) => void;
  /** Vitrina → Portal hand-off with a RWAXI referral token (LeadReferral). */
  /** Overlay + hand-off to the portal with a token signed by the vitrina (issueReferral). */
  openLead: (
    projectId: string,
    referral: { token: string; referralId: string; issuedAt: string },
    target: { slug: string; tenant: any; project: any },
  ) => void;
  confirmSubscription: (draft: any) => void;
  navigate: (env: EnvId, tenantId?: string, search?: string) => void;
}

const Ctx = createContext<DemoState | null>(null);

export function useDemo(): DemoState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDemo must be used inside <DemoProvider>");
  return ctx;
}

export function DemoProvider({
  tenantSlug,
  dbTenant,
  children,
}: {
  tenantSlug?: string;
  /** tenant of this host read from PostgreSQL when it is not one of the prototype's demo developers */
  dbTenant?: DbTenantView | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [boot] = useState(() => {
    if (dbTenant) registerDbTenant(dbTenant);
    const T: Record<string, Tenant> = initTenants();
    if (dbTenant) T[dbTenant.id] = { ...T[dbTenant.id], ...dbTenant.tenant };
    const J: Record<string, Journey> = initJourneys();
    return { T, J, L: initChainLog(T, J) as ChainTx[] };
  });
  const initialTenant =
    (tenantSlug && Object.values(boot.T).find((t: Tenant) => t.slug === tenantSlug)?.projectId) || "santabarbara";

  const [tenantId, setTenantId] = useState<string>(initialTenant);
  const [backofficeTab, setBackofficeTab] = useState("config");
  const [filter, setFilter] = useState("todos");
  const [currency, setCurrency] = useState<"COP" | "USD">("COP");
  const [tenants, setTenants] = useState<Record<string, Tenant>>(boot.T);
  const [journeys, setJourneys] = useState<Record<string, Journey>>(boot.J);
  const [chainLog, setChainLog] = useState<ChainTx[]>(boot.L);
  const [chainX, setChainX] = useState<Record<string, any>>({});
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState("state");
  const [orgs, setOrgs] = useState<any[]>([]);
  const [feeRules, setFeeRules] = useState<Record<string, any>>(initFeeRules);
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [superAdminTab, setSuperAdminTab] = useState("gobierno");
  const [modal, setModal] = useState<ModalState>(null);
  const [leadOverlay, setLeadOverlay] = useState<DemoState["leadOverlay"]>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [photoOverrides, setPhotoOverrides] = useState<Record<string, string[]>>({});
  const [, forceRender] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Canvas renders use the brand fonts by family name: re-render once they are loaded.
  useEffect(() => {
    document.fonts?.ready?.then(() => {
      PROJECTS.forEach((p: any) => delete (renderCache as Record<string, unknown>)[p.id + ":3"]);
      forceRender((n) => n + 1);
    });
  }, []);

  // Data Room access grant: issued when NDA is signed and KYC approved, revoked otherwise.
  useEffect(() => {
    PROJECTS.forEach((p: any) => {
      const j = journeys[p.id];
      const eligible = j.nda && j.kyc.status === "aprobado";
      if (eligible && !j.grant) {
        setJourneys((prev) => ({
          ...prev,
          [p.id]: {
            ...prev[p.id],
            grant: { id: "grant_" + seededHex("g" + p.id + Date.now(), 16), at: nowISO(), ttlH: 24 },
          },
        }));
      }
      if (!eligible && j.grant) setJourneys((prev) => ({ ...prev, [p.id]: { ...prev[p.id], grant: null } }));
    });
  }, [journeys]);

  const value = useMemo<DemoState>(() => {
    const tenant = tenants[tenantId];
    const project = byId(tenantId);

    const toast = (msg: string) => {
      setToastMessage(msg);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToastMessage(null), 2800);
    };
    const emit = (tx: ChainTx) => setChainLog((prev) => [tx, ...prev]);
    const setTenant = (u: Updater<Tenant>) => setTenants((prev) => ({ ...prev, [tenantId]: u(prev[tenantId]) }));
    const setJourney = (u: Updater<Journey>) => setJourneys((prev) => ({ ...prev, [tenantId]: u(prev[tenantId]) }));

    const navigate = (env: EnvId, id: string = tenantId, search = "") => {
      const url = new URL(envHref(env, tenants[id].slug, search));
      if (url.origin === window.location.origin) {
        if (id !== tenantId) setTenantId(id);
        router.push(url.pathname + url.search);
        window.scrollTo({ top: 0 });
      } else {
        window.location.assign(url.toString());
      }
    };

    const openLead: DemoState["openLead"] = (projectId, referral, target) => {
      // The overlay shows the single-use id; the URL carries the full signed token.
      const lead = { token: referral.referralId, at: referral.issuedAt.replace(/\.\d{3}Z$/, "Z"), source: "RWAXI" };
      setLeadOverlay({ id: projectId, lead, tenant: target.tenant, project: target.project });
      setTimeout(() => {
        setLeadOverlay(null);
        // vitrina → tenant portal is always a different host: full navigation.
        window.location.assign(envHref("portal", target.slug, `?ref=${encodeURIComponent(referral.token)}`));
      }, 1900);
    };

    const confirmSubscription = (draft: any) => {
      const holding = (id: string) => ({
        id,
        units: draft.units,
        capital: draft.capital,
        accrued: 0,
        since: new Date().toISOString().slice(0, 10),
        status: draft.status,
        tx: draft.tx,
      });
      if (draft.status === "en_wallet") {
        const id = "h" + Date.now();
        emit(TX.mint(tenant, project, tokenAddrOf(tenant, project), subIdOf(id), DEMO_WALLET, draft.units, txHash("pay" + id)));
        setJourney((j) => ({ ...j, holdings: [...j.holdings, holding(id)] }));
        toast(`mintSubscription(): ${nf(0).format(draft.units)} tokens ${tenant.mint.symbol}`);
        return;
      }
      setJourney((j) => ({ ...j, holdings: [...j.holdings, holding("h" + Date.now())] }));
      toast(`Reserva registrada: ${nf(0).format(draft.units)} unidades`);
    };

    const uploadPhotos = (projectId: string, files: FileList | File[] | null) => {
      const images = Array.from(files || [])
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, 4);
      if (!images.length) return;
      Promise.all(
        images.map(
          (f) =>
            new Promise<string | null>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(f);
            }),
        ),
      ).then((urls) => {
        setPhotoOverrides((prev) => {
          const next = (prev[projectId] || []).slice();
          urls.filter(Boolean).forEach((u, i) => (next[i] = u as string));
          return { ...prev, [projectId]: next };
        });
        toast("Fotografías cargadas en orden: Fachada, Interior, Zona Común, Ubicación");
      });
    };

    return {
      tenantId,
      setTenantId,
      tenants,
      setTenants,
      journeys,
      setJourneys,
      setTenant,
      setJourney,
      chainLog,
      emit,
      chainX,
      setChainX,
      inspector: { open: inspectorOpen, tab: inspectorTab },
      openInspector: (tab?: unknown) => {
        if (typeof tab === "string") setInspectorTab(tab);
        setInspectorOpen(true);
      },
      closeInspector: () => setInspectorOpen(false),
      setInspectorTab,
      currency,
      setCurrency,
      filter,
      setFilter,
      backofficeTab,
      setBackofficeTab,
      superAdminTab,
      setSuperAdminTab,
      orgs,
      setOrgs,
      feeRules,
      setFeeRules,
      overrides,
      setOverrides,
      modal,
      setModal,
      leadOverlay,
      toastMessage,
      toast,
      photosFor: (p: any) => projectPhotos(p, photoOverrides[p.id]),
      uploadPhotos,
      openLead,
      confirmSubscription,
      navigate,
    };
  }, [
    tenantId,
    tenants,
    journeys,
    chainLog,
    chainX,
    inspectorOpen,
    inspectorTab,
    currency,
    filter,
    backofficeTab,
    superAdminTab,
    orgs,
    feeRules,
    overrides,
    modal,
    leadOverlay,
    toastMessage,
    photoOverrides,
    router,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
