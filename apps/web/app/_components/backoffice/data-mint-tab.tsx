"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Field, fieldCls } from "@/app/_components/ui/form";
import { Icon } from "@/app/_components/ui/icon";
import { CopyChip } from "@/app/_components/ui/primitives";
import { DEMO_WALLET, TX, leadWallet, subIdOf, txHash } from "@/app/_lib/chain/simulator";
import { DATAROOM } from "@/app/_lib/data/projects";
import { money, nf, shortHash } from "@/app/_lib/format";
import { seededHex, sha256Hex } from "@/app/_lib/hash";
import { folderLabel, type DemoDoc } from "@/app/_components/portal/data-room-panel";
import type { PortalJourney, PortalProject, PortalTenant } from "@/app/_components/portal/portal-types";
import { useI18n } from "@/app/_i18n/provider";

/** A Data Room document of the prototype, or one uploaded in this demo panel. */
interface IssuanceDoc extends DemoDoc {
  size: number;
  /** YYYY-MM-DD */
  at: string;
}

/** The token as the prototype's issuance flow keeps it. */
interface DemoMint {
  status: string;
  name: string;
  symbol: string;
  supply: number;
  price: number;
  network: string;
  contract?: string;
  contractFull?: string;
  tx?: string;
}

/** A lead of the prototype's backoffice: what the issuance reads (approved KYC, subscribed capital in USD). */
interface DemoLead {
  id: string;
  kyc: string;
  subCapital?: number | null;
}

/** The developer as the demo issuance edits it (prototype tenant state). */
export interface IssuanceTenant extends PortalTenant {
  mint: DemoMint;
  docs: IssuanceDoc[];
  merkle: string;
  onchainRoot?: string | null;
  anchoredTx?: string | null;
  leads: DemoLead[];
}

