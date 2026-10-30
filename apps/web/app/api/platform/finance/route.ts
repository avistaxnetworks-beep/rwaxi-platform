import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { platformPrisma, retryTransient, type Prisma } from "@rwaxi/database";
import { LocalizedError } from "@/app/_i18n/marks";
import { requirePlatformAccess } from "@/app/_lib/server/staff-auth";
import { csvOf, fileResponse, recordReportExport } from "@/app/superadmin/_lib/report-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const CYCLE = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const KIND: Record<string, string> = {
  ONBOARDING_SETUP: "Setup / onboarding",
  MONTHLY_SAAS: "SaaS mensual",
  INFRASTRUCTURE_USAGE: "Comisión de plataforma por emisión",
};
const num = (d: { toString(): string } | null | undefined) => (d == null ? "" : Number(d.toString()).toFixed(2));
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

/**
 * GET /api/platform/finance?format=csv[&tenant=<id>][&cycle=YYYY-MM] — the B2B fee ledger for accounting: one row per
 * entry with its developer, billing cycle (month accrued), kind, status, amount and invoice. The investors' capital
 * appears only as the fiduciary base of each platform fee (the issuer's vehicle holds it; it is never RWAXI's revenue).
 * Admin host, PLATFORM session; the file's SHA-256 is recorded (PLATFORM_REPORT_EXPORTED).
 */
export async function GET(req: NextRequest) {
  try {
    if ((await headers()).get("x-rwaxi-env") !== "admin") return NextResponse.json({ ok: false, error: "No encontrado." }, { status: 404 });
    const actor = await requirePlatformAccess();
    const sp = req.nextUrl.searchParams;
    const tenant = sp.get("tenant") || null;
    const cycle = sp.get("cycle") || null;
    if ((tenant && !ID.test(tenant)) || (cycle && !CYCLE.test(cycle))) {
      return NextResponse.json({ ok: false, error: "Filtros inválidos: desarrollador o ciclo (AAAA-MM)." }, { status: 400 });
    }
    const where: Prisma.FeeLedgerEntryWhereInput = {
      ...(tenant ? { organizationId: tenant } : {}),
      ...(cycle
        ? { accruedOn: { gte: new Date(`${cycle}-01T00:00:00Z`), lt: new Date(Date.UTC(Number(cycle.slice(0, 4)), Number(cycle.slice(5, 7)), 1)) } }
        : {}),
    };
    const entries = await retryTransient(
      () =>
        platformPrisma().feeLedgerEntry.findMany({
          where,
          orderBy: [{ accruedOn: "asc" }, { id: "asc" }],
          include: {
            organization: { select: { displayName: true, slug: true, taxId: true } },
            invoice: { select: { number: true, issuedAt: true, paidOn: true, paymentReceipt: true } },
          },
        }),
      { repeatable: true },
    );
    const { body, sha256 } = csvOf(
      [
        "desarrollador",
        "nit",
        "ciclo",
        "fecha_devengo",
        "concepto",
        "estado",
        "monto_usd",
        "puntos_basicos",
        "base_fiduciaria_usd",
        "factura",
        "fecha_factura",
        "fecha_pago",
        "comprobante_pago",
        "evidencia",
      ],
      entries.map((e) => [
        e.organization.displayName,
        e.organization.taxId,
        day(e.accruedOn).slice(0, 7),
        day(e.accruedOn),
        KIND[e.kind] ?? e.kind,
        e.status,
        num(e.amountUsd),
        e.platformFeeBps ?? "",
        num(e.baseUsd),
        e.invoice?.number ?? "",
        day(e.invoice?.issuedAt),
        day(e.invoice?.paidOn),
        e.invoice?.paymentReceipt ?? "",
        e.evidence,
      ]),
    );
    const fileName = `comisiones-b2b-rwaxi${cycle ? `-${cycle}` : ""}-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    await recordReportExport({ id: actor.user.id, email: actor.user.email }, "fees", {
      filters: { tenant, cycle },
      rows: entries.length,
      truncated: false,
      sha256,
      fileName,
    });
    return fileResponse(body, fileName, sha256, entries.length);
  } catch (e) {
    if (e instanceof LocalizedError) return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
    console.error("[platform] fee report failed", e);
    return NextResponse.json({ ok: false, error: "No se pudo generar el reporte de comisiones." }, { status: 500 });
  }
}
