import "server-only";
import crypto from "node:crypto";
import { evidenceHash } from "@rwaxi/blockchain-sdk/canonical";
import { forTenant, newNumericCode, withTenant, type Prisma, type ResolvedTenant } from "@rwaxi/database";
import type { Translate } from "@/app/_i18n/translate";
import { recoveryCodeKey, startInvestorSession } from "./investor-session";
import { queueMail, redactMailFor } from "./mail-outbox";
import { TenantAccessError, requestMeta } from "./tenant-context";

/**
 * Recovery of an investor's portal session on another browser or device: a 6-digit code sent to the email
 * that signed the NDA. Without it, writing someone else's email in the NDA gets nobody into their process.
 *
 *   · only the code's HMAC is stored (investor_otps); it expires after TTL_MIN minutes and is single-use;
 *   · every guess spends one of MAX_ATTEMPTS attempts before the comparison, atomically, so concurrent guesses
 *     never share one; a new request supersedes the previous code;
 *   · at most PER_15_MIN codes per 15 minutes and PER_DAY per day for an investor, and PER_IP requests per hour
 *     from an address — silently: the answer is the same whether or not the email exists;
 *   · the email goes to mail_outbox; recovering writes INVESTOR_SESSION_RECOVERED, a burnt code INVESTOR_OTP_FAILED;
 *     the mail of a code that is used, burnt or replaced loses its body at once (redactMailFor).
 */
const TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const PER_15_MIN = 3;
const PER_DAY = 10;
const PER_IP = 10;
const MINUTE = 60_000;

