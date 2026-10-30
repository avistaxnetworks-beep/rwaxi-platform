"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { Modal } from "@/app/_components/ui/modal";
import { Switch } from "@/app/_components/ui/primitives";
import { fieldCls } from "@/app/_components/ui/form";
import { PORTAL_STATUS } from "@/app/_lib/data/fees";
import { REGIMES } from "@/app/_lib/data/kyc";
import { money, shortHash } from "@/app/_lib/format";
import { envHref } from "@/app/_lib/hosts";
import { PLATFORM_FEE_BPS_MAX, PLATFORM_FEE_BPS_MIN, parsePlatformFeeBps, platformFeePercent } from "@rwaxi/blockchain-sdk/platform-fee";
import { uploadToVault } from "@/app/_lib/vault-upload";
import {
  declareRegistryWallets,
  deployOfferingToken,
  deployTenantRegistry,
  resendStaffInvitation,
  setCommercialTerms,
  setOfferingCapture,
  setOrganizationPublished,
  setPortalStatus,
} from "../actions";
import type {
  PlatformActionResult,
  PlatformMetrics,
  PlatformMetricsResult,
  PlatformOfferingRow,
  PlatformStaffRow,
  PlatformTenantRow,
  PortalStatusKey,
} from "../_lib/types";

type Currency = "COP" | "USD";
type Toast = (message: string) => void;
type Decision =
  | { kind: "status"; tenant: PlatformTenantRow; to: PortalStatusKey }
  | { kind: "publish"; tenant: PlatformTenantRow; to: boolean }
  | { kind: "capture"; tenant: PlatformTenantRow; offering: PlatformOfferingRow; pause: boolean }
  | { kind: "registry"; tenant: PlatformTenantRow }
  | { kind: "wallets"; tenant: PlatformTenantRow }
  | { kind: "terms"; tenant: PlatformTenantRow }
  | { kind: "token"; tenant: PlatformTenantRow; offering: PlatformOfferingRow }
  | { kind: "invite"; tenant: PlatformTenantRow; user: PlatformStaffRow };

/** The signed agreement being registered: its fee, reference, date and the PDF the server verified (receipt). */
interface TermsForm {
  bps: string;
  reference: string;
  signedOn: string;
  file: { name: string; sha256: string; sizeBytes: number; receipt: string } | null;
  uploading: boolean;
  uploadError: string | null;
}
const AGREEMENT_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9 ._/#-]{2,63}$/;
/** Today's date in Colombia (YYYY-MM-DD): after 19:00 there, the UTC date is already tomorrow. */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

/** Why the agreement cannot be registered yet (null: it can) — the rules setCommercialTerms applies again. */
function termsProblem(f: TermsForm): string | null {
  if (parsePlatformFeeBps(f.bps) === null) {
    return `Comisión: un número entero de puntos básicos entre ${PLATFORM_FEE_BPS_MIN} (0,25 %) y ${PLATFORM_FEE_BPS_MAX} (5 %).`;
  }
  if (!AGREEMENT_REFERENCE.test(f.reference.trim())) return "Referencia del acuerdo: 3 a 64 caracteres (letras, números, espacio y . _ / # -).";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.signedOn) || f.signedOn > today()) return "Fecha de firma: una fecha válida que no sea futura.";
  if (f.uploading) return "Verificando el PDF del acuerdo…";
  if (!f.file) return "Adjunta el PDF del acuerdo firmado.";
  return null;
}

const STATUSES: PortalStatusKey[] = ["ACTIVE", "REVIEW", "SUSPENDED"];
const REGIME_KEY = { SAGRILAFT_PTEE: "sagrilaft", SARLAFT: "sarlaft" } as const;
const TOKEN_LABEL: Record<string, string> = {
  NOT_DEPLOYED: "Token sin emitir",
  DEPLOYING: "Token en despliegue",
  DEPLOYED: "emitido",
  PAUSED: "pausado on-chain por el emisor",
};
const WALLET = /^0x[0-9a-fA-F]{40}$/;
const utc = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;
const STAFF_ROLE: Record<PlatformStaffRow["role"], string> = { TENANT_ADMIN: "Administrador", COMPLIANCE_OFFICER: "Oficial de Cumplimiento" };
const STAFF_STATUS: Record<PlatformStaffRow["status"], [string, string]> = {
  ACTIVE: ["Activa · contraseña + TOTP", "bg-aquaTint text-aquaInk"],
  PENDING: ["Pendiente de activación", "bg-goldTint text-goldInk"],
  EXPIRED: ["Invitación vencida", "bg-[#FDECEA] text-[#B42318]"],
  NO_INVITATION: ["Sin invitación vigente", "bg-cloud text-muted"],
};

/**
 * Why the wallets of a deferred or reverted registry cannot be declared yet (null: they can): the server's rules
 * (declareRegistryWallets) shown while the operator types — valid, distinct and never RWAXI's operator wallet.
 */
