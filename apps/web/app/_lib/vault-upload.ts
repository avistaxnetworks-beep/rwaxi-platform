// Browser-side: sends a file to the DocumentVault (/api/vault/upload) with the SHA-256 computed here; the
// server recomputes it from the bytes it receives and refuses the file if they differ.
import { sha256Bytes } from "./sha256";

export type VaultUploadPurpose = "kyc" | "onboarding" | "data-room";

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
  /** `error` is already in the visitor's language; null when the server could not be reached */
  | { ok: false; error: string | null; status: number };

export async function uploadToVault(
  file: Blob,
  fileName: string,
  purpose: VaultUploadPurpose,
  fields: Record<string, string> = {},
): Promise<VaultUploadResult & { localSha256: string }> {
  const bytes = await file.arrayBuffer();
  const localSha256 = `0x${await sha256Bytes(bytes)}`;
  const form = new FormData();
  form.set("purpose", purpose);
  form.set("sha256", localSha256);
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  form.set("file", new File([bytes], fileName, { type: file.type }));
  try {
    const response = await fetch("/api/vault/upload", { method: "POST", body: form });
    const body = (await response.json().catch(() => null)) as VaultUploadResult | null;
    if (body && body.ok) return { ...body, localSha256 };
    return { ok: false, error: body && !body.ok ? body.error : null, status: response.status, localSha256 };
  } catch {
    return { ok: false, error: null, status: 0, localSha256 };
  }
}
