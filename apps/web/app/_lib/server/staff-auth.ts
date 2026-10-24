import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { evidenceHash } from "@rwaxi/blockchain-sdk/canonical";
import {
  base32,
  forTenant,
  newToken,
  newTotpSecret,
  openSecret,
  otpauthUri,
  platformPrisma,
  sealSecret,
  tokenHash,
  transaction,
  verifyPassword,
  verifyTotp,
  withTenant,
  type AuditAction,
  type Prisma,
  type UserRole,
} from "@rwaxi/database";
import { reason, type Reason } from "@/app/_i18n/marks";
import { TenantAccessError, requestMeta } from "./tenant-context";

/**
 * Staff authentication of the developer backoffice (TENANT scope, one organization) and the RWAXI console
 * (PLATFORM scope, organization-less staff): password (scrypt) + TOTP (RFC 6238), sessions in Neon.
 *
 *   · The rwaxi_session cookie (HttpOnly, host-only) holds an opaque token; user_sessions keeps its SHA-256.
 *     TENANT sessions are read under the host tenant's RLS, so a session of another tenant is never found.
 *   · Login = password, then a 6-digit TOTP (or its enrolment). The token is rotated when the MFA step passes.
 *   · LOCK_AFTER consecutive failures (password or code) lock the account for LOCK_MINUTES; an IP with
 *     IP_LIMIT failures in IP_WINDOW_MIN minutes is refused. Every outcome is an AuditEvent.
 *   · The demo session (RWAXI_DEMO_AUTH; default outside production) only applies without a real session,
 *     and a browser can opt out of it (DEMO_OPT_OUT_COOKIE=off): the auth E2E suite tests the real gates.
 */
export const SESSION_COOKIE = "rwaxi_session";
export const DEMO_OPT_OUT_COOKIE = "rwaxi_demo_auth";

export type StaffScope = "TENANT" | "PLATFORM";
export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}
export interface StaffSession {
  id: string;
  scope: StaffScope;
  organizationId: string | null;
  user: StaffUser;
}

const STAFF_ROLES: Record<StaffScope, readonly UserRole[]> = {
  TENANT: ["TENANT_ADMIN", "COMPLIANCE_OFFICER", "TENANT_ANALYST"],
  PLATFORM: ["SUPER_ADMIN"],
};
const MINUTE = 60_000;
const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const IP_WINDOW_MIN = 15;
const IP_LIMIT = 30;
const MFA_ATTEMPTS = 5;
const PENDING_TTL = 5 * MINUTE;
const TTL: Record<StaffScope, number> = { TENANT: 8 * 60 * MINUTE, PLATFORM: 4 * 60 * MINUTE };
const IDLE: Record<StaffScope, number> = { TENANT: 60 * MINUTE, PLATFORM: 30 * MINUTE };
const FAILED_ACTIONS: AuditAction[] = ["LOGIN_FAILED", "MFA_FAILED"];

type Db = Prisma.TransactionClient;
type Meta = Awaited<ReturnType<typeof requestMeta>>;

/** A failure shown to the person signing in, in their language. */
export class AuthError extends TenantAccessError {}

/** The demo session may act for this request: RWAXI_DEMO_AUTH (default: outside production), unless opted out. */
export async function demoAuthActive(): Promise<boolean> {
  const flag = process.env.RWAXI_DEMO_AUTH;
  const enabled = flag ? flag === "1" : process.env.NODE_ENV !== "production";
  return enabled && (await cookies()).get(DEMO_OPT_OUT_COOKIE)?.value !== "off";
}

/** Runs `fn` on the scope's client: the tenant's RLS-bound transaction, or the console's BYPASSRLS one. */
function inScope<T>(
  scope: StaffScope,
  organizationId: string | null,
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  return scope === "TENANT"
    ? withTenant(organizationId!, fn, { maxWait: 10_000, timeout: 15_000 })
    : transaction(platformPrisma(), fn);
}

export async function setSessionCookie(token: string, maxAgeMs: number) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  });
}

async function readToken(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token && /^[\w-]{20,100}$/.test(token) ? token : null;
}

const USER_FIELDS = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  active: true,
  organizationId: true,
  passwordHash: true,
  totpSecretEnc: true,
  mfaEnrolledAt: true,
  totpLastStep: true,
  lockedUntil: true,
} satisfies Prisma.UserSelect;

/** The session row for the cookie's token, read with the scope's visibility (another tenant's is not found). */
async function sessionRow(scope: StaffScope, organizationId: string | null, token: string) {
  const where = { tokenHash: tokenHash(token) };
  const include = { user: { select: USER_FIELDS } };
  const row =
    scope === "TENANT"
      ? await forTenant(organizationId!).userSession.findUnique({ where, include })
      : await platformPrisma().userSession.findUnique({ where, include });
  return row && row.scope === scope && row.organizationId === organizationId ? row : null;
}

