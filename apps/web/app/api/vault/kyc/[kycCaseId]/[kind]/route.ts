import type { NextRequest } from "next/server";
import { forTenant } from "@rwaxi/database";
import { VaultError } from "@/app/_lib/server/vault";
import { serveVaultFile, vaultFailure } from "@/app/_lib/server/vault-access";
import { requireBackofficeSession } from "@/app/tenant/[slug]/backoffice/_lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ID = /^[a-z0-9]{20,40}$/i;
const KINDS = new Set(["front", "back"]);
const hex0x = (h: string) => (h.startsWith("0x") ? h : `0x${h}`).toLowerCase();

/**
 * GET /api/vault/kyc/{kycCaseId}/{front|back}[?download=1] — a supporting document of a KYC case, for the
 * Compliance Officer or the Administrator of the host's tenant (never the analyst, never another tenant: the
 * case is read under RLS). Re-hashed against the dossier's SHA-256 and recorded as KYC_DOCUMENT_VIEWED.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kycCaseId: string; kind: string }> },
) {
  try {
    const { kycCaseId, kind } = await params;
    if (!ID.test(kycCaseId) || !KINDS.has(kind))
      throw new VaultError("Documento no encontrado.").withStatus(404);
    const session = await requireBackofficeSession("COMPLIANCE_OFFICER", { view: true });
    if (!session.demo && session.role === "TENANT_ANALYST") {
      throw new VaultError(
        "Los documentos KYC sólo los abren el Oficial de Cumplimiento y el Administrador del tenant.",
      ).withStatus(403);
    }
    const tenantId = session.tenant.id;
    const db = forTenant(tenantId);
    const kyc = await db.kycCase.findUnique({
      where: { id: kycCaseId },
      select: { id: true, investorId: true, evidence: true, investor: { select: { fullName: true } } },
    });
    if (!kyc) throw new VaultError("Expediente no encontrado en este tenant.").withStatus(404);
    const documents =
      ((kyc.evidence ?? {}) as { documents?: { kind?: string; name?: string; sha256?: string }[] })
        .documents ?? [];
    const doc = documents.find(
      (d) => d.kind === kind && typeof d.sha256 === "string" && typeof d.name === "string",
    );
    if (!doc) throw new VaultError("Documento no encontrado.").withStatus(404);
    const object = await db.vaultObject.findUnique({
      where: { organizationId_sha256: { organizationId: tenantId, sha256: hex0x(doc.sha256!) } },
    });
    if (!object) throw new VaultError("Este documento no tiene archivo en la bóveda.").withStatus(404);
    return await serveVaultFile({
      tenantId,
      actor: { id: session.reviewer.id, email: session.reviewer.email },
      entityType: "KycCase",
      entityId: kyc.id,
      action: "KYC_DOCUMENT_VIEWED",
      file: {
        name: doc.name!,
        mimeType: object.mimeType,
        sha256: object.sha256,
        storageKey: object.storageKey,
      },
      payload: {
        kind,
        name: doc.name,
        investorId: kyc.investorId,
        investorName: kyc.investor.fullName,
        role: session.role,
        demo: session.demo,
      },
      download: req.nextUrl.searchParams.get("download") === "1",
    });
  } catch (e) {
    return vaultFailure(e);
  }
}
