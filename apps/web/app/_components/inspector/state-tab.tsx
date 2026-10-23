// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { KV, Mono, Pill } from "@/app/_components/ui/primitives";
import {
  FACTORY_ADDR,
  ROLE,
  RWAXI_ADAPTER,
  ZERO_ADDR,
  adminOf,
  offeringIdOf,
  officerOf,
  orgIdOf,
  regimeEnum,
  registryOf,
  shortAddr,
} from "@/app/_lib/chain/simulator";
import { nf, shortHash } from "@/app/_lib/format";
import { useI18n } from "@/app/_i18n/provider";

export function ContractCard({ name: e, addr: a, sub: t, children: o, status: n }) {
  const { tr } = useI18n();
  return (
    <section className="border border-white/15 bg-[#120726]">
      <header className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[13px] text-white font-semibold">{e}</p>
          <p className="font-mono text-[11px] text-[#A79FC0] break-all">
            {a || tr("no desplegado")}
            {t ? ` · ${t}` : ""}
          </p>
        </div>
        {n}
      </header>
      {o}
    </section>
  );
}

export function StateTab({ s: e, toast: a }) {
  const { tr, rich } = useI18n();
  const { t, p: o, token: n } = e,
    l = t.chainRegime || regimeEnum(t.regime),
    r = n && e.onchainRoot === t.merkle;
  return (
    <div className="flex flex-col gap-4">
      <ContractCard
        name="RwaxiTenantFactory.sol"
        addr={FACTORY_ADDR}
        sub={tr("infraestructura maestra RWAXI")}
        status={<Pill ok={true}>RWAXI_OPERATOR_ROLE</Pill>}
      >
        <KV
          k="tenantRegistries[organizationId]"
          v={
            <>
              <span className="text-[#A79FC0]">
                [{shortHash(orgIdOf(t.slug).slice(2), 8, 4)}
                {"] → "}
              </span>
              {registryOf(t.slug)}
            </>
          }
          accent={true}
        />
        <KV
          k="offeringTokens[offeringId]"
          v={
            <>
              <span className="text-[#A79FC0]">
                [{shortHash(offeringIdOf(o).slice(2), 8, 4)}
                {"] → "}
              </span>
              {n || ZERO_ADDR}
            </>
          }
          accent={!!n}
        />
        <KV k="offeringOrganization[offeringId]" v={n ? orgIdOf(t.slug) : "0x0…0"} />
      </ContractCard>
      <ContractCard
        name="RwaxiComplianceRegistry.sol"
        addr={registryOf(t.slug)}
        sub={tr("aislado · {name}", { name: t.displayName })}
        status={
          <Pill ok={true}>{tr("{n} wallets", { n: e.investors.length, count: e.investors.length })}</Pill>
        }
      >
        <KV k="organizationId" v={orgIdOf(t.slug)} />
        <KV k="organizationTaxId" v={`"${t.nit}"`} />
        <KV
          k="complianceRegime"
          v={
            <>
              "{l}"
              {l !== regimeEnum(t.regime) && (
                <span className="block text-[#D9A24A] font-sans text-[11px] mt-1">
                  {tr(
                    "El Backoffice ahora usa {regime}. El valor on-chain es inmutable: requiere desplegar un nuevo registro y migrar la whitelist.",
                    { regime: regimeEnum(t.regime) },
                  )}
                </span>
              )}
            </>
          }
        />
        <KV
          k="COMPLIANCE_OFFICER_ROLE"
          v={
            <>
              {ROLE.COMPLIANCE_OFFICER_ROLE.slice(0, 18)}
              {"… → "}
              {officerOf(t.slug)}
            </>
          }
        />
        <div className="px-4 py-2.5 border-t border-white/10">
          <p className="font-mono text-[11px] text-[#A79FC0] mb-2">_investors[wallet]</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] font-mono text-[11px]">
              <thead>
                <tr className="text-left text-[#A79FC0]">
                  <th className="font-normal py-1 pr-3">wallet</th>
                  <th className="font-normal py-1 pr-3">isApproved</th>
                  <th className="font-normal py-1 pr-3">isFrozen</th>
                  <th className="font-normal py-1 pr-3">country</th>
                  <th className="font-normal py-1">kycDossierHash</th>
                </tr>
              </thead>
              <tbody>
                {e.investors.map((i) => (
                  <tr key={i.wallet} className="border-t border-white/10">
                    <td className="py-1.5 pr-3 text-white" title={i.wallet}>
                      {shortAddr(i.wallet)}
                      <span className="block font-sans text-[10px] text-[#A79FC0]">{i.label}</span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <Pill ok={true}>{String(i.isApproved)}</Pill>
                    </td>
                    <td className="py-1.5 pr-3">
                      <Pill ok={!i.isFrozen}>{String(i.isFrozen)}</Pill>
                    </td>
                    <td className="py-1.5 pr-3 text-white">{i.countryCode}</td>
                    <td className="py-1.5 text-rxAqua" title={i.dossier}>
                      {shortHash(i.dossier.slice(2), 12, 8)}
                    </td>
                  </tr>
                ))}
                {!e.investors.length && (
                  <tr>
                    <td colSpan={5} className="py-3 text-[#A79FC0]">
                      {tr("Sin wallets aprobadas todavía.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </ContractCard>
      <ContractCard
        name="RwaxiPropertyToken.sol"
        addr={n}
        sub="ERC20 + ERC20Pausable + AccessControl"
        status={
          n ? (
            <Pill ok={!e.paused} warn={e.paused}>
              {e.paused ? "paused() = true" : "paused() = false"}
            </Pill>
          ) : (
            <Pill warn={true}>{tr("pendiente de deployOfferingToken")}</Pill>
          )
        }
      >
        {n ? (
          <>
            <KV k="name()" v={`"${t.mint.name}"`} />
            <KV k="symbol()" v={`"${t.mint.symbol}"`} />
            <KV k="decimals()" v="0" />
            <KV k="legalWrapperType" v={`"${o.wrapper}"`} />
            <KV k="legalEntityName" v={`"${o.vehicle}"`} />
            <KV
              k="ISSUER_ADMIN_ROLE"
              v={
                <>
                  {ROLE.ISSUER_ADMIN_ROLE.slice(0, 18)}
                  {"… → "}
                  {adminOf(t.slug)} <span className="text-[#A79FC0] font-sans">({t.legalName})</span>
                </>
              }
            />
            <KV
              k="COMPLIANCE_OFFICER_ROLE"
              v={
                <>
                  {ROLE.COMPLIANCE_OFFICER_ROLE.slice(0, 18)}
                  {"… → "}
                  {officerOf(t.slug)}
                </>
              }
            />
            <KV
              k="MINTER_ROLE"
              v={
                <>
                  {ROLE.MINTER_ROLE.slice(0, 18)}
                  {"… → "}
                  {RWAXI_ADAPTER}{" "}
                  <span className="text-[#A79FC0] font-sans">
                    {tr("(adaptador RWAXI · solo mintSubscription)")}
                  </span>
                </>
              }
            />
            <KV
              k="hasRole(PAUSE, RWAXI)"
              v={
                <span className="text-[#FF8A80]">
                  {tr("false · RWAXI no puede pausar, congelar ni ejecutar forcedTransfer")}
                </span>
              }
            />
            {t.portalStatus === "SUSPENDED" && (
              <KV
                k="Portal off-chain"
                v={
                  <span className="text-[#D9A24A]">
                    {tr("SUSPENDED en la Consola RWAXI · el contrato no se modifica")}
                  </span>
                }
              />
            )}
            <KV k="totalSupply()" v={nf(0).format(e.totalSupply)} accent={true} />
            <KV k="maxSupplyCap" v={nf(0).format(t.mint.supply)} />
            <KV
              k="dataRoomMerkleRoot"
              v={
                <>
                  {"0x" + e.onchainRoot}
                  <span className="block mt-1">
                    {r ? (
                      <Pill ok={true}>
                        {tr("sincronizado con el Data Room ({n} documentos)", {
                          n: t.docs.length,
                          count: t.docs.length,
                        })}
                      </Pill>
                    ) : (
                      <Pill warn={true}>
                        {tr("Data Room off-chain: 0x{hash} · pendiente de anclar", {
                          hash: shortHash(t.merkle, 10, 6),
                        })}
                      </Pill>
                    )}
                  </span>
                </>
              }
            />
            <div className="px-4 py-2.5 border-t border-white/10 grid md:grid-cols-2 gap-4">
              <div className="min-w-0">
                <p className="font-mono text-[11px] text-[#A79FC0] mb-1.5">processedSubscriptionIds[id]</p>
                {e.mints.map((i) => (
                  <p key={i.subId} className="font-mono text-[11px] text-white truncate" title={i.subId}>
                    {shortHash(i.subId.slice(2), 10, 6)}
                    {" → "}
                    <span className="text-rxAqua">true</span>
                  </p>
                ))}
                {!e.mints.length && <p className="font-mono text-[11px] text-[#A79FC0]">{tr("(vacío)")}</p>}
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[11px] text-[#A79FC0] mb-1.5">balanceOf(wallet)</p>
                {Object.entries(e.bal)
                  .filter(([, i]) => i > 0)
                  .map(([i, s]) => (
                    <p key={i} className="font-mono text-[11px] text-white" title={i}>
                      {shortAddr(i)}
                      {" → "}
                      <span className="text-rxAqua">{nf(0).format(s)}</span>{" "}
                      <span className="text-[#A79FC0] font-sans text-[10px]">{e.labelOf(i)}</span>
                    </p>
                  ))}
              </div>
            </div>
          </>
        ) : (
          <p className="px-4 py-4 text-[12px] text-[#C9C1E3]">
            {rich("El token se crea con {fn} al emitir desde el Backoffice → Data Room y Minting.", {
              fn: <Mono className="text-rxAqua">RwaxiTenantFactory.deployOfferingToken()</Mono>,
            })}
          </p>
        )}
      </ContractCard>
    </div>
  );
}
