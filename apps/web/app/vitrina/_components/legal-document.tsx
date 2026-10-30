// RWAXI's legal documents (www.rwaxirealestate.com/legal/*): public and outside the vitrina's legal wall, because
// its consent checkboxes link to them. Texts delivered by RWAXI (server component).
import { vmsg } from "@/app/_i18n/marks";
import { dirOf, type Locale } from "@/app/_i18n/config";
import type { Translate } from "@/app/_i18n/translate";
import type { ConsentKey } from "../_lib/access-terms";

export const LEGAL_DOCUMENTS: Record<ConsentKey, { title: string; body: string[] }> = {
  terms: {
    title: vmsg("Términos y Condiciones y Exención de Responsabilidad"),
    body: [
      vmsg(
        "1. Naturaleza del Acceso Informativo: El ingreso a esta vitrina tiene un propósito estrictamente informativo y de descubrimiento tecnológico. Al acceder, el usuario reconoce que la visualización de los proyectos no constituye una oferta vinculante. RWAXI se reserva el derecho de admisión a su ecosistema transaccional y condiciona cualquier participación financiera futura a la superación exitosa de protocolos de debida diligencia (KYC/AML) y a la estricta validación de idoneidad del inversionista al momento de suscribir una inversión específica.",
      ),
      vmsg(
        "2. Ausencia de Oferta Pública y Exenciones Regulatorias: Los activos digitales representativos (tokens) presentados en esta plataforma no han sido ni serán registrados ante la Comisión de Bolsa y Valores de EE. UU. (SEC) bajo la Ley de Valores de 1933, ni inscritos en el Registro Nacional de Valores y Emisores (RNVE) de la Superintendencia Financiera de Colombia u otros reguladores. La información aquí dispuesta no constituye una solicitud general, oferta pública de valores, ni asesoría financiera o legal. Toda oportunidad se ejecutará bajo exenciones regulatorias (como Regulation S o equivalentes aplicables) verificando la elegibilidad del usuario de manera aislada previo al compromiso de capital.",
      ),
      vmsg(
        "3. Rol Tecnológico y Exención Absoluta de Responsabilidad: RWAXI Real Estate (constituida en Wyoming, EE. UU.) opera exclusivamente como proveedor de infraestructura de software (SaaS) y tecnología de registro distribuido (DLT). RWAXI no actúa como corredor de bolsa (broker-dealer), entidad financiera, gestor de fondos ni custodio. La plataforma no audita las proyecciones financieras ni garantiza el cumplimiento normativo individual de los emisores. RWAXI queda expresamente exonerada de toda responsabilidad frente a la viabilidad del activo, incumplimientos del desarrollador independiente, fallos sistémicos en redes blockchain, vulnerabilidades en contratos inteligentes (exploits) o la pérdida de activos derivada de la mala gestión de credenciales (billeteras de terceros) por parte del usuario.",
      ),
      vmsg(
        "4. Riesgos del Inversionista y Jurisdicción Exclusiva: Toda participación en activos inmobiliarios tokenizados conlleva un riesgo de pérdida total del capital, ausencia de liquidez y restricciones severas de transferencia. El usuario declara contar con la sofisticación necesaria para asumir dichos riesgos. Toda controversia legal o disputa derivada del uso de esta infraestructura tecnológica estará sujeta a las leyes del Estado de Wyoming, EE. UU., y se dirimirá de manera exclusiva mediante arbitraje vinculante e individual, renunciando el usuario de forma expresa e irrevocable al derecho de iniciar o participar en demandas colectivas (class-action waivers).",
      ),
    ],
  },
  privacy: {
    title: vmsg("Políticas de Tratamiento de Datos Personales"),
    body: [
      vmsg(
        "De conformidad con la Ley 1581 de 2012 (Ley Estatutaria de Habeas Data) y sus decretos reglamentarios, el usuario autoriza de manera previa, expresa e informada a RWAXI Real Estate y a las entidades emisoras (desarrolladores) la recolección, almacenamiento, uso y circulación de sus datos personales. La finalidad exclusiva de este tratamiento es la ejecución de procesos de debida diligencia (KYC/AML), vinculación y verificación de billeteras de terceros, validación de acceso al muro legal de la vitrina y notificaciones operativas. El titular conserva en todo momento el derecho a conocer, actualizar, rectificar y suprimir su información.",
      ),
    ],
  },
  cookies: {
    title: vmsg("Política de Cookies"),
    body: [
      vmsg(
        "Esta plataforma utiliza cookies técnicas, de sesión y de seguridad estrictamente necesarias para el funcionamiento del muro legal, la autenticación de usuarios (gestión del token de sesión de inversionista) y la protección contra accesos no autorizados. Al aceptar este documento y continuar la navegación, el usuario autoriza el almacenamiento de estos identificadores en su navegador, los cuales son indispensables para mantener su nivel de acceso (utilizando las cookies: rwaxi_vitrina_access, rwaxi_inv, rwaxi_session, rwaxi_vitrina_lang, rwaxi_portal_lang). Adicionalmente, la plataforma utiliza la cookie rwaxi_ref exclusivamente para fines de trazabilidad comercial y atribución de referidos.",
      ),
    ],
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
          {LEGAL_DOCUMENTS[doc].body.map((paragraph) => (
            <p key={paragraph} className="text-[13.5px] text-inkBody leading-relaxed max-w-[70ch]">
              {tr(paragraph)}
            </p>
          ))}
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
