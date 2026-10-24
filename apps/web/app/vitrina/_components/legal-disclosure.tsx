"use client";
import { useI18n } from "@/app/_i18n/provider";

/**
 * Legal and regulatory disclosure at the foot of the vitrina (formerly the «Frontera legal» section): RWAXI is a B2B
 * technology provider, each developer is the sole issuer, nothing here is a public offering or advice, and
 * projections are estimates.
 */
export function LegalDisclosure() {
  const { tr } = useI18n();
  const points: [string, string][] = [
    [
      tr("Naturaleza tecnológica B2B y no custodia"),
      tr(
        "RWAXI es un proveedor de software como servicio (SaaS) para desarrolladores y un canal de descubrimiento. No es sociedad fiduciaria, establecimiento bancario, sociedad comisionista de bolsa ni intermediario del mercado de valores; no capta recursos del público, no recibe los aportes de los inversionistas y no custodia llaves privadas ni activos digitales.",
      ),
    ],
    [
      tr("Emisor autónomo y relación contractual directa"),
      tr(
        "Cada desarrollador o vehículo de propósito especial (SPV) es el único emisor y responsable de su inmueble, de la información de su Data Room, de su proceso de conocimiento del inversionista (KYC/SAGRILAFT o SARLAFT) y del recaudo a través de sus cuentas fiduciarias o bancarias. El inversionista contrata directamente con el emisor.",
      ),
    ],
    [
      tr("Sin oferta pública no autorizada ni asesoría financiera"),
      tr(
        "La información de esta vitrina es referencial: no constituye oferta pública de valores ni recomendación o asesoría financiera, legal o tributaria. Los documentos vinculantes de cada proyecto están en el portal de su emisor: el Data Room se abre con la firma del NDA y la suscripción exige, además, la verificación KYC.",
      ),
    ],
    [
      tr("Advertencia de riesgos y proyecciones"),
      tr(
        "Toda inversión inmobiliaria implica riesgos, incluida la pérdida parcial o total del capital y una liquidez limitada. Las tasas de TIR, distribución y valorización proyectadas son estimaciones de cada desarrollador y no garantizan rendimientos fijos ni futuros.",
      ),
    ],
  ];
  return (
    <section className="gutter max-w-[1240px] mx-auto pt-8 pb-6 border-b border-line" aria-labelledby="aviso-legal" data-legal-disclosure>
      <h2 id="aviso-legal" className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-muted">
        {tr("Aviso legal y regulatorio")}
      </h2>
      <ol className="mt-4 grid md:grid-cols-2 gap-x-8 gap-y-4">
        {points.map(([title, body], i) => (
          <li key={title} className="flex gap-3 min-w-0" data-disclosure-point={i + 1}>
            <span className="font-mono text-[11px] text-goldInk shrink-0 pt-px">{`0${i + 1}`}</span>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-inkBody">{title}</p>
              <p className="text-[11.5px] leading-[1.6] text-muted mt-0.5">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
