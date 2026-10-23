import { loadPublicCatalog } from "./_lib/catalog";
import { VitrinaScreen } from "./_components/vitrina-screen";

// Progress figures change with every signed subscription: render per request.
export const dynamic = "force-dynamic";

export default async function VitrinaPage() {
  const catalog = await loadPublicCatalog();
  return <VitrinaScreen catalog={catalog} />;
}
