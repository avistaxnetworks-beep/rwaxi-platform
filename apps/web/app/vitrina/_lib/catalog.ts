import "server-only";
import { listPublicOfferings, type PublicOffering } from "@rwaxi/database";

export type PublicCatalogResult = { ok: true; offerings: PublicOffering[] } | { ok: false; error: string };

/** Live public catalogue (rwaxi_public_offerings). Never throws: failures become `ok: false`. */
export async function loadPublicCatalog(): Promise<PublicCatalogResult> {
  try {
    return { ok: true, offerings: await listPublicOfferings() };
  } catch (e) {
    console.error("[vitrina] public catalogue failed", e);
    return { ok: false, error: "Catálogo en vivo no disponible: se muestran los datos ilustrativos del prototipo." };
  }
}
