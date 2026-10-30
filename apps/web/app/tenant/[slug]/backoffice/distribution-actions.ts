"use server";

/**
 * Yield distributions of the developer (issuer) to the holders of an offering's token.
 *
 * declareDistribution() is one transaction bound to the host tenant (withTenant → RLS): the register of holders at the
 * record date (the token balances replayed from its confirmed mints — in RPC mode first checked against the token's
 * own history, balanceOfAt / totalSupplyAt), the pro-rata split in hundredths of the payment currency and its SHA-256
 * Merkle tree (@rwaxi/blockchain-sdk/distribution, v2 leaves), the supporting document (its verified upload, kept in
 * the tenant's DocumentVault), the Distribution with every allocation and its proof, the queued
 * anchorDistributionRoot(…, recordTimestamp, currency, evidenceHash) and the DISTRIBUTION_DECLARED audit event commit
 * together or not at all. The issuer anchors the root (DISTRIBUTION_ROLE); RWAXI never holds that role.
 *
 * instructDistributionPayout(), once the root is anchored, issues the payment instruction for the fiduciary (fiat)
 * or the issuer's treasury (stablecoins): only allocations whose wallet the compliance whitelist clears at that moment
 * — the registry contract in RPC mode, the confirmed outbox in simulation; a revoked KYC and queued revocations or
 * freezes withhold too. Withheld allocations keep their entitlement and wait for a later instruction. RWAXI never
 * moves the funds.
 */
import { revalidatePath } from "next/cache";
import { buildDistribution, isPayoutCurrency, type PayoutCurrency } from "@rwaxi/blockchain-sdk/distribution";
import { objectKey } from "@rwaxi/document-vault";
import { Prisma, forTenant, isUniqueViolation, withTenant } from "@rwaxi/database";
import { LocalizedError } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import type { Translate } from "@/app/_i18n/translate";
import { RECORD_DATE, balancesAt, confirmedMints, recordInstant } from "@/app/_lib/distribution-snapshot";
import { executionMode, readRegistryEntries, readTokenSnapshot } from "@/app/_lib/server/chain-executor";
import { loadChainState } from "@/app/_lib/server/chain-invariants";
import {
  WITHHOLD_REASON,
  payoutInstruction,
  pendingRegistryCalls,
  replayedEntries,
  withholdReason,
  type ComplianceView,
  type RegistryStatus,
  type WithholdReason,
} from "@/app/_lib/server/distribution-payout";
import { requestMeta } from "@/app/_lib/server/tenant-context";
import { verifyReceipt } from "@/app/_lib/server/vault";
import { PERIOD, distributionOnchainId } from "./_lib/holdings";
import { requireBackofficeSession } from "./_lib/session";
import type { ActionResult, DistributionInput } from "./_lib/types";

// Record ids: cuid() by default, fixed ids for seeded offerings (off_avista…). Looked up under RLS.
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const CUID = /^[a-z0-9]{20,40}$/i;
const AMOUNT = /^\d{1,15}(?:\.\d{1,2})?$/;
const FX_RATE = /^\d{3,5}(?:\.\d{1,2})?$/;
const ANCHOR_METHOD = "anchorDistributionRoot(bytes32,bytes32,uint256,uint256,uint64,string,bytes32)";
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };
/** Declared amount limits per payment currency (USD stablecoins as USD), and the accepted COP/USD rate. */
const LIMITS: Record<PayoutCurrency, readonly [number, number]> = {
  COP: [5_000, 400_000_000_000],
  USD: [1, 100_000_000],
  USDC: [1, 100_000_000],
  USDT: [1, 100_000_000],
};
const FX_LIMITS = [1_000, 10_000] as const;
/** What the supporting document may be: what the "evidence" vault policy accepts (a PDF or a scan). */
const SUPPORT_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

class DistributionError extends LocalizedError {}

