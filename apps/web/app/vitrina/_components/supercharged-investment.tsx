"use client";
import { Icon } from "@/app/_components/ui/icon";
import { msg } from "@/app/_i18n/marks";
import { useI18n } from "@/app/_i18n/provider";

type Mark = "yes" | "partial" | "no";

/** Traditional real estate · fractional ownership on paper · tokenized ("supercharged") investment. */
const MATRIX: [string, Mark, Mark, Mark][] = [
  [msg("Acceso global 100 % digital"), "no", "partial", "yes"],
  [msg("Auditoría criptográfica del Data Room"), "no", "no", "yes"],
  [msg("Trazabilidad on-chain en tiempo real"), "no", "no", "yes"],
  [msg("Cálculo programable de rendimientos"), "no", "partial", "yes"],
  [msg("Custodia directa en tu wallet"), "no", "no", "yes"],
];

/**
 * «Tu Inversión Supercargada» (#beneficios-tokenizacion): what tokenization adds to the real-estate investment, with
 * the comparison against traditional and paper-fractional ownership. A table on wide screens, stacked rows on phones.
 */
export function SuperchargedInvestment() {
  const { tr } = useI18n();
  const benefits: [string, string, string][] = [
    [
      "Globe",
      tr("Alcance Global con el Mismo Capital"),
      tr(
        "Rompe las fronteras geográficas y accede desde cualquier lugar a negocios inmobiliarios institucionales con tickets accesibles, sin trámites notariales presenciales.",
      ),
    ],
    [
      "FileCheck2",
      tr("Respaldo Inmutable y Auditoría en Tiempo Real"),
      tr(
        "Cada documento del Data Room, cada unidad emitida y cada corte de distribución queda sellado en blockchain con prueba SHA-256 y árboles de Merkle verificables al instante.",
      ),
    ],
    [
      "Calculator",
      tr("Propiedad Programable y Rendimientos Exactos"),
      tr(
        "Tus tokens representan tu posición verificada en el proyecto. Cuando se declaran distribuciones de rentas o valorización, el cálculo de tu participación es exacto y auditable criptográficamente.",
      ),
    ],
    [
      "Wallet",
      tr("Portabilidad y Estándar Abierto No-Custodial"),
      tr(
        "Tus participaciones viven en tu propia wallet bajo estándares abiertos (ERC-20 con registro de cumplimiento), listas para transferencias autorizadas entre inversionistas en lista blanca sin semanas de papeleo.",
      ),
    ],
  ];
  const columns = [tr("Finca Raíz Tradicional"), tr("Fraccionamiento en Papel"), tr("Inversión Supercargada en Blockchain")];
  const label: Record<Mark, string> = { yes: tr("Sí"), partial: tr("Parcial"), no: tr("No") };
  const cell = (m: Mark, highlight: boolean) => (
    <span
      data-mark={m}
      className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${m === "yes" ? (highlight ? "text-rxAqua" : "text-white") : m === "partial" ? "text-[#D9A24A]" : "text-[#A79FC0]"}`}
    >
      <Icon name={m === "yes" ? "CheckCircle2" : m === "partial" ? "MinusCircle" : "XCircle"} size={16} className="shrink-0" />
      {label[m]}
    </span>
  );
  return (
    <section
      id="beneficios-tokenizacion"
      className="bg-rxDeep text-white scroll-mt-20 relative overflow-hidden"
      data-vitrina-section="beneficios-tokenizacion"
    >
      <div className="gutter max-w-[1240px] mx-auto py-14">
        <p className="font-mono text-[11.5px] tracking-[0.14em] uppercase text-lav">
          {tr("El nuevo estándar del patrimonio inmobiliario")}
        </p>
        <h2 className="font-display font-semibold text-white text-[32px] md:text-[44px] leading-[1.06] mt-2 max-w-[24ch] balance">
          {tr("No es solo finca raíz fraccionada. Es una Inversión Supercargada.")}
        </h2>
        <p className="mt-5 max-w-[80ch] text-[15.5px] leading-[1.7] text-[#C9C1E3]">
          {tr(
            "Con el mismo capital con el que antes quedabas atado a un trámite lento, local y de papel, hoy eres partícipe de un negocio inmobiliario global. La tokenización toma la seguridad histórica del ladrillo y la supercarga en blockchain con bondades que la inversión inmobiliaria tradicional —así sea fraccionada en papel— simplemente no permite.",
          )}
        </p>
        <ul className="mt-9 grid sm:grid-cols-2 xl:grid-cols-4 gap-px bg-white/10 border border-white/10">
          {benefits.map(([icon, title, body]) => (
            <li key={icon} className="bg-rxDeep p-6 flex flex-col gap-3 min-w-0" data-benefit>
              <span className="w-10 h-10 grid place-items-center border border-rxAqua/50 text-rxAqua shrink-0">
                <Icon name={icon} size={19} />
              </span>
              <h3 className="font-semibold text-[16px] leading-snug text-white">{title}</h3>
              <p className="text-[13.5px] leading-[1.65] text-[#C9C1E3]">{body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-10" data-comparison>
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-[#A79FC0] mb-3">
            {tr("Comparativo de modelos de inversión")}
          </p>
          {/* Wide screens: one table, the tokenized column highlighted. */}
          <table className="hidden md:table w-full table-fixed border border-white/10 text-start">
            <thead>
              <tr className="border-b border-white/10">
                <th scope="col" className="w-[34%] px-4 py-3">
                  <span className="sr-only">{tr("Característica")}</span>
                </th>
                {columns.map((c, i) => (
                  <th
                    key={c}
                    scope="col"
                    className={`px-4 py-3 text-start text-[12.5px] font-semibold leading-snug ${i === 2 ? "bg-white/5 text-rxAqua border-x border-rxAqua/40" : "text-[#C9C1E3]"}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map(([feature, ...marks]) => (
                <tr key={feature} className="border-b border-white/10 last:border-b-0" data-comparison-row>
                  <th scope="row" className="px-4 py-3 text-start text-[13px] font-medium text-white leading-snug">
                    {tr(feature)}
                  </th>
                  {marks.map((m, i) => (
                    <td key={i} className={`px-4 py-3 ${i === 2 ? "bg-white/5 border-x border-rxAqua/40" : ""}`}>
                      {cell(m, i === 2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {/* Phones: each feature with its three answers, no horizontal scrolling. */}
          <ul className="md:hidden flex flex-col gap-px bg-white/10 border border-white/10">
            {MATRIX.map(([feature, ...marks]) => (
              <li key={feature} className="bg-rxDeep px-4 py-3" data-comparison-row>
                <p className="text-[13px] font-semibold text-white">{tr(feature)}</p>
                <dl className="mt-2 flex flex-col gap-1.5">
                  {marks.map((m, i) => (
                    <div key={i} className="flex items-start justify-between gap-3">
                      <dt className={`text-[12px] leading-snug ${i === 2 ? "text-rxAqua font-semibold" : "text-[#C9C1E3]"}`}>{columns[i]}</dt>
                      <dd className="shrink-0">{cell(m, i === 2)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