function walletsProblem(w: { admin: string; officer: string }, operator: string | null): string | null {
  const admin = w.admin.trim().toLowerCase();
  const officer = w.officer.trim().toLowerCase();
  if (!admin || !officer) return "incomplete";
  if (!WALLET.test(admin) || !WALLET.test(officer)) return "Cada wallet debe ser una dirección EVM válida (0x + 40 hex).";
  if (admin === officer) return "El administrador y el oficial de cumplimiento deben tener wallets distintas.";
  if (operator && (admin === operator || officer === operator))
    return "Esa es la wallet del operador RWAXI: el registro debe quedar con las wallets del desarrollador.";
  return null;
}

/** What a decision does, as the confirmation dialog explains it (all controls are off-chain). */
function effectOf(d: Decision): { title: string; effect: string; restrictive: boolean } {
  if (d.kind === "status") {
    const effect = {
      ACTIVE: "El portal vuelve a operar con normalidad y la vitrina lo enlaza de nuevo.",
      REVIEW: "El portal sigue operando, pero la vitrina muestra el proyecto sin enlace al portal mientras termina la revisión.",
      SUSPENDED:
        "El portal mostrará un aviso institucional y no recibirá nuevos NDA, verificaciones KYC ni suscripciones. Los inversionistas existentes conservan su portafolio y documentos. RWAXI no ejecuta ninguna transacción sobre el contrato del emisor.",
    }[d.to];
    return { title: `Portal de ${d.tenant.displayName} → ${PORTAL_STATUS[d.to][0]}`, effect, restrictive: d.to !== "ACTIVE" };
  }
  if (d.kind === "publish") {
    return {
      title: `${d.to ? "Publicar" : "Retirar"} ${d.tenant.displayName} ${d.to ? "en" : "de"} la vitrina`,
      effect: d.to
        ? "Sus proyectos publicados vuelven al catálogo público de la vitrina RWAXI."
        : "Sus proyectos desaparecen del catálogo público de la vitrina; el portal del desarrollador sigue operando.",
      restrictive: !d.to,
    };
  }
  if (d.kind === "invite") {
    return {
      title: `Reenviar la invitación de ${d.user.email}`,
      effect:
        "Se genera un nuevo enlace de activación de un solo uso, válido 72 horas, y cualquier enlace anterior deja de servir. El correo queda en la bandeja de salida (mail_outbox) y el reenvío se registra en el AuditEvent del desarrollador. Al activarlo, la persona define su contraseña y su verificación TOTP en el backoffice del tenant.",
      restrictive: false,
    };
  }
  if (d.kind === "wallets") {
    return {
      title: `Declarar las wallets de ${d.tenant.displayName} y desplegar su registro`,
      effect:
        (d.tenant.registry.status === "REVERTED"
          ? "La red revirtió el despliegue anterior del registro de cumplimiento. "
          : "El alta quedó con el registro de cumplimiento diferido porque faltaban las wallets del equipo. ") +
        "Las dos wallets deben ser distintas y ninguna puede ser la del operador RWAXI. Se guardan en el administrador y el oficial de cumplimiento del desarrollador, se encola deployTenantRegistry() y el operador RWAXI lo ejecuta en el acto: el RwaxiComplianceRegistry (ERC-3643) queda administrado por esas wallets y RWAXI no conserva ningún rol sobre él. Si la ejecución falla, queda en cola para «Desplegar registro». Hasta entonces el oficial no puede aprobar KYC ni el desarrollador abrir la captación.",
      restrictive: false,
    };
  }
  if (d.kind === "token") {
    const reservations = d.offering.reservations;
    return {
      title: `Desplegar el token ERC-3643 de ${d.offering.code} · ${d.offering.assetName}`,
      effect:
        `El operador RWAXI (RWAXI_OPERATOR_ROLE) ejecuta deployOfferingToken() en la factoría: el token queda administrado por las wallets oficiales del desarrollador (Administrador y Oficial de Cumplimiento), con la raíz del Data Room anclada y la comisión de plataforma pactada (${platformFeePercent(d.tenant.feeRules.platformFeeBps)}) fija e inmutable; cada emisión la declara on-chain y RWAXI la factura al desarrollador fuera de la cadena. ` +
        (reservations
          ? `Las ${reservations} reservas de pre-venta de la oferta pasan a pago pendiente con su referencia de transferencia. `
          : "") +
        "El pago fiduciario del inversionista sigue yendo al vehículo del emisor: RWAXI no custodia fondos.",
      restrictive: false,
    };
  }
  if (d.kind === "terms") {
    return {
      title: `Acuerdo comercial y comisión de plataforma de ${d.tenant.displayName}`,
      effect:
        "Se registra el acuerdo firmado con el desarrollador: su PDF queda en la bóveda documental del tenant, verificado por su SHA-256, y la comisión pactada (25 a 500 puntos básicos) pasa a ser la del desarrollador. La factoría la escribe en cada token que se despliegue desde ahora, donde queda fija e inmutable, y cada emisión la declara on-chain (PlatformFeeAccrued); RWAXI la factura fuera de la cadena al conciliar cada pago. Los tokens ya desplegados conservan la suya. El token nunca transfiere unidades ni valor a RWAXI.",
      restrictive: false,
    };
  }
  if (d.kind === "registry") {
    return {
      title: `Desplegar el registro de cumplimiento de ${d.tenant.displayName}`,
      effect:
        (d.tenant.registry.awaitingReceipt
          ? "La transacción ya se envió a la red: se concilia con su recibo y nunca se envía dos veces. "
          : "") +
        "El operador RWAXI (RWAXI_OPERATOR_ROLE de la factory) ejecuta deployTenantRegistry(): el RwaxiComplianceRegistry (ERC-3643) queda administrado por las wallets del tenant (administrador y oficial de cumplimiento) y RWAXI no conserva ningún rol sobre él. Sin registro, el oficial no puede aprobar KYC en la whitelist.",
      restrictive: false,
    };
  }
  return {
    title: `${d.pause ? "Pausar" : "Reanudar"} la captación de ${d.offering.code} · ${d.offering.assetName}`,
    effect: d.pause
      ? "La vitrina mostrará la oferta como «Captación pausada» y el portal no aceptará nuevas suscripciones. Las suscripciones ya firmadas siguen su curso (conciliación del pago y emisión). Es un control de la plataforma (off-chain): el token del emisor no se pausa."
      : "La oferta vuelve a recibir suscripciones desde el portal y la vitrina la enlaza de nuevo.",
    restrictive: d.pause,
  };
}

