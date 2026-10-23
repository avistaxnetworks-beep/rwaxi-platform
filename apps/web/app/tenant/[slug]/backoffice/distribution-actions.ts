"use server";

/**
 * Yield distributions of the developer (issuer) to the holders of an offering's token.
 *
 * Declaring one is a single transaction bound to the host tenant (withTenant → RLS): the snapshot
 * of MINTED holdings, the pro-rata split in cents and its SHA-256 Merkle tree
 * (@rwaxi/blockchain-sdk/distribution), the Distribution with every allocation and its proof, the
 * queued anchorDistributionRoot() and the DISTRIBUTION_DECLARED audit event commit together or not
 * at all. The issuer anchors the root (DISTRIBUTION_ROLE); RWAXI never holds that role.
 */
import { revalidatePath } from "next/cache";
import { buildDistribution } from "@rwaxi/blockchain-sdk/distribution";
import { Prisma, isUniqueViolation, withTenant } from "@rwaxi/database";
import { LocalizedError } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import type { Translate } from "@/app/_i18n/translate";
import { requestMeta } from "@/app/_lib/server/tenant-context";
import { PERIOD, distributionOnchainId, mintedHoldings } from "./_lib/holdings";
import { requireBackofficeSession } from "./_lib/session";
import type { ActionResult, DistributionInput } from "./_lib/types";

// Record ids: cuid() by default, fixed ids for seeded offerings (off_avista…). Looked up under RLS.
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const AMOUNT = /^\d{1,15}(?:\.\d{1,2})?$/;
const FX_RATE = /^\d{3,5}(?:\.\d{1,2})?$/;
const ANCHOR_METHOD = "anchorDistributionRoot(bytes32,bytes32,uint256,uint256)";
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };
/** Declared amount limits per currency, and the accepted COP/USD rate. */
const LIMITS = { USD: [1, 100_000_000], COP: [5_000, 400_000_000_000] } as const;
const FX_LIMITS = [1_000, 10_000] as const;

class DistributionError extends LocalizedError {}

function failure(e: unknown, tr: Translate): ActionResult {
  if (e instanceof LocalizedError) return { ok: false, error: render(tr, e.reason) };
  if (isUniqueViolation(e)) return { ok: false, error: tr("Ya existe una distribución de ese periodo para esta oferta.") };
  console.error("[backoffice] distribution declaration failed", e);
  return { ok: false, error: tr("No se pudo declarar la distribución. Inténtalo de nuevo.") };
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

/**
 * Declares the distribution of `amount` (USD, or COP at `fxRate`) for `period` among the current
 * holders of the offering's token, and queues the anchoring of its Merkle root.
 */
export async function declareDistribution(input: DistributionInput): Promise<ActionResult> {
  const tr = await requestTranslate("tenant");
  try {
    const offeringId = typeof input?.offeringId === "string" ? input.offeringId : "";
    if (!ID.test(offeringId)) throw new DistributionError("Oferta inválida.");
    const period = typeof input.period === "string" ? input.period.trim().toUpperCase() : "";
    if (!PERIOD.test(period)) throw new DistributionError("Periodo: mes (2026-09) o trimestre (2026-Q3).");
    const currency = input.currency;
    if (currency !== "USD" && currency !== "COP") throw new DistributionError("Moneda: USD o COP.");
    const amount = decimalOf(input.amount, AMOUNT, LIMITS[currency], currency === "USD" ? tr("Monto en USD") : tr("Monto en COP"));
    const fxRate = currency === "COP" ? decimalOf(input.fxRate, FX_RATE, FX_LIMITS, tr("Tasa COP/USD")) : null;
    const totalUsd = fxRate ? amount.div(fxRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : amount;
    if (totalUsd.lt(1)) throw new DistributionError("La distribución debe sumar al menos 1 USD.");
    const totalCents = totalUsd.mul(100).toNumber();

    const session = await requireBackofficeSession("TENANT_ADMIN");
    const meta = await requestMeta();
    const orgId = session.tenant.id;

    const message = await withTenant(
      orgId,
      async (tx) => {
        const offering = await tx.offering.findUnique({ where: { id: offeringId }, include: { token: true } });
        if (!offering) throw new DistributionError("Oferta no encontrada en este tenant.");
        const token = offering.token;
        if (!token?.contractAddress || (token.status !== "DEPLOYED" && token.status !== "PAUSED")) {
          throw new DistributionError("El token de la oferta no está desplegado: no hay tenedores a quienes distribuir.");
        }
        const holdings = await mintedHoldings(tx, offering.id);
        if (!holdings.length) throw new DistributionError("La oferta no tiene tokens emitidos (MINTED) en wallets de inversionistas.");

        const onchainId = distributionOnchainId(offering.id, period);
        const built = buildDistribution(
          onchainId,
          totalCents,
          holdings.map((h) => ({ key: h.investorId, wallet: h.wallet, units: h.units })),
        );
        const now = new Date();
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
            snapshotAt: now,
            merkleRoot: built.root,
            status: "DECLARED",
            declaredById: session.reviewer.id,
            createdAt: now,
          },
        });
        await tx.distributionAllocation.createMany({
          data: built.allocations.map((a) => ({
            organizationId: orgId,
            distributionId: distribution.id,
            investorId: a.key,
            wallet: a.wallet,
            units: a.units,
            amountUsd: new Prisma.Decimal(a.amountCents).div(100),
            leafHash: a.leaf,
            merkleProof: a.proof,
            createdAt: now,
          })),
        });
        // Outbox: the issuer signs it (DISTRIBUTION_ROLE of RwaxiPropertyToken).
        const chainTx = await tx.chainTransaction.create({
          data: {
            organizationId: orgId,
            offeringId: offering.id,
            network: token.network,
            kind: "DISTRIBUTION_ROOT_ANCHORED",
            contractAddress: token.contractAddress,
            method: ANCHOR_METHOD,
            args: { distributionId: onchainId, merkleRoot: built.root, totalAmountCents: String(totalCents), snapshotSupply: built.totalUnits },
            status: "PENDING",
          },
        });

        const names = new Map(holdings.map((h) => [h.investorId, h.fullName]));
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
              currency,
              amountDeclared: amount.toFixed(2),
              fxRate: fxRate?.toFixed(2) ?? null,
              totalUsd: totalUsd.toFixed(2),
              totalAmountCents: totalCents,
              holders: built.allocations.length,
              snapshotSupply: built.totalUnits,
              distributionId: onchainId,
              merkleRoot: built.root,
              allocations: built.allocations.map((a) => ({
                investorId: a.key,
                investorName: names.get(a.key) ?? null,
                wallet: a.wallet,
                units: a.units,
                amountCents: a.amountCents,
                leaf: a.leaf,
              })),
              chainTransactionId: chainTx.id,
              chainStatus: chainTx.status,
            },
            ...meta,
            createdAt: now,
          },
        });
        return tr("Distribución {period} declarada · {amount} USD entre {holders} tenedor(es) · anchorDistributionRoot() en cola", {
          period,
          amount: totalUsd.toFixed(2),
          holders: built.allocations.length,
          count: built.allocations.length,
        });
      },
      TX_OPTIONS,
    );

    refresh();
    return { ok: true, message };
  } catch (e) {
    return failure(e, tr);
  }
}
