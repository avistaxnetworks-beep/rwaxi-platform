// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
import { abiEncode } from "@/app/_lib/chain/abi";
import { PROJECTS, byId } from "@/app/_lib/data/projects";
import { nowISO } from "@/app/_lib/format";
import { seededHex } from "@/app/_lib/hash";

export const SEL = {
  "RwaxiComplianceRegistry.approveInvestor": [
    "0x1c1f1fa9",
    "approveInvestor(address,uint16,bytes32)",
    [
      ["wallet", "address"],
      ["countryCode", "uint16"],
      ["kycDossierHash", "bytes32"],
    ],
  ],
  "RwaxiComplianceRegistry.setFrozen": [
    "0xac869cd8",
    "setFrozen(address,bool)",
    [
      ["wallet", "address"],
      ["frozen", "bool"],
    ],
  ],
  "RwaxiPropertyToken.updateDataRoomMerkleRoot": [
    "0xc90e02dc",
    "updateDataRoomMerkleRoot(bytes32)",
    [["newRoot", "bytes32"]],
  ],
  "RwaxiPropertyToken.mintSubscription": [
    "0xb4141db5",
    "mintSubscription(bytes32,address,uint256,bytes32)",
    [
      ["subscriptionId", "bytes32"],
      ["investor", "address"],
      ["amount", "uint256"],
      ["paymentEvidenceRef", "bytes32"],
    ],
  ],
  "RwaxiPropertyToken.forcedTransfer": [
    "0xd9d5f8f2",
    "forcedTransfer(address,address,uint256,bytes32)",
    [
      ["from", "address"],
      ["to", "address"],
      ["amount", "uint256"],
      ["legalActHash", "bytes32"],
    ],
  ],
  "RwaxiPropertyToken.transfer": [
    "0xa9059cbb",
    "transfer(address,uint256)",
    [
      ["to", "address"],
      ["value", "uint256"],
    ],
  ],
  "RwaxiPropertyToken.pause": ["0x8456cb59", "pause()", []],
  "RwaxiPropertyToken.unpause": ["0x3f4ba83a", "unpause()", []],
  "RwaxiTenantFactory.deployOfferingToken": [
    "0x36442412",
    "deployOfferingToken(bytes32,bytes32,(string,string,string,string,uint256,bytes32),address,address)",
    [
      ["organizationId", "bytes32"],
      ["offeringId", "bytes32"],
      [
        "cfg",
        {
          tuple: ["string", "string", "string", "string", "uint256", "bytes32"],
        },
      ],
      ["tenantAdmin", "address"],
      ["complianceOfficer", "address"],
    ],
  ],
  "RwaxiTenantFactory.deployTenantRegistry": [
    "0xc331f542",
    "deployTenantRegistry(bytes32,string,string,address,address)",
    [
      ["organizationId", "bytes32"],
      ["organizationTaxId", "string"],
      ["complianceRegime", "string"],
      ["tenantAdmin", "address"],
      ["complianceOfficer", "address"],
    ],
  ],
};

export const TOPIC = {
  InvestorWhitelisted: "0x90c1e17720d0fc63868096a9bd6214279554e364f18fc4fe85e0fc258dbb2b8e",
  InvestorFreezeUpdated: "0xe36ede54cd85f42019abe31286383045c7c671a1e3ef238766cc61c9b7d03116",
  DataRoomMerkleRootAnchored: "0xbfaddd0f9217b040e64d3d16b38051a07d24473f23ee979b582f26c61f43e920",
  SubscriptionTokensMinted: "0xcc0fb9023671ce81d139692038c0bac1eef2f5a225e5caf038db29e4f2fec2a4",
  ForcedRecoveryExecuted: "0x79dfef3b1ce0058662b06bdf3f34cdc9547addfbbcc4fe9b532539050893c88f",
  OfferingTokenDeployed: "0x714fdaab2882ff189ee32d0caf672449ac255077b70ba6e3a323718a0498bd35",
  TenantRegistryDeployed: "0x8946b7d43be1de9ef08330475e9e5fa22385a1dbf1dc6414777cb856b495db1f",
  Transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  Paused: "0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258",
  Unpaused: "0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa",
};

