import type { NextRequest } from "next/server";
import { requestTranslate } from "@/app/_i18n/server";
import { VaultError, directUploads, presignUpload } from "@/app/_lib/server/vault";
import {
  authorizeUpload,
  limitUploadsFromIp,
  limitUploadsOf,
  uploadFailure,
  uploadJson,
} from "@/app/_lib/server/vault-uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/vault/upload/presign (JSON: purpose, sha256, sizeBytes, type, fileName and the purpose's fields) —
 * step 1 of a direct upload. The same authorisation and rate limits as POST /api/vault/upload, then:
 *   { mode: "direct", upload: { method, url, headers }, ticket }   S3/R2: a PUT valid for exactly the declared file
 *                                                                  (size, type and SHA-256 signed) for 15 minutes
 *   { mode: "server" }                                             local vault: upload through POST /api/vault/upload
 * The bytes never cross this function, whatever their size.
 */
export async function POST(req: NextRequest) {
  const tr = await requestTranslate("tenant");
  try {
    if (Number(req.headers.get("content-length") ?? 0) > 8 * 1024)
      throw new VaultError("Solicitud inválida.").withStatus(413);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new VaultError("Solicitud inválida.");
    const ctx = await authorizeUpload(body.purpose, (name) => body[name]);
    // Counted only where the upload happens: the multipart route counts its own.
    if (!directUploads()) return uploadJson(200, { ok: true, mode: "server" });
    await limitUploadsFromIp();
    await limitUploadsOf(ctx);
    const presigned = presignUpload(
      ctx.scopeKey,
      ctx.subject,
      { sizeBytes: body.sizeBytes, type: body.type, sha256: body.sha256 },
      ctx.vaultPurpose,
    );
    if (!presigned) return uploadJson(200, { ok: true, mode: "server" });
    return uploadJson(200, { ok: true, mode: "direct", upload: presigned.upload, ticket: presigned.ticket });
  } catch (e) {
    return uploadFailure(e, tr);
  }
}
