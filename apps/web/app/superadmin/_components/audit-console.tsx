"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { fieldCls } from "@/app/_components/ui/form";
import { ACTION_LABEL, AUDIT_ACTIONS, CATEGORY, CATEGORY_KEYS } from "../_lib/audit-catalog";
import type { AuditConsoleRow, PlatformMetricsResult } from "../_lib/types";

type Toast = (message: string) => void;
interface Filters {
  tenant: string;
  category: string;
  action: string;
  critical: boolean;
  q: string;
  from: string;
  to: string;
}
const EMPTY: Filters = { tenant: "", category: "", action: "", critical: false, q: "", from: "", to: "" };
const LIVE_MS = 8_000;
const utc = (iso: string) => `${iso.slice(0, 19).replace("T", " ")} UTC`;
const short = (h: string | null) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—");
const label = "text-[11px] font-semibold tracking-[0.06em] uppercase text-muted";
const INTEGRITY: Record<AuditConsoleRow["integrity"]["status"], [string, string]> = {
  verified: ["✓ sello verificado", "bg-aquaTint text-aquaInk"],
  mismatch: ["✗ sello no coincide", "bg-[#FDECEA] text-[#B42318]"],
  external: ["evidencia externa", "bg-cloud text-muted"],
  none: ["sin sello", "bg-cloud text-muted"],
};

