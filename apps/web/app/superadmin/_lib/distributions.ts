import "server-only";
import type { platformPrisma } from "@rwaxi/database";
import type { PlatformDistributionRow, PlatformDistributionEvent } from "./types";

const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
const short = (h: string | null | undefined) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—");

/**
 * Module D · every yield distribution of every developer, for supervision (platform role, BYPASSRLS, admin host only):
 * the record date and how its register was checked, the payment currency, the supporting document by its SHA-256,
 * the anchoring and the payment instructions. RWAXI never declares, anchors or pays one: those are the issuer's.
 */
export async function readPlatformDistributions(
  db: ReturnType<typeof platformPrisma>,
): Promise<{ rows: PlatformDistributionRow[]; events: PlatformDistributionEvent[] }> {
  const [distributions, anchors, audit] = await Promise.all([
    db.distribution.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        organizationId: true,
        organization: { select: { displayName: true, slug: true } },
        offering: { select: { code: true, network: true } },
        onchainId: true,
        period: true,
        currency: true,
        leafVersion: true,
        amountDeclared: true,
        totalUsd: true,
        holders: true,
        totalUnits: true,
        recordDate: true,
        snapshotAt: true,
        snapshotMode: true,
        merkleRoot: true,
        status: true,
        anchorTxHash: true,
        supportSha256: true,
        supportFileName: true,
        supportSizeBytes: true,
        createdAt: true,
        declaredBy: { select: { email: true } },
        _count: { select: { allocations: true } },
        payoutBatches: {
          orderBy: { sequence: "asc" },
          select: {
            sequence: true,
            instructionHash: true,
            totalAmount: true,
            payees: true,
            withheld: true,
            registryMode: true,
            createdAt: true,
            createdBy: { select: { email: true } },
          },
        },
      },
    }),
    db.chainTransaction.findMany({
      where: { kind: "DISTRIBUTION_ROOT_ANCHORED" },
      orderBy: { createdAt: "asc" },
      select: { args: true, status: true, executionMode: true, txHash: true },
    }),
    db.auditEvent.findMany({
      where: {
        OR: [
          { action: { in: ["DISTRIBUTION_DECLARED", "DISTRIBUTION_PAYOUT_INSTRUCTED", "DISTRIBUTION_SUPPORT_DOWNLOADED"] } },
          { action: "CHAIN_TX_CONFIRMED", payload: { path: ["kind"], equals: "DISTRIBUTION_ROOT_ANCHORED" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        action: true,
        createdAt: true,
        actorEmail: true,
        subjectHash: true,
        payload: true,
        organization: { select: { displayName: true } },
      },
    }),
  ]);
  const anchorOf = new Map(anchors.map((t) => [String((t.args as { distributionId?: string } | null)?.distributionId ?? "").toLowerCase(), t]));

  const rows: PlatformDistributionRow[] = distributions.map((d) => {
    const v2 = d.leafVersion >= 2;
    const anchor = anchorOf.get(d.onchainId.toLowerCase());
    const instructed = d.payoutBatches.reduce((s, b) => s + b.payees, 0);
    return {
      id: d.id,
      organizationId: d.organizationId,
      tenant: d.organization.displayName,
      slug: d.organization.slug,
      offeringCode: d.offering.code,
      network: d.offering.network,
      period: d.period,
      currency: v2 ? d.currency : "USD",
      leafVersion: d.leafVersion,
      amount: v2 ? num(d.amountDeclared) : num(d.totalUsd),
      totalUsd: num(d.totalUsd),
      holders: d.holders,
      totalUnits: d.totalUnits,
      recordDate: d.recordDate?.toISOString().slice(0, 10) ?? null,
      snapshotAt: d.snapshotAt.toISOString(),
      snapshotMode: d.snapshotMode,
      merkleRoot: d.merkleRoot,
      onchainId: d.onchainId,
      status: d.status,
      anchor: {
        status: anchor?.status ?? null,
        txHash: d.anchorTxHash ?? anchor?.txHash ?? null,
        mode: anchor?.executionMode ?? null,
      },
      support:
        d.supportSha256 && d.supportFileName && d.supportSizeBytes
          ? { sha256: d.supportSha256, fileName: d.supportFileName, sizeBytes: d.supportSizeBytes }
          : null,
      declaredAt: d.createdAt.toISOString(),
      declaredBy: d.declaredBy?.email ?? null,
      allocations: d._count.allocations,
      instructed,
      batches: d.payoutBatches.map((b) => ({
        sequence: b.sequence,
        instructionHash: b.instructionHash,
        total: num(b.totalAmount),
        payees: b.payees,
        withheld: b.withheld,
        registryMode: b.registryMode,
        createdAt: b.createdAt.toISOString(),
        createdBy: b.createdBy?.email ?? null,
      })),
    };
  });

  const events: PlatformDistributionEvent[] = audit.map((e) => {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const text = (k: string) => (p[k] == null ? "" : String(p[k]));
    const summary =
      e.action === "DISTRIBUTION_DECLARED"
        ? p.recordDate
          ? `Declaró ${text("period")} de ${text("offeringCode")}: ${text("amountDeclared")} ${text("currency")} entre ${text("holders")} tenedor(es) a la fecha de corte ${text("recordDate")}`
          : `Declaró ${text("period")} de ${text("offeringCode")}: ${text("totalUsd")} USD entre ${text("holders")} tenedor(es)`
        : e.action === "DISTRIBUTION_PAYOUT_INSTRUCTED"
          ? `Instrucción de pago #${text("sequence")} de ${text("period")} (${text("offeringCode")}): ${text("total")} ${text("currency")} a ${text("payees")} wallet(s), ${text("withheld")} retenida(s) por la whitelist`
          : e.action === "DISTRIBUTION_SUPPORT_DOWNLOADED"
            ? `Consultó el soporte de ${text("period")} (${text("offeringCode")}) · ${p.by === "platform" ? "consola RWAXI" : "backoffice"}`
            : `anchorDistributionRoot confirmado · tx ${short(text("txHash") || null)}`;
    return {
      id: e.id,
      at: e.createdAt.toISOString(),
      action: e.action,
      tenant: e.organization?.displayName ?? "RWAXI",
      actorEmail: e.actorEmail,
      summary,
      subjectHash: e.subjectHash,
    };
  });
  return { rows, events };
}
