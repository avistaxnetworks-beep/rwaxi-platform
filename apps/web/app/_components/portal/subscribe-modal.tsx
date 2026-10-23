// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useEffect, useRef, useState } from "react";
import { LegalText } from "@/app/_components/legal/legal-text";
import { Icon } from "@/app/_components/ui/icon";
import { Modal } from "@/app/_components/ui/modal";
import { LEGAL_LAYERS, legalVars } from "@/app/_lib/data/legal";
import { alt, money, nf, onColor } from "@/app/_lib/format";
import { seededHex } from "@/app/_lib/hash";

export function PortalSubscribeModal({ t: e, p: a, draft: t, currency: o, onClose: n, onConfirm: l, persist: g }) {
  const [r, i] = useState(false),
    [s, c] = useState(false),
    [d, p] = useState(false),
    [m, u] = useState(0),
    [w, A] = useState(null),
    v = e.mint.status === "minted",
    h = useRef([]);
  useEffect(() => () => h.current.forEach(clearTimeout), []);
  const b = g
      ? [
          "Firma del contrato y registro en PostgreSQL",
          v
            ? "Unidades reservadas · pago fiduciario pendiente de conciliación por el desarrollador"
            : "Reserva de unidades en el registro del vehículo",
          "Certificado con el SHA-256 del contrato",
        ]
      : [
          "Firma electrónica del contrato de suscripción",
          v ? "Transferencia de tokens a tu wallet" : "Reserva de unidades en el registro del vehículo",
          "Registro on-chain y certificado",
        ],
    y = async () => {
      if (g) {
        // Persisted path: the server validates and commits before the steps animate.
        u(1), A(null);
        const P = await g({ ...t, acknowledgments: { contract: r, risk: s, layers: d } });
        if (!P.ok) {
          u(0), A(P.error);
          return;
        }
        [2, 3, 4].forEach((N, x) =>
          h.current.push(
            setTimeout(() => {
              u(N), N === 4 && l(P);
            }, 600 * (x + 1)),
          ),
        );
        return;
      }
      u(1);
      const f = "0x" + seededHex("tx" + a.id + Date.now(), 64);
      [2, 3, 4].forEach((N, x) =>
        h.current.push(
          setTimeout(
            () => {
              u(N),
                N === 4 &&
                  l({
                    ...t,
                    tx: f,
                    status: v ? "en_wallet" : "reservado",
                  });
            },
            800 * (x + 1),
          ),
        ),
      );
    };
  return (
    <Modal title="Contrato de suscripción" onClose={n}>
      <div
        style={{
          "--tc": e.color,
          "--tc-on": onColor(e.color),
        }}
        className="flex flex-col gap-4"
      >
        <dl className="border border-line text-[13px]">
          {[
            ["Contraparte", `${e.legalName} · NIT ${e.nit}`],
            ["Vehículo", `${a.wrapper}`],
            ["Activo", a.asset],
            ["Unidades", nf(0).format(t.units)],
            ["Monto", `${money(t.capital, o)} (${alt(t.capital, o)})`],
          ].map(([f, N], x) => (
            <div
              key={f}
              className={`grid grid-cols-[110px_minmax(0,1fr)] gap-3 px-4 py-2.5 ${x ? "border-t border-line" : ""}`}
            >
              <dt className="text-[11px] uppercase tracking-[0.06em] font-semibold text-muted">{f}</dt>
              <dd className="text-inkBody break-words font-medium">{N}</dd>
            </div>
          ))}
        </dl>
        {m === 0 && (
          <>
            <label className="flex gap-3 text-[12.5px] text-inkBody leading-[1.55]">
              <input
                id="ack1"
                type="checkbox"
                checked={r}
                onChange={(f) => i(f.target.checked)}
                className="mt-0.5 accent-[#2F145F]"
              />
              Leí el contrato de suscripción del vehículo y el Data Room del proyecto.
            </label>
            <label className="flex gap-3 text-[12.5px] text-inkBody leading-[1.55]">
              <input
                id="ack2"
                type="checkbox"
                checked={s}
                onChange={(f) => c(f.target.checked)}
                className="mt-0.5 accent-[#2F145F]"
              />
              Entiendo que la TIR, las distribuciones y la valorización son escenarios estimados y que mi
              capital está sujeto a riesgo.
            </label>
            <div className="border border-line bg-stone p-4 max-h-[240px] overflow-y-auto">
              <LegalText tpl={LEGAL_LAYERS} vars={legalVars(e, a)} compact={true} />
            </div>
            <label className="flex gap-3 text-[12.5px] text-inkBody leading-[1.55]">
              <input
                id="ack3"
                type="checkbox"
                checked={d}
                onChange={(f) => p(f.target.checked)}
                className="mt-0.5 accent-[#2F145F]"
              />
              Reconozco expresamente las 4 Capas Estructurales de esta inversión y la función de recuperación
              judicial o administrativa (forcedTransfer) descritas arriba.
            </label>
            {w && (
              <p role="alert" className="border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3">
                {w}
              </p>
            )}
            <button
              disabled={!r || !s || !d}
              onClick={y}
              className="tc-btn font-semibold text-[13px] py-3 disabled:opacity-40 focus-ring"
            >
              Firmar y confirmar
            </button>
          </>
        )}
        {m > 0 && (
          <ol className="flex flex-col gap-2">
            {b.map((f, N) => {
              const x = m > N + 1 ? "done" : m === N + 1 ? "run" : "todo";
              return (
                <li key={f} className="flex items-center gap-3 text-[13px]">
                  <Icon
                    name={x === "done" ? "Check" : x === "run" ? "Loader2" : "Circle"}
                    size={15}
                    className={
                      x === "done" ? "text-aquaInk" : x === "run" ? "text-goldInk spin" : "text-muted"
                    }
                  />
                  <span className={x === "todo" ? "text-muted" : "text-inkBody"}>{f}</span>
                </li>
              );
            })}
          </ol>
        )}
        {m === 4 && (
          <button onClick={n} className="tc-btn font-semibold text-[13px] py-3 focus-ring">
            Ver mi portafolio
          </button>
        )}
      </div>
    </Modal>
  );
}
