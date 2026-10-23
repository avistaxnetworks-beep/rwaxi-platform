"use server";

import { headers } from "next/headers";
import { listPublicOfferings, resolveTenant } from "@rwaxi/database";
import { signReferral } from "@/app/_lib/referral";

export type ReferralIssue =
  | { ok: true; token: string; referralId: string; issuedAt: string }
  | { ok: false; error: string };

/**
 * Issues the signed ?ref= token for a click from the vitrina to a developer portal.
 * Only the www host issues tokens, only for ACTIVE portals listed in the vitrina with an offering
 * that is raising capital (not paused by the platform), and the secret never leaves the server.
 */
export async function issueReferral(slug: string): Promise<ReferralIssue> {
  try {
    if ((await headers()).get("x-rwaxi-env") !== "www") return { ok: false, error: "Los referidos sólo se emiten desde la vitrina." };
    if (typeof slug !== "string" || !/^[a-z0-9-]{1,63}$/.test(slug)) return { ok: false, error: "Portal inválido." };
    if (!process.env.REFERRAL_SECRET || process.env.REFERRAL_SECRET.length < 32) {
      return { ok: false, error: "Atribución deshabilitada: falta REFERRAL_SECRET en el servidor." };
    }
    const tenant = await resolveTenant(slug);
    if (!tenant) return { ok: false, error: "Este desarrollador no existe en la red RWAXI." };
    if (tenant.portalStatus !== "ACTIVE") return { ok: false, error: "El portal de este desarrollador no está disponible desde la vitrina." };
    const listed = (await listPublicOfferings()).filter((o) => o.tenant.slug === tenant.slug);
    if (!listed.length) return { ok: false, error: "Este desarrollador no está publicado en la vitrina." };
    if (listed.every((o) => o.capturePaused)) return { ok: false, error: "La captación de este proyecto está pausada temporalmente." };

    const token = await signReferral(tenant.slug, process.env.REFERRAL_SECRET);
    const [referralId = "", , issued = "0"] = token.split(".");
    return { ok: true, token, referralId, issuedAt: new Date(Number(issued)).toISOString() };
  } catch (e) {
    console.error("[vitrina] referral issue failed", e);
    return { ok: false, error: "No se pudo generar el enlace al portal. Inténtalo de nuevo." };
  }
}
