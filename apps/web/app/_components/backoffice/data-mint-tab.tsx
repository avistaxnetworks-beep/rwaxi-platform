// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useEffect, useRef, useState } from "react";
import { Field, fieldCls } from "@/app/_components/ui/form";
import { Icon } from "@/app/_components/ui/icon";
import { CopyChip } from "@/app/_components/ui/primitives";
import { DEMO_WALLET, TX, leadWallet, subIdOf, txHash } from "@/app/_lib/chain/simulator";
import { DATAROOM } from "@/app/_lib/data/projects";
import { money, nf, shortHash } from "@/app/_lib/format";
import { seededHex, sha256Hex } from "@/app/_lib/hash";

export function DataMintTab({ t: e, p: a, setTenant: t, journey: o, setJourney: n, toast: l, emit: r }) {
  const i = useRef(),
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
    f = useRef([]);
  useEffect(() => () => f.current.forEach(clearTimeout), []),
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
    );
  const N = async (E) =>
      sha256Hex(
        E.map((I) => I.hash)
          .sort()
          .join(""),
      ),
    x = async (E) => {
      const I = Array.from(E || []).slice(0, 10);
      if (!I.length) return;
      u(true);
      const $ = [];
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
        r(T),
          t((C) => ({
            ...C,
            docs: _,
            merkle: B,
            onchainRoot: B,
            anchoredTx: T.hash,
          }));
      } else
        t((T) => ({
          ...T,
          docs: _,
          merkle: B,
          anchoredTx: null,
        }));
      u(false), l(`${$.length} documento(s) cargados · SHA-256 calculado · Merkle Root actualizado`);
    },
    g = async (E) => {
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
      r(E),
        t((I) => ({
          ...I,
          onchainRoot: I.merkle,
          anchoredTx: E.hash,
        })),
        l(`updateDataRoomMerkleRoot() en ${e.mint.network}`);
    },
    A = () => {
      if (!b.name.trim() || !/^[A-Z0-9]{2,6}$/.test(b.symbol) || b.supply <= 0 || b.price <= 0) {
        l("Revisa nombre, símbolo (2–6 letras mayúsculas), unidades y precio");
        return;
      }
      h(1),
        [2, 3, 4, 5].forEach((E, I) =>
          f.current.push(
            setTimeout(
              () => {
                if ((h(E), E === 5)) {
                  const $ = "0x" + seededHex("contract" + e.slug + Date.now(), 40),
                    _ = TX.deployToken(e, a, b, $);
                  r(_),
                    [
                      ...o.holdings
                        .filter((T) => T.status === "reservado")
                        .map((T) => [subIdOf(T.id), DEMO_WALLET, T.units, txHash("pay" + T.id)]),
                      ...e.leads
                        .filter((T) => T.kyc === "aprobado" && T.subCapital)
                        .map((T) => [
                          subIdOf(T.id),
                          leadWallet(T),
                          Math.round(T.subCapital / a.unit),
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
                              status: "en_wallet",
                            }
                          : C,
                      ),
                    })),
                    l(`${b.supply.toLocaleString("es-CO")} tokens ${b.symbol} emitidos en ${b.network}`);
                }
              },
              900 * (I + 1),
            ),
          ),
        );
    },
    P = e.leads.filter((E) => E.kyc === "aprobado").length + (o.kyc.status === "aprobado" ? 1 : 0),
    z =
      o.holdings.filter((E) => E.status === "reservado").length +
      e.leads.filter((E) => E.kyc === "aprobado" && E.subCapital).length,
    G = [
      "Validar configuración del token y del vehículo",
      "RwaxiTenantFactory.deployOfferingToken() con el adaptador RWAXI",
      `Anclar dataRoomMerkleRoot inicial y vincular el registro (${P} wallets en whitelist)`,
      `mintSubscription() por cada suscripción aprobada (${z})`,
    ],
    U = e.mint.status === "minted";
  return (
    <div className="grid xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6 items-start">
      <div className="bg-white border border-line min-w-0">
        <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
            {"Data Room · "}
            {e.docs.length}
            {" documentos"}
          </p>
          <span className="text-[11.5px] text-muted">
            {"Merkle Root "}
            <span className="font-mono text-aquaInk">{shortHash(e.merkle, 10, 6)}</span>
          </span>
        </div>
        <div className="p-5 grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end border-b border-line">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field id="dr-folder" label="Carpeta">
              <select id="dr-folder" value={s} onChange={(E) => c(E.target.value)} className={fieldCls()}>
                {DATAROOM.map((E) => (
                  <option key={E.n}>
                    {E.n} {E.name}
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
              Requiere AccessGrant (NDA + KYC)
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
                x(E.target.files), (E.target.value = "");
              }}
            />
            <button
              onClick={() => i.current.click()}
              disabled={m}
              className="tc-btn px-4 py-3 text-[12.5px] font-semibold inline-flex items-center gap-2 focus-ring disabled:opacity-60 w-full justify-center"
            >
              <Icon name={m ? "Loader2" : "Upload"} size={15} className={m ? "spin" : ""} />
              {m ? "Calculando SHA-256…" : "Cargar documentos"}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[440px] overflow-y-auto">
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
                <th className="font-semibold px-5 py-2.5">Documento</th>
                <th className="font-semibold px-3 py-2.5">SHA-256</th>
                <th className="font-semibold px-3 py-2.5">Acceso</th>
                <th className="font-semibold px-3 py-2.5 text-right">Tamaño</th>
                <th className="px-3 py-2.5">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {e.docs.map((E) => (
                <tr key={E.id} className="border-b border-line last:border-b-0">
                  <td className="px-5 py-2.5">
                    <p className="text-inkBody">
                      {E.name}
                      {E.uploaded && (
                        <span className="ml-1.5 text-[10px] font-semibold text-goldInk">NUEVO</span>
                      )}
                    </p>
                    <p className="text-[10.5px] text-muted">
                      {E.folder}
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
                      <span className="text-goldInk font-semibold">AccessGrant</span>
                    ) : (
                      <span className="text-muted">Público</span>
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
                        aria-label={`Quitar ${E.name}`}
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
            <span className="text-muted">El Merkle Root se ancla al desplegar el token.</span>
          ) : e.onchainRoot === e.merkle ? (
            <span className="text-aquaInk inline-flex items-center gap-1.5">
              <Icon name="CheckCircle2" size={14} />
              {"Merkle Root anclado · "}
              <span className="font-mono">{shortHash(e.anchoredTx, 10, 6)}</span>
            </span>
          ) : (
            <span className="text-goldInk">El Merkle Root del Data Room difiere del anclado on-chain.</span>
          )}
          <button
            onClick={w}
            disabled={e.mint.status !== "minted" || e.onchainRoot === e.merkle}
            className="border border-line bg-white px-3 py-1.5 font-semibold text-rxBlue disabled:opacity-40 focus-ring"
          >
            Anclar Merkle Root
          </button>
        </div>
      </div>
      <div className="bg-white border border-line min-w-0">
        <div className="px-5 py-3.5 border-b border-line flex justify-between items-center gap-3">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Emisión de tokens</p>
          <span
            className={`text-[10.5px] font-semibold tracking-[0.08em] uppercase px-2 py-1 ${U ? "bg-aquaTint text-aquaInk" : "bg-goldTint text-goldInk"}`}
          >
            {U ? "Emitido" : "Sin emitir"}
          </span>
        </div>
        {U ? (
          <dl className="text-[12.5px]">
            {[
              ["Estado on-chain", e.tokenPaused ? "paused() = true" : "paused() = false"],
              ["Token", `${e.mint.name} (${e.mint.symbol})`],
              ["Red", e.mint.network],
              ["Estándar", "OpenZeppelin Permissioned ERC-20"],
              ["Unidades", nf(0).format(e.mint.supply)],
              ["Precio por unidad", `USD ${nf(0).format(e.mint.price)}`],
              ["Contrato", e.mint.contract],
              ["Tx de emisión", shortHash(e.mint.tx, 12, 8)],
              ["Wallets en whitelist", P],
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
                r(TX.pause(e, a, E)),
                  t((I) => ({
                    ...I,
                    tokenPaused: E,
                  })),
                  l(E ? `pause() ejecutado por ${e.legalName}` : `unpause() ejecutado por ${e.legalName}`);
              }}
              className={`${e.tokenPaused ? "tc-btn" : "border border-[#B42318] text-[#B42318] bg-white"} px-4 py-2.5 text-[12.5px] font-semibold inline-flex items-center justify-center gap-2 focus-ring`}
            >
              <Icon name={e.tokenPaused ? "Play" : "PauseOctagon"} size={15} />
              {e.tokenPaused ? "Reanudar token · unpause()" : "Pausar token · pause()"}
            </button>
            <p className="text-[11px] text-muted">
              {"Solo el ISSUER_ADMIN_ROLE o el COMPLIANCE_OFFICER_ROLE de "}
              {e.legalName}
              {" pueden pausar el token. RWAXI no tiene esta facultad."}
            </p>
          </div>
        )}
        {!U && (
          <div className="p-5 flex flex-col gap-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field id="mint-name" label="Nombre del token">
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
              <Field id="mint-symbol" label="Símbolo">
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
              <Field id="mint-supply" label="Unidades a emitir">
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
              <Field id="mint-price" label="Precio por unidad (USD)">
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
              <Field id="mint-net" label="Red">
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
              <Field id="mint-std" label="Estándar">
                <input
                  id="mint-std"
                  value="OpenZeppelin Permissioned ERC-20"
                  readOnly={true}
                  className={fieldCls() + " bg-cloud"}
                />
              </Field>
            </div>
            <p className="text-[12px] text-muted">
              {
                "Restricciones activas: solo wallets en la whitelist de este tenant · tope maxSupplyCap · pausable por el desarrollador y por RWAXI · capitalización total "
              }
              {money(b.supply * b.price, "USD", true)}.
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
              Emitir (Mint) tokens con el adaptador RWAXI
            </button>
            <p className="text-[11px] text-muted">Simulación: no se despliega ningún contrato real.</p>
          </div>
        )}
      </div>
    </div>
  );
}
