// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import React from "react";
import { L } from "@/app/_components/ui/icon-registry";

export function Icon({ name: e, size: a = 16, className: t = "" }) {
  const o = L[e];
  return o
    ? React.createElement(o, {
        size: a,
        strokeWidth: 1.75,
        className: t,
        "aria-hidden": "true",
      })
    : null;
}