/** Module A · governance of tenants, backed by PostgreSQL (platform role) and recorded in AuditEvent. */
export function PlatformGovernance({
  metrics,
  currency,
  toast,
  onboarding,
}: {
  metrics: PlatformMetricsResult;
  currency: Currency;
  toast: Toast;
  /** persisted developer onboarding (wizard) */
  onboarding: ReactNode;
}) {
  if (!metrics.ok) return null; // PlatformOverview already shows the error
  return <GovernanceView data={metrics.data} currency={currency} toast={toast} onboarding={onboarding} />;
}

function GovernanceView({ data, currency, toast, onboarding }: { data: PlatformMetrics; currency: Currency; toast: Toast; onboarding: ReactNode }) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [wallets, setWallets] = useState({ admin: "", officer: "" });
  const [terms, setTerms] = useState<TermsForm>({ bps: "", reference: "", signedOn: "", file: null, uploading: false, uploadError: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { tenants, totals, audit } = data;
  const canAct = !!data.admin;

  const open = (d: Decision) => {
    setDecision(d);
    setReason("");
    if (d.kind === "wallets") {
      const of = (role: PlatformStaffRow["role"]) => d.tenant.staff.find((u) => u.role === role)?.wallet ?? "";
      setWallets({ admin: of("TENANT_ADMIN"), officer: of("COMPLIANCE_OFFICER") });
    }
    if (d.kind === "terms") {
      setTerms({ bps: String(d.tenant.feeRules.platformFeeBps), reference: "", signedOn: today(), file: null, uploading: false, uploadError: null });
    }
    setError(null);
  };
  // The signed PDF goes to the console's staging vault: the server reads its type from the bytes, recomputes its
  // SHA-256 and returns the receipt setCommercialTerms() requires.
  const attachAgreement = async (file: File | undefined) => {
    if (!file) return;
    setTerms((t) => ({ ...t, file: null, uploading: true, uploadError: null }));
    const uploaded = await uploadToVault(file, file.name, "onboarding");
    if (uploaded.ok && uploaded.receipt && uploaded.mimeType === "application/pdf") {
      const { sha256, sizeBytes, receipt } = uploaded;
      setTerms((t) => ({ ...t, uploading: false, file: { name: file.name, sha256, sizeBytes, receipt } }));
    } else {
      const reason = uploaded.ok ? "El acuerdo firmado debe ser un PDF." : (uploaded.error ?? "No se pudo verificar el archivo; vuelve a adjuntarlo.");
      setTerms((t) => ({ ...t, uploading: false, uploadError: reason }));
    }
  };
  const confirm = () => {
    if (!decision || busy) return;
    const d = decision;
    setBusy(true);
    setError(null);
    startTransition(async () => {
      let result: PlatformActionResult;
      if (d.kind === "status") result = await setPortalStatus(d.tenant.id, d.to, reason);
      else if (d.kind === "publish") result = await setOrganizationPublished(d.tenant.id, d.to, reason);
      else if (d.kind === "registry") result = await deployTenantRegistry(d.tenant.id);
      else if (d.kind === "wallets") result = await declareRegistryWallets(d.tenant.id, wallets.admin, wallets.officer);
      else if (d.kind === "token") result = await deployOfferingToken(d.offering.id);
      else if (d.kind === "terms")
        result = await setCommercialTerms(d.tenant.id, {
          platformFeeBps: terms.bps,
          reference: terms.reference,
          signedOn: terms.signedOn,
          document: {
            receipt: terms.file?.receipt ?? "",
            sha256: terms.file?.sha256 ?? "",
            sizeBytes: terms.file?.sizeBytes ?? 0,
            fileName: terms.file?.name ?? "",
          },
        });
      else if (d.kind === "invite") result = await resendStaffInvitation(d.user.id);
      else result = await setOfferingCapture(d.offering.id, d.pause, reason);
      setBusy(false);
      if (result.ok) {
        setDecision(null);
        // took effect, but a later step did not (wallets declared, deployment failed): an alert, not a toast
        if (result.warning) setError(result.message);
        else toast(result.message);
      } else setError(result.error);
    });
  };

  const kpis: [string, string][] = [
    ["Organizations", String(tenants.length)],
    ["Portales activos", String(totals.activeOrganizations)],
    ["Publicados en vitrina", String(totals.published)],
    ["MRR SaaS", money(totals.mrrUsd, currency, false)],
  ];
  const info = decision ? effectOf(decision) : null;
  const walletProblem = walletsProblem(wallets, data.operatorWallet);
  const walletsOk = walletProblem === null;
  const termsIssue = termsProblem(terms);

  return (
    <div className="flex flex-col gap-6" data-platform-governance>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line">
        {kpis.map(([label, value]) => (
          <div key={label} className="bg-white p-4 min-w-0">
            <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{label}</p>
            <p className="font-mono text-[24px] text-rxPurple tnum mt-1 break-words">{value}</p>
          </div>
        ))}
      </div>

      {!canAct && (
        <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
          No hay un usuario SUPER_ADMIN activo: los controles de gobierno están deshabilitados.
        </p>
      )}
      {error && !decision && (
        <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
          {error}
        </p>
      )}

      <div className="bg-white border border-line">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between items-center gap-3">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Organizations · TenantPortals · PostgreSQL</p>
          {onboarding}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1700px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                <th className="font-semibold px-5 py-3">Desarrollador</th>
                <th className="font-semibold px-3 py-3">Portal</th>
                <th className="font-semibold px-3 py-3">Régimen · registro on-chain</th>
                <th className="font-semibold px-3 py-3">Comisión · acuerdo</th>
                <th className="font-semibold px-3 py-3">Equipo · activación</th>
                <th className="font-semibold px-3 py-3">Proyecto · captación</th>
                <th className="font-semibold px-3 py-3">Estado del portal</th>
                <th className="font-semibold px-3 py-3">Vitrina RWAXI</th>
                <th className="font-semibold px-3 py-3 text-right">Leads</th>
                <th className="font-semibold px-5 py-3">
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} data-governance-row={t.slug} data-portal-status={t.portalStatus} className="border-b border-line last:border-b-0 align-top">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-rxPurple">{t.legalName}</p>
                    <p className="font-mono text-[10.5px] text-muted">{`NIT ${t.taxId} · cliente desde ${t.onboardedAt}`}</p>
                  </td>
                  <td className="px-3 py-3.5 font-mono text-[11.5px] text-inkBody">
                    {`${t.slug}.rwaxirealestate.com`}
                    {t.customDomain && <span className="block text-muted">{t.customDomain}</span>}
                  </td>
                  <td className="px-3 py-3.5 text-[11.5px] min-w-[190px]" data-registry-status={t.registry.status}>
                    {REGIMES[REGIME_KEY[t.regime]].short}
                    {t.registry.status === "DEPLOYED" && t.registry.address ? (
                      <span className="flex flex-col items-start gap-1 mt-1" data-registry-mode={t.registry.mode ?? ""}>
                        <span className={`text-[10.5px] font-semibold px-2 py-0.5 ${t.registry.mode ? "bg-aquaTint text-aquaInk" : "bg-cloud text-muted"}`}>
                          {t.registry.mode === "SIMULATION"
                            ? "ERC-3643 activo · simulación firmada, no difundida"
                            : t.registry.mode === "RPC"
                              ? `ERC-3643 activo en red${t.registry.network ? ` · ${t.registry.network}` : ""}`
                              : // seed rows: illustrative, never executed in either mode
                                `ERC-3643 · dato ilustrativo del seed${t.registry.network ? ` · ${t.registry.network}` : ""}`}
                        </span>
                        <span className="font-mono text-[10.5px] text-aquaInk" title={t.registry.address}>
                          {`Registry ${shortHash(t.registry.address, 8, 6)}`}
                        </span>
                      </span>
                    ) : t.registry.status === "PENDING" ? (
                      <span className="flex flex-col items-start gap-1 mt-1">
                        <span className="text-[10.5px] font-semibold px-2 py-0.5 bg-goldTint text-goldInk">
                          {t.registry.awaitingReceipt ? "Enviado a la red · esperando recibo" : "Registro en cola · operador RWAXI"}
                        </span>
                        {t.registry.lastError && (
                          <span className="text-[10.5px] text-[#B42318] max-w-[260px] break-words" data-registry-error title={t.registry.lastError}>
                            {`Último intento fallido: ${t.registry.lastError.length > 160 ? `${t.registry.lastError.slice(0, 160)}…` : t.registry.lastError}`}
                          </span>
                        )}
                        <button
                          disabled={!canAct}
                          data-deploy-registry={t.id}
                          onClick={() => open({ kind: "registry", tenant: t })}
                          className="text-[11px] font-semibold text-rxBlue inline-flex items-center gap-1 focus-ring disabled:opacity-40"
                        >
                          <Icon name="Network" size={12} />
                          Desplegar registro
                        </button>
                      </span>
                    ) : t.registry.status === "DEFERRED" || t.registry.status === "REVERTED" ? (
                      <span className="flex flex-col items-start gap-1 mt-1">
                        {t.registry.status === "DEFERRED" ? (
                          <span className="text-[10.5px] font-semibold px-2 py-0.5 bg-cloud text-muted">Registro diferido · faltan las wallets</span>
                        ) : (
                          <span className="text-[10.5px] font-semibold px-2 py-0.5 bg-[#FDECEA] text-[#B42318]">Despliegue revertido en red</span>
                        )}
                        <button
                          disabled={!canAct}
                          data-declare-wallets={t.id}
                          onClick={() => open({ kind: "wallets", tenant: t })}
                          className="text-[11px] font-semibold text-rxBlue inline-flex items-center gap-1 focus-ring disabled:opacity-40"
                        >
                          <Icon name="Wallet" size={12} />
                          Declarar wallets y desplegar
                        </button>
                      </span>
                    ) : (
                      <span className="block text-[10.5px] text-muted mt-1">Sin registro on-chain</span>
                    )}
                  </td>
                  <td
                    className="px-3 py-3.5 text-[11.5px] min-w-[220px]"
                    data-commercial-terms={t.slug}
                    data-platform-fee-bps={t.feeRules.platformFeeBps}
                    data-agreement={t.agreement?.id ?? ""}
                  >
                    <span className="font-mono text-[12px] text-rxPurple">{`${platformFeePercent(t.feeRules.platformFeeBps)} · ${t.feeRules.platformFeeBps} pb`}</span>
                    {t.agreement ? (
                      <span className="block text-[10.5px] text-muted mt-1">
                        {`Acuerdo ${t.agreement.reference} · firmado ${t.agreement.signedOn} `}
                        <a
                          href={`/api/vault/agreement/${t.agreement.id}`}
                          target="_blank"
                          rel="noreferrer"
                          data-agreement-link={t.agreement.id}
                          className="text-rxBlue font-semibold inline-flex items-center gap-0.5 focus-ring"
                        >
                          <Icon name="FileText" size={11} />
                          PDF
                        </a>
                        <span className="block font-mono" title={t.agreement.sha256}>{`SHA-256 ${shortHash(t.agreement.sha256, 10, 6)}`}</span>
                      </span>
                    ) : (
                      <span className="mt-1 inline-block text-[10.5px] font-semibold px-2 py-0.5 bg-goldTint text-goldInk">Sin acuerdo registrado</span>
                    )}
                    <button
                      disabled={!canAct}
                      data-commercial-terms-edit={t.id}
                      onClick={() => open({ kind: "terms", tenant: t })}
                      className="mt-1 text-[11px] font-semibold text-rxBlue flex items-center gap-1 focus-ring disabled:opacity-40"
                    >
                      <Icon name="FileSignature" size={12} />
                      Registrar acuerdo y comisión
                    </button>
                  </td>
                  <td className="px-3 py-3.5 min-w-[230px]">
                    {t.staff.map((u) => (
                      <div key={u.id} className="mb-2 last:mb-0" data-staff={u.email} data-staff-status={u.status}>
                        <p className="text-[11.5px] text-inkBody break-all">{u.email}</p>
                        <p className="text-[10.5px] text-muted">{STAFF_ROLE[u.role]}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className={`text-[10.5px] font-semibold px-2 py-0.5 ${STAFF_STATUS[u.status][1]}`}>
                            {STAFF_STATUS[u.status][0]}
                            {u.status === "PENDING" && u.invitationExpiresAt && ` · vence ${utc(u.invitationExpiresAt)}`}
                          </span>
                          {(u.status === "EXPIRED" || u.status === "NO_INVITATION") && (
                            <button
                              disabled={!canAct}
                              data-resend-invitation={u.id}
                              onClick={() => open({ kind: "invite", tenant: t, user: u })}
                              className="text-[11px] font-semibold text-rxBlue inline-flex items-center gap-1 focus-ring disabled:opacity-40"
                            >
                              <Icon name="Mail" size={12} />
                              Reenviar invitación
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-3.5 min-w-[240px]">
                    {t.offerings.length === 0 && <span className="text-muted text-[11.5px]">Sin proyectos aún</span>}
                    {t.offerings.map((o) => (
                      <div key={o.id} className="mb-2 last:mb-0" data-offering-capture={o.code} data-capture={o.capturePausedAt ? "paused" : "open"}>
                        <p className="text-inkBody">
                          <span className="font-mono text-[11px] text-muted">{o.code}</span> {o.assetName}
                        </p>
                        <p className="text-[10.5px] text-muted">
                          {o.tokenStatus === "DEPLOYED" || o.tokenStatus === "PAUSED"
                            ? `Token ${o.tokenSymbol} ${TOKEN_LABEL[o.tokenStatus]}`
                            : TOKEN_LABEL[o.tokenStatus ?? "NOT_DEPLOYED"]}
                          {!o.published && " · no publicado"}
                        </p>
                        {o.tokenFeeBps !== null && (o.tokenStatus === "DEPLOYED" || o.tokenStatus === "PAUSED") && (
                          <p className="text-[10.5px] text-muted" data-token-fee-bps={o.tokenFeeBps}>
                            {`Comisión ${platformFeePercent(o.tokenFeeBps)} fijada en el token`}
                          </p>
                        )}
                        {o.tokenStatus !== "DEPLOYED" && o.tokenStatus !== "PAUSED" && (
                          <div className="flex flex-col items-start gap-1 mt-1" data-token-deploy={o.code} data-token-status={o.tokenStatus ?? "NOT_DEPLOYED"}>
                            {o.tokenTx?.status === "PENDING" ? (
                              <span className="text-[10.5px] font-semibold px-2 py-0.5 bg-goldTint text-goldInk">
                                {o.tokenTx.awaitingReceipt ? "Token enviado a la red · esperando recibo" : "Token en cola · operador RWAXI"}
                              </span>
                            ) : o.tokenTx?.status === "REVERTED" ? (
                              <span className="text-[10.5px] font-semibold px-2 py-0.5 bg-[#FDECEA] text-[#B42318]">Despliegue del token revertido en red</span>
                            ) : null}
                            {o.tokenTx?.error && (
                              <span className="text-[10.5px] text-[#B42318] max-w-[240px] break-words" data-token-error title={o.tokenTx.error}>
                                {`Último intento fallido: ${o.tokenTx.error.length > 140 ? `${o.tokenTx.error.slice(0, 140)}…` : o.tokenTx.error}`}
                              </span>
                            )}
                            {o.reservations > 0 && (
                              <span className="text-[10.5px] text-muted" data-reservations={o.reservations}>
                                {`${o.reservations} reserva(s) de pre-venta esperan el token`}
                              </span>
                            )}
                            <button
                              disabled={!canAct || (t.tokenGaps.length > 0 && o.tokenTx?.status !== "PENDING")}
                              data-deploy-token={o.id}
                              onClick={() => open({ kind: "token", tenant: t, offering: o })}
                              className="text-[11px] font-semibold text-rxBlue inline-flex items-center gap-1 focus-ring disabled:opacity-40"
                            >
                              <Icon name="Network" size={12} />
                              Desplegar token
                            </button>
                            {t.tokenGaps.length > 0 && o.tokenTx?.status !== "PENDING" && (
                              <ul className="text-[10.5px] text-goldInk max-w-[240px] list-disc ps-4" data-token-gaps={t.tokenGaps.length}>
                                {t.tokenGaps.map((g) => (
                                  <li key={g}>{g}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span
                            className={`text-[10.5px] font-semibold px-2 py-0.5 ${o.capturePausedAt ? "bg-goldTint text-goldInk" : "bg-aquaTint text-aquaInk"}`}
                          >
                            {o.capturePausedAt ? `Captación pausada · ${o.capturePausedAt.slice(0, 10)}` : "Captación abierta"}
                          </span>
                          <button
                            disabled={!canAct}
                            data-capture-toggle={o.id}
                            onClick={() => open({ kind: "capture", tenant: t, offering: o, pause: !o.capturePausedAt })}
                            className="text-[11px] font-semibold text-rxBlue inline-flex items-center gap-1 focus-ring disabled:opacity-40"
                          >
                            <Icon name={o.capturePausedAt ? "Play" : "Pause"} size={12} />
                            {o.capturePausedAt ? "Reanudar captación" : "Pausar captación"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-3.5">
                    <label htmlFor={`gov-status-${t.slug}`} className="sr-only">
                      {`Estado del portal de ${t.displayName}`}
                    </label>
                    <select
                      id={`gov-status-${t.slug}`}
                      value={t.portalStatus}
                      disabled={!canAct}
                      onChange={(ev) => open({ kind: "status", tenant: t, to: ev.target.value as PortalStatusKey })}
                      className={`border border-line px-2 py-1.5 text-[11.5px] font-semibold font-mono focus-ring ${PORTAL_STATUS[t.portalStatus][1]}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`gov-pub-${t.slug}`}
                        checked={t.published}
                        disabled={!canAct}
                        label={`Publicado en Vitrina Pública RWAXI: ${t.displayName}`}
                        onChange={(next: boolean) => open({ kind: "publish", tenant: t, to: next })}
                      />
                      <span className="font-mono text-[10.5px] text-muted">{`isPublishedInRwaxi: ${String(t.published)}`}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono tnum">{t.leads.referral + t.leads.direct}</td>
                  <td className="px-5 py-3.5 text-right">
                    <a
                      href={envHref("portal", t.slug)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-rxBlue font-medium inline-flex items-center gap-1 focus-ring whitespace-nowrap"
                    >
                      {"Ver portal "}
                      <Icon name="ArrowUpRight" size={13} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-line p-5 flex flex-col gap-2 text-[12.5px] text-inkBody leading-[1.6]">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase mb-1">Efecto de los controles</p>
          <p>
            <strong className="text-rxPurple">ACTIVE:</strong>
            {" el portal opera y la vitrina permite ir a él."}
          </p>
          <p>
            <strong className="text-rxPurple">REVIEW:</strong>
            {" el portal funciona y la vitrina muestra el proyecto sin enlace al portal."}
          </p>
          <p>
            <strong className="text-rxPurple">SUSPENDED:</strong>
            {
              " bloquea solo la interfaz web del portal (off-chain): aviso institucional, sin NDA, KYC ni suscripciones nuevas. RWAXI no ejecuta ninguna transacción sobre el contrato del emisor; pausar el token on-chain es decisión exclusiva del desarrollador."
            }
          </p>
          <p>
            <strong className="text-rxPurple">Captación pausada:</strong>
            {
              " la oferta sigue visible, sin enlace para suscribir; el portal rechaza nuevas suscripciones mientras dure la pausa. Las ya firmadas continúan (pago fiduciario y emisión)."
            }
          </p>
          <p>
            <strong className="text-rxPurple">isPublishedInRwaxi:</strong>
            {" si está apagado, el desarrollador desaparece del catálogo público."}
          </p>
        </div>
        <div className="bg-white border border-line">
          <p className="px-5 py-3 border-b border-line font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
            Registro de auditoría · AuditEvent (plataforma)
          </p>
          {audit.length === 0 ? (
            <p className="px-5 py-4 text-[12.5px] text-muted">Aún no hay decisiones de plataforma registradas.</p>
          ) : (
            <ul className="max-h-[280px] overflow-y-auto">
              {audit.map((e) => (
                <li key={e.id} data-platform-audit={e.action} className="px-5 py-2.5 border-b border-line last:border-b-0 text-[12px]">
                  <span className="font-mono text-[11px] text-muted">{utc(e.at)}</span>
                  {" · "}
                  <span className="text-inkBody">{`${e.tenant}: ${e.summary}`}</span>
                  <span className="block text-[10.5px] text-muted font-mono">
                    {e.actorEmail}
                    {e.subjectHash && ` · SHA-256 ${e.subjectHash.slice(0, 14)}…`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {decision && info && (
        <Modal title={info.title} onClose={() => !busy && setDecision(null)} wide={true}>
          <div className="flex flex-col gap-4" data-governance-dialog>
            <p className="text-[13px] text-inkBody leading-relaxed">{info.effect}</p>
            {decision.kind === "registry" ? (
              <div className="flex flex-col gap-2">
                {decision.tenant.registry.lastError && (
                  <p className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12px] px-3 py-2 break-words">
                    {`Último intento fallido: ${decision.tenant.registry.lastError}`}
                  </p>
                )}
                <p className="font-mono text-[11px] text-muted">{`${decision.tenant.slug}.rwaxirealestate.com · deployTenantRegistry(bytes32,string,string,address,address) · red ${decision.tenant.registry.network ?? "—"}`}</p>
              </div>
            ) : decision.kind === "wallets" ? (
              <div className="grid sm:grid-cols-2 gap-4">
                {(
                  [
                    ["admin", "Wallet del administrador (TENANT_ADMIN)", "TENANT_ADMIN"],
                    ["officer", "Wallet del oficial de cumplimiento (COMPLIANCE_OFFICER)", "COMPLIANCE_OFFICER"],
                  ] as const
                ).map(([key, label, role]) => (
                  <div key={key} className="flex flex-col gap-1.5 min-w-0">
                    <label htmlFor={`gov-wallet-${key}`} className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted">
                      {label}
                    </label>
                    <input
                      id={`gov-wallet-${key}`}
                      value={wallets[key]}
                      onChange={(ev) => setWallets((w) => ({ ...w, [key]: ev.target.value }))}
                      placeholder="0x…"
                      spellCheck={false}
                      className={fieldCls(!!wallets[key].trim() && !WALLET.test(wallets[key].trim())) + " font-mono text-[12.5px]"}
                    />
                    <span className="text-[10.5px] text-muted break-all">
                      {decision.tenant.staff.find((u) => u.role === role)?.email ?? "sin usuario"}
                    </span>
                  </div>
                ))}
                {walletProblem && walletProblem !== "incomplete" && (
                  <p className="sm:col-span-2 text-[11.5px] text-[#B42318]" data-wallets-problem>
                    {walletProblem}
                  </p>
                )}
                <p className="sm:col-span-2 font-mono text-[11px] text-muted">{`${decision.tenant.slug}.rwaxirealestate.com · deployTenantRegistry(bytes32,string,string,address,address)`}</p>
              </div>
            ) : decision.kind === "token" ? (
              <div className="flex flex-col gap-2" data-token-dialog={decision.offering.code}>
                {decision.offering.tokenTx?.error && (
                  <p className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12px] px-3 py-2 break-words">
                    {`Último intento fallido: ${decision.offering.tokenTx.error}`}
                  </p>
                )}
                <p className="font-mono text-[11px] text-muted break-words">
                  {`${decision.tenant.slug}.rwaxirealestate.com · deployOfferingToken(bytes32,bytes32,(string,string,string,string,uint256,bytes32,uint16),address,address) · comisión ${decision.tenant.feeRules.platformFeeBps} pb · red ${decision.tenant.registry.network ?? "—"} · reservas por abrir a pago: ${decision.offering.reservations}`}
                </p>
              </div>
            ) : decision.kind === "terms" ? (
              <div className="grid sm:grid-cols-3 gap-4" data-terms-form>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label htmlFor="gov-fee-bps" className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted">
                    Comisión (puntos básicos)
                  </label>
                  <input
                    id="gov-fee-bps"
                    inputMode="numeric"
                    value={terms.bps}
                    onChange={(ev) => setTerms((t) => ({ ...t, bps: ev.target.value }))}
                    className={fieldCls(!!terms.bps.trim() && parsePlatformFeeBps(terms.bps) === null) + " font-mono text-[12.5px]"}
                  />
                  <span className="text-[10.5px] text-muted" data-fee-preview>
                    {parsePlatformFeeBps(terms.bps) === null
                      ? `${PLATFORM_FEE_BPS_MIN}–${PLATFORM_FEE_BPS_MAX} pb (0,25 %–5 %)`
                      : `${platformFeePercent(Number(terms.bps))} · hoy ${platformFeePercent(decision.tenant.feeRules.platformFeeBps)}`}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label htmlFor="gov-agreement-ref" className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted">
                    Referencia del acuerdo
                  </label>
                  <input
                    id="gov-agreement-ref"
                    value={terms.reference}
                    placeholder="RWX-COM-2026-014"
                    onChange={(ev) => setTerms((t) => ({ ...t, reference: ev.target.value }))}
                    className={fieldCls(false) + " font-mono text-[12.5px]"}
                  />
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label htmlFor="gov-agreement-date" className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted">
                    Fecha de firma
                  </label>
                  <input
                    id="gov-agreement-date"
                    type="date"
                    max={today()}
                    value={terms.signedOn}
                    onChange={(ev) => setTerms((t) => ({ ...t, signedOn: ev.target.value }))}
                    className={fieldCls(false) + " font-mono text-[12.5px]"}
                  />
                </div>
                <div className="sm:col-span-3 flex flex-col gap-1.5">
                  <label htmlFor="gov-agreement-file" className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted">
                    Acuerdo firmado (PDF)
                  </label>
                  <input
                    id="gov-agreement-file"
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={terms.uploading}
                    onChange={(ev) => void attachAgreement(ev.target.files?.[0])}
                    className="text-[12px] text-inkBody file:me-3 file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-[12px] file:font-semibold"
                  />
                  {terms.file && (
                    <span className="text-[11px] text-aquaInk font-mono break-all" data-agreement-verified={terms.file.sha256}>
                      {`${terms.file.name} · SHA-256 ${terms.file.sha256} · verificado por el servidor`}
                    </span>
                  )}
                  {terms.uploadError && (
                    <span className="text-[11.5px] text-[#B42318]" data-agreement-upload-error>
                      {terms.uploadError}
                    </span>
                  )}
                </div>
                {termsIssue && (terms.bps.trim() || terms.reference.trim()) && (
                  <p className="sm:col-span-3 text-[11.5px] text-[#B42318]" data-terms-problem>
                    {termsIssue}
                  </p>
                )}
              </div>
            ) : decision.kind === "invite" ? (
              <p className="font-mono text-[11px] text-muted">{`${decision.tenant.slug}.rwaxirealestate.com/backoffice/activate · ${decision.user.email} · ${STAFF_ROLE[decision.user.role]}`}</p>
            ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="gov-reason" className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted">
                {info.restrictive ? "Motivo (obligatorio, queda en el registro de auditoría)" : "Motivo (opcional)"}
              </label>
              <textarea
                id="gov-reason"
                value={reason}
                onChange={(ev) => setReason(ev.target.value)}
                rows={3}
                maxLength={300}
                className={fieldCls(false) + " text-[13px]"}
              />
            </div>
            )}
            {error && (
              <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setDecision(null)}
                disabled={busy}
                className="border border-line px-4 py-2.5 text-[12.5px] font-semibold text-inkBody focus-ring disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirm}
                disabled={
                  busy ||
                  (info.restrictive && reason.trim().length < 10) ||
                  (decision.kind === "wallets" && !walletsOk) ||
                  (decision.kind === "terms" && termsIssue !== null)
                }
                className="tc-btn px-4 py-2.5 text-[12.5px] font-semibold inline-flex items-center gap-2 focus-ring disabled:opacity-50"
              >
                {busy && <Icon name="Loader2" size={14} className="spin" />}
                Confirmar decisión
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
