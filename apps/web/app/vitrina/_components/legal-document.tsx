// RWAXI's legal documents (www.rwaxirealestate.com/legal/*): public and outside the vitrina's legal wall, because
// its consent checkboxes link to them. Texts delivered by RWAXI (server component).
import { vmsg } from "@/app/_i18n/marks";
import { dirOf, type Locale } from "@/app/_i18n/config";
import type { Translate } from "@/app/_i18n/translate";
import type { ConsentKey } from "../_lib/access-terms";

export const LEGAL_DOCUMENTS: Record<ConsentKey, { title: string; body: string }> = {
  terms: {
    title: vmsg("Términos y Condiciones y Exención de Responsabilidad"),
    body: vmsg(
      "RWAXI Real Estate opera exclusivamente como proveedor tecnológico y canal de descubrimiento para la estructuración y tokenización de activos inmobiliarios mediante contratos inteligentes sobre tecnología de registro distribuido (DLT), operando bajo el marco legal de propiedad fraccionada y derechos fiduciarios en Colombia. RWAXI no capta, administra ni custodia recursos financieros del público, ni realiza ofertas públicas de valores. El usuario reconoce que toda inversión inmobiliaria conlleva riesgos inherentes, incluyendo la iliquidez y la posible pérdida de capital. La ejecución, gestión y proyecciones financieras de cada activo recaen exclusivamente en el desarrollador independiente de cada proyecto.",
    ),
  },
  privacy: {
    title: vmsg("Políticas de Tratamiento de Datos Personales"),
    body: vmsg(
      "De conformidad con la Ley 1581 de 2012 (Ley Estatutaria de Habeas Data) y sus decretos reglamentarios, el usuario autoriza de manera previa, expresa e informada a RWAXI Real Estate y a las entidades emisoras (desarrolladores) la recolección, almacenamiento, uso y circulación de sus datos personales. La finalidad exclusiva de este tratamiento es la ejecución de procesos de debida diligencia (KYC/AML), vinculación y verificación de billeteras de terceros, validación de acceso al muro legal de la vitrina y notificaciones operativas. El titular conserva en todo momento el derecho a conocer, actualizar, rectificar y suprimir su información.",
    ),
  },
  cookies: {
    title: vmsg("Política de Cookies"),
    body: vmsg(
      "Esta plataforma utiliza cookies técnicas, de sesión y de seguridad estrictamente necesarias para el funcionamiento del muro legal, la autenticación de usuarios (gestión del token de sesión de inversionista) y la protección contra accesos no autorizados. Al aceptar este documento y continuar la navegación, el usuario autoriza el almacenamiento de estos identificadores en su navegador, los cuales son indispensables para mantener su nivel de acceso (utilizando las cookies: rwaxi_vitrina_access, rwaxi_inv, rwaxi_session, rwaxi_vitrina_lang, rwaxi_portal_lang). Adicionalmente, la plataforma utiliza la cookie rwaxi_ref exclusivamente para fines de trazabilidad comercial y atribución de referidos.",
    ),
  },
};

export function LegalDocument({ doc, locale, tr }: { doc: ConsentKey; locale: Locale; tr: Translate }) {
  return (
    <div lang={locale} dir={dirOf(locale)} className="min-h-screen bg-cloud flex flex-col" data-legal-document={doc}>
      <header className="bg-rxDeep">
        <div className="gutter max-w-[880px] mx-auto py-4 flex flex-wrap items-center justify-between gap-3">
          <a href="/" className="font-display font-semibold text-white text-[22px] tracking-[0.04em] focus-ring">
            RWAXI Real Estate
          </a>
          <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-lav">{tr("Documentos legales")}</span>
        </div>
      </header>
      <main className="flex-1 gutter max-w-[880px] w-full mx-auto py-10 flex flex-col gap-6">
        <nav aria-label={tr("Documentos legales")} className="flex flex-wrap gap-2">
          {(Object.keys(LEGAL_DOCUMENTS) as ConsentKey[]).map((key) => (
            <a
              key={key}
              href={`/legal/${key}`}
              aria-current={key === doc ? "page" : undefined}
              className={`text-[12px] font-semibold px-3 py-1.5 border focus-ring ${
                key === doc ? "bg-rxPurple text-white border-rxPurple" : "bg-white text-rxBlue border-line"
              }`}
            >
              {tr(LEGAL_DOCUMENTS[key].title)}
            </a>
          ))}
        </nav>
        <article className="bg-white border border-line px-6 py-8 flex flex-col gap-4">
          <h1 className="font-display font-semibold text-rxPurple text-[34px] leading-[1.1] balance">{tr(LEGAL_DOCUMENTS[doc].title)}</h1>
          <p className="inline-flex self-start text-[11px] font-bold tracking-[0.12em] uppercase px-3 py-1.5 bg-goldTint text-goldInk">
            {tr("Versión vigente")}
          </p>
          <p className="text-[13.5px] text-inkBody leading-relaxed max-w-[70ch]">{tr(LEGAL_DOCUMENTS[doc].body)}</p>
        </article>
        <a href="/" className="self-start text-[12.5px] font-semibold text-rxBlue focus-ring">
          <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
            ←
          </span>{" "}
          {tr("Volver a la vitrina")}
        </a>
      </main>
      <footer className="border-t border-line bg-white">
        <p className="gutter max-w-[880px] mx-auto py-5 text-[11px] text-muted">Powered by RWAXI Technology</p>
      </footer>
    </div>
  );
}
