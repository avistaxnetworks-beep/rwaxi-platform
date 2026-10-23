// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { money } from "@/app/_lib/format";

export function YearChart({ years: e, currency: a }) {
  const t = Math.max(...e.map((s) => s.rent + s.val), 1),
    o = 520,
    n = 170,
    l = {
      l: 8,
      r: 8,
      t: 22,
      b: 26,
    },
    r = (o - l.l - l.r) / e.length,
    i = (s) => ((n - l.t - l.b) * s) / t;
  return (
    <svg
      viewBox={`0 0 ${o} ${n}`}
      className="w-full h-auto"
      role="img"
      aria-label="Retorno estimado acumulado por año"
    >
      <line x1={l.l} x2={o - l.r} y1={n - l.b} y2={n - l.b} stroke="#E3E0EA" />
      {e.map((s, c) => {
        const d = l.l + c * r + r * 0.22,
          p = r * 0.56,
          m = i(s.rent),
          u = i(s.val),
          v = n - l.b;
        return (
          <g key={s.y}>
            <rect x={d} y={v - m} width={p} height={m} fill="#2F145F" />
            <rect x={d} y={v - m - u} width={p} height={u} fill="#C4B5FD" />
            <text
              x={d + p / 2}
              y={v - m - u - 6}
              textAnchor="middle"
              fontSize="10.5"
              fill="#2A2238"
              fontFamily="IBM Plex Mono, monospace"
            >
              {money(s.rent + s.val, a, true).replace(/^(USD|COP) /, "")}
            </text>
            <text
              x={d + p / 2}
              y={n - 8}
              textAnchor="middle"
              fontSize="10.5"
              fill="#5E5873"
              fontFamily="IBM Plex Mono, monospace"
            >
              {"Año "}
              {s.y}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
