// Tenants onboarded in PostgreSQL that are not among the prototype's demo developers.
// The ported portal and backoffice read their project and developer from the prototype tables
// (PROJECTS, DEVELOPERS, DEFAULT_*, PRESENTERS): registerDbTenant() adds the tenant of this host
// to them in the browser, before the demo store boots, so every screen renders it with its own data.
import { PROJECTS } from "./projects";
import { DEFAULT_CONTACT, DEFAULT_REGIME, DEFAULT_SINCE, DEVELOPERS } from "./tenants";
import { PRESENTERS } from "./video";

export interface DbTenantDocument {
  id: string;
  folder: string;
  name: string;
  restricted: boolean;
  /** SHA-256 of the file (64 hex, no 0x), as the prototype renders it */
  hash: string;
  size: number;
  at: string;
  uploaded: false;
}

export interface DbTenantView {
  /** prototype project id: the tenant's slug (onboarding never lets it collide with a demo project id) */
  id: string;
  /** offering in the prototype's project shape (see toVitrinaProject) */
  project: Record<string, unknown> & { id: string };
  developer: { slug: string; displayName: string; legalName: string; nit: string; color: string; domain: string; symbol: string };
  regime: "sagrilaft" | "sarlaft";
  contact: string;
  since: string;
  presenter: [string, string];
  /** fields of the demo tenant replaced with the database's */
  tenant: {
    portalStatus: string;
    published: boolean;
    domainStatus: string;
    ndaText: string;
    complianceTpl: Record<string, unknown>;
    docs: DbTenantDocument[];
    merkle: string;
    onchainRoot: string | null;
    mint: { status: "minted" | "none"; network: string; name: string; symbol: string; supply: number; price: number; contract: string | null; tx: string | null };
    leads: never[];
  };
}

/** Browser only: makes the prototype tables aware of this host's tenant (idempotent). */
export function registerDbTenant(view: DbTenantView): void {
  const projects = PROJECTS as unknown as Record<string, unknown>[];
  const at = projects.findIndex((p) => p.id === view.id);
  if (at >= 0) projects[at] = view.project;
  else projects.push(view.project);
  (DEVELOPERS as unknown as Record<string, unknown>)[view.id] = view.developer;
  (DEFAULT_REGIME as Record<string, string>)[view.id] = view.regime;
  (DEFAULT_CONTACT as Record<string, string>)[view.id] = view.contact;
  (DEFAULT_SINCE as Record<string, string>)[view.id] = view.since;
  (PRESENTERS as Record<string, string[]>)[view.id] = view.presenter;
}
