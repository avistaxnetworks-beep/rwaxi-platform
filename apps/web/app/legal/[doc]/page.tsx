import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requestI18n } from "@/app/_i18n/server";
import { makeTranslate } from "@/app/_i18n/translate";
import { LEGAL_DOCUMENTS, LegalDocument } from "@/app/vitrina/_components/legal-document";
import type { ConsentKey } from "@/app/vitrina/_lib/access-terms";

// www.rwaxirealestate.com/legal/{terms|privacy|cookies}: outside /vitrina (and its legal wall), see internalPath().
export const dynamic = "force-dynamic";

const isDoc = (doc: string): doc is ConsentKey => Object.hasOwn(LEGAL_DOCUMENTS, doc);

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  if (!isDoc(doc)) return {};
  const { locale, catalog } = await requestI18n("vitrina");
  return { title: `${makeTranslate(locale, catalog)(LEGAL_DOCUMENTS[doc].title)} · RWAXI` };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!isDoc(doc)) notFound();
  const { locale, catalog } = await requestI18n("vitrina");
  return <LegalDocument doc={doc} locale={locale} tr={makeTranslate(locale, catalog)} />;
}