export function DataMintTab({
  t: e,
  p: a,
  setTenant: t,
  journey: o,
  setJourney: n,
  toast: l,
  emit: r,
  // Persisted Data Room and DocumentVault (app/tenant/[slug]/backoffice/_components/data-room-desk.tsx); the
  // demo panel below stays for the prototype's own screens. Token issuance is still demo state.
  dataRoomSlot: D,
}: {
  t: IssuanceTenant;
  p: PortalProject;
  setTenant: (update: (tenant: IssuanceTenant) => IssuanceTenant) => void;
  journey: PortalJourney;
  setJourney: (update: (journey: PortalJourney) => PortalJourney) => void;
  toast: (message: string) => void;
  /** records a simulated transaction in the On-Chain Inspector */
  emit: (tx: unknown) => void;
  dataRoomSlot?: ReactNode;
}) {
  const { tr } = useI18n();
  const i = useRef<HTMLInputElement>(null),
    [s, c] = useState(DATAROOM[0].n + " " + DATAROOM[0].name),
    [d, p] = useState(true),
    [m, u] = useState(false),
    [v, h] = useState(0),
    [b, y] = useState({
      name: e.mint.name,
      symbol: e.mint.symbol,
      supply: e.mint.supply,
      price: e.mint.price,
      network: e.mint.network,
    }),
    f = useRef<ReturnType<typeof setTimeout>[]>([]);
  (useEffect(() => () => f.current.forEach(clearTimeout), []),
    useEffect(
      () =>
        y({
          name: e.mint.name,
          symbol: e.mint.symbol,
          supply: e.mint.supply,
          price: e.mint.price,
          network: e.mint.network,
        }),
      [e.slug],
    ));
  const N = async (E: IssuanceDoc[]) =>
      sha256Hex(
        E.map((I) => I.hash)
          .sort()
          .join(""),
      ),
    x = async (E: FileList | null) => {
      const I = Array.from(E || []).slice(0, 10);
      if (!I.length) return;
      u(true);
      const $: IssuanceDoc[] = [];
      for (const T of I) {
        const C = await sha256Hex(await T.arrayBuffer());
        $.push({
          id: `${a.id}-u-${C.slice(0, 8)}`,
          folder: s,
          name: T.name,
          restricted: d,
          hash: C,
          size: T.size,
          at: new Date().toISOString().slice(0, 10),
          uploaded: true,
        });
      }
      const _ = [...e.docs, ...$],
        B = await N(_);
      if (e.mint.status === "minted") {
        const T = TX.anchor(e, a, e.onchainRoot || e.merkle, B);
        (r(T),
          t((C) => ({
            ...C,
            docs: _,
            merkle: B,
            onchainRoot: B,
            anchoredTx: T.hash,
          })));
      } else
        t((T) => ({
          ...T,
          docs: _,
          merkle: B,
          anchoredTx: null,
        }));
      (u(false),
        l(
          tr("{n} documento(s) cargados · SHA-256 calculado · Merkle Root actualizado", {
            n: $.length,
            count: $.length,
          }),
        ));
    },
    g = async (E: string) => {
      const I = e.docs.filter((_) => _.id !== E),
        $ = await N(I);
      t((_) => ({
        ..._,
        docs: I,
        merkle: $,
        anchoredTx: null,
      }));
    },
    w = () => {
      const E = TX.anchor(e, a, e.onchainRoot || e.merkle, e.merkle);
      (r(E),
        t((I) => ({
          ...I,
          onchainRoot: I.merkle,
          anchoredTx: E.hash,
        })),
        l(tr("updateDataRoomMerkleRoot() en {network}", { network: e.mint.network })));
    },
    A = () => {
      if (!b.name.trim() || !/^[A-Z0-9]{2,6}$/.test(b.symbol) || b.supply <= 0 || b.price <= 0) {
        l(tr("Revisa nombre, símbolo (2–6 letras mayúsculas), unidades y precio"));
        return;
      }
      (h(1),
        [2, 3, 4, 5].forEach((E, I) =>
          f.current.push(
            setTimeout(
              () => {
                if ((h(E), E === 5)) {
                  const $ = "0x" + seededHex("contract" + e.slug + Date.now(), 40),
                    _ = TX.deployToken(e, a, b, $);
                  (r(_),
                    [
                      ...o.holdings
                        .filter((T) => T.status === "reservado")
                        .map((T) => [subIdOf(T.id), DEMO_WALLET, T.units, txHash("pay" + T.id)]),
                      ...e.leads
                        .filter((T) => T.kyc === "aprobado" && T.subCapital)
                        .map((T) => [
                          subIdOf(T.id),
                          leadWallet(T),
                          Math.round((T.subCapital ?? 0) / a.unit),
                          txHash("pay" + T.id),
                        ]),
                    ].forEach(([T, C, S, k]) => r(TX.mint(e, a, $, T, C, S, k))),
                    t((T) => ({
                      ...T,
                      onchainRoot: T.merkle,
                      anchoredTx: _.hash,
                      mint: {
                        ...b,
                        status: "minted",
                        contract: $.slice(0, 5) + "..." + $.slice(-3),
                        contractFull: $,
                        tx: _.hash,
                      },
                    })),
                    n((T) => ({
                      ...T,
                      holdings: T.holdings.map((C) =>
                        C.status === "reservado"
                          ? {
                              ...C,
                              status: "en_wallet" as const,
                            }
                          : C,
                      ),
                    })),
                    l(
                      tr("{n} tokens {symbol} emitidos en {network}", {
                        n: nf(0).format(b.supply),
                        symbol: b.symbol,
                        network: b.network,
                      }),
                    ));
                }
              },
              900 * (I + 1),
            ),
          ),
        ));
    },
    P = e.leads.filter((E) => E.kyc === "aprobado").length + (o.kyc.status === "aprobado" ? 1 : 0),
    z =
      o.holdings.filter((E) => E.status === "reservado").length +
      e.leads.filter((E) => E.kyc === "aprobado" && E.subCapital).length,
    G = [
      tr("Validar configuración del token y del vehículo"),
      tr("RwaxiTenantFactory.deployOfferingToken() con el adaptador RWAXI"),
      tr("Anclar dataRoomMerkleRoot inicial y vincular el registro ({n} wallets en whitelist)", {
        n: P,
        count: P,
      }),
      tr("mintSubscription() por cada suscripción aprobada ({n})", { n: z }),
    ],
    U = e.mint.status === "minted";
  return (
    <div className="grid xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6 items-start">
      {D || (
        <div className="bg-white border border-line min-w-0">
          <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
              {tr("Data Room · {n} documentos", { n: e.docs.length, count: e.docs.length })}
            </p>
            <span className="text-[11.5px] text-muted">
              {"Merkle Root "}
              <span className="font-mono text-aquaInk">{shortHash(e.merkle, 10, 6)}</span>
            </span>
          </div>
          <div className="p-5 grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end border-b border-line">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field id="dr-folder" label={tr("Carpeta")}>
                <select id="dr-folder" value={s} onChange={(E) => c(E.target.value)} className={fieldCls()}>
                  {DATAROOM.map((E) => (
                    <option key={E.n} value={E.n + " " + E.name}>
                      {E.n} {tr(E.name)}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-[12.5px] text-inkBody self-end pb-3">
                <input
                  id="dr-restricted"
                  type="checkbox"
                  checked={d}
                  onChange={(E) => p(E.target.checked)}
                  className="accent-[#2F145F]"
                />
                {tr("Documento reservado (jurídico, fiduciario o financiero)")}
              </label>
            </div>
            <div>
              <input
                ref={i}
                id="dr-upload"
                type="file"
                multiple={true}
                className="sr-only"
                onChange={(E) => {
                  (x(E.target.files), (E.target.value = ""));
                }}
              />
              <button
                onClick={() => i.current?.click()}
                disabled={m}
                className="tc-btn px-4 py-3 text-[12.5px] font-semibold inline-flex items-center gap-2 focus-ring disabled:opacity-60 w-full justify-center"
              >
                <Icon name={m ? "Loader2" : "Upload"} size={15} className={m ? "spin" : ""} />
                {m ? tr("Calculando SHA-256…") : tr("Cargar documentos")}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[440px] overflow-y-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                  <th className="font-semibold px-5 py-2.5">{tr("Documento")}</th>
                  <th className="font-semibold px-3 py-2.5">SHA-256</th>
                  <th className="font-semibold px-3 py-2.5">{tr("Acceso")}</th>
                  <th className="font-semibold px-3 py-2.5 text-end">{tr("Tamaño")}</th>
                  <th className="px-3 py-2.5">
                    <span className="sr-only">{tr("Acciones")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {e.docs.map((E) => (
                  <tr key={E.id} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-2.5">
                      <p className="text-inkBody">
                        {E.uploaded ? E.name : tr(E.name)}
                        {E.uploaded && (
                          <span className="ms-1.5 text-[10px] font-semibold text-goldInk">{tr("NUEVO")}</span>
                        )}
                      </p>
                      <p className="text-[10.5px] text-muted">
                        {folderLabel(E.folder, tr)}
                        {" · "}
                        {E.at}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <CopyChip
                        text={E.hash}
                        display={shortHash(E.hash, 8, 6)}
                        toast={l}
                        className="text-[11px]"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-[11px]">
                      {E.restricted ? (
                        <span className="text-goldInk font-semibold">{tr("Reservado · con NDA")}</span>
                      ) : (
                        <span className="text-muted">{tr("Con NDA")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[11px] text-muted tnum">
                      {nf(0).format(E.size / 1024)}
                      {" KB"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {E.uploaded && (
                        <button
                          onClick={() => g(E.id)}
                          aria-label={tr("Quitar {name}", { name: E.name })}
                          className="text-muted hover:text-[#B42318] p-1 focus-ring"
                        >
                          <Icon name="Trash2" size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3.5 border-t border-line bg-cloud flex flex-wrap items-center justify-between gap-3 text-[12px]">
            {e.mint.status !== "minted" ? (
              <span className="text-muted">{tr("El Merkle Root se ancla al desplegar el token.")}</span>
            ) : e.onchainRoot === e.merkle ? (
              <span className="text-aquaInk inline-flex items-center gap-1.5">
                <Icon name="CheckCircle2" size={14} />
                {tr("Merkle Root anclado")}
                {" · "}
                <span className="font-mono">{shortHash(e.anchoredTx, 10, 6)}</span>
              </span>
            ) : (
              <span className="text-goldInk">
                {tr("El Merkle Root del Data Room difiere del anclado on-chain.")}
              </span>
            )}
            <button
              onClick={w}
              disabled={e.mint.status !== "minted" || e.onchainRoot === e.merkle}
              className="border border-line bg-white px-3 py-1.5 font-semibold text-rxBlue disabled:opacity-40 focus-ring"
            >
              {tr("Anclar Merkle Root")}
            </button>
          </div>
        </div>
      )}
      <div className="bg-white border border-line min-w-0">
        <div className="px-5 py-3.5 border-b border-line flex justify-between items-center gap-3">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
            {tr("Emisión de tokens")}
          </p>
          <span
            className={`text-[10.5px] font-semibold tracking-[0.08em] uppercase px-2 py-1 ${U ? "bg-aquaTint text-aquaInk" : "bg-goldTint text-goldInk"}`}
          >
            {U ? tr("Emitido") : tr("Sin emitir")}
          </span>
        </div>
        {U ? (
          <dl className="text-[12.5px]">
            {[
              [tr("Estado on-chain"), e.tokenPaused ? "paused() = true" : "paused() = false"],
              [tr("Token"), `${e.mint.name} (${e.mint.symbol})`],
              [tr("Red"), e.mint.network],
              [tr("Estándar"), "OpenZeppelin Permissioned ERC-20"],
              [tr("Unidades"), nf(0).format(e.mint.supply)],
              [tr("Precio por unidad"), `USD ${nf(0).format(e.mint.price)}`],
              [tr("Contrato"), e.mint.contract],
              [tr("Tx de emisión"), shortHash(e.mint.tx, 12, 8)],
              [tr("Wallets en whitelist"), P],
            ].map(([E, I]) => (
              <div
                key={E}
                className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 px-5 py-2.5 border-b border-line last:border-b-0"
              >
                <dt className="text-muted">{E}</dt>
                <dd className="text-inkBody font-mono text-[12px] break-words">{I}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {U && (
          <div className="px-5 py-4 border-t border-line bg-cloud flex flex-col gap-2">
            <button
              onClick={() => {
                const E = !e.tokenPaused;
                (r(TX.pause(e, a, E)),
                  t((I) => ({
                    ...I,
                    tokenPaused: E,
                  })),
                  l(
                    E
                      ? tr("pause() ejecutado por {name}", { name: e.legalName })
                      : tr("unpause() ejecutado por {name}", { name: e.legalName }),
                  ));
              }}
              className={`${e.tokenPaused ? "tc-btn" : "border border-[#B42318] text-[#B42318] bg-white"} px-4 py-2.5 text-[12.5px] font-semibold inline-flex items-center justify-center gap-2 focus-ring`}
            >
              <Icon name={e.tokenPaused ? "Play" : "PauseOctagon"} size={15} />
              {e.tokenPaused ? tr("Reanudar token · unpause()") : tr("Pausar token · pause()")}
            </button>
            <p className="text-[11px] text-muted">
              {tr(
                "Solo el ISSUER_ADMIN_ROLE o el COMPLIANCE_OFFICER_ROLE de {name} pueden pausar el token. RWAXI no tiene esta facultad.",
                { name: e.legalName },
              )}
            </p>
          </div>
        )}
        {!U && (
          <div className="p-5 flex flex-col gap-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field id="mint-name" label={tr("Nombre del token")}>
                <input
                  id="mint-name"
                  value={b.name}
                  onChange={(E) =>
                    y({
                      ...b,
                      name: E.target.value,
                    })
                  }
                  className={fieldCls()}
                  disabled={v > 0}
                />
              </Field>
              <Field id="mint-symbol" label={tr("Símbolo")}>
                <input
                  id="mint-symbol"
                  value={b.symbol}
                  onChange={(E) =>
                    y({
                      ...b,
                      symbol: E.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 6),
                    })
                  }
                  className={fieldCls() + " font-mono"}
                  disabled={v > 0}
                />
              </Field>
              <Field id="mint-supply" label={tr("Unidades a emitir")}>
                <input
                  id="mint-supply"
                  type="number"
                  min="1"
                  value={b.supply}
                  onChange={(E) =>
                    y({
                      ...b,
                      supply: Math.max(0, +E.target.value),
                    })
                  }
                  className={fieldCls() + " font-mono"}
                  disabled={v > 0}
                />
              </Field>
              <Field id="mint-price" label={tr("Precio por unidad (USD)")}>
                <input
                  id="mint-price"
                  type="number"
                  min="1"
                  value={b.price}
                  onChange={(E) =>
                    y({
                      ...b,
                      price: Math.max(0, +E.target.value),
                    })
                  }
                  className={fieldCls() + " font-mono"}
                  disabled={v > 0}
                />
              </Field>
              <Field id="mint-net" label={tr("Red")}>
                <select
                  id="mint-net"
                  value={b.network}
                  onChange={(E) =>
                    y({
                      ...b,
                      network: E.target.value,
                    })
                  }
                  className={fieldCls()}
                  disabled={v > 0}
                >
                  <option>EVM Base</option>
                  <option>EVM Polygon</option>
                </select>
              </Field>
              <Field id="mint-std" label={tr("Estándar")}>
                <input
                  id="mint-std"
                  value="OpenZeppelin Permissioned ERC-20"
                  readOnly={true}
                  className={fieldCls() + " bg-cloud"}
                />
              </Field>
            </div>
            <p className="text-[12px] text-muted">
              {tr(
                "Restricciones activas: solo wallets en la whitelist de este tenant · tope maxSupplyCap · pausable por el desarrollador · capitalización total {total}.",
                { total: money(b.supply * b.price, "USD", true) },
              )}
            </p>
            {v > 0 && (
              <ol className="flex flex-col gap-2 border border-line p-4">
                {G.map((E, I) => {
                  const $ = v > I + 1 ? "done" : v === I + 1 ? "run" : "todo";
                  return (
                    <li key={E} className="flex items-center gap-3 text-[12.5px]">
                      <Icon
                        name={$ === "done" ? "Check" : $ === "run" ? "Loader2" : "Circle"}
                        size={15}
                        className={
                          $ === "done" ? "text-aquaInk" : $ === "run" ? "text-goldInk spin" : "text-muted"
                        }
                      />
                      <span className={$ === "todo" ? "text-muted" : "text-inkBody"}>{E}</span>
                    </li>
                  );
                })}
              </ol>
            )}
            <button
              onClick={A}
              disabled={v > 0}
              className="bg-rxOrange hover:bg-[#F59C45] text-rxDeep font-semibold text-[13px] py-3 inline-flex items-center justify-center gap-2 focus-ring disabled:opacity-60"
            >
              <Icon name="Coins" size={15} />
              {tr("Emitir (Mint) tokens con el adaptador RWAXI")}
            </button>
            <p className="text-[11px] text-muted">
              {tr("Simulación: no se despliega ningún contrato real.")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
