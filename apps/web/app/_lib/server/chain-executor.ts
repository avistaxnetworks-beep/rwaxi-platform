import "server-only";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  getContractAddress,
  http,
  keccak256,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { RWAXI_CHAINS, rwaxiComplianceRegistryAbi, rwaxiPropertyTokenAbi, rwaxiTenantFactoryAbi } from "@rwaxi/blockchain-sdk";
import { withTenant, type ChainNetwork, type ChainTransaction, type Prisma } from "@rwaxi/database";
import { LocalizedError, msg, type Reason } from "@/app/_i18n/marks";
import { TENANT_SIGNED_KINDS, blockerReason, loadChainState, type ExecutionOrigin } from "./chain-invariants";
import { calldataOf, walletOf } from "./chain-queue";

/**
 * Ordered execution of a tenant's ChainTransaction outbox.
 *
 *   SIMULATION (default)  checks the contracts' invariants against the confirmed history of the
 *                         outbox, signs a real EIP-1559 transaction with OPERATOR_PRIVATE_KEY
 *                         (RFC 6979 signature, global sequential nonce, fixed gas) and never
 *                         broadcasts it: txHash = keccak256(signedTransaction).
 *   RPC (CHAIN_EXECUTION=rpc)  sends the calls RWAXI may sign (mintSubscription · MINTER_ROLE) to
 *                         RPC_URL_<NETWORK>. Registry calls belong to the tenant's compliance officer:
 *                         they sign with their own wallet and the hash is registered afterwards
 *                         (confirmExternalTransaction), never signed by RWAXI.
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
  /** contract created by the call (deployTenantRegistry → the tenant's RwaxiComplianceRegistry) */
  created: Address | null;
}

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };
const RECEIPT_TIMEOUT_MS = 60_000;
const GWEI = 1_000_000_000n;
const GAS: Record<string, bigint> = {
  approveInvestor: 120_000n,
  revokeInvestor: 80_000n,
  setFrozen: 80_000n,
  mintSubscription: 220_000n,
  anchorDistributionRoot: 90_000n,
  deployTenantRegistry: 2_500_000n,
};

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
        nonce: ex.nonce,
        blockNumber: ex.blockNumber?.toString() ?? null,
        created: ex.created,
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
  if (blocker) throw new ExecutionError(blocker.source, blocker.vars);
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
      const [next] = await db.$queryRaw<{ nonce: number }[]>`
        SELECT rwaxi_next_simulated_nonce(${tx.network}::"ChainNetwork", ${account.address}) AS nonce`;
      const nonce = Number(next?.nonce ?? 0);
      let created: Address | null = null;
      if (tx.kind === "TENANT_REGISTRY_DEPLOYED") {
        // The factory deploys with CREATE: its nonce is 1 + the contracts it already created on this network
        // (only the operator calls it, so the signer lock above also serialises this count).
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
      };
      await finalize(db, tx, ex, actor, meta);
      return ex;
    },
    TX_OPTIONS,
  );
}

type PublicRpc = ReturnType<typeof rpcClients>["publicClient"];

