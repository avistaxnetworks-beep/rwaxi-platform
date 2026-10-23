// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
export function seededHex(e, a) {
  let t = 2166136261;
  for (let n = 0; n < e.length; n++) t = Math.imul(t ^ e.charCodeAt(n), 16777619);
  let o = "";
  for (; o.length < a; )
    (t ^= t << 13), (t ^= t >>> 17), (t ^= t << 5), (o += (t >>> 0).toString(16).padStart(8, "0"));
  return o.slice(0, a);
}

export async function sha256Hex(e) {
  try {
    const a = typeof e == "string" ? new TextEncoder().encode(e) : e,
      t = await crypto.subtle.digest("SHA-256", a);
    return Array.from(new Uint8Array(t))
      .map((o) => o.toString(16).padStart(2, "0"))
      .join("");
  } catch (a) {
    return seededHex("fallback" + Math.random(), 64);
  }
}
