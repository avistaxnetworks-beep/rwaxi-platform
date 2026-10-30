import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { platformPrisma, retryTransient, type AuditAction, type AuditEvent, type Prisma } from "@rwaxi/database";
import { LocalizedError } from "@/app/_i18n/marks";
import { requirePlatformAccess } from "@/app/_lib/server/staff-auth";
import { toAuditEntry } from "@/app/tenant/[slug]/backoffice/_lib/audit";
import {
  ACTION_LABEL,
  ALERT_ACTIONS,
  CATEGORY,
  CATEGORY_KEYS,
  categoryOf,
  isAuditAction,
  isAuditCategory,
  isCritical,
  membersOf,
  type AuditCategory,
} from "@/app/superadmin/_lib/audit-catalog";
import { integrityOf } from "@/app/superadmin/_lib/audit-integrity";
import { csvOf, fileResponse, recordReportExport } from "@/app/superadmin/_lib/report-export";
import type { AuditConsoleRow } from "@/app/superadmin/_lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)\|([A-Za-z0-9_-]{1,64})$/;
const EXPORT_MAX = 10_000;

interface Filters {
  tenant: string | null;
  category: AuditCategory | null;
  action: AuditAction | null;
  critical: boolean;
  q: string;
  from: string | null;
  to: string | null;
}

class BadRequest extends Error {}

function parseFilters(sp: URLSearchParams): Filters {
  const tenant = sp.get("tenant") || null;
  if (tenant && tenant !== "platform" && !ID.test(tenant)) throw new BadRequest("Desarrollador inválido.");
  const category = sp.get("category") || null;
  if (category && !isAuditCategory(category)) throw new BadRequest("Categoría inválida.");
  const action = sp.get("action") || null;
  if (action && !isAuditAction(action)) throw new BadRequest("Acción inválida.");
  const day = (key: string) => {
    const v = sp.get(key) || null;
    if (v && (!DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))) throw new BadRequest("Fecha inválida (AAAA-MM-DD).");
    return v;
  };
  return {
    tenant,
    category: category as AuditCategory | null,
    action: action as AuditAction | null,
    critical: sp.get("critical") === "1",
    q: (sp.get("q") ?? "").trim().slice(0, 120),
    from: day("from"),
    to: day("to"),
  };
}

function categoryWhere(category: AuditCategory): Prisma.AuditEventWhereInput {
  const { actions, chainKinds, allConfirmations } = membersOf(category);
  if (allConfirmations) return { action: "CHAIN_TX_CONFIRMED" };
  return {
    OR: [
      ...(actions.length ? [{ action: { in: actions } }] : []),
      ...chainKinds.map((kind) => ({ action: "CHAIN_TX_CONFIRMED" as const, payload: { path: ["kind"], equals: kind } })),
    ],
  };
}

/** The filters as a database condition (every developer: the platform role reads past RLS, on the admin host only). */
function whereOf(f: Filters): Prisma.AuditEventWhereInput {
  const and: Prisma.AuditEventWhereInput[] = [];
  if (f.tenant === "platform") and.push({ organizationId: null });
  else if (f.tenant) and.push({ organizationId: f.tenant });
  if (f.action) and.push({ action: f.action });
  if (f.category) and.push(categoryWhere(f.category));
  if (f.critical) {
    and.push({
      OR: [
        ...CATEGORY_KEYS.filter((c) => CATEGORY[c].critical).map(categoryWhere),
        { action: { in: [...ALERT_ACTIONS] } },
      ],
    });
  }
  if (f.q) {
    and.push({
      OR: [
        { actorEmail: { contains: f.q, mode: "insensitive" } },
        { entityId: f.q },
        { subjectHash: { startsWith: f.q.toLowerCase() } },
        { entityType: f.q },
      ],
    });
  }
  if (f.from) and.push({ createdAt: { gte: new Date(`${f.from}T00:00:00Z`) } });
  if (f.to) and.push({ createdAt: { lt: new Date(Date.parse(`${f.to}T00:00:00Z`) + 86_400_000) } });
  return and.length ? { AND: and } : {};
}

function cursorWhere(raw: string | null, direction: "before" | "after"): Prisma.AuditEventWhereInput | null {
  if (!raw) return null;
  const m = CURSOR.exec(raw);
  if (!m) throw new BadRequest("Cursor inválido.");
  const at = new Date(m[1]!);
  const id = m[2]!;
  return direction === "before"
    ? { OR: [{ createdAt: { lt: at } }, { AND: [{ createdAt: at }, { id: { lt: id } }] }] }
    : { OR: [{ createdAt: { gt: at } }, { AND: [{ createdAt: at }, { id: { gt: id } }] }] };
}

type Row = AuditEvent & { organization: { id: string; displayName: string; slug: string } | null };
const short = (h: unknown) => (typeof h === "string" && h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : String(h ?? "—"));

function summaryOf(e: Row): { summary: string; subject: string | null } {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  if (e.action === "PLATFORM_REPORT_EXPORTED") {
    return { summary: `Reporte «${String(p.report)}» · ${String(p.rows)} fila(s) · SHA-256 ${short(p.sha256)}`, subject: "Consola RWAXI" };
  }
  if (e.action === "CHAIN_TX_CONFIRMED") {
    const mode = p.mode === "RPC" ? "en red" : p.mode === "SIMULATION" ? "simulación firmada, no difundida" : "";
    return {
      summary: [String(p.method ?? p.kind ?? "").split("(")[0], `tx ${short(p.txHash)}`, mode, p.via ? `vía ${String(p.via)}` : ""].filter(Boolean).join(" · "),
      subject: typeof p.investorName === "string" ? p.investorName : String(p.kind ?? "ChainTransaction"),
    };
  }
  const entry = toAuditEntry(e);
  return { summary: entry.detail ?? "—", subject: entry.investorName };
}

