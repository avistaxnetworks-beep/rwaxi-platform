// Module G · operational health of the Super-Admin console. buildHealthReport() is pure (tested); readOperationalHealth()
// loads every developer's rows with the platform role. It shows the ERC-3643 contracts (registries and tokens), the
// census of tokens issued — the database register against the confirmed outbox (and, in RPC mode and on demand, the
// token's totalSupply) — and the alerts of the chain queue (failed attempts, reverts, receipts awaited, rows stuck)
// and of the mail queue.
import type { ChainTransaction, platformPrisma } from "@rwaxi/database";
import { interpolate } from "@/app/_i18n/translate";
import { blockerReason, type ChainState } from "@/app/_lib/server/chain-invariants";

export type Severity = "critical" | "warning" | "info";
const MIN = 60_000;
const HOUR = 60 * MIN;

export interface HealthOrgInput {
  id: string;
  name: string;
  slug: string;
  complianceRegistry: string | null;
}
export interface HealthOfferingInput {
  id: string;
  organizationId: string;
  code: string;
  token: {
    network: string;
    symbol: string;
    contractAddress: string | null;
    status: string;
    platformFeeBps: number | null;
    maxSupply: number;
    deployTxHash: string | null;
    deployedAt: string | null;
  } | null;
}
export interface HealthSubscriptionInput {
  organizationId: string;
  offeringId: string;
  status: string;
  units: number;
  onchainId: string | null;
  wallet: string | null;
}
export interface HealthMailInput {
  organizationId: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
}
export interface HealthInput {
  orgs: HealthOrgInput[];
  offerings: HealthOfferingInput[];
  subscriptions: HealthSubscriptionInput[];
  txs: ChainTransaction[];
  distributions: { organizationId: string; onchainId: string; status: string }[];
  mail: HealthMailInput[];
  configuredFactory: string | null;
  /** CHAIN_EXECUTION of this server: SIMULATION signs and never broadcasts; RPC sends to RPC_URL_<NETWORK> */
  mode: "SIMULATION" | "RPC";
}

export interface HealthContractRow {
  tenant: string;
  slug: string;
  kind: "registry" | "token";
  label: string;
  address: string | null;
  network: string | null;
  status: string;
  /** how its deployment was executed: RPC, SIMULATION, or null (illustrative seed data) */
  mode: string | null;
  txHash: string | null;
  platformFeeBps: number | null;
}
export interface HealthCensusRow {
  tenant: string;
  slug: string;
  offeringCode: string;
  symbol: string;
  network: string;
  address: string;
  status: string;
  maxSupply: number;
  /** units of MINTED subscriptions (the platform's register) */
  dbMinted: number;
  /** units of the confirmed mintSubscription() calls on this token (what the token holds) */
  outboxMinted: number;
  mintPending: number;
  reserved: number;
  consistent: boolean;
  deployMode: string | null;
}
export interface HealthQueueRow {
  tenant: string;
  slug: string;
  pending: number;
  blocked: number;
  awaitingReceipt: number;
  withFailedAttempts: number;
  reverted: number;
  confirmed: number;
  cancelled: number;
  oldestPendingAt: string | null;
}
export interface HealthPendingRow {
  id: string;
  tenant: string;
  slug: string;
  kind: string;
  method: string;
  network: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  error: string | null;
  awaitingReceipt: boolean;
  txHash: string | null;
  /** why it cannot run now (queue precedence, a revert the contracts would answer), Spanish */
  blockedReason: string | null;
}
export interface HealthAlert {
  severity: Severity;
  area: "chain" | "census" | "mail";
  tenant: string | null;
  slug: string | null;
  title: string;
  detail: string;
  at: string;
  chainTxId?: string;
}
export interface PlatformHealthReport {
  generatedAt: string;
  mode: "SIMULATION" | "RPC";
  factories: { network: string; address: string; configured: boolean }[];
  contracts: HealthContractRow[];
  census: HealthCensusRow[];
  queue: HealthQueueRow[];
  pending: HealthPendingRow[];
  mail: { pending: number; retrying: number; failed: number; oldestPendingAt: string | null };
  alerts: HealthAlert[];
}