/** Receipt of a broadcast row → CONFIRMED, or REVERTED. Without a receipt yet the row stays claimed. */
async function settle(
  organizationId: string,
  tx: ChainTransaction,
  hash: Hex,
  fn: string,
  actor: Actor,
  meta: RequestMeta,
  publicClient: PublicRpc,
  wait: boolean,
): Promise<Execution> {
  const receipt = await (
    wait ? publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS }) : publicClient.getTransactionReceipt({ hash })
  ).catch(() => null);
  if (!receipt) throw new ExecutionError("Envío RPC en curso ({hash}): aún sin recibo; «Procesar cola en orden» lo concilia.", { hash });
  if (receipt.status !== "success") {
    await withTenant(organizationId, (db) =>
      db.chainTransaction.updateMany({
        where: { id: tx.id, status: "PENDING" },
        data: { status: "REVERTED", blockNumber: receipt.blockNumber, executedAt: new Date(), error: "reverted on-chain" },
      }),
    );
    throw new ExecutionError("La transacción revirtió en la red ({hash}).", { hash });
  }
  const sent = await publicClient.getTransaction({ hash });
  const deployed =
    tx.kind === "TENANT_REGISTRY_DEPLOYED"
      ? parseEventLogs({ abi: rwaxiTenantFactoryAbi, logs: receipt.logs, eventName: "TenantRegistryDeployed" }).find(
          (e) => lower(e.address) === lower(tx.contractAddress) && lower(e.args.organizationId) === lower(argsOf(tx.args).organizationId),
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
    created: deployed ? getAddress(deployed.args.registry) : null,
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
  // Sent earlier but its receipt was not awaited: reconcile it, never send it again.
  if (row.status === "PENDING" && row.executionMode === "RPC" && row.txHash) {
    const { publicClient } = rpcClients(row.network);
    return settle(organizationId, row, row.txHash as Hex, calldataOf(row)?.fn ?? row.method, actor, meta, publicClient, false);
  }

  // Claim the row (executionMode set while PENDING) so a concurrent run cannot send it twice.
  const { tx, encoded, clients } = await withTenant(
    organizationId,
    async (db) => {
      const prepared = await prepare(db, chainTxId, undefined, origin);
      if (TENANT_SIGNED_KINDS.has(prepared.tx.kind)) {
        throw new ExecutionError(
          prepared.tx.kind === "DISTRIBUTION_ROOT_ANCHORED"
            ? msg("Modo RPC: el emisor firma anchorDistributionRoot con su propia wallet (RWAXI no custodia DISTRIBUTION_ROLE); registra luego su tx hash.")
            : prepared.tx.kind === "DATA_ROOM_ROOT_ANCHORED"
              ? msg("Modo RPC: el emisor firma updateDataRoomMerkleRoot con su propia wallet (RWAXI no custodia DATA_ROOM_ROLE); registra luego su tx hash.")
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
  const account = operator();
  return executionMode() === "SIMULATION"
    ? simulate(organizationId, chainTxId, actor, meta, account, origin)
    : broadcast(organizationId, chainTxId, actor, meta, account, origin);
}

/**
 * RPC mode, tenant-signed calls: registers the hash of an approveInvestor() the compliance officer —
 * or an anchorDistributionRoot() the issuer — signed with their own wallet, once the receipt shows
 * it succeeded and emitted InvestorWhitelisted / DistributionRootAnchored from the queued contract
 * with exactly the queued arguments.
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
    throw new ExecutionError("Sólo approveInvestor(), anchorDistributionRoot() y updateDataRoomMerkleRoot() se registran por hash.");
  }
  const { publicClient } = rpcClients(tx.network);
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hex });
  if (receipt.status !== "success") throw new ExecutionError("Esa transacción no fue exitosa en la red.");
  const args = argsOf(tx.args);
  const fromQueued = (address: string) => lower(address) === lower(tx.contractAddress);
  const match =
    tx.kind === "INVESTOR_WHITELISTED"
      ? parseEventLogs({ abi: rwaxiComplianceRegistryAbi, logs: receipt.logs, eventName: "InvestorWhitelisted" }).some(
          (e) =>
            fromQueued(e.address) &&
            lower(e.args.wallet) === lower(args.wallet) &&
            e.args.countryCode === Number(args.countryCode) &&
            lower(e.args.kycDossierHash) === lower(args.kycDossierHash),
        )
      : tx.kind === "DATA_ROOM_ROOT_ANCHORED"
        ? parseEventLogs({ abi: rwaxiPropertyTokenAbi, logs: receipt.logs, eventName: "DataRoomMerkleRootAnchored" }).some(
            (e) => fromQueued(e.address) && lower(e.args.newRoot) === lower(args.newRoot),
          )
        : parseEventLogs({ abi: rwaxiPropertyTokenAbi, logs: receipt.logs, eventName: "DistributionRootAnchored" }).some(
            (e) =>
              fromQueued(e.address) &&
              lower(e.args.distributionId) === lower(args.distributionId) &&
              lower(e.args.merkleRoot) === lower(args.merkleRoot) &&
              e.args.totalAmountCents === BigInt(String(args.totalAmountCents)) &&
              e.args.snapshotSupply === BigInt(String(args.snapshotSupply)),
          );
  if (!match) {
    const eventName =
      tx.kind === "INVESTOR_WHITELISTED"
        ? "InvestorWhitelisted"
        : tx.kind === "DATA_ROOM_ROOT_ANCHORED"
          ? "DataRoomMerkleRootAnchored"
          : "DistributionRootAnchored";
    throw new ExecutionError("La transacción no emitió {event} con los argumentos en cola.", { event: eventName });
  }
  const sent = await publicClient.getTransaction({ hash: txHash as Hex });
  const ex: Execution = {
    id: tx.id,
    kind: tx.kind,
    fn:
      tx.kind === "INVESTOR_WHITELISTED"
        ? "approveInvestor"
        : tx.kind === "DATA_ROOM_ROOT_ANCHORED"
          ? "updateDataRoomMerkleRoot"
          : "anchorDistributionRoot",
    txHash: txHash as Hex,
    blockNumber: receipt.blockNumber,
    mode: "RPC",
    signer: getAddress(sent.from),
    nonce: sent.nonce,
    signedTransaction: null,
    created: null,
  };
  await withTenant(organizationId, (db) => finalize(db, tx, ex, actor, meta), TX_OPTIONS);
  return ex;
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