export const ROLE = {
  COMPLIANCE_OFFICER_ROLE: "0xb6f0283bd1ed00c6aa7e988a7516070240f3610a34d167391359b648eb37cefc",
  MINTER_ROLE: "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6",
  ISSUER_ADMIN_ROLE: "0x5e1797512844876d6fa28adc68af925a8bf6fab2fa78d771b7390b9b0609a37a",
  LEGAL_ENFORCEMENT_ROLE: "0x2d0b2dd77a48a0f2f6cf229769667f035d75a49f0d3885990199ff3474d93748",
};

export const REVERT_RECEIVER = "RWAXI Compliance: Receiver wallet is not approved in Tenant Whitelist";

export const REVERT_FROZEN = "RWAXI Compliance: Sender wallet is frozen";

export const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

export const DEAD_WALLET = "0xDeAd00000000000000000000000000000000BeEf";

export const FACTORY_ADDR = "0xFac7" + seededHex("rwaxi-factory", 36);

export const RWAXI_ADAPTER = "0xAda9" + seededHex("rwaxi-adapter", 36);

export const DEMO_WALLET = "0x4aB" + seededHex("demo-wallet", 34) + "89F";

export const RECOVERY_WALLET = "0x9C1" + seededHex("recovery-wallet", 34) + "E07";

export const regimeEnum = (e) => (e === "sarlaft" ? "SARLAFT" : "SAGRILAFT_PTEE");

export const orgIdOf = (e) => "0x" + seededHex("org" + e, 64);

export const offeringIdOf = (e) => "0x" + seededHex("offering" + e.code, 64);

export const registryOf = (e) => "0x" + seededHex("registry" + e, 40);

export const adminOf = (e) => "0x" + seededHex("tenant-admin" + e, 40);

export const officerOf = (e) => "0x" + seededHex("officer" + e, 40);

export const leadWallet = (e) => "0x" + seededHex("wallet" + e.id, 40);

export const subIdOf = (e) => "0x" + seededHex("sub" + e, 64);

export const tokenAddrOf = (e, a) =>
  e.mint.status !== "minted"
    ? null
    : e.mint.contractFull ||
      (a.id === "avista"
        ? "0x71C" + seededHex("avista-token", 34) + "9A2"
        : "0x" + seededHex("token" + e.slug, 40));

export const shortAddr = (e) => (e ? `${e.slice(0, 6)}…${e.slice(-4)}` : "—");

export const txHash = (e) => "0x" + seededHex("tx" + e, 64);

export let BLOCK = 21904310;

export function makeTx({
  tenantId: e,
  contract: a,
  address: t,
  fn: o,
  values: n,
  from: l,
  events: r = [],
  status: i = "success",
  revert: s = null,
  seed: c,
  block: d,
  ts: p,
}) {
  const [m, u, v] = SEL[`${a}.${o}`];
  let h = m;
  try {
    h =
      m +
      abiEncode(
        v.map((b) => b[1]),
        n,
      );
  } catch (b) {}
  return (
    (BLOCK += 1 + Math.floor(Math.random() * 3)),
    {
      id: c || `${Date.now()}-${Math.random()}`,
      block: d || BLOCK,
      ts: p || nowISO(),
      tenantId: e,
      contract: a,
      address: t,
      fn: o,
      sig: u,
      sel: m,
      args: v.map((b, y) => [b[0], typeof b[1] == "object" ? "tuple" : b[1], n[y]]),
      calldata: h,
      from: l,
      status: i,
      revert: s,
      hash: txHash((c || "") + h + (p || Date.now())),
      events:
        i === "success"
          ? r.map((b) => ({
              ...b,
              topic: TOPIC[b.name],
            }))
          : [],
    }
  );
}

