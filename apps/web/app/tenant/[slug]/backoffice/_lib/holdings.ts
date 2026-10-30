import "server-only";
import { toOnchainId } from "@rwaxi/blockchain-sdk";

/** Distribution periods: a month (2026-09) or a quarter (2026-Q3). */
export const PERIOD = /^\d{4}-(?:0[1-9]|1[0-2]|Q[1-4])$/;

/** bytes32 id of a distribution: one per offering and period (the token refuses to anchor an id twice). */
export const distributionOnchainId = (offeringId: string, period: string) => toOnchainId(`rwaxi.distribution:${offeringId}:${period}`);

// The holders a distribution is declared over are the token balances at its record date, replayed from the confirmed
// mints of the token: see app/_lib/distribution-snapshot.ts (the token keeps the same history on-chain).