const normalize = (raw: unknown) => (typeof raw === "string" ? raw.trim().toLowerCase().slice(0, 254) : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hashOf = (organizationId: string, investorId: string, code: string) =>
  crypto
    .createHmac("sha256", recoveryCodeKey())
    .update(`${organizationId}:${investorId}:${code}`)
    .digest("hex");

/** Shown for any code that does not open the session (wrong, expired, burnt, unknown email). */
export class RecoveryError extends TenantAccessError {}
const invalid = () => new RecoveryError("Código incorrecto o vencido. Pide un código nuevo si lo necesitas.");

async function auditRecovery(
  db: Prisma.TransactionClient,
  tenant: ResolvedTenant,
  investor: { id: string; email: string },
  action: "INVESTOR_SESSION_RECOVERED" | "INVESTOR_OTP_FAILED",
  details: Record<string, unknown>,
) {
  const meta = await requestMeta();
  // The hash covers the stored payload, so anyone can recompute it from the row.
  const payload = { email: investor.email, ...details };
  await db.auditEvent.create({
    data: {
      organizationId: tenant.id,
      action,
      actorUserId: null,
      actorEmail: investor.email,
      entityType: "Investor",
      entityId: investor.id,
      subjectHash: evidenceHash({ action, organizationId: tenant.id, entityId: investor.id, ...payload }),
      payload: payload as Prisma.InputJsonValue,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });
}

/** Sends a code when the email belongs to an investor of this portal; otherwise does nothing, identically. */
export async function requestRecoveryCode(
  tenant: ResolvedTenant,
  rawEmail: unknown,
  tr: Translate,
): Promise<void> {
  const email = normalize(rawEmail);
  if (!EMAIL.test(email)) throw new RecoveryError("Escribe el correo con el que firmaste el NDA.");
  const db = forTenant(tenant.id);
  const investor = await db.investor.findUnique({
    where: { organizationId_email: { organizationId: tenant.id, email } },
    select: { id: true, fullName: true, email: true },
  });
  if (!investor?.email) return;
  const meta = await requestMeta();
  const now = Date.now();
  const since = (minutes: number) => ({ gte: new Date(now - minutes * MINUTE) });
  const [recent, today, fromIp] = await Promise.all([
    db.investorOtp.count({ where: { investorId: investor.id, createdAt: since(15) } }),
    db.investorOtp.count({ where: { investorId: investor.id, createdAt: since(24 * 60) } }),
    meta.ipAddress ? db.investorOtp.count({ where: { ipAddress: meta.ipAddress, createdAt: since(60) } }) : 0,
  ]);
  if (recent >= PER_15_MIN || today >= PER_DAY || fromIp >= PER_IP) return;

  const code = newNumericCode();
  const vars = { name: investor.fullName, code, portal: tenant.displayName };
  await withTenant(tenant.id, async (tx) => {
    // A new code supersedes any previous one still valid (and its mail is cleared).
    const live = { investorId: investor.id, consumedAt: null, expiresAt: { gt: new Date(now) } };
    const superseded = await tx.investorOtp.findMany({ where: live, select: { id: true } });
    await tx.investorOtp.updateMany({ where: live, data: { expiresAt: new Date(now) } });
    await redactMailFor(
      tx,
      superseded.map((o) => o.id),
      "SUPERSEDED",
    );
    const otp = await tx.investorOtp.create({
      data: {
        organizationId: tenant.id,
        investorId: investor.id,
        codeHash: hashOf(tenant.id, investor.id, code),
        expiresAt: new Date(now + TTL_MIN * MINUTE),
        ipAddress: meta.ipAddress,
      },
    });
    await queueMail(tx, {
      organizationId: tenant.id,
      purpose: "INVESTOR_OTP",
      relatedId: otp.id,
      expiresAt: otp.expiresAt,
      to: investor.email!,
      subject: tr("Tu código para recuperar tu sesión en {portal}", vars),
      body: [
        tr("Hola, {name}:", vars),
        tr("Tu código de verificación es {code}. Vence en 10 minutos y sirve una sola vez.", vars),
        tr("Si no lo pediste, ignora este correo: sin el código nadie puede entrar a tu proceso.", vars),
        `${tenant.displayName} · Powered by RWAXI`,
      ].join("\n\n"),
    });
  });
}

/** Opens the investor's signed session of this portal (rwaxi_inv) when the code is the current one. */
export async function verifyRecoveryCode(
  tenant: ResolvedTenant,
  rawEmail: unknown,
  rawCode: unknown,
): Promise<void> {
  const email = normalize(rawEmail);
  const code = typeof rawCode === "string" ? rawCode.replace(/\s/g, "") : "";
  if (!EMAIL.test(email) || !/^\d{6}$/.test(code)) throw invalid();
  const investor = await forTenant(tenant.id).investor.findUnique({
    where: { organizationId_email: { organizationId: tenant.id, email } },
    select: { id: true, email: true },
  });
  if (!investor?.email) throw invalid();
  const subject = { id: investor.id, email: investor.email };

  const recovered = await withTenant(tenant.id, async (tx) => {
    // The guess spends an attempt of the current code first; the row stays locked until this transaction ends.
    const [otp] = await tx.$queryRaw<{ id: string; code_hash: string; attempts: number }[]>`
      UPDATE investor_otps SET attempts = attempts + 1
       WHERE id = (SELECT id FROM investor_otps
                    WHERE investor_id = ${investor.id} AND consumed_at IS NULL AND expires_at > now()
                    ORDER BY created_at DESC LIMIT 1)
         AND consumed_at IS NULL AND expires_at > now() AND attempts < ${MAX_ATTEMPTS}
      RETURNING id, code_hash, attempts`;
    if (!otp) return false;
    const expected = Buffer.from(otp.code_hash);
    const received = Buffer.from(hashOf(tenant.id, investor.id, code));
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
      if (otp.attempts >= MAX_ATTEMPTS) {
        // Burnt: it also reads as expired, and its mail is cleared.
        await tx.investorOtp.update({ where: { id: otp.id }, data: { expiresAt: new Date() } });
        await redactMailFor(tx, [otp.id], "EXPIRED");
        await auditRecovery(tx, tenant, subject, "INVESTOR_OTP_FAILED", {
          otpId: otp.id,
          attempts: otp.attempts,
        });
      }
      return false;
    }
    await tx.investorOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    await redactMailFor(tx, [otp.id], "CONSUMED");
    await auditRecovery(tx, tenant, subject, "INVESTOR_SESSION_RECOVERED", { otpId: otp.id });
    return true;
  });
  if (!recovered) throw invalid();
  await startInvestorSession(investor.id, tenant.id);
}
