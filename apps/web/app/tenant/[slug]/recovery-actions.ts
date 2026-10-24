"use server";

/** Portal session recovery by a one-time code sent to the investor's email (investor-recovery.ts). */
import { LocalizedError } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import { requestRecoveryCode, verifyRecoveryCode } from "@/app/_lib/server/investor-recovery";
import { requireHostTenant } from "@/app/_lib/server/tenant-context";

type Result = { ok: true; message: string } | { ok: false; error: string };

async function attempt(fn: () => Promise<string>): Promise<Result> {
  const tr = await requestTranslate("tenant");
  try {
    return { ok: true, message: await fn() };
  } catch (e) {
    if (e instanceof LocalizedError) return { ok: false, error: render(tr, e.reason) };
    console.error("[portal] session recovery failed", e);
    return { ok: false, error: tr("No se pudo completar la recuperación. Inténtalo de nuevo.") };
  }
}

export async function requestSessionCode(email: unknown): Promise<Result> {
  return attempt(async () => {
    const tr = await requestTranslate("tenant");
    await requestRecoveryCode(await requireHostTenant(), email, tr);
    return tr(
      "Si ese correo tiene un proceso en este portal, te enviamos un código de 6 dígitos. Vence en 10 minutos.",
    );
  });
}

export async function verifySessionCode(email: unknown, code: unknown): Promise<Result> {
  return attempt(async () => {
    const tr = await requestTranslate("tenant");
    await verifyRecoveryCode(await requireHostTenant(), email, code);
    return tr("Sesión recuperada.");
  });
}
