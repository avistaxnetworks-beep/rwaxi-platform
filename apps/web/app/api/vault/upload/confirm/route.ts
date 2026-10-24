import type { NextRequest } from "next/server";
import { requestTranslate } from "@/app/_i18n/server";
import { VaultError, storeIncoming, verifyTicket } from "@/app/_lib/server/vault";
import { authorizeUpload, completeUpload, uploadFailure, uploadJson } from "@/app/_lib/server/vault-uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/vault/upload/confirm (JSON: purpose, ticket, fileName and the purpose's fields) — step 3 of a direct
 * upload, once the browser PUT the file to the bucket. The caller is authorised again and must be the one the
 * ticket was issued to; the server then reads the object back and checks it exactly like an upload received here
 * (type from the bytes, size, SHA-256) before it gets its content key and becomes a receipt or a Data Room document.
 */
export async function POST(req: NextRequest) {
  const tr = await requestTranslate("tenant");
  try {
    if (Number(req.headers.get("content-length") ?? 0) > 8 * 1024)
      throw new VaultError("Solicitud inválida.").withStatus(413);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new VaultError("Solicitud inválida.");
    const ctx = await authorizeUpload(body.purpose, (name) => body[name]);
    const ticket = verifyTicket(body.ticket, {
      scope: ctx.scopeKey,
      subject: ctx.subject,
      purpose: ctx.vaultPurpose,
    });
    if (!ticket) {
      throw new VaultError(
        "La autorización de carga no es válida o venció: vuelve a cargar el archivo.",
      ).withStatus(403);
    }
    const stored = await storeIncoming(ctx.scope, ticket);
    return uploadJson(200, await completeUpload(ctx, stored));
  } catch (e) {
    return uploadFailure(e, tr);
  }
}