/**
 * The authenticated staff session of this request for `scope` (and the host tenant), or null: missing,
 * pending MFA, revoked, expired, idle too long, inactive user or a role outside the scope. Cached per request.
 */
export const currentStaff = cache(
  async (scope: StaffScope, organizationId: string | null): Promise<StaffSession | null> => {
    const token = await readToken();
    if (!token) return null;
    const row = await sessionRow(scope, organizationId, token).catch(() => null);
    const now = Date.now();
    if (!row || row.revokedAt || !row.mfaVerifiedAt || row.expiresAt.getTime() <= now) return null;
    if (now - row.lastSeenAt.getTime() > IDLE[scope]) return null;
    if (!row.user.active || !STAFF_ROLES[scope].includes(row.user.role)) return null;
    if (now - row.lastSeenAt.getTime() > MINUTE) {
      // Sliding idle window, written at most once a minute; a failure here never blocks the request.
      await inScope(scope, organizationId, (db) =>
        db.userSession.update({ where: { id: row.id }, data: { lastSeenAt: new Date(now) } }),
      ).catch(() => undefined);
    }
    const { id, email, fullName, role } = row.user;
    return { id: row.id, scope, organizationId, user: { id, email, fullName, role } };
  },
);

/** An AuditEvent of staff authentication (also used by the account activation, staff-activation.ts). */
export async function audit(
  db: Db,
  scope: StaffScope,
  organizationId: string | null,
  meta: Meta,
  e: {
    action: AuditAction;
    user: { id: string; email: string } | null;
    email: string;
    payload: Record<string, unknown>;
  },
) {
  const entityId = e.user?.id ?? "unknown";
  const payload = { scope, email: e.email, ...e.payload };
  await db.auditEvent.create({
    data: {
      organizationId,
      action: e.action,
      actorUserId: e.user?.id ?? null,
      actorEmail: e.email.slice(0, 254),
      entityType: "User",
      entityId,
      subjectHash: evidenceHash({ action: e.action, organizationId, entityId, ...payload }),
      payload: payload as Prisma.InputJsonValue,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });
}

/** Failed attempts from this IP in the window (password or code), within the scope's audit trail. */
async function recentFailures(scope: StaffScope, organizationId: string | null, ip: string): Promise<number> {
  const where = {
    action: { in: FAILED_ACTIONS },
    ipAddress: ip,
    createdAt: { gte: new Date(Date.now() - IP_WINDOW_MIN * MINUTE) },
  };
  return scope === "TENANT"
    ? forTenant(organizationId!).auditEvent.count({ where })
    : platformPrisma().auditEvent.count({ where: { ...where, organizationId: null } });
}

/** Counts a failed factor; the LOCK_AFTER-th locks the account. Returns whether it is now locked. */
async function registerFailure(
  db: Db,
  scope: StaffScope,
  organizationId: string | null,
  meta: Meta,
  user: { id: string; email: string } | null,
  email: string,
  factor: "password" | "totp",
): Promise<boolean> {
  let locked = false;
  if (user) {
    const { failedLoginCount } = await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (failedLoginCount >= LOCK_AFTER) {
      await db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * MINUTE) },
      });
      locked = true;
    }
  }
  await audit(db, scope, organizationId, meta, {
    action: factor === "password" ? "LOGIN_FAILED" : "MFA_FAILED",
    user,
    email,
    payload: { factor, failures: locked ? LOCK_AFTER : undefined },
  });
  if (locked) {
    await audit(db, scope, organizationId, meta, {
      action: "ACCOUNT_LOCKED",
      user,
      email,
      payload: { minutes: LOCK_MINUTES },
    });
  }
  return locked;
}

const lockedReason = (until: Date) =>
  reason("Cuenta bloqueada temporalmente por intentos fallidos. Inténtalo de nuevo en {minutes} min.", {
    minutes: Math.max(1, Math.ceil((until.getTime() - Date.now()) / MINUTE)),
  });

export type LoginStart =
  | { ok: true; step: "mfa" }
  | { ok: true; step: "enroll"; secret: string; uri: string }
  | { ok: false; error: Reason };

/**
 * First factor: email + password. On success the browser gets a pending session for the TOTP step
 * (PENDING_TTL); an account without MFA gets a fresh secret to enrol, confirmed by that same step.
 */