const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : null);
const argsOf = (raw: unknown) => (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
const hours = (ms: number) => Math.floor(ms / HOUR);
const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
/** Calls RWAXI's console executes (factory, RWAXI_OPERATOR_ROLE): their precedence is checked as the console's. */
const PLATFORM_KINDS = new Set(["TENANT_REGISTRY_DEPLOYED", "OFFERING_TOKEN_DEPLOYED"]);

export function buildHealthReport(input: HealthInput, now: Date = new Date()): PlatformHealthReport {
  const orgById = new Map(input.orgs.map((o) => [o.id, o]));
  const name = (orgId: string | null) => (orgId ? (orgById.get(orgId)?.name ?? orgId) : "RWAXI");
  const slug = (orgId: string | null) => (orgId ? (orgById.get(orgId)?.slug ?? null) : null);
  const alerts: HealthAlert[] = [];

  // ── factories: the configured one and every one the outbox used ──
  const factories = new Map<string, { network: string; address: string; configured: boolean }>();
  for (const t of input.txs) {
    if (!PLATFORM_KINDS.has(t.kind)) continue;
    const key = `${t.network}:${lower(t.contractAddress)}`;
    if (!factories.has(key)) factories.set(key, { network: t.network, address: t.contractAddress, configured: lower(t.contractAddress) === lower(input.configuredFactory) });
  }
  if (input.configuredFactory && ![...factories.values()].some((f) => f.configured)) {
    factories.set(`*:${lower(input.configuredFactory)}`, { network: "—", address: input.configuredFactory, configured: true });
  }

  // ── contracts: each tenant's registry and each offering's token ──
  const contracts: HealthContractRow[] = [];
  const confirmedOf = (orgId: string, kind: string, pick: (t: ChainTransaction) => boolean = () => true) =>
    input.txs.filter((t) => t.organizationId === orgId && t.kind === kind && pick(t));
  for (const o of input.orgs) {
    const deploys = confirmedOf(o.id, "TENANT_REGISTRY_DEPLOYED");
    const done = deploys.find((t) => t.status === "CONFIRMED");
    const open = deploys.find((t) => t.status === "PENDING" || t.status === "REVERTED");
    contracts.push({
      tenant: o.name,
      slug: o.slug,
      kind: "registry",
      label: "RwaxiComplianceRegistry",
      address: o.complianceRegistry,
      network: done?.network ?? open?.network ?? null,
      status: o.complianceRegistry ? "DEPLOYED" : open ? open.status : "DEFERRED",
      mode: done?.executionMode ?? null,
      txHash: done?.txHash ?? open?.txHash ?? null,
      platformFeeBps: null,
    });
  }
  for (const f of input.offerings) {
    if (!f.token) continue;
    const deployed = confirmedOf(f.organizationId, "OFFERING_TOKEN_DEPLOYED", (t) => t.status === "CONFIRMED" && t.offeringId === f.id)[0];
    contracts.push({
      tenant: name(f.organizationId),
      slug: slug(f.organizationId) ?? "",
      kind: "token",
      label: `RwaxiPropertyToken ${f.token.symbol} · ${f.code}`,
      address: f.token.contractAddress,
      network: f.token.network,
      status: f.token.status,
      mode: deployed?.executionMode ?? null,
      txHash: f.token.deployTxHash,
      platformFeeBps: f.token.platformFeeBps,
    });
  }

  // ── census: the platform's register against the confirmed mints on each deployed token ──
  const census: HealthCensusRow[] = [];
  for (const f of input.offerings) {
    const t = f.token;
    if (!t?.contractAddress || (t.status !== "DEPLOYED" && t.status !== "PAUSED")) continue;
    const subs = input.subscriptions.filter((s) => s.offeringId === f.id);
    const unitsIn = (...statuses: string[]) => subs.filter((s) => statuses.includes(s.status)).reduce((n, s) => n + s.units, 0);
    const outboxMinted = input.txs
      .filter((x) => x.kind === "SUBSCRIPTION_MINTED" && x.status === "CONFIRMED" && lower(x.contractAddress) === lower(t.contractAddress))
      .reduce((n, x) => n + Number(argsOf(x.args).amount ?? 0), 0);
    const dbMinted = unitsIn("MINTED");
    const row: HealthCensusRow = {
      tenant: name(f.organizationId),
      slug: slug(f.organizationId) ?? "",
      offeringCode: f.code,
      symbol: t.symbol,
      network: t.network,
      address: t.contractAddress,
      status: t.status,
      maxSupply: t.maxSupply,
      dbMinted,
      outboxMinted,
      mintPending: unitsIn("MINT_PENDING"),
      reserved: unitsIn("RESERVED", "PAYMENT_PENDING"),
      consistent: dbMinted === outboxMinted && outboxMinted <= t.maxSupply,
      deployMode: confirmedOf(f.organizationId, "OFFERING_TOKEN_DEPLOYED", (x) => x.status === "CONFIRMED" && x.offeringId === f.id)[0]?.executionMode ?? null,
    };
    census.push(row);
    if (!row.consistent) {
      alerts.push({
        severity: "critical",
        area: "census",
        tenant: row.tenant,
        slug: row.slug,
        title: `Censo de ${t.symbol} (${f.code}) descuadrado`,
        detail:
          outboxMinted > t.maxSupply
            ? `Las emisiones confirmadas (${outboxMinted}) superan el tope de emisión (${t.maxSupply}).`
            : `Registro de la plataforma: ${dbMinted} tokens MINTED · emisiones confirmadas en la cola: ${outboxMinted}.`,
        at: now.toISOString(),
      });
    }
  }

  // ── chain queue: per tenant, and every PENDING row with why it is stuck ──
  const stateFor = (orgId: string): ChainState => ({
    registry: orgById.get(orgId)?.complianceRegistry ?? null,
    txs: input.txs.filter((t) => t.organizationId === orgId),
    subscriptions: input.subscriptions.filter((s) => s.organizationId === orgId).map((s) => ({ onchainId: s.onchainId, status: s.status, wallet: lower(s.wallet) })),
    tokens: input.offerings
      .filter((f) => f.organizationId === orgId && f.token)
      .map((f) => ({ contractAddress: f.token!.contractAddress, status: f.token!.status, maxSupply: f.token!.maxSupply })),
    distributions: input.distributions.filter((d) => d.organizationId === orgId),
  });
  const pending: HealthPendingRow[] = [];
  const queue: HealthQueueRow[] = [];
  for (const o of input.orgs) {
    const mine = input.txs.filter((t) => t.organizationId === o.id);
    if (!mine.length) continue;
    const state = stateFor(o.id);
    const open = mine.filter((t) => t.status === "PENDING");
    for (const t of open) {
      const r = blockerReason(t, state, PLATFORM_KINDS.has(t.kind) ? "platform" : "tenant");
      const awaitingReceipt = t.executionMode === "RPC" && !!t.txHash;
      pending.push({
        id: t.id,
        tenant: o.name,
        slug: o.slug,
        kind: t.kind,
        method: t.method.split("(")[0] ?? t.method,
        network: t.network,
        createdAt: t.createdAt.toISOString(),
        attempts: t.attempts,
        lastAttemptAt: t.lastAttemptAt?.toISOString() ?? null,
        error: t.error,
        awaitingReceipt,
        txHash: t.txHash,
        blockedReason: r && !awaitingReceipt ? interpolate(r.source, r.vars) : null,
      });
      const age = now.getTime() - t.createdAt.getTime();
      if (t.attempts > 0) {
        alerts.push({
          severity: t.attempts >= 3 ? "critical" : "warning",
          area: "chain",
          tenant: o.name,
          slug: o.slug,
          title: `${t.attempts} intento(s) fallido(s) · ${t.kind}`,
          detail: t.error ?? "sin detalle del último fallo",
          at: (t.lastAttemptAt ?? t.createdAt).toISOString(),
          chainTxId: t.id,
        });
      } else if (awaitingReceipt && age > 15 * MIN) {
        alerts.push({
          severity: age > 2 * HOUR ? "critical" : "warning",
          area: "chain",
          tenant: o.name,
          slug: o.slug,
          title: `Enviada a la red sin recibo · ${t.kind}`,
          detail: `tx ${t.txHash} · «Procesar cola en orden» o «Verificar recibo» la concilia.`,
          at: t.createdAt.toISOString(),
          chainTxId: t.id,
        });
      } else if (age > 24 * HOUR) {
        alerts.push({
          severity: "warning",
          area: "chain",
          tenant: o.name,
          slug: o.slug,
          title: `En cola hace ${hours(age)} h · ${t.kind}`,
          detail: r ? interpolate(r.source, r.vars) : "ejecutable: nadie la ha procesado",
          at: t.createdAt.toISOString(),
          chainTxId: t.id,
        });
      }
    }
    for (const t of mine.filter((x) => x.status === "REVERTED")) {
      alerts.push({
        severity: "critical",
        area: "chain",
        tenant: o.name,
        slug: o.slug,
        title: `Revertida en la red · ${t.kind}`,
        detail: `${t.txHash ? `tx ${t.txHash}` : "sin hash"} · ${t.error ?? "reverted on-chain"}`,
        at: (t.executedAt ?? t.createdAt).toISOString(),
        chainTxId: t.id,
      });
    }
    const blocked = pending.filter((p) => p.slug === o.slug && p.blockedReason).length;
    queue.push({
      tenant: o.name,
      slug: o.slug,
      pending: open.length,
      blocked,
      awaitingReceipt: open.filter((t) => t.executionMode === "RPC" && !!t.txHash).length,
      withFailedAttempts: open.filter((t) => t.attempts > 0).length,
      reverted: mine.filter((t) => t.status === "REVERTED").length,
      confirmed: mine.filter((t) => t.status === "CONFIRMED").length,
      cancelled: mine.filter((t) => t.status === "CANCELLED").length,
      oldestPendingAt: open.length ? new Date(Math.min(...open.map((t) => t.createdAt.getTime()))).toISOString() : null,
    });
  }

  // ── mail queue ──
  const mailPending = input.mail.filter((m) => m.status === "PENDING");
  const mailFailed = input.mail.filter((m) => m.status === "FAILED");
  for (const [orgId, rows] of groupBy(mailFailed, (m) => m.organizationId)) {
    alerts.push({
      severity: "warning",
      area: "mail",
      tenant: name(orgId),
      slug: slug(orgId),
      title: `${rows.length} correo(s) sin entregar (FAILED)`,
      detail: rows.at(-1)?.lastError ?? "el proveedor los rechazó en todos los intentos",
      at: rows.at(-1)!.createdAt.toISOString(),
    });
  }
  for (const [orgId, rows] of groupBy(
    mailPending.filter((m) => m.attempts > 0 || now.getTime() - m.createdAt.getTime() > HOUR),
    (m) => m.organizationId,
  )) {
    alerts.push({
      severity: "warning",
      area: "mail",
      tenant: name(orgId),
      slug: slug(orgId),
      title: `${rows.length} correo(s) pendiente(s) reintentándose`,
      detail: rows.find((m) => m.lastError)?.lastError ?? "en espera del siguiente intento de entrega",
      at: rows[0]!.createdAt.toISOString(),
    });
  }

  alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.at < b.at ? 1 : -1));
  return {
    generatedAt: now.toISOString(),
    mode: input.mode,
    factories: [...factories.values()],
    contracts,
    census,
    queue,
    pending: pending.sort((a, b) => b.attempts - a.attempts || (a.createdAt < b.createdAt ? -1 : 1)),
    mail: {
      pending: mailPending.length,
      retrying: mailPending.filter((m) => m.attempts > 0).length,
      failed: mailFailed.length,
      oldestPendingAt: mailPending.length ? new Date(Math.min(...mailPending.map((m) => m.createdAt.getTime()))).toISOString() : null,
    },
    alerts,
  };
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) out.set(key(r), [...(out.get(key(r)) ?? []), r]);
  return out;
}

