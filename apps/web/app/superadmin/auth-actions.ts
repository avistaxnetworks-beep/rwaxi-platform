"use server";

/**
 * Staff login of the RWAXI console (admin.rwaxi.com): password, then TOTP, for organization-less SUPER_ADMIN
 * users (staff-auth.ts, PLATFORM scope). Only on the admin host; the console is in Spanish.
 */
import { headers } from "next/headers";
import { LocalizedError } from "@/app/_i18n/marks";
import { render } from "@/app/_i18n/server";
import { spanish } from "@/app/_i18n/translate";
import type { LoginActionResult, MfaActionResult } from "@/app/_components/auth/types";
import { completeLogin, endSession, startLogin } from "@/app/_lib/server/staff-auth";

const onAdminHost = async () => (await headers()).get("x-rwaxi-env") === "admin";
const WRONG_HOST = { ok: false as const, error: "La consola sólo está disponible en admin.rwaxi.com." };

function failure(e: unknown): { ok: false; error: string } {
  if (e instanceof LocalizedError) return { ok: false, error: render(spanish, e.reason) };
  console.error("[superadmin] login failed", e);
  return { ok: false, error: "No se pudo iniciar sesión. Inténtalo de nuevo." };
}

export async function consoleLogin(email: unknown, password: unknown): Promise<LoginActionResult> {
  if (!(await onAdminHost())) return WRONG_HOST;
  try {
    const result = await startLogin("PLATFORM", null, email, password);
    return result.ok ? result : { ok: false, error: render(spanish, result.error) };
  } catch (e) {
    return failure(e);
  }
}

export async function consoleVerify(code: unknown): Promise<MfaActionResult> {
  if (!(await onAdminHost())) return WRONG_HOST;
  try {
    const result = await completeLogin("PLATFORM", null, code);
    return result.ok ? result : { ok: false, error: render(spanish, result.error), restart: result.restart };
  } catch (e) {
    return failure(e);
  }
}

export async function consoleLogout(): Promise<{ ok: true }> {
  if (await onAdminHost()) await endSession("PLATFORM", null);
  return { ok: true };
}