async function rowsOf(where: Prisma.AuditEventWhereInput, take: number): Promise<AuditConsoleRow[]> {
  const db = platformPrisma();
  const rows = (await retryTransient(
    () =>
      db.auditEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        include: { organization: { select: { id: true, displayName: true, slug: true } } },
      }),
    { repeatable: true },
  )) as Row[];
  // Simulated confirmations re-hash the signed transaction they confirmed.
  const chainIds = rows.filter((e) => e.action === "CHAIN_TX_CONFIRMED").map((e) => e.entityId);
  const chainTxs = chainIds.length
    ? await retryTransient(
        () => db.chainTransaction.findMany({ where: { id: { in: chainIds } }, select: { id: true, signedTransaction: true, executionMode: true } }),
        { repeatable: true },
      )
    : [];
  const chainById = new Map(chainTxs.map((t) => [t.id, t]));
  return rows.map((e) => {
    const kind = e.action === "CHAIN_TX_CONFIRMED" ? (e.payload as { kind?: unknown } | null)?.kind : undefined;
    const category = categoryOf(e.action, kind);
    const { summary, subject } = summaryOf(e);
    return {
      id: e.id,
      at: e.createdAt.toISOString(),
      cursor: `${e.createdAt.toISOString()}|${e.id}`,
      action: e.action,
      label: ACTION_LABEL[e.action],
      chainKind: typeof kind === "string" ? kind : null,
      category,
      categoryLabel: CATEGORY[category].label,
      critical: isCritical(e.action, kind),
      tenant: e.organization ? { id: e.organization.id, name: e.organization.displayName, slug: e.organization.slug } : null,
      actorEmail: e.actorEmail,
      entityType: e.entityType,
      entityId: e.entityId,
      subjectHash: e.subjectHash,
      subject,
      summary,
      integrity: integrityOf(e, chainById.get(e.entityId) ?? null),
      ipAddress: e.ipAddress,
      payload: e.payload,
    };
  });
}

/**
 * GET /api/platform/audit — the audit trail of every developer and of the console itself, for the Super-Admin console
 * (admin host, PLATFORM session; the platform role reads across tenants). Filters: tenant (an organization id or
 * "platform"), category, critical=1, action, q (actor e-mail, entity id, hash prefix), from/to (YYYY-MM-DD, UTC).
 * Pages newest first: ?before=<cursor>; live updates: ?after=<cursor> (what came after the newest row the console
 * holds). ?format=csv exports every match (up to 10 000) as a file whose SHA-256 is recorded (PLATFORM_REPORT_EXPORTED).
 */
export async function GET(req: NextRequest) {
  try {
    if ((await headers()).get("x-rwaxi-env") !== "admin") return NextResponse.json({ ok: false, error: "No encontrado." }, { status: 404 });
    const actor = await requirePlatformAccess();
    const sp = req.nextUrl.searchParams;
    const filters = parseFilters(sp);
    const base = whereOf(filters);

    if (sp.get("format") === "csv") {
      const rows = await rowsOf(base, EXPORT_MAX + 1);
      const truncated = rows.length > EXPORT_MAX;
      const kept = rows.slice(0, EXPORT_MAX);
      const { body, sha256 } = csvOf(
        ["fecha_utc", "desarrollador", "categoria", "critico", "accion", "evento", "actor", "entidad", "id_entidad", "sujeto", "resumen", "sello_sha256", "integridad"],
        kept.map((r) => [
          r.at,
          r.tenant?.name ?? "RWAXI (consola)",
          r.categoryLabel,
          r.critical ? "sí" : "no",
          r.action,
          r.label,
          r.actorEmail,
          r.entityType,
          r.entityId,
          r.subject ?? "",
          r.summary,
          r.subjectHash ?? "",
          r.integrity.status,
        ]),
      );
      const fileName = `auditoria-rwaxi-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
      await recordReportExport({ id: actor.user.id, email: actor.user.email }, "audit", {
        filters: { ...filters },
        rows: kept.length,
        truncated,
        sha256,
        fileName,
      });
      return fileResponse(body, fileName, sha256, kept.length);
    }

    const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50));
    const after = cursorWhere(sp.get("after"), "after");
    const before = cursorWhere(sp.get("before"), "before");
    const where = after || before ? { AND: [base, ...(after ? [after] : []), ...(before ? [before] : [])] } : base;
    const rows = await rowsOf(where, after ? 200 : limit + 1);
    const page = after ? rows : rows.slice(0, limit);
    const total = after ? null : await retryTransient(() => platformPrisma().auditEvent.count({ where: base }), { repeatable: true });
    return NextResponse.json(
      {
        ok: true,
        events: page,
        total,
        nextBefore: !after && rows.length > limit ? page.at(-1)!.cursor : null,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof BadRequest) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof LocalizedError) return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
    console.error("[platform] audit trail failed", e);
    return NextResponse.json({ ok: false, error: "No se pudo leer la auditoría consolidada." }, { status: 500 });
  }
}
