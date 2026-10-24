import "server-only";
import { headers } from "next/headers";
import { backofficeAccess, platformActor } from "./staff-auth";
import { requireHostTenant } from "./tenant-context";

/** The session an inspector names to unlock the source: the developer's backoffice or the RWAXI console. */
export type SourceSession = "backoffice" | "platform";

/**
 * May this request read the Solidity source of RWAXI's contracts (proprietary and confidential)? Only with the
 * explicit technical-demo flag (RWAXI_INSPECTOR_SOURCE=1) or with the session the inspector names on its own host:
 * the backoffice on a tenant host, the console on admin (signed in with MFA, or the demo session where it is
 * enabled). The vitrina and the investor portal never name one.
 */
export async function inspectorSourceAccess(as: string | null): Promise<boolean> {
  if (process.env.RWAXI_INSPECTOR_SOURCE === "1") return true;
  const env = (await headers()).get("x-rwaxi-env");
  if (as === "backoffice" && env === "tenant") {
    const tenant = await requireHostTenant().catch(() => null);
    return tenant ? backofficeAccess(tenant.id) : false;
  }
  if (as === "platform" && env === "admin") return (await platformActor()) !== null;
  return false;
}