export async function startLogin(
  scope: StaffScope,
  organizationId: string | null,
  rawEmail: unknown,
  rawPassword: unknown,
): Promise<LoginStart> {
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase().slice(0, 254) : "";
  const password = typeof rawPassword === "string" ? rawPassword.slice(0, 256) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
    return { ok: false, error: reason("Escribe tu correo y tu contraseña.") };
  }
  const meta = await requestMeta();
  if (meta.ipAddress && (await recentFailures(scope, organizationId, meta.ipAddress)) >= IP_LIMIT) {
    return { ok: false, error: reason("Demasiados intentos fallidos desde esta red. Espera unos minutos.") };
  }
  const user =
    scope === "TENANT"
      ? await forTenant(organizationId!).user.findUnique({ where: { email }, select: USER_FIELDS })
      : await platformPrisma().user.findFirst({
          where: { email, organizationId: null },
          select: USER_FIELDS,
        });
  const staff = user && user.active && STAFF_ROLES[scope].includes(user.role) ? user : null;
  // Always verified (against a dummy hash without account): the answer takes the same time either way.
  const valid = await verifyPassword(password, staff?.passwordHash);

  if (staff?.lockedUntil && staff.lockedUntil.getTime() > Date.now()) {
    await inScope(scope, organizationId, (db) =>
      audit(db, scope, organizationId, meta, {
        action: "LOGIN_FAILED",
        user: staff,
        email,
        payload: { factor: "password", locked: true },
      }),
    );
    return { ok: false, error: lockedReason(staff.lockedUntil) };
  }
  if (!staff || !valid) {
    const locked = await inScope(scope, organizationId, (db) =>
      registerFailure(db, scope, organizationId, meta, staff, email, "password"),
    );
    return locked
      ? { ok: false, error: lockedReason(new Date(Date.now() + LOCK_MINUTES * MINUTE)) }
      : { ok: false, error: reason("Correo o contraseña incorrectos.") };
  }

  const token = newToken();
  const enrolment = staff.mfaEnrolledAt && staff.totpSecretEnc ? null : newTotpSecret();
  await inScope(scope, organizationId, async (db) => {
    await db.userSession.create({
      data: {
        organizationId,
        userId: staff.id,
        scope,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + PENDING_TTL),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    // Not enrolled yet: a new secret waits for its first valid code (overwrites any abandoned enrolment).
    if (enrolment) {
      await db.user.update({
        where: { id: staff.id },
        data: { totpSecretEnc: sealSecret(enrolment, staff.id), mfaEnrolledAt: null },
      });
    }
  });
  await setSessionCookie(token, PENDING_TTL);
  return enrolment
    ? { ok: true, step: "enroll", secret: base32(enrolment), uri: otpauthUri(enrolment, email) }
    : { ok: true, step: "mfa" };
}

/** Second factor: the TOTP code of the pending session. Rotates the token and opens the session. */
export async function completeLogin(
  scope: StaffScope,
  organizationId: string | null,
  rawCode: unknown,
): Promise<{ ok: true } | { ok: false; error: Reason; restart?: boolean }> {
  const code = typeof rawCode === "string" ? rawCode.replace(/\s/g, "") : "";
  const expired = {
    ok: false as const,
    error: reason("Tu acceso venció. Vuelve a escribir tu contraseña."),
    restart: true,
  };
  const token = await readToken();
  if (!token) return expired;
  const meta = await requestMeta();
  const row = await sessionRow(scope, organizationId, token);
  if (!row || row.revokedAt || row.mfaVerifiedAt || row.expiresAt.getTime() <= Date.now()) return expired;
  const user = row.user;
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now())
    return { ok: false, error: lockedReason(user.lockedUntil), restart: true };

  let step: number | null = null;
  try {
    step = user.totpSecretEnc
      ? verifyTotp(openSecret(user.totpSecretEnc, user.id), code, { after: user.totpLastStep ?? -1 })
      : null;
  } catch (e) {
    console.error("[auth] TOTP secret could not be opened", e);
  }
  if (step === null) {
    const { locked, closed } = await inScope(scope, organizationId, async (db) => {
      const attempts = row.mfaAttempts + 1;
      const closed = attempts >= MFA_ATTEMPTS;
      await db.userSession.update({
        where: { id: row.id },
        data: { mfaAttempts: attempts, revokedAt: closed ? new Date() : undefined },
      });
      return {
        locked: await registerFailure(db, scope, organizationId, meta, user, user.email, "totp"),
        closed,
      };
    });
    if (locked)
      return { ok: false, error: lockedReason(new Date(Date.now() + LOCK_MINUTES * MINUTE)), restart: true };
    if (closed)
      return {
        ...expired,
        error: reason("Demasiados códigos incorrectos. Vuelve a escribir tu contraseña."),
      };
    return {
      ok: false,
      error: reason("Código incorrecto. Revisa la hora de tu dispositivo e inténtalo de nuevo."),
    };
  }

  const fresh = newToken();
  const enrolling = !user.mfaEnrolledAt;
  const opened = await inScope(scope, organizationId, async (db) => {
    const now = new Date();
    // Both transitions are conditional: a parallel request with the same session or the same code loses.
    const session = await db.userSession.updateMany({
      where: { id: row.id, mfaVerifiedAt: null, revokedAt: null },
      data: {
        tokenHash: tokenHash(fresh),
        mfaVerifiedAt: now,
        expiresAt: new Date(now.getTime() + TTL[scope]),
        lastSeenAt: now,
      },
    });
    const account = await db.user.updateMany({
      where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step! } }] },
      data: {
        totpLastStep: step!,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
        ...(enrolling ? { mfaEnrolledAt: now } : {}),
      },
    });
    if (session.count !== 1 || account.count !== 1)
      throw new AuthError("Ese código ya se usó. Espera el siguiente e inténtalo de nuevo.");
    if (enrolling)
      await audit(db, scope, organizationId, meta, {
        action: "MFA_ENROLLED",
        user,
        email: user.email,
        payload: { sessionId: row.id },
      });
    await audit(db, scope, organizationId, meta, {
      action: "LOGIN_SUCCEEDED",
      user,
      email: user.email,
      payload: { sessionId: row.id, role: user.role },
    });
    return true;
  }).catch((e) => {
    if (e instanceof AuthError) return e;
    throw e;
  });
  if (opened instanceof AuthError) return { ok: false, error: opened.reason };
  await setSessionCookie(fresh, TTL[scope]);
  return { ok: true };
}

