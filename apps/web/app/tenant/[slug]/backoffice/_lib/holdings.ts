import "server-only";
import { toOnchainId } from "@rwaxi/blockchain-sdk";
import type { Prisma } from "@rwaxi/database";

/** Distribution periods: a month (2026-09) or a quarter (2026-Q3). */
export const PERIOD = /^\d{4}-(?:0[1-9]|1[0-2]|Q[1-4])$/;

/** bytes32 id of a distribution: one per offering and period (the token refuses to anchor an id twice). */
export const distributionOnchainId = (offeringId: string, period: string) => toOnchainId(`rwaxi.distribution:${offeringId}:${period}`);

export interface Holder {
  investorId: string;
  fullName: string;
  wallet: string;
  units: number;
}

/** Token balances of an offering's holders: the units of their MINTED subscriptions, one row per investor. */
export async function mintedHoldings(db: Prisma.TransactionClient, offeringId: string): Promise<Holder[]> {
  const groups = await db.subscription.groupBy({
    by: ["investorId"],
    where: { offeringId, status: "MINTED" },
    _sum: { units: true },
    orderBy: { investorId: "asc" },
  });
  if (!groups.length) return [];
  const investors = await db.investor.findMany({
    where: { id: { in: groups.map((g) => g.investorId) } },
    select: { id: true, fullName: true, walletAddress: true },
  });
  const byId = new Map(investors.map((i) => [i.id, i]));
  return groups.flatMap((g) => {
    const investor = byId.get(g.investorId);
    const units = g._sum.units ?? 0;
    return investor?.walletAddress && units > 0
      ? [{ investorId: investor.id, fullName: investor.fullName, wallet: investor.walletAddress.toLowerCase(), units }]
      : [];
  });
}
