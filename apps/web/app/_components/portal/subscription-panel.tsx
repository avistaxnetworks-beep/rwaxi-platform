"use client";
import type { CSSProperties, ReactNode } from "react";
import { LockedNote, type OpenedDoc } from "@/app/_components/portal/data-room-panel";
import { Icon } from "@/app/_components/ui/icon";
import { CopyChip } from "@/app/_components/ui/primitives";
import { REGIMES } from "@/app/_lib/data/kyc";
import { simulate } from "@/app/_lib/finance";
import { alt, money, nf, shortHash } from "@/app/_lib/format";
import { seededHex } from "@/app/_lib/hash";
import { useI18n } from "@/app/_i18n/provider";
import type { Currency, PortalJourney, PortalProject, PortalTenant } from "./portal-types";

/**
 * Step 4 of the funnel: subscription of units and the investor's portfolio. Subscribing needs the KYC approved by the
 * developer's compliance officer (the server enforces it too); a revoked investor keeps the minted tokens in view but
 * subscribes no more, and a frozen wallet takes no new subscription.
 */
export function SubscriptionPanel({
  t: e,
  p: a,
  journey: t,
  currency: o,
  amount: n,
  setAmount: l,
  startSub: r,
  openDoc: i,
  toast: s,
  suspended: c,
  distributionsSlot: w,
  toKyc: k,
}: {
  t: PortalTenant;
  p: PortalProject;
  journey: PortalJourney;
  currency: Currency;
  amount: number;
  setAmount: (amount: number) => void;
  startSub: (draft: { units: number; capital: number }) => void;
  openDoc: (doc: OpenedDoc) => void;
  toast: (message: string) => void;
  suspended: boolean;
  distributionsSlot?: ReactNode;
  /** to step 3, while the KYC is not approved yet */
  toKyc?: () => void;
}) {
  const { tr } = useI18n();
  // Revoked by the compliance officer: no new subscription, but the tokens already minted stay in view (never the reason).
  const revoked = t.kyc.status === "revocado",
    revokedNote = (
      <div data-subscribe-locked="revoked">
        <LockedNote text={tr("Tu verificación fue revocada: no se reciben nuevas suscripciones.")} />
      </div>
    );
  if (revoked && !t.holdings.length) return revokedNote;
  if (t.kyc.status !== "aprobado" && !revoked)
    return (
      <div className="flex flex-col gap-3 items-start" data-subscribe-locked="kyc">
        <LockedNote
          text={tr("La suscripción se habilita cuando el Oficial de Cumplimiento aprueba tu verificación KYC/{sys} (Paso 3).", {
            sys: REGIMES[e.regime].sys,
          })}
        />
        {k && t.nda && t.kyc.status !== "pendiente" && (
          <button onClick={k} className="tc-btn font-semibold text-[13px] px-5 py-3 inline-flex items-center gap-2 focus-ring">
            {tr("Completar verificación KYC (Paso 3)")}
            <Icon name="ArrowRight" size={15} className="rtl:-scale-x-100" />
          </button>
        )}
      </div>
    );
  // t.offering: availability and token state persisted in PostgreSQL (portal-screen applyPersisted).
  const d = simulate(a, n, 60),
    p = t.offering ? t.offering.tokenDeployed : e.mint.status === "minted",
    f = t.offering ? t.offering.tokenPaused : e.tokenPaused,
    x = t.offering ? t.offering.totalUnits - t.offering.unitsSubscribed : null,
    m = 25e4,
    terms: [string, string][] = [
      [tr("Unidades digitales"), nf(0).format(d.units)],
      [tr("Contrato"), `${tr("Suscripción")} · ${tr(a.wrapper)}`],
      [tr("Contraparte"), `${e.legalName} · NIT ${e.nit}`],
      ["Token", p ? `${e.mint.symbol} · ${e.mint.network}` : tr("Pendiente de emisión (reserva)")],
      ...(x === null || !t.offering
        ? []
        : ([
            [
              tr("Disponibles"),
              tr("{available} de {total} unidades", {
                available: nf(0).format(x),
                total: nf(0).format(t.offering.totalUnits),
                count: t.offering.totalUnits,
              }),
            ],
          ] as [string, string][])),
    ];
  return (
    <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
      <div className="flex flex-col gap-4 min-w-0">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <label htmlFor="sub-amt" className="text-[12px] font-semibold tracking-[0.06em] uppercase text-muted">
            {tr("Monto a suscribir")}
          </label>
          <span className="text-right">
            <span className="block font-mono text-[24px] text-rxPurple tnum leading-tight">{money(d.capital, o, false)}</span>
            <span className="block font-mono text-[11.5px] text-muted">{alt(d.capital, o, false)}</span>
          </span>
        </div>
        <input
          id="sub-amt"
          type="range"
          min={a.ticket}
          max={m}
          step={a.unit}
          value={n}
          onChange={(u) => l(+u.target.value)}
          className="rx-range w-full"
          style={
            {
              "--fill": `${((n - a.ticket) / (m - a.ticket)) * 100}%`,
            } as CSSProperties
          }
        />
        <dl className="border border-line text-[12.5px]">
          {terms.map(([u, v], h) => (
            <div key={u} className={`grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-4 py-2.5 ${h ? "border-t border-line" : ""}`}>
              <dt className="text-muted">{u}</dt>
              <dd className="text-inkBody font-medium break-words">{v}</dd>
            </div>
          ))}
        </dl>
        {revoked ? (
          revokedNote
        ) : t.frozen ? (
          <div data-subscribe-locked="frozen">
            <LockedNote text={tr("Tu wallet está congelada por una decisión de cumplimiento: no se reciben nuevas suscripciones.")} />
          </div>
        ) : c ? (
          <LockedNote text={tr("Nuevas suscripciones suspendidas temporalmente.")} />
        ) : t.offering?.capturePaused ? (
          <LockedNote
            text={tr(
              "La captación de esta oferta está pausada temporalmente por la plataforma: no se reciben nuevas suscripciones. Las ya firmadas siguen su curso.",
            )}
          />
        ) : f ? (
          <LockedNote
            text={tr("El emisor pausó el token {symbol} on-chain: no se pueden emitir nuevas unidades hasta que lo reanude.", {
              symbol: e.mint.symbol,
            })}
          />
        ) : (
          <button
            onClick={() =>
              r({
                units: d.units,
                capital: d.capital,
              })
            }
            className="bg-rxOrange hover:bg-[#F59C45] text-rxDeep font-semibold text-[13px] py-3 inline-flex items-center justify-center gap-2 focus-ring"
          >
            {p ? tr("Firmar contrato del vehículo y suscribir") : tr("Firmar contrato y reservar unidades")}
            <Icon name="ArrowUpRight" size={15} className="rtl:-scale-x-100" />
          </button>
        )}
        {!p && (
          <p className="text-[11.5px] text-muted">
            {tr("Las unidades reservadas se entregan en tu wallet cuando el desarrollador emite los tokens.")}
          </p>
        )}
      </div>
      <div className="min-w-0 flex flex-col gap-3">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{tr("Mi portafolio en este proyecto")}</p>
        {t.holdings.length ? (
          <div className="border border-line overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px] tnum">
              <thead>
                <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                  <th className="font-semibold px-4 py-2.5">{tr("Fecha")}</th>
                  <th className="font-semibold px-3 py-2.5 text-end">{tr("Unidades")}</th>
                  <th className="font-semibold px-3 py-2.5 text-end">{tr("Capital")}</th>
                  <th className="font-semibold px-3 py-2.5">{tr("Estado")}</th>
                  <th className="font-semibold px-3 py-2.5">Tx</th>
                  <th className="font-semibold px-4 py-2.5">{tr("Certificado")}</th>
                </tr>
              </thead>
              <tbody>
                {t.holdings.map((u) => (
                  <tr key={u.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3 font-mono">{u.since}</td>
                    <td className="px-3 py-3 text-end font-mono">{nf(0).format(u.units)}</td>
                    <td className="px-3 py-3 text-end font-mono">{money(u.capital, o, false)}</td>
                    <td className="px-3 py-3">
                      <span
                        data-holding={u.status}
                        className={`text-[10.5px] font-semibold px-2 py-0.5 ${u.status === "en_wallet" ? "bg-aquaTint text-aquaInk" : "bg-goldTint text-goldInk"}`}
                      >
                        {u.status === "en_wallet"
                          ? tr("En wallet")
                          : u.status === "mint_pendiente"
                            ? tr("Mint en cola")
                            : u.status === "pago_pendiente"
                              ? tr("Pago pendiente")
                              : tr("Reservado")}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {u.tx ? (
                        <CopyChip text={u.tx} display={shortHash(u.tx, 8, 4)} toast={s} className="text-[11.5px]" />
                      ) : u.paymentCode ? (
                        <span className="text-[11px] text-goldInk font-mono" title={tr("Referencia para la transferencia fiduciaria")}>
                          {tr("Ref. {code}", { code: u.paymentCode })}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted">{u.status === "mint_pendiente" ? tr("en cola") : "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          i({
                            name: tr("Certificado de participación"),
                            project: a,
                            folder: tr("Certificados"),
                            // Persisted subscriptions carry the SHA-256 of the signed agreement.
                            hash: u.evidenceHash || seededHex("cert" + u.id, 64),
                            signed: true,
                            tenant: e,
                            holding: u,
                          })
                        }
                        className="text-rxBlue font-medium inline-flex items-center gap-1 focus-ring"
                      >
                        <Icon name="FileCheck" size={14} />
                        {tr("Ver")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-muted border border-dashed border-[#C9C4D6] px-4 py-6">
            {tr("Aún no tienes suscripciones en este proyecto.")}
          </p>
        )}
        {t.holdings.some((u) => u.accrued) && (
          <p className="text-[12px] text-inkBody">
            {tr("Distribuciones acumuladas:")}{" "}
            <span className="font-mono">
              {money(
                t.holdings.reduce((u, v) => u + (v.accrued || 0), 0),
                o,
                false,
              )}
            </span>
          </p>
        )}
        {w}
      </div>
    </div>
  );
}
