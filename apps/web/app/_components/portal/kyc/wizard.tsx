// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useState } from "react";
import { DropZone, sampleDoc } from "@/app/_components/portal/kyc/drop-zone";
import { Liveness } from "@/app/_components/portal/kyc/liveness";
import { CheckRow, Field, Stepper, fieldCls } from "@/app/_components/ui/form";
import { Icon } from "@/app/_components/ui/icon";
import { TrustNote } from "@/app/_components/ui/primitives";
import {
  ACTIVITIES,
  COUNTRIES,
  INCOME,
  REGIMES,
  RISK,
  incomeLabel,
  stepsFor,
  validateStep,
} from "@/app/_lib/data/kyc";
import { WALLET } from "@/app/_lib/data/projects";

export function Wizard({
  auth: e,
  data: a,
  setData: t,
  step: o,
  setStep: n,
  onSubmit: l,
  currency: r,
  entity: i = "el desarrollador",
  sarlaftText: s,
  regime: c = "sagrilaft",
}) {
  const d = stepsFor(c),
    p = REGIMES[c],
    [m, u] = useState({}),
    v = (f) => (N) =>
      t((x) => ({
        ...x,
        [f]: N,
      })),
    h = () => {
      const f = validateStep(o, a, c);
      u(f),
        !Object.keys(f).length &&
          (o < 3
            ? (n(o + 1),
              window.scrollTo({
                top: 0,
                behavior: "smooth",
              }))
            : l());
    },
    b = () => {
      u({}), n(o - 1);
    },
    y = () => {
      o === 0 &&
        t((f) => ({
          ...f,
          fullName: "María Fernanda Ríos Ospina",
          docType: "CC",
          docNumber: "1020456789",
          country: "Colombia",
        })),
        o === 1 &&
          t((f) => ({
            ...f,
            activity: "Profesional independiente",
            income: 1,
            risk: "moderado",
          })),
        o === 2 &&
          t((f) => ({
            ...f,
            docFront: sampleDoc("front"),
            docBack: f.docType === "CC" ? sampleDoc("back") : f.docBack,
          })),
        o === 3 &&
          t((f) => ({
            ...f,
            noPep: true,
            dataPolicy: true,
            terms: true,
            sarlaft: true,
            ptee: true,
            listas: true,
          })),
        u({});
    };
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-8 items-start">
      <div className="bg-white border border-line min-w-0">
        <div className="px-6 pt-6 pb-5 border-b border-line">
          <Stepper step={o} steps={d} />
        </div>
        <div className="p-6 flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
                Paso 0{o + 1}
                {" / 04"}
              </p>
              <h3 className="font-display font-semibold text-[28px] text-rxPurple leading-tight">{d[o]}</h3>
            </div>
            <button
              type="button"
              onClick={y}
              className="text-[12px] text-rxBlue underline underline-offset-2 focus-ring"
            >
              Completar con datos de ejemplo
            </button>
          </div>
          {o === 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Field
                  id="kyc-name"
                  label="Nombre completo"
                  error={m.fullName}
                  hint="Tal como aparece en el documento de identidad."
                >
                  <input
                    id="kyc-name"
                    autoComplete="name"
                    value={a.fullName}
                    onChange={(f) => v("fullName")(f.target.value)}
                    className={fieldCls(m.fullName)}
                  />
                </Field>
              </div>
              <Field id="kyc-doctype" label="Tipo de documento">
                <select
                  id="kyc-doctype"
                  value={a.docType}
                  onChange={(f) => v("docType")(f.target.value)}
                  className={fieldCls()}
                >
                  <option value="CC">Cédula de Ciudadanía</option>
                  <option value="PA">Pasaporte</option>
                </select>
              </Field>
              <Field id="kyc-docnum" label="Número de documento" error={m.docNumber}>
                <input
                  id="kyc-docnum"
                  inputMode={a.docType === "CC" ? "numeric" : "text"}
                  value={a.docNumber}
                  onChange={(f) =>
                    v("docNumber")(f.target.value.replace(a.docType === "CC" ? /\D/g : /[^A-Za-z0-9]/g, ""))
                  }
                  className={fieldCls(m.docNumber) + " font-mono"}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field
                  id="kyc-country"
                  label="País de residencia"
                  hint={
                    a.country === "Colombia"
                      ? "Residente en Colombia: aplica régimen cambiario local."
                      : "Inversionista no residente: se solicitará registro de inversión extranjera."
                  }
                >
                  <select
                    id="kyc-country"
                    value={a.country}
                    onChange={(f) => v("country")(f.target.value)}
                    className={fieldCls()}
                  >
                    {COUNTRIES.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          )}
          {o === 1 && (
            <div className="flex flex-col gap-5">
              {s && (
                <div className="bg-stone border border-line px-4 py-3 max-h-[280px] overflow-y-auto">{s}</div>
              )}
              <Field
                id="kyc-activity"
                label="¿Cuál es la actividad económica principal del origen de sus fondos?"
                error={m.activity}
              >
                <select
                  id="kyc-activity"
                  value={a.activity}
                  onChange={(f) => v("activity")(f.target.value)}
                  className={fieldCls(m.activity)}
                >
                  <option value="">Selecciona una opción</option>
                  {ACTIVITIES.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </Field>
              {a.activity === "Otra actividad" && (
                <Field id="kyc-activity-other" label="Describe la actividad" error={m.activityOther}>
                  <input
                    id="kyc-activity-other"
                    value={a.activityOther}
                    onChange={(f) => v("activityOther")(f.target.value)}
                    className={fieldCls(m.activityOther)}
                  />
                </Field>
              )}
              <fieldset className="flex flex-col gap-2">
                <legend className="text-[12px] font-semibold text-inkBody mb-1.5">
                  Ingresos anuales estimados
                </legend>
                <div className="grid sm:grid-cols-2 gap-2">
                  {INCOME.map((f, N) => (
                    <label
                      key={N}
                      className={`flex items-center gap-3 border px-4 py-3 cursor-pointer ${a.income === N ? "tc-border bg-[#F7F5FB]" : "border-line hover:border-[#B9B2CC]"}`}
                    >
                      <input
                        type="radio"
                        name="income"
                        id={`kyc-income-${N}`}
                        checked={a.income === N}
                        onChange={() => v("income")(N)}
                        className="accent-[#2F145F]"
                      />
                      <span className="font-mono text-[12.5px] text-inkBody tnum">{incomeLabel(f, r)}</span>
                    </label>
                  ))}
                </div>
                {m.income && <p className="text-[12px] text-[#B42318]">{m.income}</p>}
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-[12px] font-semibold text-inkBody mb-1.5">Perfil de riesgo</legend>
                <div className="grid sm:grid-cols-3 gap-2">
                  {RISK.map(([f, N, x]) => (
                    <label
                      key={f}
                      className={`flex flex-col gap-1 border p-4 cursor-pointer ${a.risk === f ? "tc-border bg-[#F7F5FB]" : "border-line hover:border-[#B9B2CC]"}`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="risk"
                          id={`kyc-risk-${f}`}
                          checked={a.risk === f}
                          onChange={() => v("risk")(f)}
                          className="accent-[#2F145F]"
                        />
                        <span className="text-[13.5px] font-semibold text-rxPurple">{N}</span>
                      </span>
                      <span className="text-[12px] text-muted leading-[1.5]">{x}</span>
                    </label>
                  ))}
                </div>
                {m.risk && <p className="text-[12px] text-[#B42318]">{m.risk}</p>}
              </fieldset>
            </div>
          )}
          {o === 2 && (
            <div className="flex flex-col gap-5">
              <div className={`grid gap-4 ${a.docType === "CC" ? "sm:grid-cols-2" : ""}`}>
                <DropZone
                  id="kyc-front"
                  label={a.docType === "CC" ? "Cédula · frente" : "Pasaporte · página de datos"}
                  file={a.docFront}
                  onFile={v("docFront")}
                  error={m.docFront}
                />
                {a.docType === "CC" && (
                  <DropZone
                    id="kyc-back"
                    label="Cédula · reverso"
                    file={a.docBack}
                    onFile={v("docBack")}
                    error={m.docBack}
                  />
                )}
              </div>
              <Liveness state={a.liveness} onChange={v("liveness")} error={m.liveness} />
            </div>
          )}
          {o === 3 && (
            <div className="flex flex-col gap-3">
              <CheckRow
                id="kyc-pep"
                checked={a.noPep}
                onChange={v("noPep")}
                error={m.noPep}
                title="Declaración de No-PEP"
              >
                Declaro que no soy Persona Expuesta Políticamente (PEP), ni familiar o asociado cercano de una
                PEP, en los términos del Decreto 830 de 2021. Me obligo a informar cualquier cambio en esta
                condición.
              </CheckRow>
              <CheckRow
                id="kyc-data"
                checked={a.dataPolicy}
                onChange={v("dataPolicy")}
                error={m.dataPolicy}
                title="Tratamiento de Datos Personales"
              >
                {"Autorizo a "}
                {i}, como Responsable del Tratamiento, y a RWAXI, como Encargado Tecnológico de
                Infraestructura que actúa por cuenta del Responsable, el tratamiento de mis datos conforme a
                la Ley 1581 de 2012.
              </CheckRow>
              <CheckRow
                id="kyc-terms"
                checked={a.terms}
                onChange={v("terms")}
                error={m.terms}
                title="Términos de Coinversión"
              >
                Acepto los términos de coinversión y entiendo que la TIR, las distribuciones y la valorización
                son escenarios estimados, y que mi capital está sujeto a riesgo.
              </CheckRow>
              <CheckRow
                id="kyc-listas"
                checked={a.listas}
                onChange={v("listas")}
                error={m.listas}
                title="Consulta en listas restrictivas"
              >
                {"Autorizo a "}
                {i}
                {
                  " a consultar mi información en listas restrictivas y vinculantes (ONU, OFAC y fuentes nacionales) como parte de la debida diligencia."
                }
              </CheckRow>
              {p.ptee && (
                <CheckRow
                  id="kyc-ptee"
                  checked={a.ptee}
                  onChange={v("ptee")}
                  error={m.ptee}
                  title="Programa de Transparencia y Ética Empresarial (PTEE)"
                >
                  {"Conozco y acepto el PTEE de "}
                  {i}, adoptado conforme al Capítulo XIII de la Circular Básica Jurídica de la
                  Superintendencia de Sociedades, y me comprometo a reportar cualquier situación de soborno o
                  corrupción relacionada con este negocio.
                </CheckRow>
              )}
              <CheckRow
                id="kyc-sarlaft"
                checked={a.sarlaft}
                onChange={v("sarlaft")}
                error={m.sarlaft}
                title={`Origen lícito de fondos (${p.sys})`}
              >
                {
                  "Declaro que la información suministrada es veraz y que mis recursos provienen de actividades lícitas, y autorizo su verificación conforme "
                }
                {p.sys === "SAGRILAFT"
                  ? "al Capítulo X de la Circular Básica Jurídica de la Superintendencia de Sociedades"
                  : "a la Parte I, Título IV, Capítulo IV de la Circular Básica Jurídica de la Superintendencia Financiera"}
                .
              </CheckRow>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-line bg-cloud flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={b}
            disabled={o === 0}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-rxPurple px-3 py-2.5 border border-transparent hover:border-line disabled:opacity-0 focus-ring"
          >
            <Icon name="ArrowLeft" size={15} />
            Atrás
          </button>
          <button
            type="button"
            onClick={h}
            className={`${o === 3 ? "bg-rxOrange hover:bg-[#F59C45] text-rxDeep" : "tc-btn"} font-semibold text-[13px] px-5 py-3 inline-flex items-center gap-2 focus-ring`}
          >
            {o === 3 ? "Enviar a revisión de cumplimiento" : "Continuar"}
            <Icon name="ChevronRight" size={15} />
          </button>
        </div>
      </div>
      <aside className="flex flex-col gap-4 min-w-0">
        <div className="bg-white border border-line p-5 flex flex-col gap-3">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Sesión</p>
          {e.method === "wallet" ? (
            <p className="text-[13px] text-inkBody">
              {"Billetera "}
              {e.wallet}
              <span className="block font-mono text-aquaInk text-[12px] mt-0.5">{WALLET}</span>
            </p>
          ) : (
            <p className="text-[13px] text-inkBody break-words">
              {e.email}
              <span className="block text-[12px] text-muted mt-0.5">
                Billetera: se vincula al aprobarse el perfil
              </span>
            </p>
          )}
        </div>
        <div className="bg-white border border-line p-5 flex flex-col gap-2.5">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Resumen</p>
          {[
            ["Titular", a.fullName || "—"],
            ["Documento", a.docNumber ? `${a.docType === "CC" ? "C.C." : "Pasaporte"} ${a.docNumber}` : "—"],
            ["Residencia", a.country],
            ["Perfil", (RISK.find((f) => f[0] === a.risk) || [0, "—"])[1]],
            ["Documento cargado", a.docFront ? "Sí" : "No"],
            ["Prueba de vida", a.liveness === "done" ? "Completada" : "Pendiente"],
          ].map(([f, N]) => (
            <div key={f} className="flex justify-between gap-3 text-[12.5px]">
              <span className="text-muted">{f}</span>
              <span className="text-inkBody font-medium text-right min-w-0 break-words">{N}</span>
            </div>
          ))}
        </div>
        <TrustNote />
      </aside>
    </div>
  );
}
