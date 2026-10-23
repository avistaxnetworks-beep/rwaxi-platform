// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useState } from "react";
import { Field, fieldCls } from "@/app/_components/ui/form";
import { Modal } from "@/app/_components/ui/modal";
import { REGIMES } from "@/app/_lib/data/kyc";

export function OnboardTenantModal({ onClose: e, onCreate: a, existing: t }) {
  const [o, n] = useState({
      legalName: "",
      nit: "",
      displayName: "",
      contact: "",
      regime: "sagrilaft",
      color: "#1F4E79",
      setup: 8e3,
      monthly: 1200,
      usagePct: 1.2,
    }),
    [l, r] = useState({}),
    i = (d) => (p) =>
      n({
        ...o,
        [d]: p.target.type === "number" ? +p.target.value : p.target.value,
      }),
    s = (o.displayName || o.legalName)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/s\.a\.s\.?|s\.a\.?/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 18);
  return (
    <Modal title="Onboarding de nuevo desarrollador" onClose={e} wide={true}>
      <form
        onSubmit={(d) => {
          d.preventDefault();
          const p = {};
          o.legalName.trim().length < 5 && (p.legalName = "Escribe la razón social completa."),
            /^\d{3}\.\d{3}\.\d{3}-\d$/.test(o.nit)
              ? t.includes(o.nit) && (p.nit = "Ya existe un tenant con este NIT.")
              : (p.nit = "Formato 900.123.456-7."),
            /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(o.contact) ||
              (p.contact = "Correo del Oficial de Cumplimiento."),
            s || (p.displayName = "Necesitamos un nombre para el subdominio."),
            r(p),
            !Object.keys(p).length &&
              a({
                ...o,
                slug: s,
                displayName: o.displayName || o.legalName,
                logo: null,
                since: new Date().toISOString().slice(0, 10),
                fees: {
                  setup: o.setup,
                  monthly: o.monthly,
                  usagePct: o.usagePct,
                },
              });
        }}
        noValidate={true}
        className="flex flex-col gap-4"
        style={{
          "--tc": "#2F145F",
          "--tc-on": "#FFFFFF",
        }}
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Field id="on-legal" label="Razón social" error={l.legalName}>
            <input
              id="on-legal"
              value={o.legalName}
              onChange={i("legalName")}
              className={fieldCls(l.legalName)}
              placeholder="Constructora Ejemplo S.A.S."
            />
          </Field>
          <Field id="on-nit" label="NIT" error={l.nit}>
            <input
              id="on-nit"
              value={o.nit}
              onChange={i("nit")}
              className={fieldCls(l.nit) + " font-mono"}
              placeholder="900.123.456-7"
            />
          </Field>
          <Field
            id="on-name"
            label="Nombre comercial"
            error={l.displayName}
            hint={s ? `Portal: ${s}.rwaxi.com` : null}
          >
            <input
              id="on-name"
              value={o.displayName}
              onChange={i("displayName")}
              className={fieldCls(l.displayName)}
            />
          </Field>
          <Field id="on-contact" label="Correo del Oficial de Cumplimiento" error={l.contact}>
            <input
              id="on-contact"
              type="email"
              value={o.contact}
              onChange={i("contact")}
              className={fieldCls(l.contact)}
            />
          </Field>
          <Field id="on-regime" label="Régimen de cumplimiento">
            <select id="on-regime" value={o.regime} onChange={i("regime")} className={fieldCls()}>
              {Object.entries(REGIMES).map(([d, p]) => (
                <option key={d} value={d}>
                  {p.full}
                </option>
              ))}
            </select>
          </Field>
          <Field id="on-color" label="Color de marca inicial">
            <div className="flex gap-2">
              <input
                id="on-color"
                type="color"
                value={o.color}
                onChange={i("color")}
                className="w-11 h-11 p-0.5 border border-line"
              />
              <input
                aria-label="Hex"
                value={o.color}
                onChange={i("color")}
                className={fieldCls() + " font-mono"}
              />
            </div>
          </Field>
        </div>
        <fieldset className="border border-line p-4 grid sm:grid-cols-3 gap-3">
          <legend className="px-1 text-[12px] font-semibold text-inkBody">FeeRule inicial (USD)</legend>
          <Field id="on-setup" label="Setup / Onboarding">
            <input
              id="on-setup"
              type="number"
              min="0"
              value={o.setup}
              onChange={i("setup")}
              className={fieldCls() + " font-mono"}
            />
          </Field>
          <Field id="on-monthly" label="SaaS mensual">
            <input
              id="on-monthly"
              type="number"
              min="0"
              value={o.monthly}
              onChange={i("monthly")}
              className={fieldCls() + " font-mono"}
            />
          </Field>
          <Field id="on-usage" label="Uso (% del capital verificado)">
            <input
              id="on-usage"
              type="number"
              min="0"
              step="0.1"
              value={o.usagePct}
              onChange={i("usagePct")}
              className={fieldCls() + " font-mono"}
            />
          </Field>
        </fieldset>
        <p className="text-[11.5px] text-muted">
          El tenant se crea en estado REVIEW y sin publicación en vitrina. Se causa el Setup Fee al firmar; la
          suscripción SaaS empieza al activar el portal.
        </p>
        <button type="submit" className="tc-btn font-semibold text-[13px] py-3 focus-ring">
          Crear tenant y causar Setup Fee
        </button>
      </form>
    </Modal>
  );
}
