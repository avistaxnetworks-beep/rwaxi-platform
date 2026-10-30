// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { Icon } from "@/app/_components/ui/icon";
import { LayerTag, Progress } from "@/app/_components/ui/primitives";
import { CardGallery } from "@/app/_components/vitrina/card-gallery";
import { Num } from "@/app/_i18n/num";
import { useI18n } from "@/app/_i18n/provider";
import { STAGES } from "@/app/_lib/data/projects";
import { alt, initials, money, nf, onColor, pct, shortHash } from "@/app/_lib/format";

export function ProjectCard({ p: e, currency: a, onOpen: t, photos: o, dev: n }) {
  const { tr, rich } = useI18n();
  const l = STAGES[e.stage],
    // committed units: live catalogue (rwaxi_public_offerings) or the prototype's subscribed share
    u = e.unitsSubscribed ?? Math.round(e.totalUnits * e.subscribed),
    r = e.totalUnits - u,
    i = [
      ["tir", tr("TIR Estimada"), tr("Escenario base · E.A."), pct(e.tir)],
      [
        "dist",
        tr("Distribución Anual Est."),
        e.rentStart ? tr("Por renta · desde mes {month}", { month: e.rentStart + 1 }) : tr("Por renta"),
        pct(e.dist),
      ],
      ["val", tr("Valorización Anual Proy."), tr("Escenario base"), pct(e.val)],
      ["ticket", tr("Ticket Mínimo"), alt(e.ticket, a), money(e.ticket, a)],
    ];
  return (
    <article
      data-offering={e.code ?? e.id}
      data-units-subscribed={u}
      data-total-units={e.totalUnits}
      data-min-ticket={e.ticket}
      data-stage={e.stage}
      data-portal-status={n.portalStatus}
      data-capture={e.capturePaused ? "paused" : "open"}
      data-offering-status={e.status ?? "ACTIVE"}
      className="bg-white border border-line flex flex-col min-w-0 hover:border-[#B9B2CC] transition-colors"
    >
      {e.status === "STRUCTURING" && (
        <p
          data-coming-soon
          className="bg-rxDeep text-lav text-center text-[11.5px] font-bold tracking-[0.12em] uppercase px-4 py-2.5 inline-flex items-center justify-center gap-2"
        >
          <Icon name="Clock" size={14} />
          {tr("PROYECTO EN ESTRUCTURACIÓN - PRÓXIMAMENTE")}
        </p>
      )}
      <CardGallery p={e} photos={o} st={l} />
      <div className="p-6 flex flex-col gap-5 flex-1">
        <div>
          <LayerTag n="1">{tr("Activo real")}</LayerTag>
          <h3 className="font-display font-semibold text-rxPurple text-[27px] leading-[1.08] mt-1 balance">
            {e.asset}
          </h3>
          <p className="text-[12.5px] text-muted mt-1" data-offering-location>
            {e.type}
            {" · "}
            {e.region}
          </p>
        </div>
        <div className="border-t border-line pt-4">
          <LayerTag n="2">{tr("Vehículo Jurídico Independiente (Legal Wrapper)")}</LayerTag>
          <p className="text-[13px] text-inkBody mt-1 leading-[1.5]">
            <span className="text-muted">{tr("Vehículo:")}</span>{" "}
            <span className="font-semibold text-rxPurple">{tr(e.wrapper)}</span>{" "}
            <span className="text-goldInk font-semibold whitespace-nowrap">| Structured by RWAXI</span>
          </p>
          <p className="text-[11.5px] text-muted mt-0.5">
            {tr("Emisor:")} <bdi>{e.vehicle}</bdi>
          </p>
        </div>
        <div className="flex items-center gap-2.5 bg-cloud px-3 py-2.5">
          <span
            className="w-7 h-7 grid place-items-center font-display italic font-semibold text-[13px] shrink-0"
            style={{
              background: n.color,
              color: onColor(n.color),
            }}
            aria-hidden="true"
          >
            {initials(n.displayName)}
          </span>
          <span className="min-w-0 text-[11.5px] leading-tight">
            <span className="block text-muted">{tr("Desarrollador y emisor responsable")}</span>
            <bdi className="block font-semibold text-inkBody truncate">{n.legalName}</bdi>
          </span>
        </div>
        <div className="border-t border-line pt-4">
          <LayerTag n="3">{tr("Derecho económico")}</LayerTag>
          <p className="text-[13px] text-inkBody mt-1 leading-[1.55]" data-offering-right>
            {e.right}
            {". "}
            <span className="text-muted">{tr("Escenario Estimado.")}</span>
          </p>
        </div>
        <dl className="grid grid-cols-2 border border-line">
          {i.map(([k, s, c, d], p) => (
            <div
              key={k}
              className={`p-3 min-w-0 ${p % 2 ? "border-s border-line" : ""} ${p > 1 ? "border-t border-line" : ""}`}
            >
              <dt className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted">{s}</dt>
              <dd
                className={`font-mono mt-1 text-rxPurple ${p === 3 ? "text-[14px] break-words" : "text-[21px]"} leading-tight`}
              >
                <Num>{d}</Num>
              </dd>
              <dd className="text-[10.5px] text-muted mt-0.5">{p === 3 ? <Num>{c}</Num> : c}</dd>
            </div>
          ))}
        </dl>
        <div>
          <div className="flex justify-between gap-3 text-[11.5px] mb-1.5">
            <span className="font-semibold text-inkBody">
              {rich("{pct} suscrito", { pct: <Num>{pct(e.subscribed * 100, 0)}</Num> })}
            </span>
            <span className="font-mono text-muted" data-units-label>
              {rich(
                "{committed} / {total} unidades",
                {
                  committed: <Num>{nf(0).format(u)}</Num>,
                  total: <Num>{nf(0).format(e.totalUnits)}</Num>,
                },
                e.totalUnits,
              )}
            </span>
          </div>
          <Progress value={e.subscribed} />
          <p className="mt-1.5 text-[10.5px] text-muted">
            {rich("{n} unidades disponibles", { n: <Num>{nf(0).format(r)}</Num> }, r)}
          </p>
        </div>
        {n.portalStatus !== "ACTIVE" ? (
          <p className="mt-auto text-center text-[12.5px] font-semibold py-3 border border-line bg-cloud text-muted inline-flex items-center justify-center gap-2">
            <Icon name={n.portalStatus === "SUSPENDED" ? "PauseOctagon" : "Clock"} size={15} />
            {n.portalStatus === "SUSPENDED"
              ? tr("Portal suspendido temporalmente")
              : tr("Portal del desarrollador en revisión")}
          </p>
        ) : e.status === "STRUCTURING" ? (
          <p className="mt-auto text-center text-[12.5px] font-semibold py-3 border border-rxDeep bg-rxDeep text-lav inline-flex items-center justify-center gap-2">
            <Icon name="Clock" size={15} />
            {tr("Próximamente: captación aún no abierta")}
          </p>
        ) : e.status === "FUNDED" ? (
          <p className="mt-auto text-center text-[12.5px] font-semibold py-3 border border-line bg-aquaTint text-aquaInk inline-flex items-center justify-center gap-2">
            <Icon name="CheckCircle2" size={15} />
            {tr("Captación completada")}
          </p>
        ) : e.capturePaused ? (
          <p className="mt-auto text-center text-[12.5px] font-semibold py-3 border border-line bg-goldTint text-goldInk inline-flex items-center justify-center gap-2">
            <Icon name="Pause" size={15} />
            {tr("Captación pausada temporalmente")}
          </p>
        ) : (
          <button
            onClick={() => t(e.id)}
            className="mt-auto tc-btn text-[13px] font-semibold tracking-[0.02em] py-3 px-4 inline-flex items-center justify-center gap-2 transition-colors focus-ring"
          >
            {tr("Ir al Portal Oficial del Desarrollador")}{" "}
            <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
              ↗
            </span>
          </button>
        )}
      </div>
      <footer className="bg-aquaTint px-6 py-2.5 flex flex-wrap gap-x-3 gap-y-1 items-center text-[10.5px] text-aquaInk">
        <span className="font-mono tracking-[0.1em] text-[10px]">C4</span>
        <strong className="tracking-[0.08em] uppercase font-bold">Powered by RWAXI</strong>
        <span>
          <Num>
            {"OpenZeppelin · "}
            {e.chain}
          </Num>
        </span>
        <span className="font-mono">
          <Num>
            {"SHA-256 "}
            {shortHash(e.merkle, 6, 4)}
          </Num>
        </span>
      </footer>
    </article>
  );
}
