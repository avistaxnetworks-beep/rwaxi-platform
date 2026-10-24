"use server";

/**
 * Execution of the tenant's ChainTransaction queue, from the backoffice and the On-Chain Inspector.
 *
 * Who authorises each call mirrors the contracts' roles: registry operations (approveInvestor…)
 * the compliance officer, mintSubscription the administrator who reconciled the payment. The
 * executor enforces precedence and the contract invariants (see chain-executor.ts): SIMULATION
 * signs with OPERATOR_PRIVATE_KEY and never broadcasts; RPC only sends what RWAXI may sign, and
 * the tenant's staff sign theirs in their browser wallet (EIP-1193, prepare → sign → confirm).
 */
import { revalidatePath } from "next/cache";
import { forTenant, isUniqueViolation } from "@rwaxi/database";
import { LocalizedError } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import type { Translate } from "@/app/_i18n/translate";
import {
  ExecutionError,
  confirmExternalTransaction,
  confirmWalletCall,
  executeChainTx,
  prepareWalletCall,
  processQueue,
  queueIssuerMinterGrant,
  type Execution,
} from "@/app/_lib/server/chain-executor";
import { REGISTRY_KINDS } from "@/app/_lib/server/chain-invariants";
import { TenantAccessError, requestMeta, requireHostTenant } from "@/app/_lib/server/tenant-context";
import { ROLE_LABEL, requireBackofficeSession, type BackofficeRole, type BackofficeSession } from "./_lib/session";
import type { ActionResult, QueueRunResult, WalletConfirmResult, WalletPrepareResult } from "./_lib/types";

const CUID = /^[a-z0-9]{20,40}$/i;
/** Offering ids: cuid, or the readable ids of the demo seed (off_avista). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const roleFor = (kind: string): BackofficeRole => (REGISTRY_KINDS.has(kind) ? "COMPLIANCE_OFFICER" : "TENANT_ADMIN");

function failure(e: unknown, tr: Translate): { ok: false; error: string } {
  if (e instanceof LocalizedError) return { ok: false, error: render(tr, e.reason) };
  if (isUniqueViolation(e)) {
    return { ok: false, error: tr("Otra ejecución tomó ese nonce o tx hash primero; vuelve a intentarlo.") };
  }
  console.error("[backoffice] chain execution failed", e);
  return { ok: false, error: tr("No se pudo ejecutar la transacción. Inténtalo de nuevo.") };
}

// Confirmations change the backoffice desk, the compliance inbox and the investor's portfolio.
const refresh = () => {
  revalidatePath("/tenant/[slug]/backoffice", "page");
  revalidatePath("/tenant/[slug]", "page");
};

const done = (ex: Execution, tr: Translate) =>
  tr("{fn}() confirmada · {mode} · tx {hash}", {
    fn: ex.fn,
    mode:
      ex.mode === "SIMULATION"
        ? tr("simulación firmada, nonce {nonce}", { nonce: ex.nonce })
        : ex.via === "wallet"
          ? tr("en red, firmada con tu wallet")
          : tr("en red"),
    hash: `${ex.txHash.slice(0, 10)}…${ex.txHash.slice(-6)}`,
  });

/** The registered wallet of the signed-in staff member (or of the demo session's user for that role). */
async function walletOfSigner(session: BackofficeSession): Promise<string | null> {
  const user = await forTenant(session.tenant.id).user.findUnique({
    where: { id: session.reviewer.id },
    select: { walletAddress: true },
  });
  return user?.walletAddress ?? null;
}

async function kindOf(chainTxId: string): Promise<string> {
  if (typeof chainTxId !== "string" || !CUID.test(chainTxId)) throw new ExecutionError("Transacción inválida.");
  const tenant = await requireHostTenant();
  const row = await forTenant(tenant.id).chainTransaction.findUnique({ where: { id: chainTxId }, select: { kind: true } });
  if (!row) throw new ExecutionError("Transacción no encontrada en este tenant.");
  return row.kind;
}

/** Signs and confirms one PENDING row if precedence and the contract invariants allow it. */
export async function executeChainTransaction(chainTxId: string): Promise<ActionResult> {
  const tr = await requestTranslate("tenant");
  try {
    const session = await requireBackofficeSession(roleFor(await kindOf(chainTxId)));
    const ex = await executeChainTx(session.tenant.id, chainTxId, session.reviewer, await requestMeta());
    refresh();
    return { ok: true, message: done(ex, tr) };
  } catch (e) {
    return failure(e, tr);
  }
}

