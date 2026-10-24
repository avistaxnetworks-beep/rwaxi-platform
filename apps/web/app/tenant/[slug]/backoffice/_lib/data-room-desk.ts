import "server-only";
import { withTenant } from "@rwaxi/database";
import { render, requestTranslate } from "@/app/_i18n/server";
import { DATAROOM } from "@/app/_lib/data/projects";
import { TenantAccessError } from "@/app/_lib/server/tenant-context";
import { deskSession, requireBackofficeSession } from "./session";
import type { DataRoomDeskResult } from "./types";

const FOLDERS: string[] = (DATAROOM as { n: string; name: string }[]).map((f) => `${f.n} ${f.name}`);
/** Root an anchoring call writes on the token: updateDataRoomMerkleRoot(newRoot) or the deployment's initial one. */
const rootOf = (args: unknown) => {
  const a = (args ?? {}) as { newRoot?: unknown; dataRoomMerkleRoot?: unknown };
  const root = a.newRoot ?? a.dataRoomMerkleRoot;
  return typeof root === "string" ? root.toLowerCase() : null;
};

/**
 * Data Room of the tenant's offerings from PostgreSQL: documents (Merkle leaves), whether each file is in the
 * DocumentVault, and the anchoring of the root on the token. Read by any staff role; uploading is the issuer's
 * (TENANT_ADMIN). Never throws: failures become `ok: false`.
 */
export async function loadDataRoomDesk(): Promise<DataRoomDeskResult> {
  const tr = await requestTranslate("tenant");
  try {
    const session = await requireBackofficeSession("TENANT_ADMIN", { view: true });
    const data = await withTenant(
      session.tenant.id,
      async (db) => {
        const offerings = await db.offering.findMany({
          orderBy: { code: "asc" },
          select: {
            id: true,
            code: true,
            assetName: true,
            dataRoomRoot: true,
            token: { select: { status: true, contractAddress: true } },
            documents: { orderBy: [{ folder: "asc" }, { uploadedAt: "asc" }, { name: "asc" }] },
          },
        });
        const [objects, anchors] = await Promise.all([
          db.vaultObject.findMany({ select: { sha256: true, mimeType: true } }),
          db.chainTransaction.findMany({
            where: {
              kind: { in: ["DATA_ROOM_ROOT_ANCHORED", "OFFERING_TOKEN_DEPLOYED"] },
              status: { in: ["PENDING", "CONFIRMED"] },
            },
            orderBy: { createdAt: "desc" },
            select: { offeringId: true, kind: true, status: true, args: true },
          }),
        ]);
        const mime = new Map(objects.map((o) => [o.sha256, o.mimeType]));
        return offerings.map((o) => {
          const mine = anchors.filter((a) => a.offeringId === o.id);
          return {
            id: o.id,
            code: o.code,
            assetName: o.assetName,
            root: o.dataRoomRoot,
            tokenDeployed:
              (o.token?.status === "DEPLOYED" || o.token?.status === "PAUSED") && !!o.token.contractAddress,
            anchoredRoot: rootOf(mine.find((a) => a.status === "CONFIRMED")?.args),
            anchorPending: mine.some((a) => a.status === "PENDING" && a.kind === "DATA_ROOM_ROOT_ANCHORED"),
            documents: o.documents.map((d) => ({
              id: d.id,
              folder: d.folder,
              name: d.name,
              restricted: d.restricted,
              sha256: d.sha256,
              sizeBytes: d.sizeBytes,
              mimeType: mime.get(d.sha256) ?? null,
              stored: !!d.storageKey && mime.has(d.sha256),
              uploadedAt: d.uploadedAt.toISOString().slice(0, 10),
            })),
          };
        });
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
    return {
      ok: true,
      data: { session: deskSession(session, "TENANT_ADMIN"), folders: FOLDERS, offerings: data },
    };
  } catch (e) {
    if (e instanceof TenantAccessError) return { ok: false, error: render(tr, e.reason) };
    console.error("[backoffice] data room desk failed", e);
    return { ok: false, error: tr("No se pudo leer el Data Room desde la base de datos.") };
  }
}
