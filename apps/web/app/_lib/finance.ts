// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
export function simulate(e, a, t) {
  const o = Math.floor(a / e.unit),
    n = o * e.unit,
    l = (n * e.dist) / 100 / 12,
    r = Math.max(0, t - e.rentStart),
    i = l * r,
    s = n * (Math.pow(1 + e.val / 100, t / 12) - 1),
    c = [];
  for (let d = 1; d <= t / 12; d++) {
    const p = d * 12;
    c.push({
      y: d,
      rent: l * Math.max(0, p - e.rentStart),
      val: n * (Math.pow(1 + e.val / 100, d) - 1),
    });
  }
  return {
    units: o,
    capital: n,
    monthly: l,
    rent: i,
    valuation: s,
    total: i + s,
    years: c,
  };
}
