import "server-only";
import { headers } from "next/headers";
import { demoAccessEnabled, requirePlatformAccess } from "./tenant-context";

/** The session an inspector names to unlock the source: the developer's backoffice or the RWAXI console. */
export type SourceSession = "backoffice" | "platform";

/**
 * May this request read the Solidity source of RWAXI's contracts (proprietary and confidential)? Only with the
 * explicit technical-demo flag (RWAXI_INSPECTOR_SOURCE=1) or with the session the inspector names on its own host:
 * the backoffice on a tenant host, the console on admin. The vitrina and the investor portal never name one.
 */
export async function inspectorSourceAccess(as: string | null): Promise<boolean> {
  if (process.env.RWAXI_INSPECTOR_SOURCE === "1") return true;
  const env = (await headers()).get("x-rwaxi-env");
  if (as === "backoffice" && env === "tenant") return demoAccessEnabled();
  if (as === "platform" && env === "admin") {
    return requirePlatformAccess().then(
      () => true,
      () => false,
    );
  }
  return false;
}