/** Loads every developer's contracts, register and queues (platform role) and builds the report. */
export async function readOperationalHealth(db: ReturnType<typeof platformPrisma>, mode: "SIMULATION" | "RPC"): Promise<PlatformHealthReport> {
  const [orgs, offerings, subscriptions, txs, distributions, mail] = await Promise.all([
    db.organization.findMany({ orderBy: { onboardedAt: "asc" }, select: { id: true, displayName: true, slug: true, complianceRegistry: true } }),
    db.offering.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
        organizationId: true,
        code: true,
        token: {
          select: {
            network: true,
            symbol: true,
            contractAddress: true,
            status: true,
            platformFeeBps: true,
            maxSupply: true,
            deployTxHash: true,
            deployedAt: true,
          },
        },
      },
    }),
    db.subscription.findMany({
      select: { organizationId: true, offeringId: true, status: true, units: true, onchainId: true, investor: { select: { walletAddress: true } } },
    }),
    db.chainTransaction.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    db.distribution.findMany({ select: { organizationId: true, onchainId: true, status: true } }),
    db.mailOutbox.findMany({
      where: { status: { in: ["PENDING", "FAILED"] } },
      select: { organizationId: true, status: true, attempts: true, lastError: true, createdAt: true },
    }),
  ]);
  const configured = process.env.RWAXI_FACTORY_ADDRESS;
  return buildHealthReport({
    orgs: orgs.map((o) => ({ id: o.id, name: o.displayName, slug: o.slug, complianceRegistry: o.complianceRegistry })),
    offerings: offerings.map((f) => ({
      id: f.id,
      organizationId: f.organizationId,
      code: f.code,
      token: f.token ? { ...f.token, deployedAt: f.token.deployedAt?.toISOString() ?? null } : null,
    })),
    subscriptions: subscriptions.map((s) => ({
      organizationId: s.organizationId,
      offeringId: s.offeringId,
      status: s.status,
      units: s.units,
      onchainId: s.onchainId,
      wallet: s.investor.walletAddress,
    })),
    txs,
    distributions,
    mail,
    configuredFactory: configured && /^0x[0-9a-fA-F]{40}$/.test(configured) ? configured : null,
    mode,
  });
}
