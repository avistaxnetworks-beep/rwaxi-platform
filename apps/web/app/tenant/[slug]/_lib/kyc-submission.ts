// Browser-side: turns the wizard's form state into the KycSubmission sent to submitKyc(). Each identity document
// is first uploaded to the DocumentVault, which verifies its bytes against the SHA-256 computed here.
import { LocalizedError } from "@/app/_i18n/marks";
import { uploadToVault } from "@/app/_lib/vault-upload";
import type { KycDocument, KycSubmission } from "./journey-types";

/** A document of the wizard that could not be uploaded; shown in the visitor's language. */
export class KycFileError extends LocalizedError {}

interface WizardFile {
  name: string;
  size?: number;
  type?: string;
  sha256?: string;
  /** image preview or sample document (data URL) */
  src?: string | null;
  /** the file chosen in this browser */
  file?: Blob | null;
  error?: string;
}

async function documentOf(file: WizardFile | null | undefined): Promise<KycDocument | null> {
  if (!file || file.error) return null;
  // The bytes: the file chosen in this browser, or the sample / preview data URL.
  const blob = file.file ?? (file.src ? await (await fetch(file.src)).blob() : null);
  if (!blob)
    throw new KycFileError("Vuelve a cargar {name}: el archivo ya no está disponible en este navegador.", {
      name: file.name,
    });
  const uploaded = await uploadToVault(blob, file.name, "kyc");
  if (!uploaded.ok || !uploaded.receipt) {
    throw uploaded.ok || uploaded.error === null
      ? new KycFileError("No se pudo subir {name} a la bóveda documental; inténtalo de nuevo.", {
          name: file.name,
        })
      : new KycFileError("{name}: {error}", { name: file.name, error: uploaded.error });
  }
  return {
    name: file.name,
    size: uploaded.sizeBytes,
    type: uploaded.mimeType,
    sha256: uploaded.sha256,
    receipt: uploaded.receipt,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the wizard state comes from the untyped prototype */
export async function toKycSubmission(data: any): Promise<KycSubmission> {
  const docFront = await documentOf(data.docFront);
  const docBack = data.docType === "CC" ? await documentOf(data.docBack) : null;
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
    docBack,
    liveness: String(data.liveness ?? ""),
    noPep: data.noPep === true,
    dataPolicy: data.dataPolicy === true,
    terms: data.terms === true,
    sarlaft: data.sarlaft === true,
    ptee: data.ptee === true,
    listas: data.listas === true,
  };
}
