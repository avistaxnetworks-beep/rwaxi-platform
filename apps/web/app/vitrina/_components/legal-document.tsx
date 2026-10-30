// RWAXI's legal documents (www.rwaxirealestate.com/legal/*): public and outside the vitrina's legal wall, because
// its consent checkboxes link to them. Placeholder until the legal team delivers the texts (server component).
import { vmsg } from "@/app/_i18n/marks";
import { dirOf, type Locale } from "@/app/_i18n/config";
import type { Translate } from "@/app/_i18n/translate";
import type { ConsentKey } from "../_lib/access-terms";

export const LEGAL_DOCUMENTS: Record<ConsentKey, { title: string }> = {
  terms: { title: vmsg("Términos y Condiciones y Exención de Responsabilidad") },
  privacy: { title: vmsg("Políticas de Tratamiento de Datos Personales") },
  cookies: { title: vmsg("Política de Cookies") },
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
            {tr("Documento legal en redacción")}
          </p>
          <p className="text-[13.5px] text-inkBody leading-relaxed max-w-[70ch]">
            {tr("El equipo legal de RWAXI está redactando este documento. Su versión vigente se publicará en esta misma dirección.")}
          </p>
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