/** Runs every PENDING row of the tenant oldest first; rows still blocked are reported, not forced. */
export async function processChainQueue(): Promise<QueueRunResult> {
  const tr = await requestTranslate("tenant");
  try {
    // A signed-in staff member runs the rows of their own role; the others are reported, never forced.
    // The demo session holds both roles.
    const viewer = await requireBackofficeSession("TENANT_ADMIN", { view: true });
    const actors: Partial<Record<BackofficeRole, { id: string; email: string }>> = viewer.demo
      ? {
          COMPLIANCE_OFFICER: (await requireBackofficeSession("COMPLIANCE_OFFICER")).reviewer,
          TENANT_ADMIN: viewer.reviewer,
        }
      : viewer.role === "TENANT_ANALYST"
        ? {}
        : { [viewer.role]: viewer.reviewer };
    const run = await processQueue(
      viewer.tenant.id,
      (kind) => {
        const role = roleFor(kind);
        const actor = actors[role];
        if (!actor) {
          throw new ExecutionError("La firma el rol {role}: inicia sesión con ese rol para ejecutarla.", { role: ROLE_LABEL[role] });
        }
        return actor;
      },
      await requestMeta(),
    );
    const executed = run.executed;
    const skipped = run.skipped.map((s) => ({ ...s, reason: render(tr, s.reason) }));
    if (executed.length) refresh();
    const message = executed.length
      ? skipped.length
        ? tr("Cola procesada en orden: {done} confirmada(s) · {blocked} bloqueada(s)", { done: executed.length, blocked: skipped.length, count: executed.length })
        : tr("Cola procesada en orden: {done} confirmada(s)", { done: executed.length, count: executed.length })
      : skipped.length
        ? tr("Nada ejecutable: {blocked} transacción(es) bloqueada(s)", { blocked: skipped.length, count: skipped.length })
        : tr("La cola no tiene transacciones pendientes.");
    return { ok: true, message, executed: executed.length, skipped };
  } catch (e) {
    return failure(e, tr);
  }
}

/** RPC mode: registers a call the tenant signed with its own wallet (registry: the compliance officer; anchorDistributionRoot: the issuer). */
export async function registerOfficerTransaction(chainTxId: string, txHash: string): Promise<ActionResult> {
  const tr = await requestTranslate("tenant");
  try {
    const session = await requireBackofficeSession(roleFor(await kindOf(chainTxId)));
    const ex = await confirmExternalTransaction(session.tenant.id, chainTxId, String(txHash).trim(), session.reviewer, await requestMeta());
    refresh();
    return { ok: true, message: done(ex, tr) };
  } catch (e) {
    return failure(e, tr);
  }
}

/**
 * EIP-1193, step 1: the exact call the role that signs this row must send from its browser wallet (to, data,
 * chainId, expected account). The server checks the account's role on-chain; it never handles a private key.
 */
export async function prepareWalletTransaction(chainTxId: string): Promise<WalletPrepareResult> {
  const tr = await requestTranslate("tenant");
  try {
    const session = await requireBackofficeSession(roleFor(await kindOf(chainTxId)));
    return { ok: true, call: await prepareWalletCall(session.tenant.id, chainTxId, await walletOfSigner(session)) };
  } catch (e) {
    return failure(e, tr);
  }
}

/**
 * EIP-1193, step 2: the tx hash the browser wallet returned. Confirmed only once the node shows that exact
 * transaction (signer, contract, calldata) with a successful receipt; until a receipt exists it stays claimed.
 */
export async function confirmWalletTransaction(chainTxId: string, txHash: string): Promise<WalletConfirmResult> {
  const tr = await requestTranslate("tenant");
  try {
    const session = await requireBackofficeSession(roleFor(await kindOf(chainTxId)));
    const outcome = await confirmWalletCall(
      session.tenant.id,
      chainTxId,
      String(txHash).trim(),
      await walletOfSigner(session),
      session.reviewer,
      await requestMeta(),
    );
    refresh();
    if (outcome.state === "pending") {
      return {
        ok: true,
        pending: true,
        txHash: outcome.hash,
        message: tr("Transacción enviada ({hash}): aún sin recibo en la red; verifícala en unos segundos.", {
          hash: `${outcome.hash.slice(0, 10)}…${outcome.hash.slice(-6)}`,
        }),
      };
    }
    return { ok: true, pending: false, txHash: outcome.execution.txHash, message: done(outcome.execution, tr) };
  } catch (e) {
    return failure(e, tr);
  }
}

/**
 * Optional, RPC mode: the issuer's administrator queues grantRole(MINTER_ROLE) on an offering's token for its own
 * registered wallet, then signs it in the queue with that same wallet (DEFAULT_ADMIN_ROLE of the token). From then
 * on it may sign that token's mints itself (EIP-1193); RWAXI's operator keeps only the MINTER_ROLE it already had.
 */
export async function requestIssuerMinterRole(offeringId: string): Promise<ActionResult> {
  const tr = await requestTranslate("tenant");
  try {
    if (typeof offeringId !== "string" || !ID.test(offeringId)) throw new ExecutionError("Oferta inválida.");
    const session = await requireBackofficeSession("TENANT_ADMIN");
    const queued = await queueIssuerMinterGrant(
      session.tenant.id,
      offeringId,
      await walletOfSigner(session),
      session.reviewer,
      await requestMeta(),
    );
    refresh();
    return {
      ok: true,
      message: tr("grantRole(MINTER_ROLE) en cola para tu wallet {wallet} en el token de {code}: fírmalo con esa wallet en la cola on-chain.", {
        wallet: `${queued.account.slice(0, 8)}…${queued.account.slice(-6)}`,
        code: queued.offeringCode,
      }),
    };
  } catch (e) {
    return failure(e, tr);
  }
}
