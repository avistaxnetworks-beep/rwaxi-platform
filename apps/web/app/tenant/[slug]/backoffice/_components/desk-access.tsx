"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { msg } from "@/app/_i18n/marks";
import { useI18n } from "@/app/_i18n/provider";
import type { DeskSession } from "../_lib/types";

const ROLE_LABEL = {
  COMPLIANCE_OFFICER: msg("Oficial de Cumplimiento"),
  TENANT_ADMIN: msg("Administrador"),
  TENANT_ANALYST: msg("Analista"),
} as const;

const Access = createContext(true);

/** Whether the person looking at this desk may act on it (the server checks the role again on every action). */
export const useCanAct = () => useContext(Access);

/**
 * A desk as its viewer sees it: who the session is (demo or signed-in user) and, when their role cannot act
 * here, a read-only notice — every action button of the desk reads useCanAct().
 */
export function DeskAccess({
  session,
  required,
  children,
}: {
  session: DeskSession;
  required: keyof typeof ROLE_LABEL;
  children: ReactNode;
}) {
  const { tr } = useI18n();
  return (
    <Access.Provider value={session.canAct}>
      {!session.canAct && (
        <p
          role="note"
          data-read-only
          className="mb-4 border border-line bg-goldTint text-goldInk px-4 py-3 text-[12.5px] inline-flex items-center gap-2 w-full"
        >
          <Icon name="Lock" size={14} />
          {tr("Solo lectura: tu rol es {role}; estas acciones requieren el rol {required}.", {
            role: tr(ROLE_LABEL[session.role]),
            required: tr(ROLE_LABEL[required]),
          })}
        </p>
      )}
      {children}
    </Access.Provider>
  );
}

/** The data line of a desk: RLS tenant and who is acting (demo session or the signed-in user). */
export function SessionLine({
  slug,
  email,
  session,
  admin,
}: {
  slug: string;
  email: string;
  session: DeskSession;
  admin?: boolean;
}) {
  const { tr } = useI18n();
  return (
    <>
      {session.demo
        ? admin
          ? tr("PostgreSQL · RLS tnt_{slug} · sesión demo: {email} (Administrador)", { slug, email })
          : tr("PostgreSQL · RLS tnt_{slug} · sesión demo: {email}", { slug, email })
        : tr("PostgreSQL · RLS tnt_{slug} · sesión: {email} ({role})", {
            slug,
            email,
            role: tr(ROLE_LABEL[session.role]),
          })}
    </>
  );
}