export const TX = {
  approve: (e, a, t, o, n = {}) =>
    makeTx({
      tenantId: a,
      contract: "RwaxiComplianceRegistry",
      address: registryOf(e.slug),
      fn: "approveInvestor",
      values: [t, 170, o],
      from: officerOf(e.slug),
      events: [
        {
          name: "InvestorWhitelisted",
          args: [
            ["wallet", t],
            ["countryCode", 170],
            ["kycDossierHash", o],
          ],
        },
      ],
      ...n,
    }),
  freeze: (e, a, t, o) =>
    makeTx({
      tenantId: a,
      contract: "RwaxiComplianceRegistry",
      address: registryOf(e.slug),
      fn: "setFrozen",
      values: [t, o],
      from: officerOf(e.slug),
      events: [
        {
          name: "InvestorFreezeUpdated",
          args: [
            ["wallet", t],
            ["isFrozen", o],
          ],
        },
      ],
    }),
  anchor: (e, a, t, o) =>
    makeTx({
      tenantId: a.id,
      contract: "RwaxiPropertyToken",
      address: tokenAddrOf(e, a),
      fn: "updateDataRoomMerkleRoot",
      values: ["0x" + o],
      from: adminOf(e.slug),
      events: [
        {
          name: "DataRoomMerkleRootAnchored",
          args: [
            ["previousRoot", "0x" + t],
            ["newRoot", "0x" + o],
          ],
        },
      ],
    }),
  deployToken: (e, a, t, o, n = {}) =>
    makeTx({
      tenantId: a.id,
      contract: "RwaxiTenantFactory",
      address: FACTORY_ADDR,
      fn: "deployOfferingToken",
      values: [
        orgIdOf(e.slug),
        offeringIdOf(a),
        [t.name, t.symbol, a.wrapper, a.vehicle, t.supply, "0x" + e.merkle],
        adminOf(e.slug),
        officerOf(e.slug),
      ],
      from: RWAXI_ADAPTER,
      events: [
        {
          name: "OfferingTokenDeployed",
          args: [
            ["organizationId", orgIdOf(e.slug)],
            ["offeringId", offeringIdOf(a)],
            ["token", o],
          ],
        },
      ],
      ...n,
    }),
  mint: (e, a, t, o, n, l, r, i = {}) =>
    makeTx({
      tenantId: a.id,
      contract: "RwaxiPropertyToken",
      address: t,
      fn: "mintSubscription",
      values: [o, n, l, r],
      from: RWAXI_ADAPTER,
      events: [
        {
          name: "Transfer",
          args: [
            ["from", ZERO_ADDR],
            ["to", n],
            ["value", l],
          ],
        },
        {
          name: "SubscriptionTokensMinted",
          args: [
            ["subscriptionId", o],
            ["investor", n],
            ["amount", l],
            ["paymentEvidenceRef", r],
          ],
        },
      ],
      ...i,
    }),
  pause: (e, a, t) =>
    makeTx({
      tenantId: a.id,
      contract: "RwaxiPropertyToken",
      address: tokenAddrOf(e, a),
      fn: t ? "pause" : "unpause",
      values: [],
      from: adminOf(e.slug),
      events: [
        {
          name: t ? "Paused" : "Unpaused",
          args: [["account", adminOf(e.slug)]],
        },
      ],
    }),
  registry: (e) =>
    makeTx({
      tenantId: null,
      contract: "RwaxiTenantFactory",
      address: FACTORY_ADDR,
      fn: "deployTenantRegistry",
      values: [orgIdOf(e.slug), e.nit, regimeEnum(e.regime), adminOf(e.slug), officerOf(e.slug)],
      from: RWAXI_ADAPTER,
      events: [
        {
          name: "TenantRegistryDeployed",
          args: [
            ["organizationId", orgIdOf(e.slug)],
            ["registry", registryOf(e.slug)],
            ["organizationTaxId", e.nit],
          ],
        },
      ],
    }),
};

