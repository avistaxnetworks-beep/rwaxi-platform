// SHA-256 with Web Crypto for evidence that gets persisted (NDA text, KYC documents).
// Unlike the prototype's sha256Hex() it never falls back to a made-up hash: failures throw.

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Bytes(data: ArrayBuffer | Uint8Array): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", data as BufferSource));
}

export function sha256Text(text: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(text));
}
