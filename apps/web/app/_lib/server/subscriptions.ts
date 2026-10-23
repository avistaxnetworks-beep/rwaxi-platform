import "server-only";
import { evidenceHash, type Bytes32 } from "@rwaxi/blockchain-sdk";

/**
 * paymentEvidenceRef passed to RwaxiPropertyToken.mintSubscription(): binds the signed agreement
 * to the fiduciary payment the developer reconciled. Recomputable from the Subscription row:
 *   evidenceHash({ version, kind, subscriptionId: onchainId, agreementHash, paymentReference })
 */
export function paymentEvidenceRef(input: { onchainId: string; agreementHash: string; paymentReference: string }): Bytes32 {
  return evidenceHash({
    version: 1,
    kind: "rwaxi.subscription.payment",
    subscriptionId: input.onchainId,
    agreementHash: input.agreementHash,
    paymentReference: input.paymentReference,
  });
}

/** Reference the investor quotes in the bank / fiduciary transfer (derived from the on-chain id). */
export const paymentCodeOf = (onchainId: string | null) => (onchainId ? `SUB-${onchainId.slice(2, 10).toUpperCase()}` : null);