export function initChainLog(e, a) {
  const t = [];
  let o = 2041e4;
  const n = (c, d) => ({
    block: (o += 1200 + d),
    ts: `${c}T14:${String(10 + d).padStart(2, "0")}:00Z`,
  });
  PROJECTS.forEach((c, d) => {
    const p = e[c.id];
    t.push({
      ...TX.registry(p),
      tenantId: c.id,
      ...n(p.since, d),
      id: "g-reg-" + c.id,
    }),
      p.leads
        .filter((m) => m.kyc === "aprobado")
        .forEach((m) =>
          t.push({
            ...TX.approve(p, c.id, leadWallet(m), "0x" + seededHex("dossier" + m.id, 64)),
            ...n(m.at, d + 2),
            id: "g-ap-" + m.id,
          }),
        );
  });
  const l = e.avista,
    r = byId("avista"),
    i = a.avista,
    s = tokenAddrOf(l, r);
  return (
    t.push({
      ...TX.deployToken(l, r, l.mint, s),
      ...n("2025-11-12", 5),
      id: "g-dep-avista",
    }),
    t.push({
      ...TX.approve(
        l,
        "avista",
        DEMO_WALLET,
        "0x" + (i.kyc.dossierHash || seededHex("dossier-demo-avista", 64)),
      ),
      ...n("2025-11-11", 4),
      id: "g-ap-demo",
    }),
    i.holdings.forEach((c) =>
      t.push({
        ...TX.mint(l, r, s, subIdOf(c.id), DEMO_WALLET, c.units, txHash("pay" + c.id)),
        ...n(c.since, 6),
        id: "g-mint-" + c.id,
      }),
    ),
    l.leads
      .filter((c) => c.kyc === "aprobado" && c.subCapital)
      .forEach((c) =>
        t.push({
          ...TX.mint(
            l,
            r,
            s,
            subIdOf(c.id),
            leadWallet(c),
            Math.round(c.subCapital / r.unit),
            txHash("pay" + c.id),
          ),
          ...n(c.at, 7),
          id: "g-mint-" + c.id,
        }),
      ),
    t.sort((c, d) => d.block - c.block)
  );
}

export function chainStateFor(e, a, t, o) {
  const n = a[e.id],
    l = t[e.id],
    r = o[e.id] || {
      frozen: {},
      extra: {},
      moves: [],
    },
    i = [];
  l.kyc.status === "aprobado" &&
    i.push({
      wallet: DEMO_WALLET,
      label: l.kyc.data.fullName || "Inversionista demo",
      dossier: "0x" + (l.kyc.dossierHash || seededHex("dossier-demo-" + e.id, 64)),
    }),
    n.leads
      .filter((m) => m.kyc === "aprobado")
      .forEach((m) =>
        i.push({
          wallet: leadWallet(m),
          label: m.name,
          dossier: "0x" + seededHex("dossier" + m.id, 64),
        }),
      ),
    Object.entries(r.extra).forEach(([m, u]) =>
      i.push({
        wallet: m,
        label: u.label,
        dossier: u.dossier,
      }),
    ),
    i.forEach((m) => {
      (m.isApproved = true), (m.isFrozen = !!r.frozen[m.wallet]), (m.countryCode = 170);
    });
  const s = tokenAddrOf(n, e),
    c = [];
  s &&
    (l.holdings
      .filter((m) => m.status === "en_wallet")
      .forEach((m) =>
        c.push({
          subId: subIdOf(m.id),
          wallet: DEMO_WALLET,
          units: m.units,
        }),
      ),
    n.leads
      .filter((m) => m.kyc === "aprobado" && m.subCapital)
      .forEach((m) =>
        c.push({
          subId: subIdOf(m.id),
          wallet: leadWallet(m),
          units: Math.round(m.subCapital / e.unit),
        }),
      ));
  const d = {};
  return (
    c.forEach((m) => {
      d[m.wallet] = (d[m.wallet] || 0) + m.units;
    }),
    r.moves.forEach((m) => {
      (d[m.from] = (d[m.from] || 0) - m.amount), (d[m.to] = (d[m.to] || 0) + m.amount);
    }),
    {
      t: n,
      p: e,
      x: r,
      token: s,
      investors: i,
      mints: c,
      bal: d,
      labelOf: (m) =>
        m === DEMO_WALLET
          ? l.kyc.data.fullName || "Inversionista demo"
          : (i.find((u) => u.wallet === m) || {}).label || "Wallet externa",
      totalSupply: c.reduce((m, u) => m + u.units, 0),
      paused: !!n.tokenPaused,
      eligible: (m) => {
        const u = i.find((v) => v.wallet.toLowerCase() === String(m).toLowerCase());
        return !!(u && u.isApproved && !u.isFrozen);
      },
      frozen: (m) => !!r.frozen[m],
      onchainRoot: n.onchainRoot || (s ? n.merkle : null),
    }
  );
}

export const t_net = (e, a) => e[a].mint.network;
