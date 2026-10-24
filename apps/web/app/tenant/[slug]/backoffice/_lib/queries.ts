import "server-only";
import { forTenant, type KycStatus, type RiskProfile } from "@rwaxi/database";
import { msg } from "@/app/_i18n/marks";
import { render, requestTranslate } from "@/app/_i18n/server";
import { spanish, type Translate } from "@/app/_i18n/translate";
import { TenantAccessError } from "@/app/_lib/server/tenant-context";
import { toAuditEntry } from "./audit";
import { deskSession, requireBackofficeSession, type BackofficeSession } from "./session";
import type { AuditEntry, ComplianceInboxData, ComplianceInboxResult, ComplianceRow, KycView, RiskKey } from "./types";

const KYC_VIEW: Record<KycStatus, KycView> = {
  NOT_STARTED: "no_iniciado",
  PENDING: "pendiente",
  APPROVED: "aprobado",
  REJECTED: "rechazado",
};

const RISK_VIEW: Record<RiskProfile, RiskKey> = {
  CONSERVATIVE: "conservador",
  MODERATE: "moderado",
  DYNAMIC: "dinamico",
};

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const DOC_LABEL: Record<string, string> = { CC: msg("C.C."), CE: msg("C.E."), PA: msg("Pasaporte"), NIT: "NIT" };

/** "CC" + "52381904" → "C.C. 52.381.904" · "NIT" + "901330448-2" → "NIT 901.330.448-2" · none yet → "—" */
export function formatDoc(docType: string | null, docNumber: string | null, tr: Translate = spanish): string {
  if (!docType || !docNumber) return "—";
  const [base = docNumber, dv] = docNumber.split("-");
  const grouped = /^\d+$/.test(base) ? group(base) : base;
  return `${DOC_LABEL[docType] ? tr(DOC_LABEL[docType]) : docType} ${grouped}${dv ? `-${dv}` : ""}`;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Documents and liveness recorded in KycCase.evidence by the portal (absent for seeded cases). */
function evidenceSummary(evidence: unknown, stored: Set<string>, tr: Translate): Pick<ComplianceRow, "documents" | "liveness"> {
  const ev = (evidence ?? {}) as {
    documents?: { kind?: unknown; name?: unknown; sha256?: unknown }[];
    liveness?: { method?: unknown; result?: unknown };
  };
  const documents = Array.isArray(ev.documents)
    ? ev.documents.flatMap((d) =>
        typeof d.name === "string" && typeof d.sha256 === "string"
          ? [{ kind: String(d.kind ?? ""), name: d.name, sha256: d.sha256, stored: stored.has(d.sha256.toLowerCase()) }]
          : [],
      )
    : [];
  const liveness =
    ev.liveness && typeof ev.liveness.result === "string"
      ? `${ev.liveness.result === "done" ? tr("Completada") : ev.liveness.result}${
          ev.liveness.method === "simulated" ? ` · ${tr("simulada (sin proveedor biométrico)")}` : ""
        }`
      : null;
  return { documents, liveness };
}

async function readInbox(session: BackofficeSession, tr: Translate): Promise<ComplianceInboxData> {
  const db = forTenant(session.tenant.id);
  const [org, investors, whitelistTxs, audit, vaultObjects] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: session.tenant.id },
      select: { slug: true, legalName: true, brandColor: true, complianceRegime: true },
    }),
    db.investor.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        leads: { orderBy: { landedAt: "desc" }, take: 1 },
        ndas: { orderBy: { acceptedAt: "desc" }, take: 1, select: { id: true } },
        kycCases: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { reviewedBy: { select: { email: true } } },
        },
      },
    }),
    db.chainTransaction.findMany({
      where: { kind: "INVESTOR_WHITELISTED" },
      orderBy: { createdAt: "desc" },
      select: { args: true, status: true, txHash: true },
    }),
    db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    db.vaultObject.findMany({ select: { sha256: true } }),
  ]);
  // Dossier documents whose file is in the tenant's DocumentVault (seeded cases predate it).
  const stored = new Set(vaultObjects.map((o) => o.sha256));

  // Latest whitelist operation per wallet.
  const whitelistByWallet = new Map<string, ComplianceRow["whitelist"]>();
  for (const tx of whitelistTxs) {
    const wallet = (tx.args as { wallet?: unknown } | null)?.wallet;
    if (typeof wallet === "string" && !whitelistByWallet.has(wallet.toLowerCase())) {
      whitelistByWallet.set(wallet.toLowerCase(), { status: tx.status, txHash: tx.txHash });
    }
  }

  const ptee = org.complianceRegime === "SAGRILAFT_PTEE";
  const rows: ComplianceRow[] = investors.map((inv) => {
    const lead = inv.leads[0];
    const kyc = inv.kycCases[0];
    const submitted = !!kyc && kyc.status !== "NOT_STARTED";
    return {
      investorId: inv.id,
      kycCaseId: kyc?.id ?? null,
      name: inv.fullName,
      doc: formatDoc(inv.docType, inv.docNumber, tr),
      source: lead?.source === "REFERRAL" ? "RWAXI" : "DIRECT",
      token: lead?.referralToken ?? null,
      at: day(lead?.landedAt ?? inv.createdAt),
      nda: inv.ndas.length > 0,
      kyc: kyc ? KYC_VIEW[kyc.status] : "no_iniciado",
      lists: kyc?.listsResult ?? "—",
      activity: kyc?.activity ?? null,
      incomeBracket: kyc?.incomeBracket ?? null,
      risk: kyc?.riskProfile ? RISK_VIEW[kyc.riskProfile] : null,
      isPep: kyc?.isPep ?? false,
      ptee: ptee && submitted,
      wallet: inv.walletAddress,
      dossierHash: kyc?.dossierHash ?? null,
      ...evidenceSummary(kyc?.evidence, stored, tr),
      whitelist: inv.walletAddress ? (whitelistByWallet.get(inv.walletAddress.toLowerCase()) ?? null) : null,
      rejectionReason: kyc?.rejectionReason ?? null,
      reviewedAt: kyc?.reviewedAt?.toISOString() ?? null,
      reviewedBy: kyc?.reviewedBy?.email ?? null,
    };
  });

  const entries: AuditEntry[] = audit.map((e) => toAuditEntry(e, tr));

  return {
    organization: {
      slug: org.slug,
      legalName: org.legalName,
      brandColor: org.brandColor,
      regime: org.complianceRegime === "SARLAFT" ? "sarlaft" : "sagrilaft",
    },
    reviewer: { name: session.reviewer.fullName, email: session.reviewer.email },
    session: deskSession(session, "COMPLIANCE_OFFICER"),
    rows,
    audit: entries,
  };
}

/** Compliance inbox of the tenant resolved from the host. Never throws: failures become `ok: false`. */
export async function loadComplianceInbox(): Promise<ComplianceInboxResult> {
  const tr = await requestTranslate("tenant");
  try {
    const session = await requireBackofficeSession("COMPLIANCE_OFFICER", { view: true });
    return { ok: true, data: await readInbox(session, tr) };
  } catch (e) {
    if (e instanceof TenantAccessError) return { ok: false, error: render(tr, e.reason) };
    console.error("[backoffice] compliance inbox failed", e);
    return { ok: false, error: tr("No se pudo leer la bandeja de cumplimiento desde la base de datos.") };
  }
}
