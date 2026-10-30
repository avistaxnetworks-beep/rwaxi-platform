import "server-only";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  getContractAddress,
  http,
  keccak256,
  parseEventLogs,
  toHex,
  type Abi,
  type Address,
  type Hex,
  type Log,
  zeroHash,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { RWAXI_CHAINS, rwaxiComplianceRegistryAbi, rwaxiPropertyTokenAbi, rwaxiTenantFactoryAbi } from "@rwaxi/blockchain-sdk";
import { evidenceHash } from "@rwaxi/blockchain-sdk/canonical";
import { withTenant, type ChainNetwork, type ChainTransaction, type Prisma } from "@rwaxi/database";
import { LocalizedError, msg, type Reason } from "@/app/_i18n/marks";
import { interpolate } from "@/app/_i18n/translate";
import { WALLET_SIGNER_ROLE, type WalletCall } from "@/app/_lib/chain-queue-types";
import {
  MINTER_ROLE_ID,
  REGISTRY_KINDS,
  TENANT_SIGNED_KINDS,
  blockerReason,
  loadChainState,
  walletTxMismatch,
  type ExecutionOrigin,
} from "./chain-invariants";
import { calldataOf, eventOf, walletOf } from "./chain-queue";
import { paymentCodeOf } from "./subscriptions";

/**
 * Ordered execution of a tenant's ChainTransaction outbox.
 *
 *   SIMULATION (default)  checks the contracts' invariants against the confirmed history of the
 *                         outbox, signs a real EIP-1559 transaction with OPERATOR_PRIVATE_KEY
 *                         (RFC 6979 signature, global sequential nonce, fixed gas) and never
 *                         broadcasts it: txHash = keccak256(signedTransaction).
 *   RPC (CHAIN_EXECUTION=rpc)  sends the calls RWAXI may sign (mintSubscription · MINTER_ROLE) to
 *                         RPC_URL_<NETWORK>. Registry calls belong to the tenant's compliance officer and
 *                         the token's Data Room and distribution roots to the issuer: they sign with their
 *                         own wallet, never with RWAXI's key —
 *                           · in the backoffice, through their browser wallet (EIP-1193): prepareWalletCall()
 *                             hands out the exact call, confirmWalletCall() accepts only that transaction
 *                             (signer, contract, calldata) once its receipt succeeded;
 *                           · or from any wallet (multisig included), registering the hash afterwards
 *                             (confirmExternalTransaction: the receipt must carry the queued event).
 */
/** Expected execution failures (blocked, reverted, misconfigured): shown to the user in their language. */
export class ExecutionError extends LocalizedError {}

export type ExecutionMode = "SIMULATION" | "RPC";
export const executionMode = (): ExecutionMode => (process.env.CHAIN_EXECUTION === "rpc" ? "RPC" : "SIMULATION");

export interface Actor {
  id: string;
  email: string;
}
export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}
export interface Execution {
  id: string;
  kind: string;
  fn: string;
  txHash: Hex;
  blockNumber: bigint | null;
  mode: ExecutionMode;
  signer: string;
  nonce: number;
  signedTransaction: Hex | null;
  /** contract created by the call (deployTenantRegistry → the tenant's registry; deployOfferingToken → the token) */
  created: Address | null;
  /** RPC mint: the platform fee its PlatformFeeAccrued event declared (null if the receipt carried none) */
  platformFeeBps?: number | null;
  /** who sent it: RWAXI's operator, the signer's browser wallet (EIP-1193) or a wallet whose hash was registered */
  via: "operator" | "wallet" | "registered";
}

/** Sent, but the node has no receipt yet: the row stays claimed by its hash until one arrives. */
export class ReceiptPendingError extends ExecutionError {}
/**
 * A precondition stops the call before anything is signed: queue precedence, a revert the contracts would answer, a
 * call the tenant signs with its own wallet. Not an execution attempt (no retry is counted).
 */
export class BlockedError extends ExecutionError {}

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };
const RECEIPT_TIMEOUT_MS = 60_000;
/** A browser-signed call is confirmed within one request (serverless limits): later, «Verificar recibo». */
const WALLET_RECEIPT_TIMEOUT_MS = 25_000;
const GWEI = 1_000_000_000n;
const GAS: Record<string, bigint> = {
  approveInvestor: 120_000n,
  revokeInvestor: 80_000n,
  setFrozen: 80_000n,
  mintSubscription: 260_000n, // ~197k for a first holder: the token also records the balance history
  updateDataRoomMerkleRoot: 60_000n,
  anchorDistributionRoot: 90_000n,
  deployTenantRegistry: 2_500_000n,
  deployOfferingToken: 4_500_000n,
};
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

function operator(): PrivateKeyAccount {
  const key = process.env.OPERATOR_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new ExecutionError("OPERATOR_PRIVATE_KEY no está configurada (0x + 64 hex): no se puede firmar la cola.");
  }
  return privateKeyToAccount(key as Hex);
}

export function operatorAddress(): string | null {
  try {
    return operator().address;
  } catch {
    return null;
  }
}

