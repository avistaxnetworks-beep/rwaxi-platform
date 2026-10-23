// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
import { PROJECTS } from "@/app/_lib/data/projects";
import { seededHex } from "@/app/_lib/hash";

export const PORTAL_STATUS = {
  ACTIVE: ["Activo", "bg-aquaTint text-aquaInk"],
  REVIEW: ["En revisión", "bg-goldTint text-goldInk"],
  SUSPENDED: ["Suspendido", "bg-[#FDECEA] text-[#B42318]"],
};

export const FEE_STATUS = {
  ACCRUED: ["ACCRUED", "bg-goldTint text-goldInk", "Causado"],
  INVOICED: ["INVOICED", "bg-blueTint text-rxBlue", "Facturado"],
  PAID: ["PAID", "bg-aquaTint text-aquaInk", "Pagado"],
};

export const FEE_KIND = {
  setup: "Setup / Onboarding",
  saas: "Suscripción SaaS",
  usage: "Uso · operación verificada",
};

export const DEFAULT_FEES = {
  santabarbara: {
    setup: 12e3,
    monthly: 1800,
    usagePct: 1.2,
  },
  poblado: {
    setup: 6500,
    monthly: 950,
    usagePct: 1.5,
  },
  avista: {
    setup: 9500,
    monthly: 1400,
    usagePct: 1,
  },
};

export const LEDGER_MONTHS = ["2026-08", "2026-09", "2026-10"];

export const MONTH_NAME = {
  "2026-08": "agosto 2026",
  "2026-09": "septiembre 2026",
  "2026-10": "octubre 2026",
};

export function initFeeRules() {
  return JSON.parse(JSON.stringify(DEFAULT_FEES));
}

export function buildReferrals(e, a) {
  const t = [];
  return (
    PROJECTS.forEach((o) => {
      const n = e[o.id],
        l = a[o.id],
        r = n.mint.status === "minted";
      if (l.lead) {
        const i = l.holdings.filter((c) => c.status === "en_wallet"),
          s = l.holdings.filter((c) => c.status === "reservado");
        t.push({
          id: `${o.id}-me`,
          me: true,
          token: l.lead.token,
          tenantId: o.id,
          investor: l.kyc.data.fullName || (l.nda ? l.nda.signer : "Visitante anónimo"),
          at: l.lead.at.slice(0, 10),
          nda: !!l.nda,
          kyc: l.kyc.status || (l.nda ? "no_iniciado" : null),
          sub: i.length ? "verificada" : s.length ? "reservada" : null,
          capital: i.reduce((c, d) => c + d.capital, 0),
          evidence: i.length ? i[i.length - 1].tx : null,
        });
      }
      n.leads
        .filter((i) => i.source === "RWAXI")
        .forEach((i) => {
          const s = i.kyc === "aprobado" && i.subCapital;
          t.push({
            id: i.id,
            token: i.token,
            tenantId: o.id,
            investor: i.name,
            at: i.at,
            nda: i.nda,
            kyc: i.kyc,
            sub: s ? (r ? "verificada" : "reservada") : null,
            capital: s && r ? i.subCapital : 0,
            evidence: s && r ? "0x" + seededHex("lead-sub" + i.id, 64) : null,
          });
        });
    }),
    t
  );
}

export function buildLedger(e, a, t, o, n) {
  const l = [],
    r = (i) =>
      l.push({
        ...i,
        status: n[i.id] || i.status,
      });
  return (
    PROJECTS.forEach((i) => {
      const s = e[i.id],
        c = a[i.id],
        d = o[i.id];
      r({
        id: `fee_setup_${s.slug}`,
        tenantId: i.id,
        org: s.legalName,
        kind: "setup",
        amount: d.setup,
        date: s.since,
        evidence: `Contrato de implementación White Label · ${s.slug}`,
        status: "PAID",
      }),
        LEDGER_MONTHS.filter((p) => p >= s.since.slice(0, 7)).forEach((p, m, u) => {
          (s.portalStatus === "SUSPENDED" && m === u.length - 1) ||
            r({
              id: `fee_saas_${s.slug}_${p}`,
              tenantId: i.id,
              org: s.legalName,
              kind: "saas",
              amount: d.monthly,
              date: `${p}-01`,
              evidence: `Suscripción ${MONTH_NAME[p]} · infraestructura, Data Room y nodo`,
              status: m === u.length - 1 ? "INVOICED" : "PAID",
            });
        }),
        s.mint.status === "minted" &&
          (c.holdings
            .filter((p) => p.status === "en_wallet")
            .forEach((p) => {
              r({
                id: `fee_use_${p.tx.slice(2, 14)}`,
                tenantId: i.id,
                org: s.legalName,
                kind: "usage",
                amount: (p.capital * d.usagePct) / 100,
                base: p.capital,
                date: p.since,
                evidence: p.tx,
                status: p.id === "h-av-1" ? "PAID" : "ACCRUED",
              });
            }),
          s.leads
            .filter((p) => p.kyc === "aprobado" && p.subCapital)
            .forEach((p) => {
              const m = "0x" + seededHex("lead-sub" + p.id, 64);
              r({
                id: `fee_use_${m.slice(2, 14)}`,
                tenantId: i.id,
                org: s.legalName,
                kind: "usage",
                amount: (p.subCapital * d.usagePct) / 100,
                base: p.subCapital,
                date: p.at,
                evidence: m,
                status: "INVOICED",
              });
            }));
    }),
    t.forEach((i) =>
      r({
        id: `fee_setup_${i.slug}`,
        tenantId: null,
        org: i.legalName,
        kind: "setup",
        amount: i.fees.setup,
        date: i.since,
        evidence: `Contrato de implementación White Label · ${i.slug}`,
        status: "ACCRUED",
      }),
    ),
    l
  );
}
