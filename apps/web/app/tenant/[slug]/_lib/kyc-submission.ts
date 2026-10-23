// Browser-side: turns the wizard's form state into the KycSubmission sent to submitKyc().
import { sha256Bytes } from "@/app/_lib/sha256";
import type { KycDocument, KycSubmission } from "./journey-types";

interface WizardFile {
  name: string;
  size?: number;
  type?: string;
  sha256?: string;
  src?: string | null;
  error?: string;
}

async function documentOf(file: WizardFile | null | undefined): Promise<KycDocument | null> {
  if (!file || file.error) return null;
  let { sha256, type, size } = file;
  if (!sha256 && file.src) {
    // Sample documents (and images previewed as data URLs) are hashed from their bytes here.
    const bytes = await (await fetch(file.src)).arrayBuffer();
    sha256 = await sha256Bytes(bytes);
    type ||= /^data:([^;,]+)/.exec(file.src)?.[1];
    size ||= bytes.byteLength;
  }
  if (!sha256) throw new Error(`No se pudo calcular el SHA-256 de ${file.name}; vuelve a cargarlo.`);
  return { name: file.name, size: size ?? 0, type: type || "application/octet-stream", sha256 };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the wizard state comes from the untyped prototype */
export async function toKycSubmission(data: any): Promise<KycSubmission> {
  const [docFront, docBack] = await Promise.all([documentOf(data.docFront), documentOf(data.docBack)]);
  return {
    fullName: String(data.fullName ?? ""),
    docType: String(data.docType ?? ""),
    docNumber: String(data.docNumber ?? ""),
    country: String(data.country ?? ""),
    wallet: String(data.wallet ?? ""),
    activity: String(data.activity ?? ""),
    activityOther: String(data.activityOther ?? ""),
    income: typeof data.income === "number" ? data.income : null,
    risk: String(data.risk ?? ""),
    docFront,
    docBack: data.docType === "CC" ? docBack : null,
    liveness: String(data.liveness ?? ""),
    noPep: data.noPep === true,
    dataPolicy: data.dataPolicy === true,
    terms: data.terms === true,
    sarlaft: data.sarlaft === true,
    ptee: data.ptee === true,
    listas: data.listas === true,
  };
}
