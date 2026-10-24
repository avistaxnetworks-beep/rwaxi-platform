"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { computeDataRoomRoot } from "@rwaxi/blockchain-sdk/merkle";
import { Icon } from "@/app/_components/ui/icon";
import { Modal } from "@/app/_components/ui/modal";
import { fieldCls } from "@/app/_components/ui/form";
import { REGIMES } from "@/app/_lib/data/kyc";
import { money, shortHash } from "@/app/_lib/format";
import { envHref } from "@/app/_lib/hosts";
import { samplePdf } from "@rwaxi/document-vault/sample";
import { sha256Bytes } from "@/app/_lib/sha256";
import { uploadToVault } from "@/app/_lib/vault-upload";
import { checkSlugAvailability, onboardDeveloper } from "../actions";
import {
  DOCUMENT_SLOTS,
  NETWORK_LABEL,
  OFFERING_STAGES,
  RENDER_KINDS,
  WRAPPERS,
  brandContrast,
  nitCheckDigit,
  nitIsValid,
  slugFrom,
  type OnboardingDocument,
  type OnboardingInput,
} from "../_lib/onboarding-shared";
import type { PlatformMetrics, PlatformMetricsResult } from "../_lib/types";

type Toast = (message: string) => void;
const STEPS = ["Empresa", "Equipo inicial", "Primera oferta", "Data Room base", "Tarifas y confirmación"] as const;
const label = "text-[11px] font-semibold tracking-[0.06em] uppercase text-muted";

const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
const randomDigits = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => String(b % 10)).join("");
function sampleNit(): string {
  const base = `9${randomDigits(8)}`;
  return `${base.slice(0, 3)}.${base.slice(3, 6)}.${base.slice(6, 9)}-${nitCheckDigit(base)}`;
}

function emptyInput(code: string, network: string): OnboardingInput {
  return {
    company: { legalName: "", displayName: "", taxId: "", slug: "", regime: "SAGRILAFT_PTEE", brandColor: "#1F4E79" },
    team: { admin: { fullName: "", email: "", wallet: "" }, officer: { fullName: "", email: "", wallet: "" } },
    offering: {
      code,
      assetName: "",
      city: "",
      region: "",
      assetType: "",
      stage: "PRESALE",
      renderKind: "suites",
      legalWrapperType: "FIDUCIARY_TRUST",
      legalEntityName: "",
      economicRight: "",
      unitPriceUsd: "100",
      totalUnits: "80000",
      minTicketUsd: "1000",
      assetValueUsd: "",
      targetIrrPct: "",
      distributionYieldPct: "",
      appreciationPct: "",
      rentStartMonths: "18",
      network,
      tokenSymbol: "",
    },
    documents: [],
    fees: { setupUsd: "8000", monthlyUsd: "1200", usagePct: "1.2" },
  };
}

/**
 * A Data Room file, uploaded at once to the vault's staging area: the server recomputes its SHA-256 and checks
 * its type; its receipt lets onboardDeveloper() move the verified bytes into the new tenant's vault.
 */
async function documentOf(
  slot: { folder: string; name: string; restricted: boolean },
  file: Blob,
  fileName: string,
): Promise<{ ok: true; doc: OnboardingDocument } | { ok: false; error: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = `0x${await sha256Bytes(bytes)}`;
  const uploaded = await uploadToVault(new Blob([bytes], { type: file.type }), fileName, "onboarding");
  if (!uploaded.ok || !uploaded.receipt) return { ok: false, error: (!uploaded.ok && uploaded.error) || "No se pudo subir el archivo a la bóveda." };
  return { ok: true, doc: { ...slot, sha256, sizeBytes: uploaded.sizeBytes, fileName, receipt: uploaded.receipt } };
}

/** Illustrative PDF of a base Data Room slot (the same bytes for the same developer and slot). */
const sampleFile = (legalName: string, slot: { folder: string; name: string }) =>
  new Blob(
    [
      samplePdf([
        "RWAXI - documento de ejemplo del Data Room",
        legalName,
        `${slot.folder} - ${slot.name}`,
        "Documento ilustrativo de demostracion: no constituye oferta ni contrato.",
      ]) as BlobPart,
    ],
    { type: "application/pdf" },
  );

