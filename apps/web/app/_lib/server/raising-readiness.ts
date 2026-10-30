// What deploying an offering's token and opening its capital raise require of the developer, checked the same way
// by the Super-Admin console (deployOfferingToken) and the backoffice (setOfferingStatus → ACTIVE): the tenant's
// RwaxiComplianceRegistry deployed, the official wallets declared (administrator and compliance officer, distinct,
// never RWAXI's operator) and an active compliance officer assigned. Pure: raising-readiness.test.ts runs it.
import { msg } from "@/app/_i18n/marks";

export type ReadinessGap = "registry" | "adminWallet" | "officer" | "officerWallet" | "sameWallet" | "operatorWallet";

export interface ReadinessStaff {
  role: string;
  active: boolean;
  walletAddress: string | null;
}

/** Why the gap blocks, as the backoffice and the console show it. */
export const READINESS_GAP: Record<ReadinessGap, string> = {
  registry: msg("El registro de cumplimiento (RwaxiComplianceRegistry) del tenant aún no está desplegado."),
  adminWallet: msg("Falta la wallet oficial del Administrador del desarrollador."),
  officer: msg("No hay un Oficial de Cumplimiento activo asignado al desarrollador."),
  officerWallet: msg("Falta la wallet oficial del Oficial de Cumplimiento."),
  sameWallet: msg("El Administrador y el Oficial de Cumplimiento deben tener wallets distintas."),
  operatorWallet: msg("Una wallet oficial del desarrollador no puede ser la del operador RWAXI."),
};

const WALLET = /^0x[0-9a-fA-F]{40}$/;

/** The requirements still missing (empty: ready), in the order they have to be met. */
export function readinessGaps(input: {
  complianceRegistry: string | null;
  staff: ReadinessStaff[];
  /** RWAXI's operator address, when known: it may never be one of the developer's official wallets */
  operator?: string | null;
}): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];
  const active = input.staff.filter((u) => u.active);
  const admin = active.find((u) => u.role === "TENANT_ADMIN" && u.walletAddress && WALLET.test(u.walletAddress));
  const officer = active.find((u) => u.role === "COMPLIANCE_OFFICER");
  const officerWallet = active.find((u) => u.role === "COMPLIANCE_OFFICER" && u.walletAddress && WALLET.test(u.walletAddress));
  if (!input.complianceRegistry) gaps.push("registry");
  if (!admin) gaps.push("adminWallet");
  if (!officer) gaps.push("officer");
  else if (!officerWallet) gaps.push("officerWallet");
  const a = admin?.walletAddress?.toLowerCase();
  const o = officerWallet?.walletAddress?.toLowerCase();
  if (a && o && a === o) gaps.push("sameWallet");
  const op = input.operator?.toLowerCase();
  if (op && (a === op || o === op)) gaps.push("operatorWallet");
  return gaps;
}

/** The official wallets the token is deployed with (null unless both are ready). */
export function officialWallets(staff: ReadinessStaff[]): { tenantAdmin: string; complianceOfficer: string } | null {
  const active = staff.filter((u) => u.active && u.walletAddress && WALLET.test(u.walletAddress));
  const admin = active.find((u) => u.role === "TENANT_ADMIN");
  const officer = active.find((u) => u.role === "COMPLIANCE_OFFICER");
  return admin && officer ? { tenantAdmin: admin.walletAddress!.toLowerCase(), complianceOfficer: officer.walletAddress!.toLowerCase() } : null;
}
