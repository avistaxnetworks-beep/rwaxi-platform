import type { ReactNode } from "react";

/** A figure, percentage, code or hash: left-to-right and tabular, also inside right-to-left (Arabic) text. */
export function Num({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={`tnum ${className}`}>
      {children}
    </bdi>
  );
}