function failure(e: unknown, tr: Translate): ActionResult {
  if (e instanceof LocalizedError) return { ok: false, error: render(tr, e.reason) };
  if (isUniqueViolation(e)) return { ok: false, error: tr("Ya existe una distribución de ese periodo para esta oferta.") };
  console.error("[backoffice] distribution action failed", e);
  return { ok: false, error: tr("No se pudo completar la operación de la distribución. Inténtalo de nuevo.") };
}

const refresh = () => {
  revalidatePath("/tenant/[slug]/backoffice", "page");
  revalidatePath("/tenant/[slug]", "page");
};

function decimalOf(raw: unknown, rule: RegExp, [min, max]: readonly [number, number], label: string): Prisma.Decimal {
  const s = typeof raw === "string" ? raw.trim().replace(/\s/g, "").replace(",", ".") : "";
  const value = rule.test(s) ? new Prisma.Decimal(s) : null;
  if (!value || value.lt(min) || value.gt(max)) {
    throw new DistributionError("{label}: entre {min} y {max} (hasta 2 decimales).", {
      label,
      min: min.toLocaleString("es-CO"),
      max: max.toLocaleString("es-CO"),
    });
  }
  return value;
}

/** USD equivalent of an amount in the payment currency: COP at the declared rate, USD stablecoins 1:1. */
const usdOf = (amount: Prisma.Decimal, fxRate: Prisma.Decimal | null) =>
  fxRate ? amount.div(fxRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : amount;

interface Holder {
  investorId: string;
  fullName: string;
  wallet: string;
  units: number;
}

/**
 * The offering's deployed token and its register of holders at `seconds`: the confirmed mints of that token replayed
 * up to the instant of record (the token's own balanceOfAt keeps the same history), one row per investor wallet.
 */
async function registerAt(db: Prisma.TransactionClient, offeringId: string, seconds: number) {
  const offering = await db.offering.findUnique({ where: { id: offeringId }, include: { token: true } });
  if (!offering) throw new DistributionError("Oferta no encontrada en este tenant.");
  const token = offering.token;
  if (!token?.contractAddress || (token.status !== "DEPLOYED" && token.status !== "PAUSED")) {
    throw new DistributionError("El token de la oferta no está desplegado: no hay tenedores a quienes distribuir.");
  }
  const mints = await db.chainTransaction.findMany({
    where: { kind: "SUBSCRIPTION_MINTED", status: "CONFIRMED" },
    select: { kind: true, status: true, contractAddress: true, args: true, executedAt: true, createdAt: true },
  });
  const balances = balancesAt(confirmedMints(mints, token.contractAddress), seconds);
  if (!balances.size) {
    throw new DistributionError("A la fecha de corte la oferta no tenía tokens emitidos en wallets de inversionistas.");
  }
  const investors = await db.investor.findMany({
    where: { walletAddress: { in: [...balances.keys()] } },
    select: { id: true, fullName: true, walletAddress: true },
  });
  const byWallet = new Map(investors.map((i) => [i.walletAddress!.toLowerCase(), i]));
  const holders: Holder[] = [...balances]
    .map(([wallet, units]) => {
      const investor = byWallet.get(wallet);
      if (!investor) {
        throw new DistributionError("La wallet {wallet} tiene tokens de la oferta pero no es de un inversionista de este tenant.", { wallet });
      }
      return { investorId: investor.id, fullName: investor.fullName, wallet, units };
    })
    .sort((a, b) => (a.wallet < b.wallet ? -1 : 1));
  const org = await db.organization.findFirst({ select: { complianceRegistry: true } }); // RLS: the tenant's own row
  return { offering, token: { ...token, contractAddress: token.contractAddress }, holders, registry: org?.complianceRegistry ?? null };
}

/** Investors whose latest KYC case for the offering was revoked by the compliance officer. */
async function revokedInvestors(db: Prisma.TransactionClient, offeringId: string, investorIds: string[]): Promise<Set<string>> {
  const cases = await db.kycCase.findMany({
    where: { investorId: { in: investorIds }, OR: [{ offeringId }, { offeringId: null }] },
    orderBy: { createdAt: "desc" },
    select: { investorId: true, status: true },
  });
  const latest = new Map<string, string>();
  for (const c of cases) if (!latest.has(c.investorId)) latest.set(c.investorId, c.status);
  return new Set([...latest].filter(([, status]) => status === "REVOKED").map(([id]) => id));
}

/** The whitelist as the registry contract answers (RPC) or as the confirmed outbox leaves it (SIMULATION). */
async function complianceView(
  db: Prisma.TransactionClient,
  offeringId: string,
  investorIds: string[],
  onchain: Map<string, RegistryStatus> | null,
): Promise<ComplianceView> {
  const state = await loadChainState(db);
  const revoked = await revokedInvestors(db, offeringId, investorIds);
  const replayed = replayedEntries(state);
  return {
    entry: onchain ? (wallet) => onchain.get(wallet.toLowerCase()) ?? { approved: false, frozen: false } : replayed,
    pending: (wallet) => pendingRegistryCalls(state.txs, wallet),
    kycRevoked: (id) => revoked.has(id),
  };
}

const sameRegister = (a: Holder[], b: Holder[]) =>
  a.length === b.length && a.every((h, i) => h.wallet === b[i]!.wallet && h.units === b[i]!.units);

/**
 * Declares the distribution of `amount` in the payment currency (COP at `fxRate` for its USD equivalent) for `period`
 * among the holders of the offering's token at `recordDate`, with its supporting document, and queues the anchoring
 * of its Merkle root.
 */
export async function declareDistribution(input: DistributionInput): Promise<ActionResult> {
  const tr = await requestTranslate("tenant");
  try {
    const offeringId = typeof input?.offeringId === "string" ? input.offeringId : "";
    if (!ID.test(offeringId)) throw new DistributionError("Oferta inválida.");
    const period = typeof input.period === "string" ? input.period.trim().toUpperCase() : "";
    if (!PERIOD.test(period)) throw new DistributionError("Periodo: mes (2026-09) o trimestre (2026-Q3).");
    const recordDate = typeof input.recordDate === "string" ? input.recordDate.trim() : "";
    if (!RECORD_DATE.test(recordDate) || !recordInstant(recordDate)) {
      throw new DistributionError("Fecha de corte: una fecha válida (AAAA-MM-DD) que no sea futura.");
    }
    const currency = input.currency;
    if (!isPayoutCurrency(currency)) throw new DistributionError("Moneda de pago: COP, USD, USDC o USDT.");
    const amount = decimalOf(input.amount, AMOUNT, LIMITS[currency], tr("Monto en {currency}", { currency }));
    const fxRate = currency === "COP" ? decimalOf(input.fxRate, FX_RATE, FX_LIMITS, tr("Tasa COP/USD")) : null;
    const totalUsd = usdOf(amount, fxRate);
    if (totalUsd.lt(1)) throw new DistributionError("La distribución debe sumar al menos 1 USD.");
    // hundredths of the payment currency: at most 4·10^13 (COP), a safe integer
    const totalCents = amount.mul(100).toNumber();

    const session = await requireBackofficeSession("TENANT_ADMIN");
    const orgId = session.tenant.id;
    // Under RLS: another tenant's offering "does not exist" (before anything else is looked at).
    if (!(await forTenant(orgId).offering.findUnique({ where: { id: offeringId }, select: { id: true } }))) {
      throw new DistributionError("Oferta no encontrada en este tenant.");
    }
    const support = input.support;
    const claims = verifyReceipt(support?.receipt, { scope: `tenant:${orgId}`, subject: `usr:${session.reviewer.id}` });
    if (!claims || claims.sha256 !== support?.sha256 || claims.sizeBytes !== support?.sizeBytes) {
      throw new DistributionError("El soporte documental no fue verificado por el servidor: vuelve a adjuntarlo.");
    }
    if (!SUPPORT_TYPES.includes(claims.mimeType)) {
      throw new DistributionError("El soporte documental debe ser un PDF o una imagen (PNG, JPG o WebP).");
    }
    const fileName =
      (typeof support.fileName === "string" ? support.fileName : "")
        .replace(/[\\/\u0000-\u001f]/g, "_")
        .trim()
        .slice(0, 160) || "soporte-distribucion";
    const storageKey = objectKey({ organizationId: orgId }, claims.sha256);
    const instant = recordInstant(recordDate)!;
    const mode = executionMode();
    const meta = await requestMeta();

    // RPC: the register replayed from the outbox must be what the token itself recorded at that instant, and the
    // whitelist status is read from the registry contract. Both reads happen before the transaction.
    let onchainCheck: { source: "history" | "latest"; blockNumber: string; supply: number } | null = null;
    let onchainRegistry: Map<string, RegistryStatus> | null = null;
    let checked: Holder[] | null = null;
    if (mode === "RPC") {
      const pre = await withTenant(orgId, (tx) => registerAt(tx, offeringId, instant.seconds), TX_OPTIONS);
      const wallets = pre.holders.map((h) => h.wallet);
      const snapshot = await readTokenSnapshot(pre.token.network, pre.token.contractAddress, wallets, instant.seconds);
      const recorded = pre.holders.reduce((s, h) => s + h.units, 0);
      const differs = pre.holders.filter((h) => snapshot.balances.get(h.wallet) !== h.units);
      if (snapshot.supply !== recorded || differs.length) {
        throw new DistributionError(
          "El registro de tenedores no coincide con el token on-chain a la fecha de corte (oferta total {onchain} on-chain, {recorded} en el registro; {n} wallet(s) con otro saldo): no se declaró nada.",
          { onchain: snapshot.supply, recorded, n: differs.length, count: differs.length },
        );
      }
      onchainCheck = { source: snapshot.source, blockNumber: snapshot.blockNumber.toString(), supply: snapshot.supply };
      if (pre.registry) onchainRegistry = await readRegistryEntries(pre.token.network, pre.registry, wallets);
      checked = pre.holders;
    }

    const result = await withTenant(
      orgId,
      async (tx) => {
        // Serialises declarations of the same offering: each reads the register and the queue as they stand.
        await tx.$queryRaw`SELECT id FROM offerings WHERE id = ${offeringId} FOR UPDATE`;
        const { offering, token, holders, registry } = await registerAt(tx, offeringId, instant.seconds);
        if (checked && !sameRegister(checked, holders)) {
          throw new DistributionError("El registro de tenedores cambió mientras se verificaba on-chain: vuelve a declarar la distribución.");
        }
        const onchainId = distributionOnchainId(offering.id, period);
        const built = buildDistribution(
          onchainId,
          totalCents,
          holders.map((h) => ({ key: h.investorId, wallet: h.wallet, units: h.units })),
          currency,
        );
        const view = await complianceView(tx, offering.id, holders.map((h) => h.investorId), onchainRegistry);
        const now = new Date();
        const snapshotAt = new Date(instant.seconds * 1000);

        await tx.vaultObject.createMany({
          data: [{ organizationId: orgId, sha256: claims.sha256, sizeBytes: claims.sizeBytes, mimeType: claims.mimeType, storageKey }],
          skipDuplicates: true,
        });
        const distribution = await tx.distribution.create({
          data: {
            organizationId: orgId,
            offeringId: offering.id,
            onchainId,
            period,
            currency,
            amountDeclared: amount,
            fxRate,
            totalUsd,
            totalUnits: built.totalUnits,
            holders: built.allocations.length,
            recordDate: new Date(`${recordDate}T00:00:00Z`),
            snapshotAt,
            snapshotMode: mode,
            leafVersion: 2,
            merkleRoot: built.root,
            supportSha256: claims.sha256,
            supportFileName: fileName,
            supportMimeType: claims.mimeType,
            supportSizeBytes: claims.sizeBytes,
            supportStorageKey: storageKey,
            status: "DECLARED",
            declaredById: session.reviewer.id,
            createdAt: now,
          },
        });
        const lines = built.allocations.map((a) => {
          const share = new Prisma.Decimal(a.amountCents).div(100);
          const whitelist: WithholdReason | null = withholdReason(view, { investorId: a.key, wallet: a.wallet });
          return { a, share, shareUsd: usdOf(share, fxRate), whitelist };
        });
        await tx.distributionAllocation.createMany({
          data: lines.map(({ a, share, shareUsd }) => ({
            organizationId: orgId,
            distributionId: distribution.id,
            investorId: a.key,
            wallet: a.wallet,
            units: a.units,
            amount: share,
            amountUsd: shareUsd,
            leafHash: a.leaf,
            merkleProof: a.proof,
            createdAt: now,
          })),
        });
        // Outbox: the issuer signs it (DISTRIBUTION_ROLE of RwaxiPropertyToken); the token checks the snapshot supply
        // against its own history at recordTimestamp and records the supporting document's SHA-256.
        const chainTx = await tx.chainTransaction.create({
          data: {
            organizationId: orgId,
            offeringId: offering.id,
            network: token.network,
            kind: "DISTRIBUTION_ROOT_ANCHORED",
            contractAddress: token.contractAddress,
            method: ANCHOR_METHOD,
            args: {
              distributionId: onchainId,
              merkleRoot: built.root,
              totalAmountCents: String(totalCents),
              snapshotSupply: built.totalUnits,
              recordTimestamp: instant.seconds,
              currency,
              evidenceHash: claims.sha256,
            },
            status: "PENDING",
          },
        });

        const names = new Map(holders.map((h) => [h.investorId, h.fullName]));
        const withheld = lines.filter((l) => l.whitelist).length;
        await tx.auditEvent.create({
          data: {
            organizationId: orgId,
            action: "DISTRIBUTION_DECLARED",
            actorUserId: session.reviewer.id,
            actorEmail: session.reviewer.email,
            entityType: "Distribution",
            entityId: distribution.id,
            subjectHash: built.root,
            payload: {
              offeringCode: offering.code,
              period,
              recordDate,
              recordTimestamp: instant.seconds,
              snapshotAt: snapshotAt.toISOString(),
              snapshotMode: mode,
              onchainCheck,
              currency,
              amountDeclared: amount.toFixed(2),
              fxRate: fxRate?.toFixed(2) ?? null,
              totalUsd: totalUsd.toFixed(2),
              totalAmountCents: String(totalCents),
              holders: built.allocations.length,
              snapshotSupply: built.totalUnits,
              distributionId: onchainId,
              merkleRoot: built.root,
              leafVersion: 2,
              support: { sha256: claims.sha256, fileName, mimeType: claims.mimeType, sizeBytes: claims.sizeBytes, storageKey },
              allocations: lines.map(({ a, share, shareUsd, whitelist }) => ({
                investorId: a.key,
                investorName: names.get(a.key) ?? null,
                wallet: a.wallet,
                units: a.units,
                amount: share.toFixed(2),
                amountUsd: shareUsd.toFixed(2),
                amountCents: a.amountCents,
                leaf: a.leaf,
                // the whitelist when declared (informative): the payment instruction checks it again
                whitelist: whitelist ?? "CLEARED",
              })),
              withheldAtDeclaration: withheld,
              chainTransactionId: chainTx.id,
              chainStatus: chainTx.status,
            },
            ...meta,
            createdAt: now,
          },
        });
        return { holders: built.allocations.length, withheld };
      },
      TX_OPTIONS,
    );

    refresh();
    const message = tr(
      "Distribución {period} declarada · {amount} {currency} entre {holders} tenedor(es) a la fecha de corte {date} · anchorDistributionRoot() en cola",
      { period, amount: amount.toFixed(2), currency, holders: result.holders, count: result.holders, date: recordDate },
    );
    return {
      ok: true,
      message: result.withheld
        ? `${message} · ${tr("{n} asignación(es) con el pago retenido hoy por la whitelist", { n: result.withheld, count: result.withheld })}`
        : message,
    };
  } catch (e) {
    return failure(e, tr);
  }
}

/**
 * Issues the next payment instruction of an anchored distribution: every allocation not instructed yet whose wallet
 * the compliance whitelist clears now, in the payment currency, with the canonical document its hash covers.
 */
export async function instructDistributionPayout(distributionId: string): Promise<ActionResult> {
  const tr = await requestTranslate("tenant");
  try {
    if (typeof distributionId !== "string" || !CUID.test(distributionId)) throw new DistributionError("Distribución inválida.");
    const session = await requireBackofficeSession("TENANT_ADMIN");
    const orgId = session.tenant.id;
    const mode = executionMode();
    const meta = await requestMeta();

    // RPC: the registry contract answers for the wallets still to be paid, read before the transaction.
    let onchainRegistry: Map<string, RegistryStatus> | null = null;
    if (mode === "RPC") {
      const db = forTenant(orgId);
      const pre = await db.distribution.findUnique({
        where: { id: distributionId },
        select: { offering: { select: { network: true } }, allocations: { where: { payout: { is: null } }, select: { wallet: true } } },
      });
      const org = await db.organization.findFirst({ select: { complianceRegistry: true } });
      if (pre && org?.complianceRegistry && pre.allocations.length) {
        onchainRegistry = await readRegistryEntries(
          pre.offering.network,
          org.complianceRegistry,
          pre.allocations.map((a) => a.wallet),
        );
      } else if (pre && !org?.complianceRegistry) {
        throw new DistributionError("El registro de cumplimiento del tenant no está desplegado: no hay whitelist contra la cual validar el pago.");
      }
    }

    const result = await withTenant(
      orgId,
      async (tx) => {
        // One instruction at a time per distribution: the sequence and "instructed at most once" hold.
        await tx.$queryRaw`SELECT id FROM distributions WHERE id = ${distributionId} FOR UPDATE`;
        const d = await tx.distribution.findUnique({
          where: { id: distributionId },
          include: {
            offering: { select: { id: true, code: true, network: true, token: { select: { contractAddress: true } } } },
            allocations: { orderBy: { wallet: "asc" }, include: { payout: true, investor: { select: { fullName: true } } } },
            payoutBatches: { select: { sequence: true } },
          },
        });
        if (!d) throw new DistributionError("Distribución no encontrada en este tenant.");
        if (d.leafVersion < 2 || !d.recordDate || !d.supportSha256) {
          throw new DistributionError("Esta distribución se declaró sin fecha de corte ni soporte documental: no admite instrucciones de pago.");
        }
        if (d.status !== "ANCHORED" || !d.anchorTxHash) {
          throw new DistributionError("La raíz de la distribución aún no está anclada en el token: el pago se instruye después de anclarla.");
        }
        const pending = d.allocations.filter((a) => !a.payout && a.amount.gt(0));
        if (!pending.length) throw new DistributionError("Todas las asignaciones de esta distribución ya tienen instrucción de pago.");
        const org = await tx.organization.findFirst({ select: { complianceRegistry: true } });
        const view = await complianceView(tx, d.offering.id, pending.map((a) => a.investorId), onchainRegistry);

        const toLine = (a: (typeof pending)[number]) => ({
          id: a.id,
          investorId: a.investorId,
          name: a.investor.fullName,
          wallet: a.wallet,
          units: a.units,
          amount: a.amount.toFixed(2),
          leafHash: a.leafHash,
        });
        const payees: ReturnType<typeof toLine>[] = [];
        const withheld: (ReturnType<typeof toLine> & { reason: WithholdReason })[] = [];
        for (const a of pending) {
          const reason = withholdReason(view, { investorId: a.investorId, wallet: a.wallet });
          if (reason) withheld.push({ ...toLine(a), reason });
          else payees.push(toLine(a));
        }
        if (!payees.length) {
          throw new DistributionError(
            "Ninguna asignación pendiente supera hoy la validación de la whitelist ({n} retenida(s)): no se emitió ninguna instrucción de pago.",
            { n: withheld.length, count: withheld.length },
          );
        }
        const sequence = Math.max(0, ...d.payoutBatches.map((b) => b.sequence)) + 1;
        const issuedAt = new Date();
        const currency = d.currency as PayoutCurrency;
        const { document, hash, total } = payoutInstruction({
          distribution: {
            id: d.id,
            onchainId: d.onchainId,
            offeringCode: d.offering.code,
            period: d.period,
            recordDate: d.recordDate.toISOString().slice(0, 10),
            snapshotAt: d.snapshotAt.toISOString(),
            currency,
            amountDeclared: d.amountDeclared.toFixed(2),
            merkleRoot: d.merkleRoot,
            anchorTxHash: d.anchorTxHash,
            supportSha256: d.supportSha256,
          },
          token: { address: d.offering.token?.contractAddress ?? "", network: d.offering.network },
          registry: { mode, address: org?.complianceRegistry ?? null },
          sequence,
          issuedAt: issuedAt.toISOString(),
          payees,
          withheld,
        });
        const batch = await tx.distributionPayoutBatch.create({
          data: {
            organizationId: orgId,
            distributionId: d.id,
            sequence,
            instructionHash: hash,
            instruction: document as Prisma.InputJsonValue,
            currency,
            totalAmount: new Prisma.Decimal(total),
            payees: payees.length,
            withheld: withheld.length,
            registryMode: mode,
            createdById: session.reviewer.id,
            createdAt: issuedAt,
          },
        });
        await tx.distributionPayout.createMany({
          data: payees.map((p) => ({
            organizationId: orgId,
            batchId: batch.id,
            allocationId: p.id,
            wallet: p.wallet,
            amount: new Prisma.Decimal(p.amount),
            createdAt: issuedAt,
          })),
        });
        await tx.auditEvent.create({
          data: {
            organizationId: orgId,
            action: "DISTRIBUTION_PAYOUT_INSTRUCTED",
            actorUserId: session.reviewer.id,
            actorEmail: session.reviewer.email,
            entityType: "DistributionPayoutBatch",
            entityId: batch.id,
            subjectHash: hash,
            payload: {
              offeringCode: d.offering.code,
              period: d.period,
              distributionId: d.onchainId,
              distribution: d.id,
              sequence,
              instructionHash: hash,
              currency,
              total,
              payees: payees.length,
              withheld: withheld.length,
              withheldReasons: withheld.map((w) => ({ wallet: w.wallet, reason: w.reason, label: WITHHOLD_REASON[w.reason] })),
              registryMode: mode,
              instruction: document as Prisma.InputJsonValue,
            },
            ...meta,
            createdAt: issuedAt,
          },
        });
        return { sequence, period: d.period, total, currency, payees: payees.length, withheld: withheld.length };
      },
      TX_OPTIONS,
    );

    refresh();
    const message = tr(
      "Instrucción de pago #{sequence} de {period} emitida · {total} {currency} a {payees} wallet(s) validada(s) en la whitelist",
      { ...result, count: result.payees },
    );
    return {
      ok: true,
      message: result.withheld
        ? `${message} · ${tr("{n} asignación(es) retenida(s) hasta que la whitelist las habilite", { n: result.withheld, count: result.withheld })}`
        : message,
    };
  } catch (e) {
    return failure(e, tr);
  }
}
