// Browser-side: sends a file to the DocumentVault with the SHA-256 computed here; the server recomputes it from
// the bytes and refuses the file if they differ. With S3/R2 the bytes go straight to the bucket through a
// presigned PUT bound to that size, type and SHA-256 (presign → PUT → confirm), so no file crosses the app's
// functions; with the local vault they are posted to /api/vault/upload.
import { sha256Bytes } from "./sha256";

export type VaultUploadPurpose = "kyc" | "onboarding" | "data-room" | "distribution";

export type VaultUploadResult =
  | {
      ok: true;
      sha256: string;
      mimeType: string;
      sizeBytes: number;
      receipt?: string;
      documentId?: string;
      anchorQueued?: boolean;
    }
  /** `error` is already in the visitor's language; null when the server (or the bucket) refused without one */
  | { ok: false; error: string | null; status: number };

type Presigned =
  | { ok: true; mode: "server" }
  | {
      ok: true;
      mode: "direct";
      upload: { method: "PUT"; url: string; headers: Record<string, string> };
      ticket: string;
    }
  | { ok: false; error: string };

async function postJson<T>(path: string, body: unknown): Promise<{ status: number; body: T | null }> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json().catch(() => null)) as T | null };
}

const failed = (r: {
  status: number;
  body: { ok: boolean; error?: string | null } | null;
}): VaultUploadResult => ({
  ok: false,
  error: r.body && !r.body.ok ? (r.body.error ?? null) : null,
  status: r.status,
});

export async function uploadToVault(
  file: Blob,
  fileName: string,
  purpose: VaultUploadPurpose,
  fields: Record<string, string> = {},
): Promise<VaultUploadResult & { localSha256: string }> {
  const bytes = await file.arrayBuffer();
  const localSha256 = `0x${await sha256Bytes(bytes)}`;
  try {
    const presign = await postJson<Presigned>("/api/vault/upload/presign", {
      purpose,
      sha256: localSha256,
      sizeBytes: bytes.byteLength,
      type: file.type,
      fileName,
      ...fields,
    });
    if (!presign.body?.ok) return { ...failed(presign), localSha256 };
    if (presign.body.mode === "direct") {
      const { upload, ticket } = presign.body;
      const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: bytes });
      if (!put.ok) return { ok: false, error: null, status: put.status, localSha256 };
      const done = await postJson<VaultUploadResult>("/api/vault/upload/confirm", {
        purpose,
        ticket,
        fileName,
        ...fields,
      });
      return done.body?.ok ? { ...done.body, localSha256 } : { ...failed(done), localSha256 };
    }
    const form = new FormData();
    form.set("purpose", purpose);
    form.set("sha256", localSha256);
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    form.set("file", new File([bytes], fileName, { type: file.type }));
    const response = await fetch("/api/vault/upload", { method: "POST", body: form });
    const body = (await response.json().catch(() => null)) as VaultUploadResult | null;
    if (body && body.ok) return { ...body, localSha256 };
    return { ok: false, error: body && !body.ok ? body.error : null, status: response.status, localSha256 };
  } catch {
    return { ok: false, error: null, status: 0, localSha256 };
  }
}
