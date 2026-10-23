// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { Icon } from "@/app/_components/ui/icon";
import { LayerTag, Progress } from "@/app/_components/ui/primitives";
import { CardGallery } from "@/app/_components/vitrina/card-gallery";
import { STAGES } from "@/app/_lib/data/projects";
import { alt, initials, money, nf, onColor, pct, shortHash } from "@/app/_lib/format";

export function ProjectCard({ p: e, currency: a, onOpen: t, photos: o, dev: n }) {
  const l = STAGES[e.stage],
    // committed units: live catalogue (rwaxi_public_offerings) or the prototype's subscribed share
    u = e.unitsSubscribed ?? Math.round(e.totalUnits * e.subscribed),
    r = e.totalUnits - u,
    i = [
      ["TIR Estimada", "Escenario base · E.A.", pct(e.tir)],
      [
        "Distribución Anual Est.",
        e.rentStart ? `Por renta · desde mes ${e.rentStart + 1}` : "Por renta",
        pct(e.dist),
      ],
      ["Valorización Anual Proy.", "Escenario base", pct(e.val)],
      ["Ticket Mínimo", alt(e.ticket, a), money(e.ticket, a)],
    ];
  return (
    <article
      data-offering={e.code ?? e.id}
      data-units-subscribed={u}
      data-total-units={e.totalUnits}
      data-min-ticket={e.ticket}
      data-stage={e.stage}
      className="bg-white border border-line flex flex-col min-w-0 hover:border-[#B9B2CC] transition-colors"
    >
      <CardGallery p={e} photos={o} st={l} />
      <div className="p-6 flex flex-col gap-5 flex-1">
        <div>
          <LayerTag n="1">Activo real</LayerTag>
          <h3 className="font-display font-semibold text-rxPurple text-[27px] leading-[1.08] mt-1 balance">
            {e.asset}
          </h3>
          <p className="text-[12.5px] text-muted mt-1">
            {e.type}
            {" · "}
            {e.region}
          </p>
        </div>
        <div className="border-t border-line pt-4">
          <LayerTag n="2">Vehículo Jurídico Independiente (Legal Wrapper)</LayerTag>
          <p className="text-[13px] text-inkBody mt-1 leading-[1.5]">
            <span className="text-muted">Vehículo:</span>{" "}
            <span className="font-semibold text-rxPurple">{e.wrapper}</span>{" "}
            <span className="text-goldInk font-semibold whitespace-nowrap">| Structured by RWAXI</span>
          </p>
          <p className="text-[11.5px] text-muted mt-0.5">
            {"Emisor: "}
            {e.vehicle}
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
            <span className="block text-muted">Desarrollador y emisor responsable</span>
            <span className="block font-semibold text-inkBody truncate">{n.legalName}</span>
          </span>
        </div>
        <div className="border-t border-line pt-4">
          <LayerTag n="3">Derecho económico</LayerTag>
          <p className="text-[13px] text-inkBody mt-1 leading-[1.55]">
            {e.right}
            {". "}
            <span className="text-muted">Escenario Estimado.</span>
          </p>
        </div>
        <dl className="grid grid-cols-2 border border-line">
          {i.map(([s, c, d], p) => (
            <div
              key={s}
              className={`p-3 min-w-0 ${p % 2 ? "border-l border-line" : ""} ${p > 1 ? "border-t border-line" : ""}`}
            >
              <dt className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted">{s}</dt>
              <dd
                className={`font-mono tnum mt-1 text-rxPurple ${p === 3 ? "text-[14px] break-words" : "text-[21px]"} leading-tight`}
              >
                {d}
              </dd>
              <dd className="text-[10.5px] text-muted mt-0.5">{c}</dd>
            </div>
          ))}
        </dl>
        <div>
          <div className="flex justify-between text-[11.5px] mb-1.5">
            <span className="font-semibold text-inkBody tnum">
              {pct(e.subscribed * 100, 0)}
              {" suscrito"}
            </span>
            <span className="font-mono text-muted tnum" data-units-label>
              {nf(0).format(u)}
              {" / "}
              {nf(0).format(e.totalUnits)}
              {" unidades"}
            </span>
          </div>
          <Progress value={e.subscribed} />
          <p className="mt-1.5 text-[10.5px] text-muted tnum">
            {nf(0).format(r)}
            {" unidades disponibles"}
          </p>
        </div>
        {n.portalStatus !== "ACTIVE" ? (
          <p className="mt-auto text-center text-[12.5px] font-semibold py-3 border border-line bg-cloud text-muted inline-flex items-center justify-center gap-2">
            <Icon name={n.portalStatus === "SUSPENDED" ? "PauseOctagon" : "Clock"} size={15} />
            {n.portalStatus === "SUSPENDED"
              ? "Portal suspendido temporalmente"
              : "Portal del desarrollador en revisión"}
          </p>
        ) : (
          <button
            onClick={() => t(e.id)}
            className="mt-auto tc-btn text-[13px] font-semibold tracking-[0.02em] py-3 px-4 inline-flex items-center justify-center gap-2 transition-colors focus-ring"
          >
            {"Ir al Portal Oficial del Desarrollador "}
            <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>
      <footer className="bg-aquaTint px-6 py-2.5 flex flex-wrap gap-x-3 gap-y-1 items-center text-[10.5px] text-aquaInk">
        <span className="font-mono tracking-[0.1em] text-[10px]">C4</span>
        <strong className="tracking-[0.08em] uppercase font-bold">Powered by RWAXI</strong>
        <span>
          {"OpenZeppelin · "}
          {e.chain}
        </span>
        <span className="font-mono">
          {"SHA-256 "}
          {shortHash(e.merkle, 6, 4)}
        </span>
      </footer>
    </article>
  );
}
