"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { listPublicOfferings, recordVitrinaAccess, resolveTenant } from "@rwaxi/database";
import { requestI18n, requestTranslate } from "@/app/_i18n/server";
import { makeTranslate } from "@/app/_i18n/translate";
import { signReferral } from "@/app/_lib/referral";
import { hitRateLimit, ipBucket } from "@/app/_lib/server/rate-limit";
import { requestMeta } from "@/app/_lib/server/tenant-context";
import { VITRINA_ACCESS_TERMS_VERSION, grantVitrinaAccess } from "@/app/_lib/server/vitrina-access";
import { VITRINA_WELCOME_MAIL, notifyVitrinaLead, sendVitrinaWelcome, vitrinaUrl } from "@/app/_lib/server/vitrina-notify";
import { VITRINA_CONSENTS, consentText, type ConsentKey } from "./_lib/access-terms";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Acceptances of the legal wall per IP address: generous for a shared office network, not for a script. */
const ACCESS_PER_IP = { windowSeconds: 15 * 60, max: 30 };

export type VitrinaAccessResult = { ok: true } | { ok: false; error: string };

/**
 * Legal wall of the vitrina, with granular consent: the visitor's email and the three mandatory consents (terms +
 * liability disclaimer, personal-data policy, cookie policy — each the SHA-256 of its text as shown, in the
 * visitor's language, plus their version) are recorded through rwaxi_record_vitrina_access(), then the vitrina is
 * unlocked with a signed HttpOnly cookie. www host only. Then, after the response, RWAXI's leads inbox is notified
 * (and, once VITRINA_WELCOME_MAIL is on, the investor gets their welcome): app/_lib/server/vitrina-notify.ts.
 */
export async function acceptVitrinaAccess(input: { email: string; consents: Record<ConsentKey, boolean> }): Promise<VitrinaAccessResult> {
  const { locale, catalog } = await requestI18n("vitrina");
  const tr = makeTranslate(locale, catalog);
  try {
    if ((await headers()).get("x-rwaxi-env") !== "www") return { ok: false, error: tr("El ingreso sólo se registra desde la vitrina.") };
    const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
    if (!EMAIL.test(email) || email.length > 254) return { ok: false, error: tr("Escribe un correo electrónico válido.") };
    // Each consent is its own decision: all three must be explicitly true.
    if (!VITRINA_CONSENTS.every((c) => input?.consents?.[c.key] === true)) {
      return { ok: false, error: tr("Debes aceptar las tres condiciones para ingresar.") };
    }

    const { ipAddress } = await requestMeta();
    if (ipAddress) {
      const wait = await hitRateLimit(ipBucket("vitrina-access", ipAddress), ACCESS_PER_IP.windowSeconds, ACCESS_PER_IP.max);
      if (wait > 0) return { ok: false, error: tr("Demasiados intentos desde esta red: espera {minutes} min y vuelve a intentarlo.", { minutes: Math.ceil(wait / 60) }) };
    }
    const sha256 = (s: string) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
    const consents = VITRINA_CONSENTS.map((c) => ({ key: c.key, text: consentText(tr, c), href: c.href }));
    const hashes = Object.fromEntries(consents.map((c) => [c.key, sha256(c.text)])) as Record<ConsentKey, string>;
    const id = await recordVitrinaAccess({
      email,
      termsVersion: VITRINA_ACCESS_TERMS_VERSION,
      termsSha256: hashes.terms,
      privacySha256: hashes.privacy,
      cookiesSha256: hashes.cookies,
      language: locale,
      ipHash: ipAddress ? sha256(ipAddress) : null,
    });
    const acceptedAt = new Date();
    await grantVitrinaAccess(id);

    // Emails go out after the response (after()): they never delay the visitor nor undo the recorded acceptance.
    try {
      const lead = { acceptanceId: id, email, acceptedAt, language: locale, termsVersion: VITRINA_ACCESS_TERMS_VERSION };
      notifyVitrinaLead(lead);
      if (VITRINA_WELCOME_MAIL) {
        const base = vitrinaUrl();
        sendVitrinaWelcome({ ...lead, consents: consents.map((c) => ({ key: c.key, text: c.text, url: base + c.href, sha256: hashes[c.key] })) });
      }
    } catch (e) {
      console.error("[vitrina] could not schedule the legal wall emails", e);
    }
    return { ok: true };
  } catch (e) {
    // 42883 (undefined function): the database lacks the migration that creates rwaxi_record_vitrina_access().
    if (String((e as Error)?.message).includes("42883")) {
      console.error("[vitrina] rwaxi_record_vitrina_access() does not exist: apply the migrations (pnpm db:deploy) and re-run pnpm db:provision-app-role");
    }
    console.error("[vitrina] legal wall acceptance failed", e);
    return { ok: false, error: tr("No se pudo registrar tu ingreso. Inténtalo de nuevo.") };
  }
}

export type ReferralIssue =
  | { ok: true; token: string; referralId: string; issuedAt: string }
  | { ok: false; error: string };

/**
 * Issues the signed ?ref= token for a click from the vitrina to a developer portal.
 * Only the www host issues tokens, only for ACTIVE portals listed in the vitrina with an offering
 * that is raising capital (ACTIVE and not paused by the platform), and the secret never leaves the server.
 */
export async function issueReferral(slug: string): Promise<ReferralIssue> {
  const tr = await requestTranslate("vitrina");
  try {
    if ((await headers()).get("x-rwaxi-env") !== "www") return { ok: false, error: tr("Los referidos sólo se emiten desde la vitrina.") };
    if (typeof slug !== "string" || !/^[a-z0-9-]{1,63}$/.test(slug)) return { ok: false, error: tr("Portal inválido.") };
    if (!process.env.REFERRAL_SECRET || process.env.REFERRAL_SECRET.length < 32) {
      return { ok: false, error: tr("Atribución deshabilitada: falta REFERRAL_SECRET en el servidor.") };
    }
    const tenant = await resolveTenant(slug);
    if (!tenant) return { ok: false, error: tr("Este desarrollador no existe en la red RWAXI.") };
    if (tenant.portalStatus !== "ACTIVE") return { ok: false, error: tr("El portal de este desarrollador no está disponible desde la vitrina.") };
    const listed = (await listPublicOfferings()).filter((o) => o.tenant.slug === tenant.slug);
    if (!listed.length) return { ok: false, error: tr("Este desarrollador no está publicado en la vitrina.") };
    if (listed.every((o) => o.status !== "ACTIVE")) {
      return { ok: false, error: tr("Este proyecto está en estructuración: la captación abrirá próximamente.") };
    }
    if (listed.every((o) => o.status !== "ACTIVE" || o.capturePaused)) {
      return { ok: false, error: tr("La captación de este proyecto está pausada temporalmente.") };
    }

    const token = await signReferral(tenant.slug, process.env.REFERRAL_SECRET);
    const [referralId = "", , issued = "0"] = token.split(".");
    return { ok: true, token, referralId, issuedAt: new Date(Number(issued)).toISOString() };
  } catch (e) {
    console.error("[vitrina] referral issue failed", e);
    return { ok: false, error: tr("No se pudo generar el enlace al portal. Inténtalo de nuevo.") };
  }
}