/**
 * A session already verified with both factors, for a person who just proved them outside the login form (the
 * account activation sets the password and confirms the first TOTP code). The caller sets the cookie.
 */
export async function openVerifiedSession(
  db: Db,
  scope: StaffScope,
  organizationId: string | null,
  userId: string,
  meta: Meta,
): Promise<{ id: string; token: string; maxAgeMs: number }> {
  const token = newToken();
  const now = new Date();
  const row = await db.userSession.create({
    data: {
      organizationId,
      userId,
      scope,
      tokenHash: tokenHash(token),
      mfaVerifiedAt: now,
      expiresAt: new Date(now.getTime() + TTL[scope]),
      lastSeenAt: now,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });
  return { id: row.id, token, maxAgeMs: TTL[scope] };
}

/** Revokes the browser's session of this scope (verified or still pending) and forgets the cookie. */
export async function endSession(scope: StaffScope, organizationId: string | null): Promise<void> {
  const token = await readToken();
  const row = token ? await sessionRow(scope, organizationId, token).catch(() => null) : null;
  if (row && !row.revokedAt) {
    const meta = await requestMeta();
    await inScope(scope, organizationId, async (db) => {
      await db.userSession.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
      if (row.mfaVerifiedAt) {
        await audit(db, scope, organizationId, meta, {
          action: "LOGOUT",
          user: row.user,
          email: row.user.email,
          payload: { sessionId: row.id },
        });
      }
    });
  }
  (await cookies()).delete(SESSION_COOKIE);
}

/** May this request read the backoffice's data of `organizationId`: a staff session of it, or the demo session. */
export async function backofficeAccess(organizationId: string): Promise<boolean> {
  return (await currentStaff("TENANT", organizationId)) !== null || (await demoAuthActive());
}

// ── who acts on the console ─────────────────────────────────────────────────────

export interface PlatformActor {
  user: { id: string; email: string; fullName: string };
  demo: boolean;
}

/**
 * The console's actor on the admin host: the signed-in SUPER_ADMIN (password + MFA), or — never in
 * production — the demo session (first active SUPER_ADMIN) while it is enabled. Null otherwise.
 */
export const platformActor = cache(async (): Promise<PlatformActor | null> => {
  if ((await headers()).get("x-rwaxi-env") !== "admin") return null;
  const staff = await currentStaff("PLATFORM", null);
  if (staff) return { user: staff.user, demo: false };
  if (process.env.NODE_ENV === "production" || !(await demoAuthActive())) return null;
  const admin = await platformPrisma().user.findFirst({
    where: { role: "SUPER_ADMIN", active: true, organizationId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, fullName: true },
  });
  return admin ? { user: admin, demo: true } : null;
});

/** Gate of every console read and action (platformPrisma, BYPASSRLS): admin host and a console session. */
export async function requirePlatformAccess(): Promise<PlatformActor> {
  if ((await headers()).get("x-rwaxi-env") !== "admin") {
    throw new TenantAccessError("Los datos consolidados sólo están disponibles en admin.rwaxi.com.");
  }
  const actor = await platformActor();
  if (!actor) throw new TenantAccessError("Inicia sesión en la consola RWAXI para continuar.");
  return actor;
}
