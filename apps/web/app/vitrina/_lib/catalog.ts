import "server-only";
import { listPublicOfferings, type PublicOffering } from "@rwaxi/database";
import { vmsg } from "@/app/_i18n/marks";
import { IS_PRODUCTION_BUILD } from "@/app/_lib/runtime";

export type PublicCatalogResult = { ok: true; offerings: PublicOffering[] } | { ok: false; error: string };

/**
 * Live public catalogue (rwaxi_public_offerings). Never throws: failures become `ok: false`. The notice about the
 * prototype's illustrative data only exists outside production: a production build shows no fallback, so it never
 * sends that text to the browser either (the failure stays in the server log).
 */
export async function loadPublicCatalog(): Promise<PublicCatalogResult> {
  try {
    return { ok: true, offerings: await listPublicOfferings() };
  } catch (e) {
    console.error("[vitrina] public catalogue failed", e);
    const notice = vmsg("Catálogo en vivo no disponible: se muestran los datos ilustrativos del prototipo.");
    return { ok: false, error: IS_PRODUCTION_BUILD ? "" : notice };
  }
}