function Text({ id, title, value, onChange, hint, mono, ...rest }: { id: string; title: string; value: string; onChange: (v: string) => void; hint?: ReactNode; mono?: boolean; placeholder?: string; inputMode?: "decimal" | "numeric" }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={id} className={label}>
        {title}
      </label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" className={fieldCls(false) + (mono ? " font-mono" : "")} {...rest} />
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/** Module A · persisted B2B onboarding of a developer (Super-Admin). */
export function OnboardingWizard({ metrics, toast }: { metrics: PlatformMetricsResult; toast: Toast }) {
  const [open, setOpen] = useState(false);
  if (!metrics.ok) return null;
  const { onboarding, admin } = metrics.data;
  return (
    <>
      <button
        disabled={!admin}
        onClick={() => setOpen(true)}
        className="tc-btn px-3.5 py-2 text-[12.5px] font-semibold inline-flex items-center gap-1.5 focus-ring disabled:opacity-50"
      >
        <Icon name="Plus" size={15} />
        Dar de Alta Nuevo Desarrollador (Onboarding Tenant)
      </button>
      {open && <Wizard defaults={onboarding} onClose={() => setOpen(false)} toast={toast} />}
    </>
  );
}

function Wizard({ defaults, onClose, toast }: { defaults: PlatformMetrics["onboarding"]; onClose: () => void; toast: Toast }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingInput>(() => emptyInput(defaults.nextOfferingCode, defaults.networks[0] ?? "POLYGON_AMOY"));
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugState, setSlugState] = useState<{ slug: string; available: boolean; reason: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  /** server answer per Data Room slot that refused its file (type, size or SHA-256) */
  const [rowError, setRowError] = useState<Record<number, string | null>>({});
  const [, startTransition] = useTransition();

  const set = <K extends keyof OnboardingInput>(section: K, patch: Partial<OnboardingInput[K]>) =>
    setForm((f) => ({ ...f, [section]: { ...(f[section] as object), ...patch } }));
  const setPerson = (who: "admin" | "officer", patch: Partial<OnboardingInput["team"]["admin"]>) =>
    setForm((f) => ({ ...f, team: { ...f.team, [who]: { ...f.team[who], ...patch } } }));

  // Subdomain: derived from the commercial name until edited, checked against the database as you type.
  const c = form.company;
  useEffect(() => {
    if (!slugEdited) setForm((f) => ({ ...f, company: { ...f.company, slug: slugFrom(f.company.displayName || f.company.legalName) } }));
  }, [c.displayName, c.legalName, slugEdited]);
  useEffect(() => {
    if (!c.slug) {
      setSlugState(null);
      return;
    }
    const slug = c.slug;
    const timer = setTimeout(async () => {
      const r = await checkSlugAvailability(slug);
      if (r.ok) setSlugState({ slug, available: r.available, reason: r.reason });
    }, 350);
    return () => clearTimeout(timer);
  }, [c.slug]);

  const raise = Number(form.offering.unitPriceUsd) * Number(form.offering.totalUnits);
  const root = useMemo(() => (form.documents.length ? computeDataRoomRoot(form.documents) : null), [form.documents]);
  const contrast = /^#[0-9a-fA-F]{6}$/.test(c.brandColor) ? brandContrast(c.brandColor) : 0;

  const stepError = (): string | null => {
    if (step === 0) {
      if (c.legalName.trim().length < 5) return "Escribe la razón social completa.";
      if (!nitIsValid(c.taxId)) return "NIT inválido: formato 900.123.456-7 con dígito de verificación correcto.";
      if (!slugState || slugState.slug !== c.slug) return "Verificando el subdominio…";
      if (!slugState.available) return `Subdominio: ${slugState.reason}`;
      if (contrast < 4.5) return "El color de marca no alcanza contraste AA (4,5:1).";
    }
    if (step === 1 && [form.team.admin, form.team.officer].some((p) => !p.fullName || !p.email || !p.wallet)) {
      return "Completa nombre, correo y wallet de ambos usuarios.";
    }
    if (step === 2 && (!form.offering.assetName || !form.offering.assetValueUsd || !form.offering.tokenSymbol)) return "Completa los datos de la oferta.";
    if (step === 3 && !form.documents.length) return "Adjunta al menos un documento base del Data Room.";
    return null;
  };

  const sample = async () => {
    setError(null);
    if (step === 0) {
      setSlugEdited(false);
      set("company", { legalName: "Constructora Costa Azul S.A.S.", displayName: "Costa Azul", taxId: sampleNit(), regime: "SAGRILAFT_PTEE", brandColor: "#1F4E79" });
    } else if (step === 1) {
      const domain = `${c.slug || "costaazul"}.co`;
      setPerson("admin", { fullName: "Laura Salazar Mejía", email: `admin@${domain}`, wallet: `0x${randomHex(20)}` });
      setPerson("officer", { fullName: "Andrés Felipe Rojas", email: `cumplimiento@${domain}`, wallet: `0x${randomHex(20)}` });
    } else if (step === 2) {
      set("offering", {
        assetName: `Residencias ${c.displayName || "Costa Azul"}`,
        city: "Cartagena",
        region: "Bocagrande",
        assetType: "Residencial turístico · renta corta",
        stage: "PRESALE",
        renderKind: "suites",
        legalWrapperType: "FIDUCIARY_TRUST",
        legalEntityName: `Patrimonio Autónomo ${c.displayName || "Costa Azul"}`,
        economicRight: "Participación en los flujos de renta corta y en la valorización estimada del activo",
        unitPriceUsd: "100",
        totalUnits: "80000",
        minTicketUsd: "1000",
        assetValueUsd: "12000000",
        targetIrrPct: "14.5",
        distributionYieldPct: "7.2",
        appreciationPct: "6.5",
        rentStartMonths: "18",
        tokenSymbol: (slugFrom(c.displayName || "costa azul").replace(/[^a-z]/g, "").slice(0, 3) || "TCA").toUpperCase(),
      });
    } else if (step === 3) {
      const results = await Promise.all(DOCUMENT_SLOTS.map((slot) => documentOf(slot, sampleFile(c.legalName, slot), `${slot.name}.pdf`)));
      const failed = results.find((r) => !r.ok);
      if (failed && !failed.ok) setError(failed.error);
      setForm((f) => ({ ...f, documents: results.flatMap((r) => (r.ok ? [r.doc] : [])) }));
    } else {
      set("fees", { setupUsd: "8000", monthlyUsd: "1200", usagePct: "1.2" });
    }
  };

  const attach = async (index: number, file: File | undefined) => {
    if (!file) return;
    const slot = DOCUMENT_SLOTS[index]!;
    setRowError((e) => ({ ...e, [index]: null }));
    const result = await documentOf(slot, file, file.name);
    if (!result.ok) return setRowError((e) => ({ ...e, [index]: result.error }));
    setForm((f) => ({ ...f, documents: [...f.documents.filter((d) => !(d.folder === slot.folder && d.name === slot.name)), result.doc] }));
  };
  const docOf = (slot: { folder: string; name: string }) => form.documents.find((d) => d.folder === slot.folder && d.name === slot.name);

  const next = () => {
    const problem = stepError();
    if (problem) return setError(problem);
    setError(null);
    setStep((s) => s + 1);
  };
  const submit = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await onboardDeveloper(form);
      setBusy(false);
      if (result.ok) {
        setCreated(result.slug ?? c.slug);
        toast(result.message);
      } else setError(result.error);
    });
  };

  const o = form.offering;
  return (
    <Modal title="Onboarding de nuevo desarrollador" onClose={() => !busy && onClose()} wide={true}>
      {created ? (
        <div className="flex flex-col gap-4" data-onboarded-slug={created}>
          <p className="text-[13px] text-inkBody leading-relaxed">
            {`${c.displayName || c.legalName} quedó creado en PostgreSQL en estado REVIEW y fuera de la vitrina. Se causó el Setup Fee y `}
            {"el despliegue de su RwaxiComplianceRegistry quedó en cola para el operador RWAXI. "}
            {`${form.team.admin.email} y ${form.team.officer.email} recibieron su enlace de activación (contraseña + TOTP), válido 72 horas.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={envHref("portal", created)} target="_blank" rel="noreferrer" className="tc-btn px-3.5 py-2 text-[12.5px] font-semibold inline-flex items-center gap-1.5">
              {`Abrir ${created}.rwaxi.com`}
              <Icon name="ArrowUpRight" size={14} />
            </a>
            <a href={envHref("backoffice", created)} target="_blank" rel="noreferrer" className="border border-line px-3.5 py-2 text-[12.5px] font-semibold text-rxBlue inline-flex items-center gap-1.5">
              Abrir su backoffice
              <Icon name="ArrowUpRight" size={14} />
            </a>
            <button onClick={onClose} className="ml-auto border border-line px-3.5 py-2 text-[12.5px] font-semibold text-inkBody focus-ring">
              Cerrar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4" data-onboarding-step={step}>
          <ol className="flex flex-wrap gap-x-4 gap-y-1">
            {STEPS.map((s, i) => (
              <li key={s} className={`text-[11.5px] font-semibold ${i === step ? "text-rxPurple" : i < step ? "text-aquaInk" : "text-muted"}`}>
                <span className="font-mono mr-1">{`0${i + 1}`}</span>
                {s}
              </li>
            ))}
          </ol>
          <div className="flex justify-end">
            <button onClick={() => void sample()} className="text-[12px] font-semibold text-rxBlue inline-flex items-center gap-1 focus-ring">
              <Icon name="FileText" size={13} />
              {step === 3 ? "Adjuntar documentos de ejemplo" : "Completar con datos de ejemplo"}
            </button>
          </div>

          {step === 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Text id="ob-legal" title="Razón social" value={c.legalName} onChange={(v) => set("company", { legalName: v })} placeholder="Constructora Ejemplo S.A.S." />
              <Text id="ob-nit" title="NIT" value={c.taxId} onChange={(v) => set("company", { taxId: v })} placeholder="900.123.456-7" mono hint={c.taxId && !nitIsValid(c.taxId) ? "Formato o dígito de verificación inválido" : null} />
              <Text id="ob-display" title="Nombre comercial" value={c.displayName} onChange={(v) => set("company", { displayName: v })} />
              <Text
                id="ob-slug"
                title="Subdominio del portal"
                value={c.slug}
                mono
                onChange={(v) => {
                  setSlugEdited(true);
                  set("company", { slug: v.toLowerCase() });
                }}
                hint={
                  <span data-slug-state={slugState?.slug === c.slug ? (slugState.available ? "available" : "taken") : "checking"}>
                    {`${c.slug || "…"}.rwaxi.com · `}
                    {slugState?.slug !== c.slug ? "verificando…" : slugState.available ? "disponible" : slugState.reason}
                  </span>
                }
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ob-regime" className={label}>
                  Régimen de cumplimiento
                </label>
                <select id="ob-regime" value={c.regime} onChange={(e) => set("company", { regime: e.target.value as OnboardingInput["company"]["regime"] })} className={fieldCls(false)}>
                  <option value="SAGRILAFT_PTEE">{REGIMES.sagrilaft.full}</option>
                  <option value="SARLAFT">{REGIMES.sarlaft.full}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ob-color" className={label}>
                  Color de marca
                </label>
                <div className="flex gap-2 items-center">
                  <input type="color" aria-label="Selector de color" value={/^#[0-9a-fA-F]{6}$/.test(c.brandColor) ? c.brandColor : "#000000"} onChange={(e) => set("company", { brandColor: e.target.value.toUpperCase() })} className="w-11 h-11 p-0.5 border border-line" />
                  <input id="ob-color" value={c.brandColor} onChange={(e) => set("company", { brandColor: e.target.value })} className={fieldCls(false) + " font-mono"} />
                </div>
                <p className={`text-[11px] ${contrast >= 4.5 ? "text-aquaInk" : "text-[#B42318]"}`}>{`Contraste ${contrast.toFixed(1)}:1 · ${contrast >= 4.5 ? "cumple AA" : "no cumple AA"}`}</p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid sm:grid-cols-2 gap-6">
              {(
                [
                  ["admin", "Administrador del tenant (TENANT_ADMIN)"],
                  ["officer", "Oficial de Cumplimiento (COMPLIANCE_OFFICER)"],
                ] as const
              ).map(([who, title]) => (
                <fieldset key={who} className="border border-line p-4 flex flex-col gap-3 min-w-0">
                  <legend className="px-1 text-[12px] font-semibold text-inkBody">{title}</legend>
                  <Text id={`ob-${who}-name`} title="Nombre completo" value={form.team[who].fullName} onChange={(v) => setPerson(who, { fullName: v })} />
                  <Text id={`ob-${who}-email`} title="Correo" value={form.team[who].email} onChange={(v) => setPerson(who, { email: v })} />
                  <Text id={`ob-${who}-wallet`} title="Wallet EVM" value={form.team[who].wallet} onChange={(v) => setPerson(who, { wallet: v })} mono placeholder="0x…" />
                </fieldset>
              ))}
              <p className="sm:col-span-2 text-[11.5px] text-muted">
                Las wallets reciben los roles del registro de cumplimiento del tenant (administrador y oficial). RWAXI no custodia ninguno.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="grid sm:grid-cols-3 gap-4">
              <Text id="ob-code" title="Código" value={o.code} onChange={(v) => set("offering", { code: v.toUpperCase() })} mono />
              <div className="sm:col-span-2">
                <Text id="ob-asset" title="Nombre del activo" value={o.assetName} onChange={(v) => set("offering", { assetName: v })} />
              </div>
              <Text id="ob-city" title="Ciudad" value={o.city} onChange={(v) => set("offering", { city: v })} />
              <Text id="ob-region" title="Zona / región" value={o.region} onChange={(v) => set("offering", { region: v })} />
              <Text id="ob-type" title="Tipo de activo" value={o.assetType} onChange={(v) => set("offering", { assetType: v })} />
              {(
                [
                  ["ob-stage", "Etapa", "stage", OFFERING_STAGES],
                  ["ob-render", "Render del activo", "renderKind", RENDER_KINDS],
                  ["ob-wrapper", "Vehículo jurídico", "legalWrapperType", Object.fromEntries(Object.entries(WRAPPERS).map(([k, w]) => [k, w.label]))],
                  ["ob-network", "Red", "network", Object.fromEntries(defaults.networks.map((n) => [n, NETWORK_LABEL[n] ?? n]))],
                ] as const
              ).map(([id, title, key, options]) => (
                <div key={id} className="flex flex-col gap-1.5">
                  <label htmlFor={id} className={label}>
                    {title}
                  </label>
                  <select id={id} value={o[key]} onChange={(e) => set("offering", { [key]: e.target.value } as Partial<OnboardingInput["offering"]>)} className={fieldCls(false)}>
                    {Object.entries(options).map(([value, text]) => (
                      <option key={value} value={value}>
                        {String(text)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <Text id="ob-symbol" title="Símbolo del token" value={o.tokenSymbol} onChange={(v) => set("offering", { tokenSymbol: v.toUpperCase() })} mono />
              <div className="sm:col-span-2">
                <Text id="ob-entity" title="Vehículo jurídico (razón social)" value={o.legalEntityName} onChange={(v) => set("offering", { legalEntityName: v })} />
              </div>
              <div className="sm:col-span-3">
                <Text id="ob-right" title="Derecho económico del inversionista" value={o.economicRight} onChange={(v) => set("offering", { economicRight: v })} />
              </div>
              <Text id="ob-unit" title="Precio por unidad (USD)" value={o.unitPriceUsd} onChange={(v) => set("offering", { unitPriceUsd: v })} mono inputMode="decimal" />
              <Text id="ob-units" title="Unidades totales" value={o.totalUnits} onChange={(v) => set("offering", { totalUnits: v })} mono inputMode="numeric" hint={raise ? `Captación: ${money(raise, "USD", false)}` : null} />
              <Text id="ob-ticket" title="Ticket mínimo (USD)" value={o.minTicketUsd} onChange={(v) => set("offering", { minTicketUsd: v })} mono inputMode="decimal" />
              <Text id="ob-value" title="Valor del activo (USD)" value={o.assetValueUsd} onChange={(v) => set("offering", { assetValueUsd: v })} mono inputMode="decimal" />
              <Text id="ob-irr" title="TIR objetivo (%)" value={o.targetIrrPct} onChange={(v) => set("offering", { targetIrrPct: v })} mono inputMode="decimal" />
              <Text id="ob-dist" title="Distribución anual (%)" value={o.distributionYieldPct} onChange={(v) => set("offering", { distributionYieldPct: v })} mono inputMode="decimal" />
              <Text id="ob-val" title="Valorización anual (%)" value={o.appreciationPct} onChange={(v) => set("offering", { appreciationPct: v })} mono inputMode="decimal" />
              <Text id="ob-rent" title="Meses hasta la renta" value={o.rentStartMonths} onChange={(v) => set("offering", { rentStartMonths: v })} mono inputMode="numeric" />
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-muted">
                Cada archivo se hashea (SHA-256) en este navegador y se sube a la bóveda documental, que recalcula su SHA-256 y verifica su tipo
                (PDF, imagen, DOCX o XLSX · máx. 20 MB) antes de guardarlo; la raíz de Merkle del Data Room se recalcula en el servidor con
                @rwaxi/blockchain-sdk.
              </p>
              <div className="border border-line overflow-x-auto">
                <table className="w-full min-w-[640px] text-[12px]">
                  <tbody>
                    {DOCUMENT_SLOTS.map((slot, i) => {
                      const doc = docOf(slot);
                      return (
                        <tr key={slot.folder + slot.name} className="border-b border-line last:border-b-0" data-doc-row={i} data-doc-loaded={doc ? "true" : "false"}>
                          <td className="px-3 py-2 text-muted font-mono text-[10.5px] whitespace-nowrap">{slot.folder}</td>
                          <td className="px-3 py-2 text-inkBody">
                            {slot.name}
                            <span className="block text-[10.5px] text-muted">{slot.restricted ? "Restringido (NDA + KYC)" : "Público"}</span>
                          </td>
                          <td className="px-3 py-2 font-mono text-[10.5px] text-muted">
                            {doc ? `${doc.fileName} · ${doc.sizeBytes} B · ${shortHash(doc.sha256, 10, 6)}` : "—"}
                            {doc?.receipt && <span className="block font-sans text-aquaInk" data-doc-verified>SHA-256 verificado en el servidor</span>}
                            {rowError[i] && (
                              <span role="alert" className="block font-sans text-[#B42318]" data-doc-error={i}>
                                {rowError[i]}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <label className="text-rxBlue font-semibold cursor-pointer text-[11.5px]">
                              {doc ? "Cambiar" : "Adjuntar"}
                              <input type="file" className="sr-only" data-doc-slot={i} onChange={(e) => void attach(i, e.target.files?.[0])} />
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="font-mono text-[11px] text-muted" data-dataroom-root={root ?? ""}>
                {root ? `${form.documents.length} documento(s) · Merkle root ${shortHash(root, 14, 8)}` : "Sin documentos adjuntos"}
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <fieldset className="border border-line p-4 grid sm:grid-cols-3 gap-3">
                <legend className="px-1 text-[12px] font-semibold text-inkBody">Tarifas pactadas (USD)</legend>
                <Text id="ob-setup" title="Setup / Onboarding" value={form.fees.setupUsd} onChange={(v) => set("fees", { setupUsd: v })} mono inputMode="decimal" />
                <Text id="ob-monthly" title="SaaS mensual" value={form.fees.monthlyUsd} onChange={(v) => set("fees", { monthlyUsd: v })} mono inputMode="decimal" />
                <Text id="ob-usage" title="Uso (% del capital verificado)" value={form.fees.usagePct} onChange={(v) => set("fees", { usagePct: v })} mono inputMode="decimal" />
              </fieldset>
              <dl className="grid sm:grid-cols-2 gap-px bg-line border border-line text-[12.5px]">
                {(
                  [
                    ["Desarrollador", `${c.legalName} · NIT ${c.taxId}`],
                    ["Portal", `${c.slug}.rwaxi.com · REVIEW · fuera de la vitrina`],
                    ["Usuarios", `${form.team.admin.email} (admin) · ${form.team.officer.email} (cumplimiento)`],
                    ["Oferta", `${o.code} · ${o.assetName} · ${OFFERING_STAGES[o.stage]}`],
                    ["Captación", `${money(raise || 0, "USD", false)} · ${o.totalUnits} unidades ${o.tokenSymbol}`],
                    ["Data Room", root ? `${form.documents.length} documentos · ${shortHash(root, 12, 6)}` : "—"],
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <div key={k} className="bg-white px-4 py-2.5">
                    <dt className="text-[10.5px] font-semibold tracking-[0.06em] uppercase text-muted">{k}</dt>
                    <dd className="text-inkBody mt-0.5 break-words">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-[11.5px] text-muted">
                El tenant se crea en estado REVIEW y sin publicación en vitrina. Se causa el Setup Fee al firmar; la suscripción SaaS empieza al
                activar el portal. El despliegue de su RwaxiComplianceRegistry queda en cola para el operador RWAXI.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
            <button
              onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
              disabled={busy}
              className="border border-line px-4 py-2.5 text-[12.5px] font-semibold text-inkBody focus-ring disabled:opacity-50"
            >
              {step === 0 ? "Cancelar" : "Anterior"}
            </button>
            {step < STEPS.length - 1 ? (
              <button onClick={next} className="tc-btn px-4 py-2.5 text-[12.5px] font-semibold inline-flex items-center gap-1.5 focus-ring">
                Continuar
                <Icon name="ArrowRight" size={14} />
              </button>
            ) : (
              <button onClick={submit} disabled={busy} className="tc-btn px-4 py-2.5 text-[12.5px] font-semibold inline-flex items-center gap-2 focus-ring disabled:opacity-50">
                {busy && <Icon name="Loader2" size={14} className="spin" />}
                Crear tenant y causar Setup Fee
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
