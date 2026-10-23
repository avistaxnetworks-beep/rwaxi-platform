// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { Icon } from "@/app/_components/ui/icon";
import { useI18n } from "@/app/_i18n/provider";
import { PROJECTS } from "@/app/_lib/data/projects";
import { portalHost } from "@/app/_lib/hosts";

export function ArchBar({ env: e, setEnv: a, tenantId: t, setTenantId: o, tenants: n, openInspector: l }) {
  const { tr } = useI18n();
  const r = n[t],
    i =
      e === "vitrina"
        ? "www.rwaxi.com"
        : e === "portal"
          ? portalHost(r)
          : e === "superadmin"
            ? "admin.rwaxi.com"
            : `${r.slug}.rwaxi.com/backoffice`;
  return (
    <div className="bg-[#0E0620] text-white border-b border-white/10">
      <div className="gutter max-w-[1240px] mx-auto py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="font-mono text-[10.5px] tracking-[0.16em] text-[#A79FC0] inline-flex items-center gap-2">
          <Icon name="Network" size={14} className="text-rxAqua" />
          {tr("SIMULACIÓN DE ARQUITECTURA")}
        </span>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={tr("Entornos")}>
          {[
            ["vitrina", "1", tr("Vitrina pública"), tr("Marca RWAXI")],
            ["portal", "2", tr("Portal White Label"), tr("Marca del desarrollador")],
            ["backoffice", "3", tr("Backoffice del desarrollador"), tr("Tenant admin")],
            ["superadmin", "4", tr("Consola Super-Admin"), tr("Dirección RWAXI")],
          ].map(([c, d, p, m]) => (
            <button
              key={c}
              role="tab"
              aria-selected={e === c}
              onClick={() => a(c)}
              className={`px-3 py-1.5 text-start focus-ring border ${e === c ? "bg-white text-rxDeep border-white" : "border-white/15 text-white hover:bg-white/10"}`}
            >
              <span className="font-mono text-[10.5px] me-1.5 opacity-70">{d}</span>
              <span className="text-[12px] font-semibold">{p}</span>
              <span
                className={`hidden xl:inline text-[10.5px] ms-1.5 ${e === c ? "text-muted" : "text-[#A79FC0]"}`}
              >
                {"· "}
                {m}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={() => l()}
          className="px-3 py-1.5 border border-rxAqua/60 text-rxAqua hover:bg-rxAqua hover:text-rxDeep font-mono text-[11.5px] inline-flex items-center gap-1.5 focus-ring"
        >
          <Icon name="Link" size={13} />
          {tr("Inspector On-Chain (OpenZeppelin v5)")}
        </button>
        <div className="flex items-center gap-2 ms-auto min-w-0">
          <label
            htmlFor="tenant-sel"
            className={`text-[10.5px] font-mono tracking-[0.1em] ${e === "vitrina" || e === "superadmin" ? "text-white/40" : "text-[#A79FC0]"}`}
          >
            TENANT
          </label>
          <select
            id="tenant-sel"
            value={t}
            disabled={e === "vitrina" || e === "superadmin"}
            onChange={(c) => o(c.target.value)}
            className="bg-[#1D1236] border border-white/15 text-white text-[12px] px-2 py-1.5 disabled:opacity-40 focus-ring max-w-[200px]"
          >
            {PROJECTS.map((c) => (
              <option key={c.id} value={c.id}>
                {n[c.id].displayName}
              </option>
            ))}
          </select>
          <span className="hidden md:inline-flex items-center gap-1.5 bg-white/10 px-2.5 py-1.5 font-mono text-[11.5px] min-w-0">
            <Icon name="Lock" size={12} className="text-rxAqua shrink-0" />
            <bdi dir="ltr" className="truncate">
              https://{i}
            </bdi>
          </span>
        </div>
      </div>
    </div>
  );
}
