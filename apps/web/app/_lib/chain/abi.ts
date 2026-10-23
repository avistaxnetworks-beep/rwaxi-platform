// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
export const abiPad = (e) => e.padStart(64, "0");

export function abiIsDyn(e) {
  return e === "string" || (typeof e == "object" && e.tuple.some(abiIsDyn));
}

export function abiUtf8Hex(e) {
  return Array.from(new TextEncoder().encode(e))
    .map((a) => a.toString(16).padStart(2, "0"))
    .join("");
}

export function abiWord(e, a) {
  if (e === "address") return abiPad(String(a).slice(2).toLowerCase());
  if (e === "bool") return abiPad(a ? "1" : "0");
  if (e === "bytes32") return String(a).slice(2).toLowerCase().padEnd(64, "0");
  if (/^uint/.test(e)) return abiPad(BigInt(a).toString(16));
  throw new Error("tipo no soportado " + e);
}

export function abiItem(e, a) {
  if (e === "string") {
    const t = abiUtf8Hex(a);
    return (
      abiPad((t.length / 2).toString(16)) + (t.length ? t.padEnd(Math.ceil(t.length / 64) * 64, "0") : "")
    );
  }
  return typeof e == "object" ? abiEncode(e.tuple, a) : abiWord(e, a);
}

export function abiEncode(e, a) {
  const t = e.reduce((l, r) => l + (abiIsDyn(r) ? 32 : typeof r == "object" ? 32 * r.tuple.length : 32), 0);
  let o = "",
    n = "";
  return (
    e.forEach((l, r) => {
      abiIsDyn(l)
        ? ((o += abiPad((t + n.length / 2).toString(16))), (n += abiItem(l, a[r])))
        : (o += abiItem(l, a[r]));
    }),
    o + n
  );
}
