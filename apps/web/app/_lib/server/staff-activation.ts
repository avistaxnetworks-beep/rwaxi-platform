import "server-only";
import {
  base32,
  forTenant,
  hashPassword,
  newTotpSecret,
  openSecret,
  otpauthUri,
  sealSecret,
  tokenHash,
  verifyTotp,
  withTenant,
  type ResolvedTenant,
} from "@rwaxi/database";
import { passwordFailures, type PasswordRule } from "@/app/_lib/password-policy";
import { redactMailFor } from "./mail-outbox";
import { audit, openVerifiedSession, setSessionCookie } from "./staff-auth";
import { TenantAccessError, requestMeta } from "./tenant-context";

/**
 * Activation of a staff account from its invitation link ({slug}.rwaxirealestate.com/backoffice/activate#token=…), under
 * the host tenant's RLS (a token of another tenant is not found):
 *   1. choosePassword(): the policy (password-policy.ts) re-applied here; the scrypt hash and a new TOTP secret
 *      are parked on the invitation — the account still has neither;
 *   2. confirm(): the first code of the authenticator app proves the enrolment; in one transaction the
 *      invitation is used, the account gets password + MFA and a verified session opens (ACCOUNT_ACTIVATED,
 *      MFA_ENROLLED, LOGIN_SUCCEEDED). The person lands in the backoffice already signed in.
 */
export class ActivationError extends TenantAccessError {}
export class WeakPasswordError extends ActivationError {
  failed: PasswordRule[] = [];
}

const TOKEN = /^[\w-]{20,100}$/;
const invalid = () =>
  new ActivationError("Este enlace de activación no es válido, ya se usó o venció. Pide uno nuevo a RWAXI.");

async function invitationOf(tenant: ResolvedTenant, rawToken: unknown) {
  if (typeof rawToken !== "string" || !TOKEN.test(rawToken)) throw invalid();
  const invitation = await forTenant(tenant.id).userInvitation.findUnique({
    where: { tokenHash: tokenHash(rawToken) },
    include: {
      user: {
        select: { id: true, email: true, fullName: true, role: true, active: true, passwordHash: true },
      },
    },
  });
  if (
    !invitation ||
    invitation.consumedAt ||
    invitation.revokedAt ||
    invitation.expiresAt.getTime() <= Date.now()
  )
    throw invalid();
  if (!invitation.user.active || invitation.user.passwordHash) throw invalid();
  if (invitation.user.role !== "TENANT_ADMIN" && invitation.user.role !== "COMPLIANCE_OFFICER")
    throw invalid();
  return invitation;
}

export interface InvitationView {
  name: string;
  email: string;
  role: "TENANT_ADMIN" | "COMPLIANCE_OFFICER";
  expiresAt: string;
  /** step 1 already done: the TOTP enrolment is waiting for its code */
  enrolling: boolean;
}

export async function inspectInvitation(tenant: ResolvedTenant, token: unknown): Promise<InvitationView> {
  const inv = await invitationOf(tenant, token);
  return {
    name: inv.user.fullName,
    email: inv.user.email,
    role: inv.user.role as InvitationView["role"],
    expiresAt: inv.expiresAt.toISOString(),
    enrolling: !!inv.pendingPasswordHash,
  };
}

/** Step 1: checks the password and parks it (hashed) with a new TOTP secret; returns the secret to enrol. */
export async function choosePassword(
  tenant: ResolvedTenant,
  token: unknown,
  rawPassword: unknown,
): Promise<{ secret: string; uri: string }> {
  const inv = await invitationOf(tenant, token);
  const password = typeof rawPassword === "string" ? rawPassword : "";
  const failed = passwordFailures(password, [
    inv.user.fullName,
    inv.user.email,
    tenant.displayName,
    tenant.slug,
  ]);
  if (failed.length) {
    const error = new WeakPasswordError("La contraseña no cumple la política de seguridad.");
    error.failed = failed;
    throw error;
  }
  const secret = newTotpSecret();
  const passwordHash = await hashPassword(password);
  const updated = await withTenant(tenant.id, (tx) =>
    tx.userInvitation.updateMany({
      where: { id: inv.id, consumedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { pendingPasswordHash: passwordHash, pendingTotpSecretEnc: sealSecret(secret, inv.user.id) },
    }),
  );
  if (updated.count !== 1) throw invalid();
  return { secret: base32(secret), uri: otpauthUri(secret, inv.user.email) };
}

/** Step 2: the first TOTP code activates the account and opens its session. */
export async function confirmActivation(
  tenant: ResolvedTenant,
  token: unknown,
  rawCode: unknown,
): Promise<void> {
  const inv = await invitationOf(tenant, token);
  if (!inv.pendingPasswordHash || !inv.pendingTotpSecretEnc)
    throw new ActivationError("Define primero tu contraseña.");
  const code = typeof rawCode === "string" ? rawCode.replace(/\s/g, "") : "";
  const step = verifyTotp(openSecret(inv.pendingTotpSecretEnc, inv.user.id), code);
  if (step === null)
    throw new ActivationError("Código incorrecto. Revisa la hora de tu dispositivo e inténtalo de nuevo.");

  const meta = await requestMeta();
  const session = await withTenant(
    tenant.id,
    async (tx) => {
      const now = new Date();
      // Both transitions are conditional: a second tab with the same link (or a resent one) loses.
      const used = await tx.userInvitation.updateMany({
        where: {
          id: inv.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
          pendingPasswordHash: inv.pendingPasswordHash,
          pendingTotpSecretEnc: inv.pendingTotpSecretEnc,
        },
        data: { consumedAt: now, pendingPasswordHash: null, pendingTotpSecretEnc: null },
      });
      const activated = await tx.user.updateMany({
        where: { id: inv.user.id, passwordHash: null, active: true },
        data: {
          passwordHash: inv.pendingPasswordHash,
          totpSecretEnc: inv.pendingTotpSecretEnc,
          mfaEnrolledAt: now,
          totpLastStep: step,
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: now,
        },
      });
      if (used.count !== 1 || activated.count !== 1) throw invalid();
      // The link is spent: its email keeps only its delivery metadata.
      await redactMailFor(tx, [inv.id], "CONSUMED");
      const opened = await openVerifiedSession(tx, "TENANT", tenant.id, inv.user.id, meta);
      const user = { id: inv.user.id, email: inv.user.email };
      await audit(tx, "TENANT", tenant.id, meta, {
        action: "ACCOUNT_ACTIVATED",
        user,
        email: user.email,
        payload: { invitationId: inv.id, role: inv.user.role, sessionId: opened.id },
      });
      await audit(tx, "TENANT", tenant.id, meta, {
        action: "MFA_ENROLLED",
        user,
        email: user.email,
        payload: { sessionId: opened.id },
      });
      await audit(tx, "TENANT", tenant.id, meta, {
        action: "LOGIN_SUCCEEDED",
        user,
        email: user.email,
        payload: { sessionId: opened.id, role: inv.user.role },
      });
      return opened;
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  await setSessionCookie(session.token, session.maxAgeMs);
}