const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : null);
const argsOf = (raw: unknown) => (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;

// ───────────────────────────────────────────────────────── confirmation side effects

async function finalize(db: Prisma.TransactionClient, tx: ChainTransaction, ex: Execution, actor: Actor, meta: RequestMeta) {
  const now = new Date();
  const { count } = await db.chainTransaction.updateMany({
    where: { id: tx.id, status: "PENDING" },
    data: {
      status: "CONFIRMED",
      txHash: ex.txHash,
      blockNumber: ex.blockNumber,
      executionMode: ex.mode,
      signerAddress: ex.signer,
      nonce: ex.nonce,
      signedTransaction: ex.signedTransaction,
      executedAt: now,
      error: null,
    },
  });
  if (count !== 1) throw new ExecutionError("Otra ejecución confirmó esta transacción primero.");

  const args = argsOf(tx.args);
  const wallet = walletOf(tx.args) ?? "";
  const investor = await db.investor.findFirst({
    where: { walletAddress: { equals: wallet, mode: "insensitive" } },
    select: { fullName: true },
  });

  if (tx.kind === "TENANT_REGISTRY_DEPLOYED") {
    if (!ex.created) throw new ExecutionError("No se pudo determinar la dirección del registro desplegado.");
    const org = await db.organization.updateMany({
      where: { id: tx.organizationId, complianceRegistry: null },
      data: { complianceRegistry: ex.created },
    });
    if (org.count !== 1) throw new ExecutionError("El tenant ya tiene RwaxiComplianceRegistry.");
    await db.chainTransaction.update({ where: { id: tx.id }, data: { args: { ...args, registry: ex.created } as Prisma.InputJsonValue } });
  }
  let reservationsOpened = 0;
  if (tx.kind === "OFFERING_TOKEN_DEPLOYED") {
    if (!ex.created) throw new ExecutionError("No se pudo determinar la dirección del token desplegado.");
    if (!tx.offeringId) throw new ExecutionError("El despliegue del token no indica su oferta.");
    const feeBps = Number(argsOf(args.cfg).platformFeeBps);
    const token = await db.tokenDeployment.updateMany({
      where: { offeringId: tx.offeringId, status: { in: ["NOT_DEPLOYED", "DEPLOYING"] } },
      data: { status: "DEPLOYED", contractAddress: ex.created, deployTxHash: ex.txHash, deployedAt: now, platformFeeBps: feeBps },
    });
    if (token.count !== 1) throw new ExecutionError("El token de la oferta ya está desplegado.");
    await db.chainTransaction.update({ where: { id: tx.id }, data: { args: { ...args, token: ex.created } as Prisma.InputJsonValue } });
    // The offering's pre-sale reservations become payable: same units and signed agreement, now with their transfer
    // reference and the platform fee fixed in the token (the developer pays it to RWAXI; the investor never does).
    const reserved = await db.subscription.findMany({
      where: { offeringId: tx.offeringId, status: "RESERVED" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, onchainId: true, units: true, capitalUsd: true, agreementHash: true, investorId: true, investor: { select: { fullName: true } } },
    });
    for (const r of reserved) {
      const platformFeeUsd = r.capitalUsd.mul(feeBps).div(10_000).toDecimalPlaces(2);
      const opened = await db.subscription.updateMany({
        where: { id: r.id, status: "RESERVED" },
        data: { status: "PAYMENT_PENDING", platformFeeBps: feeBps, platformFeeUsd },
      });
      if (opened.count !== 1) continue;
      reservationsOpened += 1;
      await db.auditEvent.create({
        data: {
          organizationId: tx.organizationId,
          action: "SUBSCRIPTION_PAYMENT_OPENED",
          actorUserId: actor.id,
          actorEmail: actor.email,
          entityType: "Subscription",
          entityId: r.id,
          subjectHash: r.agreementHash,
          payload: {
            investorId: r.investorId,
            investorName: r.investor.fullName,
            from: "RESERVED",
            to: "PAYMENT_PENDING",
            units: r.units,
            capitalUsd: r.capitalUsd.toFixed(2),
            paymentCode: paymentCodeOf(r.onchainId),
            token: ex.created,
            platformFeeBps: feeBps,
            platformFeeUsd: platformFeeUsd.toFixed(2),
            chainTransactionId: tx.id,
          },
          ...meta,
          createdAt: now,
        },
      });
    }
  }
  if (tx.kind === "DISTRIBUTION_ROOT_ANCHORED") {
    const anchored = await db.distribution.updateMany({
      where: { onchainId: String(args.distributionId), status: "DECLARED" },
      data: { status: "ANCHORED", anchorTxHash: ex.txHash },
    });
    if (anchored.count !== 1) throw new ExecutionError("La distribución ya no está DECLARED.");
  }

  if (tx.kind === "INVESTOR_WHITELISTED") {
    await db.kycCase.updateMany({
      where: {
        status: "APPROVED",
        dossierHash: String(args.kycDossierHash),
        investor: { walletAddress: { equals: wallet, mode: "insensitive" } },
      },
      data: { whitelistTxHash: ex.txHash },
    });
  }
  if (tx.kind === "SUBSCRIPTION_MINTED") {
    const onchainId = String(args.subscriptionId);
    const sub = await db.subscription.findFirst({ where: { onchainId }, select: { id: true, units: true, capitalUsd: true } });
    const minted = await db.subscription.updateMany({
      where: { onchainId, status: "MINT_PENDING" },
      data: { status: "MINTED", mintTxHash: ex.txHash },
    });
    if (!sub || minted.count !== 1) throw new ExecutionError("La suscripción ya no está MINT_PENDING.");
    // The fee accrual the mint declares on-chain (PlatformFeeAccrued, with the token's immutable fee), next to the
    // ledger entry accrued when the payment was reconciled. RPC: read from the receipt; SIMULATION: the token's fee,
    // which its code would declare (nothing is observed on a network).
    const feeEntry = await db.feeLedgerEntry.findFirst({
      where: { subscriptionId: sub.id, kind: "INFRASTRUCTURE_USAGE", status: { not: "VOIDED" } },
      select: { id: true, amountUsd: true, platformFeeBps: true },
    });
    const tokenFee = await db.tokenDeployment.findFirst({
      where: { contractAddress: { equals: tx.contractAddress, mode: "insensitive" } },
      select: { platformFeeBps: true },
    });
    const declaredBps = ex.mode === "RPC" ? (ex.platformFeeBps ?? null) : (tokenFee?.platformFeeBps ?? null);
    const platformFee = {
      event: "PlatformFeeAccrued",
      platformFeeBps: declaredBps,
      observedOnChain: ex.mode === "RPC" && ex.platformFeeBps != null,
      feeLedgerEntryId: feeEntry?.id ?? null,
      feeUsd: feeEntry?.amountUsd.toFixed(2) ?? null,
      ledgerBps: feeEntry?.platformFeeBps ?? null,
      matchesLedger: declaredBps !== null && feeEntry?.platformFeeBps != null ? declaredBps === feeEntry.platformFeeBps : null,
    };
    await db.auditEvent.create({
      data: {
        organizationId: tx.organizationId,
        action: "SUBSCRIPTION_MINTED",
        actorUserId: actor.id,
        actorEmail: actor.email,
        entityType: "Subscription",
        entityId: sub.id,
        subjectHash: ex.txHash,
        payload: {
          investorName: investor?.fullName ?? null,
          from: "MINT_PENDING",
          to: "MINTED",
          units: sub.units,
          capitalUsd: sub.capitalUsd.toFixed(2),
          chainTransactionId: tx.id,
          txHash: ex.txHash,
          mode: ex.mode,
          paymentEvidenceRef: String(args.paymentEvidenceRef),
          platformFee,
        },
        ...meta,
        createdAt: now,
      },
    });
  }
  await db.auditEvent.create({
    data: {
      organizationId: tx.organizationId,
      action: "CHAIN_TX_CONFIRMED",
      actorUserId: actor.id,
      actorEmail: actor.email,
      entityType: "ChainTransaction",
      entityId: tx.id,
      subjectHash: ex.txHash,
      payload: {
        investorName: investor?.fullName ?? null,
        kind: tx.kind,
        method: tx.method,
        contractAddress: tx.contractAddress,
        txHash: ex.txHash,
        mode: ex.mode,
        signer: ex.signer,
        via: ex.via,
        nonce: ex.nonce,
        blockNumber: ex.blockNumber?.toString() ?? null,
        created: ex.created,
        ...(tx.kind === "OFFERING_TOKEN_DEPLOYED" ? { reservationsOpened } : {}),
      },
      ...meta,
      createdAt: now,
    },
  });
}

/**
 * Locks the outbox row (and, when given, a signer lock), then checks the invariants on state
 * read after every earlier holder of those locks committed.
 */
async function prepare(
  db: Prisma.TransactionClient,
  chainTxId: string,
  lockKey?: (network: ChainNetwork) => string,
  origin: ExecutionOrigin = "tenant",
) {
  const [row] = await db.$queryRaw<{ network: ChainNetwork }[]>`
    SELECT network::text AS network FROM chain_transactions WHERE id = ${chainTxId} FOR UPDATE`;
  if (!row) throw new ExecutionError("Transacción no encontrada en este tenant.");
  if (lockKey) await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey(row.network)}))`;
  const tx = await db.chainTransaction.findUniqueOrThrow({ where: { id: chainTxId } });
  const blocker = blockerReason(tx, await loadChainState(db), origin);
  if (blocker) throw new BlockedError(blocker.source, blocker.vars);
  return { tx, encoded: calldataOf(tx)! };
}

function rpcClients(network: ChainNetwork, account?: PrivateKeyAccount) {
  const rpcUrl = process.env[`RPC_URL_${network}`];
  if (!rpcUrl) throw new ExecutionError("Modo RPC: falta RPC_URL_{network}.", { network });
  const chain = RWAXI_CHAINS[network];
  return {
    chain,
    publicClient: createPublicClient({ chain, transport: http(rpcUrl) }),
    walletClient: account ? createWalletClient({ account, chain, transport: http(rpcUrl) }) : null,
  };
}

// ───────────────────────────────────────────────────────── execution

async function simulate(
  organizationId: string,
  chainTxId: string,
  actor: Actor,
  meta: RequestMeta,
  account: PrivateKeyAccount,
  origin: ExecutionOrigin,
) {
  return withTenant(
    organizationId,
    async (db) => {
      // One operator account serves every tenant: its executions on a network run one at a time,
      // so the nonce sequence is global and gapless (the unique index backs it up).
      const { tx, encoded } = await prepare(db, chainTxId, (network) => `rwaxi-signer:${account.address}:${network}`, origin);
      // The issuer granting MINTER_ROLE to its own wallet only means something on a real network.
      if (tx.kind === "MINTER_ROLE_GRANTED") {
        throw new ExecutionError("Otorgar MINTER_ROLE al emisor lo firma su wallet en modo RPC: en simulación no aplica.");
      }
      const [next] = await db.$queryRaw<{ nonce: number }[]>`
        SELECT rwaxi_next_simulated_nonce(${tx.network}::"ChainNetwork", ${account.address}) AS nonce`;
      const nonce = Number(next?.nonce ?? 0);
      let created: Address | null = null;
      if (tx.kind === "TENANT_REGISTRY_DEPLOYED" || tx.kind === "OFFERING_TOKEN_DEPLOYED") {
        // The factory deploys registries and tokens with CREATE: its nonce is 1 + the contracts it already created
        // on this network (only the operator calls it, so the signer lock above also serialises this count).
        const [made] = await db.$queryRaw<{ n: number }[]>`
          SELECT rwaxi_factory_creations(${tx.network}::"ChainNetwork", ${tx.contractAddress}) AS n`;
        created = getContractAddress({ from: tx.contractAddress as Address, nonce: BigInt(1 + Number(made?.n ?? 0)) });
      }
      const signedTransaction = await account.signTransaction({
        type: "eip1559",
        chainId: RWAXI_CHAINS[tx.network].id,
        nonce,
        to: tx.contractAddress as Address,
        data: encoded.calldata,
        value: 0n,
        gas: GAS[encoded.fn] ?? 300_000n,
        maxFeePerGas: GWEI,
        maxPriorityFeePerGas: GWEI,
      });
      const ex: Execution = {
        id: tx.id,
        kind: tx.kind,
        fn: encoded.fn,
        txHash: keccak256(signedTransaction),
        blockNumber: null,
        mode: "SIMULATION",
        signer: account.address,
        nonce,
        signedTransaction,
        created,
        via: "operator",
      };
      await finalize(db, tx, ex, actor, meta);
      return ex;
    },
    TX_OPTIONS,
  );
}

type PublicRpc = ReturnType<typeof rpcClients>["publicClient"];

/** Did the receipt carry the event of the queued call, emitted by the queued contract with the queued arguments? */
function emitsQueuedEvent(tx: ChainTransaction, logs: Log[]): boolean {
  const args = argsOf(tx.args);
  const fromQueued = (address: string) => lower(address) === lower(tx.contractAddress);
  const registry = rwaxiComplianceRegistryAbi;
  const token = rwaxiPropertyTokenAbi;
  switch (tx.kind) {
    case "INVESTOR_WHITELISTED":
      return parseEventLogs({ abi: registry, logs, eventName: "InvestorWhitelisted" }).some(
        (e) =>
          fromQueued(e.address) &&
          lower(e.args.wallet) === lower(args.wallet) &&
          e.args.countryCode === Number(args.countryCode) &&
          lower(e.args.kycDossierHash) === lower(args.kycDossierHash),
      );
    case "INVESTOR_REVOKED":
      return parseEventLogs({ abi: registry, logs, eventName: "InvestorRevoked" }).some(
        (e) => fromQueued(e.address) && lower(e.args.wallet) === lower(args.wallet),
      );
    case "INVESTOR_FREEZE_UPDATED":
      return parseEventLogs({ abi: registry, logs, eventName: "InvestorFreezeUpdated" }).some(
        (e) => fromQueued(e.address) && lower(e.args.wallet) === lower(args.wallet) && e.args.isFrozen === (args.frozen === true),
      );
    case "SUBSCRIPTION_MINTED":
      return parseEventLogs({ abi: token, logs, eventName: "SubscriptionTokensMinted" }).some(
        (e) =>
          fromQueued(e.address) &&
          lower(e.args.subscriptionId) === lower(args.subscriptionId) &&
          lower(e.args.investor) === lower(args.investor) &&
          e.args.amount === BigInt(String(args.amount)) &&
          lower(e.args.paymentEvidenceRef) === lower(args.paymentEvidenceRef),
      );
    case "DATA_ROOM_ROOT_ANCHORED":
      return parseEventLogs({ abi: token, logs, eventName: "DataRoomMerkleRootAnchored" }).some(
        (e) => fromQueued(e.address) && lower(e.args.newRoot) === lower(args.newRoot),
      );
    case "DISTRIBUTION_ROOT_ANCHORED":
      return parseEventLogs({ abi: token, logs, eventName: "DistributionRootAnchored" }).some(
        (e) =>
          fromQueued(e.address) &&
          lower(e.args.distributionId) === lower(args.distributionId) &&
          lower(e.args.merkleRoot) === lower(args.merkleRoot) &&
          e.args.totalAmountCents === BigInt(String(args.totalAmountCents)) &&
          e.args.snapshotSupply === BigInt(String(args.snapshotSupply)) &&
          e.args.recordTimestamp === BigInt(String(args.recordTimestamp)) &&
          e.args.currency === args.currency &&
          lower(e.args.evidenceHash) === lower(args.evidenceHash),
      );
    case "MINTER_ROLE_GRANTED":
      return parseEventLogs({ abi: token, logs, eventName: "RoleGranted" }).some(
        (e) => fromQueued(e.address) && lower(e.args.role) === lower(args.role) && lower(e.args.account) === lower(args.account),
      );
    default:
      return false;
  }
}

/**
 * Receipt of a broadcast row → CONFIRMED. A revert marks an operator send REVERTED; a call signed in the
 * tenant's browser wallet is released instead (the queued call is still valid: sign it again). Without a
 * receipt yet the row stays claimed by its hash (ReceiptPendingError).
 */
async function settle(
  organizationId: string,
  tx: ChainTransaction,
  hash: Hex,
  fn: string,
  actor: Actor,
  meta: RequestMeta,
  publicClient: PublicRpc,
  wait: boolean,
  claim: "operator" | "wallet" = "operator",
): Promise<Execution> {
  const timeout = claim === "wallet" ? WALLET_RECEIPT_TIMEOUT_MS : RECEIPT_TIMEOUT_MS;
  const receipt = await (
    wait ? publicClient.waitForTransactionReceipt({ hash, timeout }) : publicClient.getTransactionReceipt({ hash })
  ).catch(() => null);
  if (!receipt) throw new ReceiptPendingError("Envío RPC en curso ({hash}): aún sin recibo; «Procesar cola en orden» lo concilia.", { hash });
  if (receipt.status !== "success") {
    if (claim === "wallet") {
      await withTenant(organizationId, (db) =>
        db.chainTransaction.updateMany({
          where: { id: tx.id, status: "PENDING", txHash: hash },
          data: {
            executionMode: null,
            signerAddress: null,
            txHash: null,
            error: `wallet tx ${hash} reverted on-chain (block ${receipt.blockNumber})`,
            attempts: { increment: 1 },
            lastAttemptAt: new Date(),
          },
        }),
      );
      throw new ExecutionError(
        "La transacción de tu wallet revirtió en la red ({hash}): no se confirmó nada y la operación sigue en cola para firmarla de nuevo.",
        { hash },
      );
    }
    await withTenant(organizationId, (db) =>
      db.chainTransaction.updateMany({
        where: { id: tx.id, status: "PENDING" },
        data: {
          status: "REVERTED",
          blockNumber: receipt.blockNumber,
          executedAt: new Date(),
          error: "reverted on-chain",
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      }),
    );
    throw new ExecutionError("La transacción revirtió en la red ({hash}).", { hash });
  }
  const sent = await publicClient.getTransaction({ hash });
  // Whoever sent it, only the queued call to the queued contract confirms the row.
  if (lower(sent.to) !== lower(tx.contractAddress) || lower(sent.input) !== lower(calldataOf(tx)?.calldata)) {
    throw new ExecutionError("La transacción {hash} no corresponde a la operación en cola (contrato o calldata distintos).", { hash });
  }
  if (claim === "wallet") {
    if (lower(sent.from) !== lower(tx.signerAddress)) {
      throw new ExecutionError("La transacción la firmó {from}, no tu wallet autorizada {expected}: no se registró nada.", {
        from: sent.from,
        expected: tx.signerAddress ?? "—",
      });
    }
    if (!emitsQueuedEvent(tx, receipt.logs)) {
      throw new ExecutionError("La transacción no emitió {event} con los argumentos en cola.", { event: eventOf(tx.kind) ?? fn });
    }
  }
  const deployed =
    tx.kind === "TENANT_REGISTRY_DEPLOYED"
      ? parseEventLogs({ abi: rwaxiTenantFactoryAbi, logs: receipt.logs, eventName: "TenantRegistryDeployed" }).find(
          (e) => lower(e.address) === lower(tx.contractAddress) && lower(e.args.organizationId) === lower(argsOf(tx.args).organizationId),
        )
      : undefined;
  const tokenDeployed =
    tx.kind === "OFFERING_TOKEN_DEPLOYED"
      ? parseEventLogs({ abi: rwaxiTenantFactoryAbi, logs: receipt.logs, eventName: "OfferingTokenDeployed" }).find(
          (e) => lower(e.address) === lower(tx.contractAddress) && lower(e.args.offeringId) === lower(argsOf(tx.args).offeringId),
        )
      : undefined;
  // The mint declares the platform fee fixed in the token (PlatformFeeAccrued): recorded next to the ledger's.
  const feeAccrued =
    tx.kind === "SUBSCRIPTION_MINTED"
      ? parseEventLogs({ abi: rwaxiPropertyTokenAbi, logs: receipt.logs, eventName: "PlatformFeeAccrued" }).find(
          (e) => lower(e.address) === lower(tx.contractAddress) && lower(e.args.subscriptionId) === lower(argsOf(tx.args).subscriptionId),
        )
      : undefined;
  const ex: Execution = {
    id: tx.id,
    kind: tx.kind,
    fn,
    txHash: hash,
    blockNumber: receipt.blockNumber,
    mode: "RPC",
    signer: getAddress(sent.from),
    nonce: sent.nonce,
    signedTransaction: null,
    created: deployed ? getAddress(deployed.args.registry) : tokenDeployed ? getAddress(tokenDeployed.args.token) : null,
    platformFeeBps: feeAccrued ? Number(feeAccrued.args.platformFeeBps) : null,
    via: claim,
  };
  await withTenant(organizationId, (db) => finalize(db, tx, ex, actor, meta), TX_OPTIONS);
  return ex;
}

async function broadcast(
  organizationId: string,
  chainTxId: string,
  actor: Actor,
  meta: RequestMeta,
  account: PrivateKeyAccount,
  origin: ExecutionOrigin,
) {
  const row = await withTenant(organizationId, (db) => db.chainTransaction.findUnique({ where: { id: chainTxId } }));
  if (!row) throw new ExecutionError("Transacción no encontrada en este tenant.");
  // Sent earlier but its receipt was not awaited: reconcile it, never send it again. A hash claimed by a
  // tenant's browser wallet (not RWAXI's operator) is held to that wallet.
  if (row.status === "PENDING" && row.executionMode === "RPC" && row.txHash) {
    const { publicClient } = rpcClients(row.network);
    const claim = lower(row.signerAddress) === lower(account.address) ? "operator" : "wallet";
    return settle(organizationId, row, row.txHash as Hex, calldataOf(row)?.fn ?? row.method, actor, meta, publicClient, false, claim);
  }

  // Claim the row (executionMode set while PENDING) so a concurrent run cannot send it twice.
  const { tx, encoded, clients } = await withTenant(
    organizationId,
    async (db) => {
      const prepared = await prepare(db, chainTxId, undefined, origin);
      if (TENANT_SIGNED_KINDS.has(prepared.tx.kind)) {
        throw new BlockedError(
          prepared.tx.kind === "DISTRIBUTION_ROOT_ANCHORED"
            ? msg("Modo RPC: el emisor firma anchorDistributionRoot con su propia wallet (RWAXI no custodia DISTRIBUTION_ROLE); registra luego su tx hash.")
            : prepared.tx.kind === "DATA_ROOM_ROOT_ANCHORED"
              ? msg("Modo RPC: el emisor firma updateDataRoomMerkleRoot con su propia wallet (RWAXI no custodia DATA_ROOM_ROLE); registra luego su tx hash.")
              : prepared.tx.kind === "MINTER_ROLE_GRANTED"
                ? msg("Modo RPC: el emisor se otorga MINTER_ROLE con su propia wallet (DEFAULT_ADMIN_ROLE del token); RWAXI no lo firma.")
                : msg("Modo RPC: esta operación la firma el Oficial de Cumplimiento con su propia wallet (RWAXI no custodia COMPLIANCE_OFFICER_ROLE); registra luego su tx hash."),
        );
      }
      const clients = rpcClients(prepared.tx.network, account); // a missing RPC_URL fails before claiming
      const claimed = await db.chainTransaction.updateMany({
        where: { id: chainTxId, status: "PENDING", executionMode: null },
        data: { executionMode: "RPC", signerAddress: account.address },
      });
      if (claimed.count !== 1) throw new ExecutionError("Otra ejecución RPC tomó esta transacción.");
      return { ...prepared, clients };
    },
    TX_OPTIONS,
  );
  const update = (data: Prisma.ChainTransactionUpdateManyArgs["data"]) =>
    withTenant(organizationId, (db) => db.chainTransaction.updateMany({ where: { id: chainTxId, status: "PENDING" }, data }));

  const { chain, publicClient, walletClient } = clients;
  let hash: Hex;
  try {
    const code = await publicClient.getCode({ address: tx.contractAddress as Address });
    if (!code || code === "0x") throw new ExecutionError("Modo RPC: no hay contrato desplegado en esa dirección de la red configurada.");
    hash = await walletClient!.sendTransaction({ account, chain, to: tx.contractAddress as Address, data: encoded.calldata });
  } catch (e) {
    await update({ executionMode: null, signerAddress: null }); // nothing was broadcast: release the claim
    if (e instanceof ExecutionError) throw e;
    throw new ExecutionError("Modo RPC: el nodo rechazó la transacción ({detail}).", { detail: e instanceof Error ? e.message.split("\n")[0]! : "error" });
  }
  await update({ txHash: hash });
  return settle(organizationId, tx, hash, encoded.fn, actor, meta, publicClient, true);
}

/**
 * Executes one PENDING row, enforcing precedence and the contract invariants. Throws ExecutionError
 * when blocked. `origin: "platform"` is RWAXI's console (factory deployments of RWAXI_OPERATOR_ROLE).
 */
export async function executeChainTx(
  organizationId: string,
  chainTxId: string,
  actor: Actor,
  meta: RequestMeta,
  origin: ExecutionOrigin = "tenant",
): Promise<Execution> {
  try {
    const account = operator();
    return executionMode() === "SIMULATION"
      ? await simulate(organizationId, chainTxId, actor, meta, account, origin)
      : await broadcast(organizationId, chainTxId, actor, meta, account, origin);
  } catch (e) {
    // A precondition (not an attempt) or a send that still awaits its receipt (it may yet confirm) is not a failure.
    if (!(e instanceof BlockedError) && !(e instanceof ReceiptPendingError)) await recordFailedAttempt(organizationId, chainTxId, e);
    throw e;
  }
}

/**
 * A failed execution of a PENDING row, counted with its moment and reason (one line): the Super-Admin console raises
 * its retry alerts from them. A REVERTED row already counted its revert. Best effort: it never hides the failure.
 */
async function recordFailedAttempt(organizationId: string, chainTxId: string, e: unknown) {
  const reason = e instanceof LocalizedError ? interpolate(e.reason.source, e.reason.vars) : e instanceof Error ? e.message : String(e);
  const now = new Date();
  await withTenant(organizationId, (db) =>
    db.chainTransaction.updateMany({
      where: { id: chainTxId, status: "PENDING" },
      data: { attempts: { increment: 1 }, lastAttemptAt: now, error: `${now.toISOString()} · ${reason.split("\n")[0]}`.slice(0, 500) },
    }),
  ).catch((err: unknown) => console.error("[chain] could not record the failed attempt", err));
}

/**
 * RPC mode, tenant-signed calls: registers the hash of a registry call the compliance officer — or a
 * root anchor or MINTER_ROLE grant the issuer — signed with their own wallet, once the receipt shows
 * it succeeded and emitted the queued event (InvestorWhitelisted, InvestorRevoked, InvestorFreezeUpdated,
 * DistributionRootAnchored, DataRoomMerkleRootAnchored, RoleGranted) from the queued contract with exactly
 * the queued arguments.
 */
export async function confirmExternalTransaction(
  organizationId: string,
  chainTxId: string,
  txHash: string,
  actor: Actor,
  meta: RequestMeta,
): Promise<Execution> {
  if (executionMode() !== "RPC") throw new ExecutionError("Registrar un tx hash externo sólo aplica en modo RPC.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new ExecutionError("Tx hash inválido.");
  const { tx } = await withTenant(organizationId, (db) => prepare(db, chainTxId), TX_OPTIONS);
  if (!TENANT_SIGNED_KINDS.has(tx.kind)) {
    throw new ExecutionError("Sólo las operaciones que firma el tenant con su wallet (registro de cumplimiento, raíces y MINTER_ROLE del emisor) se registran por hash.");
  }
  const { publicClient } = rpcClients(tx.network);
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hex });
  if (receipt.status !== "success") throw new ExecutionError("Esa transacción no fue exitosa en la red.");
  // The event, not the calldata: a multisig or smart-contract wallet calls the contract from its own code.
  if (!emitsQueuedEvent(tx, receipt.logs)) {
    throw new ExecutionError("La transacción no emitió {event} con los argumentos en cola.", { event: eventOf(tx.kind) ?? tx.method });
  }
  const sent = await publicClient.getTransaction({ hash: txHash as Hex });
  const ex: Execution = {
    id: tx.id,
    kind: tx.kind,
    fn: calldataOf(tx)?.fn ?? tx.method,
    txHash: txHash as Hex,
    blockNumber: receipt.blockNumber,
    mode: "RPC",
    signer: getAddress(sent.from),
    nonce: sent.nonce,
    signedTransaction: null,
    created: null,
    via: "registered",
  };
  await withTenant(organizationId, (db) => finalize(db, tx, ex, actor, meta), TX_OPTIONS);
  return ex;
}

// ───────────────────────────────────────────────────────── EIP-1193: the tenant's own browser wallet

/**
 * The revert, if any, of a call a wallet is about to sign, executed against the latest block. A distribution anchoring
 * whose record instant no block has passed yet would answer FutureLookup there, although its transaction lands in a
 * later block: in that window the token's own checks are replayed instead — not anchored yet, and the supply at the
 * record instant is the latest one (no block came after it). The other conditions were replayed by prepare().
 */
async function dryRun(publicClient: PublicRpc, tx: ChainTransaction, from: Address, to: Address, data: Hex): Promise<unknown> {
  if (tx.kind === "DISTRIBUTION_ROOT_ANCHORED") {
    const args = argsOf(tx.args);
    const latest = await publicClient.getBlock({ blockTag: "latest" });
    if (BigInt(String(args.recordTimestamp)) >= latest.timestamp) {
      const [supply, root] = await Promise.all([
        publicClient.readContract({ address: to, abi: rwaxiPropertyTokenAbi, functionName: "totalSupply", blockNumber: latest.number }),
        publicClient.readContract({
          address: to,
          abi: rwaxiPropertyTokenAbi,
          functionName: "distributionRoots",
          args: [String(args.distributionId) as Hex],
          blockNumber: latest.number,
        }),
      ]);
      if (root !== zeroHash) return new Error("DistributionAlreadyAnchored(distributionId)");
      const declared = BigInt(String(args.snapshotSupply));
      return supply === declared ? null : new Error(`SnapshotSupplyMismatch(${declared}, ${supply})`);
    }
  }
  return publicClient.call({ account: from, to, data }).then(
    () => null,
    (e: unknown) => e,
  );
}

const shortError = (e: unknown) =>
  (e && typeof e === "object" && "shortMessage" in e && typeof e.shortMessage === "string" ? e.shortMessage : e instanceof Error ? e.message : String(e))
    .split("\n")[0]!
    .slice(0, 240);

/** The signer's registered wallet as stored (lowercase), or an error naming why there is none. */
function signerWallet(wallet: string | null | undefined): Address {
  if (!wallet || !ADDRESS.test(wallet)) {
    throw new ExecutionError("Tu usuario no tiene una wallet registrada en este tenant: no hay una cuenta autorizada para firmar.");
  }
  return getAddress(wallet);
}

/**
 * The exact call the signer's browser wallet must sign for one PENDING row (RPC mode): the queued calldata
 * (compiled ABIs of @rwaxi/blockchain-sdk) to the tenant's contract on the expected chain, from the signer's
 * registered wallet — which must hold the contract role on-chain and pass a dry run of the call. The server
 * never sees a private key: it only hands out what to sign and, later, checks what was signed.
 */
export async function prepareWalletCall(organizationId: string, chainTxId: string, wallet: string | null): Promise<WalletCall> {
  if (executionMode() !== "RPC") {
    throw new ExecutionError("La firma con wallet requiere modo RPC (CHAIN_EXECUTION=rpc): en simulación la cola la firma la clave de demostración.");
  }
  const { tx, encoded } = await withTenant(organizationId, (db) => prepare(db, chainTxId), TX_OPTIONS);
  const role = WALLET_SIGNER_ROLE[tx.kind];
  if (!role) throw new ExecutionError("Esta operación no se firma con wallet desde el backoffice.");
  const from = signerWallet(wallet);
  const { chain, publicClient } = rpcClients(tx.network);
  const to = getAddress(tx.contractAddress);
  const code = await publicClient.getCode({ address: to });
  if (!code || code === "0x") throw new ExecutionError("Modo RPC: no hay contrato desplegado en esa dirección de la red configurada.");
  if (tx.kind === "MINTER_ROLE_GRANTED") {
    // The issuer grants MINTER_ROLE only to its own wallet — never to RWAXI's operator or anyone else.
    const account = argsOf(tx.args).account;
    if (lower(account) !== lower(from) || lower(account) === lower(operatorAddress())) {
      throw new ExecutionError("MINTER_ROLE sólo se otorga a la wallet registrada del Administrador que lo firma.");
    }
  }
  const abi = (REGISTRY_KINDS.has(tx.kind) ? rwaxiComplianceRegistryAbi : rwaxiPropertyTokenAbi) as Abi;
  // AccessControl: DEFAULT_ADMIN_ROLE is bytes32(0); every other role is keccak256 of its name.
  const roleId = role === "DEFAULT_ADMIN_ROLE" ? zeroHash : keccak256(toHex(role));
  const holds = await publicClient.readContract({ address: to, abi, functionName: "hasRole", args: [roleId, from] });
  if (holds !== true) {
    throw tx.kind === "SUBSCRIPTION_MINTED"
      ? new ExecutionError(
          "Tu wallet {wallet} no tiene MINTER_ROLE en el token: el mint lo envía el operador RWAXI («Firmar y ejecutar»), salvo que el emisor otorgue MINTER_ROLE a su propia wallet.",
          { wallet: from },
        )
      : new ExecutionError("Tu wallet registrada {wallet} no tiene {role} en {contract}: no puede firmar esta operación.", { wallet: from, role, contract: to });
  }
  // Dry run from the signer: a call the network would revert is never offered for signature.
  const dry = await dryRun(publicClient, tx, from, to, encoded.calldata);
  if (dry) throw new ExecutionError("La red rechazaría la llamada desde tu wallet ({detail}): no se pidió ninguna firma.", { detail: shortError(dry) });
  return {
    chainTxId: tx.id,
    kind: tx.kind,
    fn: encoded.fn,
    network: tx.network,
    chainId: chain.id,
    chainName: chain.name,
    to,
    data: encoded.calldata,
    from,
    role,
    roleCall: { to, data: encodeFunctionData({ abi, functionName: "hasRole", args: [roleId, from] }) },
  };
}

export type WalletOutcome = { state: "confirmed"; execution: Execution } | { state: "pending"; hash: Hex };

/**
 * The hash a browser wallet returned for one PENDING row. Nothing is recorded unless the node shows that very
 * transaction on the expected chain, sent by the signer's registered wallet to the queued contract with the
 * queued calldata and no value; the row is then claimed by the hash (RWAXI's operator can no longer send it and
 * a reload still reconciles it) and confirmed only by a successful receipt carrying the queued event — the
 * CHAIN_TX_CONFIRMED AuditEvent records that real txHash. A revert releases the row to be signed again.
 */
export async function confirmWalletCall(
  organizationId: string,
  chainTxId: string,
  txHash: string,
  wallet: string | null,
  actor: Actor,
  meta: RequestMeta,
): Promise<WalletOutcome> {
  if (executionMode() !== "RPC") throw new ExecutionError("La firma con wallet requiere modo RPC (CHAIN_EXECUTION=rpc).");
  if (!TX_HASH.test(txHash)) throw new ExecutionError("Tx hash inválido.");
  const hash = txHash.toLowerCase() as Hex;
  const row = await withTenant(organizationId, (db) => db.chainTransaction.findUnique({ where: { id: chainTxId } }));
  if (!row) throw new ExecutionError("Transacción no encontrada en este tenant.");
  if (!WALLET_SIGNER_ROLE[row.kind]) throw new ExecutionError("Esta operación no se firma con wallet desde el backoffice.");
  const from = signerWallet(wallet);
  const fn = calldataOf(row)?.fn ?? row.method;
  // Asked again for a hash already confirmed (e.g. «Procesar cola en orden» reconciled it first).
  if (row.status === "CONFIRMED" && lower(row.txHash) === hash) {
    return {
      state: "confirmed",
      execution: {
        id: row.id,
        kind: row.kind,
        fn,
        txHash: hash,
        blockNumber: row.blockNumber,
        mode: "RPC",
        signer: row.signerAddress ?? from,
        nonce: row.nonce ?? 0,
        signedTransaction: null,
        created: null,
        via: "wallet",
      },
    };
  }
  const { chain, publicClient } = rpcClients(row.network);
  const reconcile = async (claimed: ChainTransaction): Promise<WalletOutcome> => {
    try {
      return { state: "confirmed", execution: await settle(organizationId, claimed, hash, fn, actor, meta, publicClient, true, "wallet") };
    } catch (e) {
      if (e instanceof ReceiptPendingError) return { state: "pending", hash };
      throw e;
    }
  };
  // Claimed by this very hash earlier, receipt not seen then: reconcile it.
  if (row.status === "PENDING" && row.executionMode === "RPC" && lower(row.txHash) === hash) {
    if (lower(row.signerAddress) !== lower(from)) throw new ExecutionError("Ese envío lo hizo otra wallet: lo concilia «Procesar cola en orden».");
    return reconcile(row);
  }
  // A new signature: the row must still be executable (precedence and the contracts' invariants).
  const { tx, encoded } = await withTenant(organizationId, (db) => prepare(db, chainTxId), TX_OPTIONS);
  const sent = await publicClient.getTransaction({ hash }).catch(() => null);
  if (!sent) {
    throw new ExecutionError("La red {network} no conoce la transacción {hash}: revisa que tu wallet la haya enviado a {chain}.", {
      network: tx.network,
      hash,
      chain: chain.name,
    });
  }
  const mismatch = walletTxMismatch(sent, {
    from,
    to: getAddress(tx.contractAddress),
    data: encoded.calldata,
    chainId: chain.id,
    chainName: chain.name,
    fn: encoded.fn,
  });
  if (mismatch) throw new ExecutionError(mismatch.source, mismatch.vars);
  const claimed = await withTenant(organizationId, (db) =>
    db.chainTransaction.updateMany({
      where: { id: tx.id, status: "PENDING", executionMode: null },
      data: { executionMode: "RPC", txHash: hash, signerAddress: getAddress(sent.from), error: null },
    }),
  );
  if (claimed.count !== 1) throw new ExecutionError("Otra ejecución tomó esta transacción.");
  return reconcile({ ...tx, executionMode: "RPC", txHash: hash, signerAddress: getAddress(sent.from), error: null });
}

// ───────────────────────────────────────────────────────── distributions: the token's history and the whitelist (RPC)

async function deployedAt(publicClient: PublicRpc, address: Address) {
  const code = await publicClient.getCode({ address });
  if (!code || code === "0x") throw new ExecutionError("Modo RPC: no hay contrato desplegado en esa dirección de la red configurada.");
}

/**
 * What an offering's token recorded at an instant (RPC): totalSupplyAt and balanceOfAt of each wallet — or, while no
 * block has been mined after that instant, the latest state, pinned to the latest block. The holders' register a
 * distribution is declared over must match it.
 */
export async function readTokenSnapshot(
  network: ChainNetwork,
  token: string,
  wallets: readonly string[],
  seconds: number,
): Promise<{ supply: number; balances: Map<string, number>; source: "history" | "latest"; blockNumber: bigint }> {
  const { publicClient } = rpcClients(network);
  const address = getAddress(token);
  await deployedAt(publicClient, address);
  const latest = await publicClient.getBlock({ blockTag: "latest" });
  const history = BigInt(seconds) < latest.timestamp;
  const blockNumber = latest.number;
  const abi = rwaxiPropertyTokenAbi;
  const at = BigInt(seconds);
  try {
    const supply = history
      ? await publicClient.readContract({ address, abi, functionName: "totalSupplyAt", args: [at], blockNumber })
      : await publicClient.readContract({ address, abi, functionName: "totalSupply", blockNumber });
    const units = await Promise.all(
      wallets.map((w) =>
        history
          ? publicClient.readContract({ address, abi, functionName: "balanceOfAt", args: [getAddress(w), at], blockNumber })
          : publicClient.readContract({ address, abi, functionName: "balanceOf", args: [getAddress(w)], blockNumber }),
      ),
    );
    return {
      supply: Number(supply),
      balances: new Map(wallets.map((w, i) => [w.toLowerCase(), Number(units[i])])),
      source: history ? "history" : "latest",
      blockNumber,
    };
  } catch (e) {
    console.error("[chain] token snapshot read failed", e);
    throw new ExecutionError(
      "Modo RPC: no se pudo leer el historial de saldos del token (balanceOfAt / totalSupplyAt); un token desplegado antes de esa versión del contrato no lo tiene.",
    );
  }
}

/** The units an offering's token holds on its network now (RPC): totalSupply() at the latest block. */
export async function readTokenSupply(network: ChainNetwork, token: string): Promise<number> {
  const { publicClient } = rpcClients(network);
  const address = getAddress(token);
  await deployedAt(publicClient, address);
  return Number(await publicClient.readContract({ address, abi: rwaxiPropertyTokenAbi, functionName: "totalSupply" }));
}

/** RwaxiComplianceRegistry's entry of each wallet (RPC): approved and frozen, as the token's isEligible() reads them. */
export async function readRegistryEntries(
  network: ChainNetwork,
  registry: string,
  wallets: readonly string[],
): Promise<Map<string, { approved: boolean; frozen: boolean }>> {
  const { publicClient } = rpcClients(network);
  const address = getAddress(registry);
  await deployedAt(publicClient, address);
  const entries = await Promise.all(
    wallets.map((w) => publicClient.readContract({ address, abi: rwaxiComplianceRegistryAbi, functionName: "investor", args: [getAddress(w)] })),
  );
  return new Map(wallets.map((w, i) => [w.toLowerCase(), { approved: entries[i]!.isApproved, frozen: entries[i]!.isFrozen }]));
}

// ───────────────────────────────────────────────────────── optional: the issuer signs its own mints

/** What a token's AccessControl says about a wallet (RPC): MINTER_ROLE, and DEFAULT_ADMIN_ROLE (it may grant it). */
export async function readIssuerRoles(network: ChainNetwork, token: string, wallet: string): Promise<{ minter: boolean; admin: boolean }> {
  const { publicClient } = rpcClients(network);
  const address = getAddress(token);
  const code = await publicClient.getCode({ address });
  if (!code || code === "0x") throw new ExecutionError("Modo RPC: no hay contrato desplegado en esa dirección de la red configurada.");
  const account = getAddress(wallet);
  const has = (role: Hex) => publicClient.readContract({ address, abi: rwaxiPropertyTokenAbi, functionName: "hasRole", args: [role, account] });
  const [minter, admin] = await Promise.all([has(MINTER_ROLE_ID), has(zeroHash)]);
  return { minter: minter === true, admin: admin === true };
}

/**
 * RPC mode, optional: queues grantRole(MINTER_ROLE, the administrator's registered wallet) on an offering's token, so
 * the issuer may sign its own mints in its browser wallet. Only once the token itself shows that this wallet holds
 * DEFAULT_ADMIN_ROLE and not MINTER_ROLE yet, and never for RWAXI's operator. That same wallet signs the grant
 * (WALLET_SIGNER_ROLE: DEFAULT_ADMIN_ROLE): RWAXI gains no role, and its own MINTER_ROLE stays as it was.
 */
export async function queueIssuerMinterGrant(
  organizationId: string,
  offeringId: string,
  wallet: string | null,
  actor: Actor,
  meta: RequestMeta,
): Promise<{ chainTxId: string; account: Address; offeringCode: string }> {
  if (executionMode() !== "RPC") {
    throw new ExecutionError("Otorgar MINTER_ROLE al emisor lo firma su wallet en modo RPC: en simulación no aplica.");
  }
  const account = signerWallet(wallet);
  if (lower(account) === lower(operatorAddress())) {
    throw new ExecutionError("MINTER_ROLE sólo se otorga a la wallet registrada del Administrador que lo firma.");
  }
  const offering = await withTenant(organizationId, (db) =>
    db.offering.findUnique({
      where: { id: offeringId },
      select: { id: true, code: true, token: { select: { contractAddress: true, network: true, status: true } } },
    }),
  );
  if (!offering) throw new ExecutionError("Oferta no encontrada en este tenant.");
  const token = offering.token;
  if (!token?.contractAddress || token.status === "NOT_DEPLOYED" || token.status === "DEPLOYING") {
    throw new ExecutionError("El token destino no está desplegado.");
  }
  const roles = await readIssuerRoles(token.network, token.contractAddress, account);
  if (roles.minter) throw new ExecutionError("Esa wallet ya tiene MINTER_ROLE en el token.");
  if (!roles.admin) {
    throw new ExecutionError("Tu wallet registrada {wallet} no tiene DEFAULT_ADMIN_ROLE en el token: sólo el administrador del emisor se otorga MINTER_ROLE.", {
      wallet: account,
    });
  }
  const contractAddress = token.contractAddress;
  return withTenant(
    organizationId,
    async (db) => {
      // One grant per wallet and token: concurrent requests are serialised here.
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rwaxi-minter-grant:${lower(contractAddress)}:${lower(account)}`}))`;
      const existing = await db.chainTransaction.findFirst({
        where: {
          kind: "MINTER_ROLE_GRANTED",
          contractAddress: { equals: contractAddress, mode: "insensitive" },
          status: { in: ["PENDING", "CONFIRMED"] },
          args: { path: ["account"], equals: account.toLowerCase() },
        },
        select: { status: true },
      });
      if (existing) {
        throw new ExecutionError(
          existing.status === "PENDING"
            ? msg("Prelación: ya hay un grantRole(MINTER_ROLE) pendiente para esa wallet.")
            : msg("Esa wallet ya tiene MINTER_ROLE en el token."),
        );
      }
      const now = new Date();
      const row = await db.chainTransaction.create({
        data: {
          organizationId,
          offeringId: offering.id,
          network: token.network,
          kind: "MINTER_ROLE_GRANTED",
          contractAddress,
          method: "grantRole(bytes32,address)",
          args: { role: MINTER_ROLE_ID, account: account.toLowerCase() },
          status: "PENDING",
          createdAt: now,
        },
      });
      const payload = {
        offeringCode: offering.code,
        token: contractAddress,
        network: token.network,
        role: "MINTER_ROLE",
        roleId: MINTER_ROLE_ID,
        account: account.toLowerCase(),
        signerRole: "DEFAULT_ADMIN_ROLE",
        // what the token said when the grant was queued
        onchain: { minter: roles.minter, admin: roles.admin },
        chainTransactionId: row.id,
      };
      await db.auditEvent.create({
        data: {
          organizationId,
          action: "MINTER_ROLE_REQUESTED",
          actorUserId: actor.id,
          actorEmail: actor.email,
          entityType: "ChainTransaction",
          entityId: row.id,
          subjectHash: evidenceHash({ action: "MINTER_ROLE_REQUESTED", organizationId, entityId: row.id, ...payload }),
          payload,
          ...meta,
          createdAt: now,
        },
      });
      return { chainTxId: row.id, account, offeringCode: offering.code };
    },
    TX_OPTIONS,
  );
}

/** Runs the tenant's PENDING rows oldest first; blocked rows are reported and skipped. */
export async function processQueue(
  organizationId: string,
  actorFor: (kind: string) => Actor,
  meta: RequestMeta,
  origin: ExecutionOrigin = "tenant",
): Promise<{ executed: Execution[]; skipped: { id: string; kind: string; reason: Reason }[] }> {
  const pending = await withTenant(organizationId, (db) =>
    db.chainTransaction.findMany({
      where: { status: "PENDING" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, kind: true },
    }),
  );
  const executed: Execution[] = [];
  const skipped: { id: string; kind: string; reason: Reason }[] = [];
  for (const p of pending) {
    try {
      executed.push(await executeChainTx(organizationId, p.id, actorFor(p.kind), meta, origin));
    } catch (e) {
      if (!(e instanceof ExecutionError)) throw e;
      skipped.push({ id: p.id, kind: p.kind, reason: e.reason });
    }
  }
  return { executed, skipped };
}