function query(f: Filters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  if (f.tenant) p.set("tenant", f.tenant);
  if (f.category) p.set("category", f.category);
  if (f.action) p.set("action", f.action);
  if (f.critical) p.set("critical", "1");
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

/**
 * Module E · the audit trail of every developer and of the console itself (AuditEvent, append-only), filtered on the
 * server (GET /api/platform/audit) and kept live: every few seconds it asks for what came after the newest event it
 * holds. Each row says whether its seal still matches what it seals. The export is a CSV whose SHA-256 is recorded.
 */
export function AuditConsole({ metrics, toast }: { metrics: PlatformMetricsResult; toast: Toast }) {
  const tenants = metrics.ok ? metrics.data.tenants.map((t) => ({ id: t.id, name: t.displayName })) : [];
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [events, setEvents] = useState<AuditConsoleRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const newest = useRef<string | null>(null);

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/platform/audit?${query(f)}`, { cache: "no-store" });
      const body = (await r.json()) as { ok: boolean; events?: AuditConsoleRow[]; total?: number; nextBefore?: string | null; error?: string };
      if (!body.ok) throw new Error(body.error ?? "No se pudo leer la auditoría.");
      setEvents(body.events ?? []);
      setTotal(body.total ?? 0);
      setNextBefore(body.nextBefore ?? null);
      newest.current = body.events?.[0]?.cursor ?? null;
      setCheckedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la auditoría.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Filters apply on their own (the search box after a short pause).
  useEffect(() => {
    const t = setTimeout(() => setApplied(filters), filters.q === applied.q ? 0 : 400);
    return () => clearTimeout(t);
  }, [filters, applied.q]);
  useEffect(() => {
    void load(applied);
  }, [applied, load]);

  // Live: only what came after the newest event already on screen.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(async () => {
      try {
        const after = newest.current;
        const r = await fetch(`/api/platform/audit?${query(applied, after ? { after } : {})}`, { cache: "no-store" });
        const body = (await r.json()) as { ok: boolean; events?: AuditConsoleRow[]; total?: number };
        if (!body.ok) return;
        setCheckedAt(new Date().toISOString());
        const incoming = body.events ?? [];
        if (!after) {
          setEvents(incoming);
          setTotal(body.total ?? incoming.length);
          newest.current = incoming[0]?.cursor ?? null;
          return;
        }
        if (!incoming.length) return;
        newest.current = incoming[0]!.cursor;
        setEvents((prev) => {
          const known = new Set(prev.map((e) => e.id));
          const added = incoming.filter((e) => !known.has(e.id));
          setTotal((t) => (t ?? 0) + added.length);
          return [...added, ...prev];
        });
        setFresh(new Set(incoming.map((e) => e.id)));
        setTimeout(() => setFresh(new Set()), 6_000);
      } catch {
        /* the next tick tries again */
      }
    }, LIVE_MS);
    return () => clearInterval(timer);
  }, [live, applied]);

  const loadMore = async () => {
    if (!nextBefore) return;
    const r = await fetch(`/api/platform/audit?${query(applied, { before: nextBefore })}`, { cache: "no-store" });
    const body = (await r.json()) as { ok: boolean; events?: AuditConsoleRow[]; nextBefore?: string | null; error?: string };
    if (!body.ok) return setError(body.error ?? "No se pudo leer la auditoría.");
    setEvents((prev) => [...prev, ...(body.events ?? [])]);
    setNextBefore(body.nextBefore ?? null);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const r = await fetch(`/api/platform/audit?${query(applied, { format: "csv" })}`, { cache: "no-store" });
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo exportar.");
      const sha = r.headers.get("x-content-sha256") ?? "";
      const rows = r.headers.get("x-report-rows") ?? "0";
      const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "auditoria-rwaxi.csv";
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`Exportados ${rows} evento(s) · SHA-256 del archivo ${sha.slice(0, 18)}… (queda auditado)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      setExporting(false);
    }
  };

  const stats = useMemo(
    () => ({
      critical: events.filter((e) => e.critical).length,
      verified: events.filter((e) => e.integrity.status === "verified").length,
      mismatch: events.filter((e) => e.integrity.status === "mismatch").length,
      tenants: new Set(events.map((e) => e.tenant?.id ?? "platform")).size,
    }),
    [events],
  );
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className="flex flex-col gap-6" data-audit-console>
      <div className="bg-white border border-line px-5 py-3.5 text-[12px] text-muted leading-relaxed flex gap-2">
        <Icon name="ShieldCheck" size={15} className="text-rxGold mt-0.5 shrink-0" />
        <p>
          Todos los eventos de auditoría de todos los desarrolladores y de la consola. La tabla es de solo inserción para los roles de la
          aplicación; además, cada evento cuyo sello puede recalcularse desde el propio evento se verifica aquí (decisiones de la consola,
          acuerdos de suscripción, conciliaciones de pago, raíces de distribución, instrucciones de pago y transacciones simuladas). Un sello
          que no coincide indica una fila alterada fuera de la aplicación.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line">
        {(
          [
            ["total", "Eventos que coinciden", total === null ? "—" : String(total), `${events.length} cargados`],
            ["critical", "Críticos (cargados)", String(stats.critical), "comisiones · despliegues · bóveda · wallets"],
            ["verified", "Sellos verificados", String(stats.verified), stats.mismatch ? `${stats.mismatch} NO coinciden` : "ninguno alterado"],
            ["tenants", "Organizaciones", String(stats.tenants), "en los eventos cargados"],
          ] as const
        ).map(([id, title, value, sub]) => (
          <div key={id} className="bg-white p-4 min-w-0" data-kpi={`audit-${id}`} data-value={value}>
            <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">{title}</p>
            <p className={`font-mono text-[22px] tnum mt-1 ${id === "verified" && stats.mismatch ? "text-[#B42318]" : "text-rxPurple"}`}>{value}</p>
            <p className="text-[11px] text-muted mt-1">{sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-line p-4 flex flex-col gap-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-tenant" className={label}>
              Desarrollador
            </label>
            <select id="audit-tenant" value={filters.tenant} onChange={(e) => set("tenant", e.target.value)} className={fieldCls(false)}>
              <option value="">Todos</option>
              <option value="platform">Consola RWAXI (sin organización)</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-category" className={label}>
              Categoría
            </label>
            <select id="audit-category" value={filters.category} onChange={(e) => set("category", e.target.value)} className={fieldCls(false)}>
              <option value="">Todas</option>
              {CATEGORY_KEYS.map((c) => (
                <option key={c} value={c}>
                  {`${CATEGORY[c].label}${CATEGORY[c].critical ? " · crítica" : ""}`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-action" className={label}>
              Evento
            </label>
            <select id="audit-action" value={filters.action} onChange={(e) => set("action", e.target.value)} className={fieldCls(false)}>
              <option value="">Todos</option>
              {[...AUDIT_ACTIONS].sort((a, b) => ACTION_LABEL[a].localeCompare(ACTION_LABEL[b], "es")).map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-q" className={label}>
              Buscar
            </label>
            <input
              id="audit-q"
              value={filters.q}
              onChange={(e) => set("q", e.target.value)}
              placeholder="correo del actor, id de entidad o prefijo del hash"
              className={fieldCls(false)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-from" className={label}>
              Desde (UTC)
            </label>
            <input id="audit-from" type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} className={fieldCls(false) + " font-mono"} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-to" className={label}>
              Hasta (UTC)
            </label>
            <input id="audit-to" type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} className={fieldCls(false) + " font-mono"} />
          </div>
          <label className="inline-flex items-center gap-2 text-[12.5px] text-inkBody py-2.5">
            <input id="audit-critical" type="checkbox" checked={filters.critical} onChange={(e) => set("critical", e.target.checked)} />
            Solo críticos
          </label>
          <button onClick={() => setFilters(EMPTY)} className="border border-line px-3 py-2 text-[12px] font-semibold text-rxBlue focus-ring">
            Limpiar filtros
          </button>
          <div className="md:ml-auto flex flex-wrap items-center gap-3">
            <button
              onClick={() => setLive((v) => !v)}
              aria-pressed={live}
              data-live={live ? "on" : "off"}
              className={`inline-flex items-center gap-2 border px-3 py-2 text-[12px] font-semibold focus-ring ${live ? "border-rxAqua text-aquaInk" : "border-line text-muted"}`}
            >
              <span className={`inline-block w-2 h-2 rounded-full ${live ? "bg-rxAqua animate-pulse" : "bg-[#C9C4D6]"}`} />
              {live ? "En vivo" : "Pausado"}
            </button>
            <span className="text-[11px] text-muted font-mono">{checkedAt ? `actualizado ${utc(checkedAt)}` : ""}</span>
            <button
              onClick={exportCsv}
              disabled={exporting || loading}
              data-audit-export
              className="tc-btn px-3 py-2 text-[12px] font-semibold inline-flex items-center gap-1.5 focus-ring disabled:opacity-50"
            >
              <Icon name={exporting ? "Loader2" : "Download"} size={13} className={exporting ? "spin" : ""} />
              Exportar CSV
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
          {error}
        </p>
      )}

      <div className="bg-white border border-line overflow-x-auto" data-audit-total={total ?? ""}>
        <table className="w-full min-w-[1100px] text-[12px]">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
              <th className="font-semibold px-5 py-3">Fecha</th>
              <th className="font-semibold px-3 py-3">Desarrollador</th>
              <th className="font-semibold px-3 py-3">Evento</th>
              <th className="font-semibold px-3 py-3">Actor</th>
              <th className="font-semibold px-3 py-3">Detalle</th>
              <th className="font-semibold px-5 py-3">Sello SHA-256</th>
            </tr>
          </thead>
          <tbody>
            {!loading && events.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-5 text-muted">
                  Ningún evento coincide con los filtros.
                </td>
              </tr>
            )}
            {events.map((e) => (
              <AuditRow key={e.id} e={e} fresh={fresh.has(e.id)} open={open === e.id} toggle={() => setOpen(open === e.id ? null : e.id)} />
            ))}
          </tbody>
        </table>
        <div className="px-5 py-3 border-t border-line flex items-center justify-between text-[12px] text-muted">
          <span>{loading ? "Cargando…" : `${events.length} de ${total ?? "—"} evento(s)`}</span>
          {nextBefore && (
            <button onClick={loadMore} className="text-rxBlue font-semibold focus-ring" data-audit-more>
              Cargar más
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AuditRow({ e, fresh, open, toggle }: { e: AuditConsoleRow; fresh: boolean; open: boolean; toggle: () => void }) {
  const [text, cls] = INTEGRITY[e.integrity.status];
  return (
    <>
      <tr
        className={`border-b border-line align-top cursor-pointer hover:bg-cloud ${fresh ? "bg-[#ECFEFF]" : ""}`}
        onClick={toggle}
        data-audit-row={e.id}
        data-action={e.action}
        data-category={e.category}
        data-critical={e.critical ? "true" : "false"}
        data-integrity={e.integrity.status}
        data-tenant={e.tenant?.slug ?? "platform"}
        aria-expanded={open}
      >
        <td className="px-5 py-2.5 font-mono text-[11px] text-muted whitespace-nowrap">{utc(e.at)}</td>
        <td className="px-3 py-2.5 text-inkBody">{e.tenant?.name ?? "RWAXI · consola"}</td>
        <td className="px-3 py-2.5">
          <p className="text-inkBody font-semibold">{e.label}</p>
          <p className="text-[10.5px] text-muted">
            {e.categoryLabel}
            {e.chainKind && ` · ${e.chainKind}`}
          </p>
          {e.critical && <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-goldTint text-goldInk">CRÍTICO</span>}
        </td>
        <td className="px-3 py-2.5 text-muted break-all">{e.actorEmail}</td>
        <td className="px-3 py-2.5 text-inkBody">
          {e.subject && <p className="font-semibold">{e.subject}</p>}
          <p className="text-muted">{e.summary}</p>
        </td>
        <td className="px-5 py-2.5">
          <p className="font-mono text-[10.5px] text-muted">{short(e.subjectHash)}</p>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 ${cls}`}>{text}</span>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-cloud" data-audit-detail={e.id}>
          <td colSpan={6} className="px-5 py-3">
            <div className="grid md:grid-cols-[1fr_1.4fr] gap-4 text-[11.5px]">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted">Entidad</dt>
                <dd className="font-mono break-all">{`${e.entityType} · ${e.entityId}`}</dd>
                <dt className="text-muted">Evento</dt>
                <dd className="font-mono">{e.action}</dd>
                <dt className="text-muted">Sello</dt>
                <dd className="font-mono break-all">{e.subjectHash ?? "—"}</dd>
                <dt className="text-muted">Integridad</dt>
                <dd>{`${text} · ${e.integrity.method}`}</dd>
                <dt className="text-muted">IP</dt>
                <dd className="font-mono">{e.ipAddress ?? "—"}</dd>
              </dl>
              <pre className="bg-white border border-line p-3 font-mono text-[10.5px] text-inkBody overflow-auto max-h-[320px] whitespace-pre-wrap break-all">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
