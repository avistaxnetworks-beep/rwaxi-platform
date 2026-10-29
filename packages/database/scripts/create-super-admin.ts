/**
 * Creates a RWAXI console account (SUPER_ADMIN, no organization) on the database of DIRECT_URL, with a random
 * temporary password printed once on this terminal and no TOTP: the first sign-in at admin.<domain>/login asks for
 * the password, then enrols an authenticator app (scan the QR, confirm its first code). Nothing else is touched.
 *
 *   DIRECT_URL="postgresql://…" tsx scripts/create-super-admin.ts \
 *     --email persona@empresa.com --name "Nombre Apellido" --confirm-host <host of DIRECT_URL> [--reset-password]
 *
 * --confirm-host must equal the host of DIRECT_URL: a guard against writing to the wrong database. An existing
 * email is refused unless --reset-password (new password, MFA cleared, account unlocked, sessions revoked).
 */
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "../src/credentials";
import { DEMO_PASSWORD } from "../prisma/seed-data/credentials";

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!#%+-_=?";

/** 20 characters with every class the staff password policy asks for (app/_lib/password-policy.ts). */
function temporaryPassword(personal: string[]): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  for (;;) {
    const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
    while (chars.length < 20) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const password = chars.join("");
    const folded = password.toLowerCase();
    const words = ["rwaxi", ...personal.flatMap((p) => p.toLowerCase().split(/[^a-z0-9]+/)).filter((w) => w.length >= 4)];
    if (!words.some((w) => folded.includes(w))) return password;
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const value = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const email = value("--email")?.trim().toLowerCase();
  const fullName = value("--name")?.trim();
  const confirmHost = value("--confirm-host")?.trim().toLowerCase();
  const reset = args.includes("--reset-password");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("--email <corporate email> is required");
  if (!fullName || fullName.length < 3) throw new Error('--name "<full name>" is required');

  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("DIRECT_URL (owner connection of the target database) is not set");
  const host = new URL(url).hostname.toLowerCase();
  if (confirmHost !== host) throw new Error(`--confirm-host must be the host of DIRECT_URL (${host})`);

  const db = new PrismaClient({ datasourceUrl: url });
  try {
    // A database with the seed's public demo password is not fit for real staff: report it before anything else.
    const seeded = await db.user.findMany({ where: { passwordHash: { not: null } }, select: { email: true, passwordHash: true } });
    const demo: string[] = [];
    for (const u of seeded) if (await verifyPassword(DEMO_PASSWORD, u.passwordHash)) demo.push(u.email);
    if (demo.length) {
      console.warn(`⚠ ${demo.length} cuenta(s) de esta base usan la contraseña demo pública (seed): ${demo.join(", ")}`);
      console.warn("  Esta base parece la de desarrollo/E2E (el seed la reinicia). Revisa que sea la de producción.");
    }

    const existing = await db.user.findUnique({ where: { email }, select: { id: true, role: true, organizationId: true } });
    if (existing && !reset) throw new Error(`${email} already exists (role ${existing.role}); use --reset-password to issue a new one`);
    if (existing && (existing.role !== "SUPER_ADMIN" || existing.organizationId)) {
      throw new Error(`${email} exists but is not an organization-less SUPER_ADMIN (role ${existing.role}): not changed`);
    }

    const password = temporaryPassword([email, fullName]);
    const passwordHash = await hashPassword(password);
    const user = await db.$transaction(async (tx) => {
      if (existing) {
        await tx.userSession.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } });
        return tx.user.update({
          where: { id: existing.id },
          data: {
            fullName,
            active: true,
            passwordHash,
            totpSecretEnc: null,
            mfaEnrolledAt: null,
            totpLastStep: null,
            failedLoginCount: 0,
            lockedUntil: null,
          },
        });
      }
      return tx.user.create({ data: { email, fullName, role: "SUPER_ADMIN", organizationId: null, passwordHash } });
    });

    console.log(`✔ ${existing ? "contraseña restablecida" : "cuenta creada"}: ${user.email} (SUPER_ADMIN) en ${host}`);
    console.log(`  Contraseña temporal (sólo se muestra ahora): ${password}`);
    console.log("  Primer acceso: admin.<dominio>/login → correo + contraseña → enrola tu app de autenticación (QR) y");
    console.log("  confirma su primer código de 6 dígitos.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
