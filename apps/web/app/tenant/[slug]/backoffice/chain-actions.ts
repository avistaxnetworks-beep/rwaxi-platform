"use server";

/**
 * Execution of the tenant's ChainTransaction queue, from the backoffice and the On-Chain Inspector.
 *
 * Who authorises each call mirrors the contracts' roles: registry operations (approveInvestor…)
 * the compliance officer, mintSubscription the administrator who reconciled the payment. The
 * executor enforces precedence and the contract invariants (see chain-executor.ts): SIMULATION
 * signs with OPERATOR_PRIVATE_KEY and never broadcasts; RPC only sends what RWAXI may sign.
 */
import { revalidatePath } from "next/cache";
import { forTenant, isUniqueViolation } from "@rwaxi/database";
import { LocalizedError } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import type { Translate } from "@/app/_i18n/translate";
import {
  ExecutionError,
  confirmExternalTransaction,
  executeChainTx,
  processQueue,
  type Execution,
} from "@/app/_lib/server/chain-executor";
import { TenantAccessError, requestMeta, requireHostTenant } from "@/app/_lib/server/tenant-context";
import { requireBackofficeSession, type BackofficeRole } from "./_lib/session";
import type { ActionResult, QueueRunResult } from "./_lib/types";

const CUID = /^[a-z0-9]{20,40}$/i;
const REGISTRY_KINDS = new Set(["INVESTOR_WHITELISTED", "INVESTOR_REVOKED", "INVESTOR_FREEZE_UPDATED"]);
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
    mode: ex.mode === "SIMULATION" ? tr("simulación firmada, nonce {nonce}", { nonce: ex.nonce }) : tr("en red"),
    hash: `${ex.txHash.slice(0, 10)}…${ex.txHash.slice(-6)}`,
  });

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
    const officer = await requireBackofficeSession("COMPLIANCE_OFFICER");
    const admin = await requireBackofficeSession("TENANT_ADMIN");
    const { executed, skipped } = await processQueue(
      admin.tenant.id,
      (kind) => (roleFor(kind) === "COMPLIANCE_OFFICER" ? officer : admin).reviewer,
      await requestMeta(),
    );
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
