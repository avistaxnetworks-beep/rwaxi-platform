"use server";

/**
 * Staff login of the developer backoffice ({slug}.rwaxi.com/backoffice): password, then TOTP (staff-auth.ts).
 * The tenant comes from the host; an account of another tenant is simply not found under its RLS.
 */
import { LocalizedError } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import type { Translate } from "@/app/_i18n/translate";
import type { LoginActionResult, MfaActionResult } from "@/app/_components/auth/types";
import { completeLogin, endSession, startLogin } from "@/app/_lib/server/staff-auth";
import { requireHostTenant } from "@/app/_lib/server/tenant-context";

function failure(e: unknown, tr: Translate): { ok: false; error: string } {
  if (e instanceof LocalizedError) return { ok: false, error: render(tr, e.reason) };
  console.error("[backoffice] login failed", e);
  return { ok: false, error: tr("No se pudo iniciar sesión. Inténtalo de nuevo.") };
}

export async function backofficeLogin(email: unknown, password: unknown): Promise<LoginActionResult> {
  const tr = await requestTranslate("tenant");
  try {
    const tenant = await requireHostTenant();
    const result = await startLogin("TENANT", tenant.id, email, password);
    return result.ok ? result : { ok: false, error: render(tr, result.error) };
  } catch (e) {
    return failure(e, tr);
  }
}

export async function backofficeVerify(code: unknown): Promise<MfaActionResult> {
  const tr = await requestTranslate("tenant");
  try {
    const tenant = await requireHostTenant();
    const result = await completeLogin("TENANT", tenant.id, code);
    return result.ok ? result : { ok: false, error: render(tr, result.error), restart: result.restart };
  } catch (e) {
    return failure(e, tr);
  }
}

export async function backofficeLogout(): Promise<{ ok: true }> {
  const tenant = await requireHostTenant().catch(() => null);
  if (tenant) await endSession("TENANT", tenant.id);
  return { ok: true };
}
