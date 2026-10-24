import type { NextRequest } from "next/server";
import { requestTranslate } from "@/app/_i18n/server";
import { VaultError, storeUpload } from "@/app/_lib/server/vault";
import {
  authorizeUpload,
  completeUpload,
  limitUploadsFromIp,
  limitUploadsOf,
  uploadFailure,
  uploadJson,
} from "@/app/_lib/server/vault-uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/vault/upload (multipart: file, sha256 = what the browser computed, purpose, and the purpose's fields)
 * — the upload through the app (local vault, or files the browser could not send to the bucket). The server
 * checks type (from the bytes), size and SHA-256 before writing anything; see vault-uploads.ts for who may
 * upload what. With S3/R2 the browser uploads directly instead (presign → PUT → confirm).
 */
const MAX_BODY = 21 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const tr = await requestTranslate("tenant");
  try {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) {
      throw new VaultError("La solicitud supera el tamaño máximo permitido.").withStatus(413);
    }
    await limitUploadsFromIp();
    const form = await req.formData().catch(() => {
      throw new VaultError("La carga llegó incompleta o no es un formulario válido; vuelve a intentarlo.");
    });
    const file = form.get("file");
    if (!(file instanceof Blob)) throw new VaultError("Adjunta el archivo.");
    const fileName = file instanceof File ? file.name : "";
    const ctx = await authorizeUpload(form.get("purpose"), (name) =>
      name === "fileName" ? fileName : form.get(name),
    );
    await limitUploadsOf(ctx);
    const stored = await storeUpload(ctx.scope, file, form.get("sha256"), ctx.vaultPurpose);
    return uploadJson(200, await completeUpload(ctx, stored));
  } catch (e) {
    return uploadFailure(e, tr);
  }
}
