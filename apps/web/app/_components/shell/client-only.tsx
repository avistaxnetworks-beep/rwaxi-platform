"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders children only after mount. The ported prototype draws on <canvas>, reads `window`
 * and seeds state with Date.now()/Math.random(), so it is rendered client-side only for now.
 */
export function ClientOnly({
  children,
  label = "RWAXI · CARGANDO PLATAFORMA",
}: {
  children: ReactNode;
  /** boot placeholder, already in the visitor's language */
  label?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : <div className="boot">{label}</div>;
}
