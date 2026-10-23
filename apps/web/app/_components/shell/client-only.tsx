"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders children only after mount. The ported prototype draws on <canvas>, reads `window`
 * and seeds state with Date.now()/Math.random(), so it is rendered client-side only for now.
 */
export function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : <div className="boot">RWAXI · CARGANDO PLATAFORMA</div>;
}
