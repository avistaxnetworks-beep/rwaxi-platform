import "server-only";
import { headers } from "next/headers";
import { newToken, tokenHash, type Prisma } from "@rwaxi/database";
import { ROOT_DOMAIN } from "@/app/_lib/hosts";
import { queueMail, redactMailFor } from "./mail-outbox";

/**
 * Activation links of the staff accounts the B2B onboarding creates without a password (user_invitations).
 * The token travels only in the link (#token=… — a URL fragment never reaches servers or logs); the database
 * keeps its SHA-256, an expiry and whether it was used. Issued from the console, completed on the tenant host
 * (staff-activation.ts).
 */
export const INVITATION_TTL_H = 72;

export type InvitedRole = "TENANT_ADMIN" | "COMPLIANCE_OFFICER";
const ROLE_NAME: Record<InvitedRole, string> = {
  TENANT_ADMIN: "Administrador del tenant",
  COMPLIANCE_OFFICER: "Oficial de Cumplimiento",
};

/** https://{slug}.rwaxirealestate.com (http://{slug}.localhost:3000 in development), seen from the request issuing the link. */
export async function tenantOrigin(slug: string): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwarded || (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${slug}.${ROOT_DOMAIN}`;
}

const utc = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/**
 * A fresh activation link for a staff account without a password, in the caller's transaction: earlier unused
 * invitations of the user are revoked (their emails cleared), the new token is stored only as its SHA-256 and the
 * email (Spanish, as the console) goes to mail_outbox.
 */
export async function issueInvitation(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    tenant: { slug: string; displayName: string };
    user: { id: string; email: string; fullName: string; role: InvitedRole };
  },
): Promise<{ invitationId: string; expiresAt: Date; revoked: number }> {
  const now = new Date();
  const open = { userId: input.user.id, consumedAt: null, revokedAt: null };
  const previous = await tx.userInvitation.findMany({ where: open, select: { id: true } });
  const { count: revoked } = await tx.userInvitation.updateMany({ where: open, data: { revokedAt: now } });
  await redactMailFor(
    tx,
    previous.map((i) => i.id),
    "SUPERSEDED",
  );
  const token = newToken();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_H * 3600_000);
  const invitation = await tx.userInvitation.create({
    data: {
      organizationId: input.organizationId,
      userId: input.user.id,
      tokenHash: tokenHash(token),
      expiresAt,
    },
  });
  const link = `${await tenantOrigin(input.tenant.slug)}/backoffice/activate#token=${token}`;
  await queueMail(tx, {
    organizationId: input.organizationId,
    purpose: "STAFF_INVITATION",
    relatedId: invitation.id,
    expiresAt,
    to: input.user.email,
    subject: `Activa tu acceso al backoffice de ${input.tenant.displayName}`,
    body: [
      `Hola, ${input.user.fullName}:`,
      `RWAXI habilitó el backoffice de ${input.tenant.displayName} en su infraestructura White Label. Tu rol: ${ROLE_NAME[input.user.role]}.`,
      `Activa tu cuenta con este enlace personal (sirve una sola vez y vence el ${utc(expiresAt)}):\n${link}`,
      "Al activarla definirás tu contraseña y configurarás la verificación en dos pasos (TOTP) con una app de autenticación. Nadie de RWAXI te pedirá tu contraseña ni tus códigos.",
      "Si no esperabas este correo, ignóralo.",
    ].join("\n\n"),
  });
  return { invitationId: invitation.id, expiresAt, revoked };
}
