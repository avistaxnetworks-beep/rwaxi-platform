"use server";

/**
 * Activation of an invited staff account ({slug}.rwaxi.com/backoffice/activate#token=…): password, then the TOTP
 * enrolment confirmed by its first code (staff-activation.ts). The tenant comes from the host.
 */
import { LocalizedError } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import type { Translate } from "@/app/_i18n/translate";
import type { PasswordRule } from "@/app/_lib/password-policy";
import {
  WeakPasswordError,
  choosePassword,
  confirmActivation,
  inspectInvitation,
  type InvitationView,
} from "@/app/_lib/server/staff-activation";
import { requireHostTenant } from "@/app/_lib/server/tenant-context";

type Failure = { ok: false; error: string; failed?: PasswordRule[] };

function failure(e: unknown, tr: Translate): Failure {
  if (e instanceof WeakPasswordError) return { ok: false, error: render(tr, e.reason), failed: e.failed };
  if (e instanceof LocalizedError) return { ok: false, error: render(tr, e.reason) };
  console.error("[backoffice] activation failed", e);
  return { ok: false, error: tr("No se pudo activar la cuenta. Inténtalo de nuevo.") };
}

export async function inspectActivation(
  token: unknown,
): Promise<{ ok: true; invitation: InvitationView } | Failure> {
  const tr = await requestTranslate("tenant");
  try {
    return { ok: true, invitation: await inspectInvitation(await requireHostTenant(), token) };
  } catch (e) {
    return failure(e, tr);
  }
}

export async function setActivationPassword(
  token: unknown,
  password: unknown,
): Promise<{ ok: true; secret: string; uri: string } | Failure> {
  const tr = await requestTranslate("tenant");
  try {
    return { ok: true, ...(await choosePassword(await requireHostTenant(), token, password)) };
  } catch (e) {
    return failure(e, tr);
  }
}

export async function confirmActivationCode(token: unknown, code: unknown): Promise<{ ok: true } | Failure> {
  const tr = await requestTranslate("tenant");
  try {
    await confirmActivation(await requireHostTenant(), token, code);
    return { ok: true };
  } catch (e) {
    return failure(e, tr);
  }
}
