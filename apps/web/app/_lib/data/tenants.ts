// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
import { EMPTY_KYC } from "@/app/_lib/data/kyc";
import { LEGAL_COMPLIANCE, LEGAL_NDA } from "@/app/_lib/data/legal";
import { DATAROOM, PROJECTS } from "@/app/_lib/data/projects";
import { defaultVideo } from "@/app/_lib/data/video";
import { newToken } from "@/app/_lib/format";
import { seededHex } from "@/app/_lib/hash";

export const DEVELOPERS = {
  santabarbara: {
    slug: "santabarbara",
    displayName: "Andes Urbano",
    legalName: "Andes Urbano Desarrollos S.A.S.",
    nit: "901.482.317-5",
    color: "#0E5A4F",
    domain: "inversiones.andesurbano.co",
    symbol: "TSB",
  },
  poblado: {
    slug: "elpoblado",
    displayName: "Valle Alto Constructora",
    legalName: "Valle Alto Constructora S.A.S.",
    nit: "900.917.264-1",
    color: "#A4461F",
    domain: "",
    symbol: "SEP",
  },
  avista: {
    slug: "avista",
    displayName: "Avista Hospitality Group",
    legalName: "Avista Hospitality Group S.A.S.",
    nit: "901.105.738-9",
    color: "#0B4F7A",
    domain: "invest.avistaresort.co",
    symbol: "AVB",
  },
};

export const DEFAULT_REGIME = {
  santabarbara: "sagrilaft",
  poblado: "sarlaft",
  avista: "sagrilaft",
};

export const DEFAULT_CONTACT = {
  santabarbara: "cumplimiento@andesurbano.co",
  poblado: "oficialcumplimiento@vallealto.co",
  avista: "compliance@avistaresort.co",
};

export const DEFAULT_SINCE = {
  santabarbara: "2026-03-02",
  poblado: "2026-06-17",
  avista: "2025-09-08",
};

export const DEMO_KYC = {
  ...EMPTY_KYC,
  fullName: "María Fernanda Ríos Ospina",
  docType: "CC",
  docNumber: "1020456789",
  country: "Colombia",
  activity: "Profesional independiente",
  income: 1,
  risk: "moderado",
  liveness: "done",
  noPep: true,
  dataPolicy: true,
  terms: true,
  sarlaft: true,
  ptee: true,
  listas: true,
};

export function seedLeads(e) {
  return [
    {
      name: "Laura Gómez Restrepo",
      doc: "C.C. 52.381.904",
      source: "RWAXI",
      nda: true,
      kyc: "aprobado",
      subCapital: 2e4,
      lists: "Sin coincidencias",
      activity: "Empresario / socio de empresa",
      income: 2,
      risk: "dinamico",
      ptee: true,
    },
    {
      name: "Carlos A. Méndez Pardo",
      doc: "C.C. 79.604.112",
      source: "RWAXI",
      nda: true,
      kyc: "pendiente",
      lists: "Sin coincidencias",
      activity: "Empleado / asalariado",
      income: 1,
      risk: "moderado",
      ptee: true,
    },
    {
      name: "Jorge Iván Toro",
      doc: "C.C. 71.228.540",
      source: "RWAXI",
      nda: true,
      kyc: "pendiente",
      lists: "Coincidencia parcial · revisar homónimo",
      activity: "Rentista de capital (inversiones, arriendos)",
      income: 3,
      risk: "moderado",
      ptee: true,
    },
    {
      name: "Inversiones Pradera S.A.S.",
      doc: "NIT 901.330.448-2",
      source: "Directo",
      nda: false,
      kyc: "no_iniciado",
      lists: "—",
      activity: "",
      income: null,
      risk: "",
      ptee: false,
    },
  ].map((t, o) => ({
    ...t,
    id: `${e}-L${o + 1}`,
    token: newToken(e + o),
    at: `2026-10-${String(12 + o * 2).padStart(2, "0")}`,
    whitelistTx: t.kyc === "aprobado" ? "0x" + seededHex("wl" + e + o, 64) : null,
  }));
}

export function seedDocs(e) {
  return DATAROOM.flatMap((a) =>
    a.docs.map(([t, o], n) => ({
      id: `${e.id}-${a.n}-${n}`,
      folder: `${a.n} ${a.name}`,
      name: t,
      restricted: o,
      hash: seededHex("doc-" + e.id + t, 64),
      size: 18e4 + Math.round(seededHex(t, 4).charCodeAt(1) * 7300),
      at: "2026-09-30",
      uploaded: false,
    })),
  );
}

export function initTenants() {
  const e = {};
  return (
    PROJECTS.forEach((a) => {
      const t = DEVELOPERS[a.id];
      e[a.id] = {
        ...t,
        projectId: a.id,
        logo: null,
        domainStatus: t.domain ? "verificado" : "sin_configurar",
        regime: DEFAULT_REGIME[a.id],
        chainRegime: DEFAULT_REGIME[a.id] === "sarlaft" ? "SARLAFT" : "SAGRILAFT_PTEE",
        onchainRoot: a.id === "avista" ? a.merkle : null,
        portalStatus: "ACTIVE",
        published: true,
        contact: DEFAULT_CONTACT[a.id],
        since: DEFAULT_SINCE[a.id],
        ndaText: LEGAL_NDA,
        complianceTpl: {
          ...LEGAL_COMPLIANCE,
        },
        tokenPaused: false,
        docs: seedDocs(a),
        merkle: a.merkle,
        anchoredTx: null,
        mint:
          a.id === "avista"
            ? {
                status: "minted",
                network: a.chain,
                name: "Avista Villas Unit",
                symbol: t.symbol,
                supply: a.totalUnits,
                price: a.unit,
                contract: a.contract,
                tx: "0x" + seededHex("mint-avista", 64),
              }
            : {
                status: "none",
                network: a.chain,
                name: `${a.asset} Unit`,
                symbol: t.symbol,
                supply: a.totalUnits,
                price: a.unit,
                contract: null,
                tx: null,
              },
        leads: seedLeads(a.id),
        video: defaultVideo(a),
      };
    }),
    e
  );
}

export function initJourneys() {
  const e = {};
  return (
    PROJECTS.forEach((a) => {
      e[a.id] = {
        lead: null,
        nda: null,
        kyc: {
          stage: "form",
          step: 0,
          data: EMPTY_KYC,
          status: null,
          reason: null,
          whitelistTx: null,
        },
        grant: null,
        holdings: [],
      };
    }),
    (e.avista = {
      lead: {
        token: "ref_rwx_892a" + seededHex("lead-avista", 20),
        at: "2025-11-10T15:02:11Z",
        source: "RWAXI",
      },
      nda: {
        id: "cr_" + seededHex("nda-avista", 12),
        signer: DEMO_KYC.fullName,
        email: "inversionista@ejemplo.co",
        at: "2025-11-10T15:06:40Z",
        hash: seededHex("ndahash-avista", 64),
      },
      kyc: {
        stage: "status",
        step: 3,
        data: DEMO_KYC,
        status: "aprobado",
        reason: null,
        whitelistTx: "0x" + seededHex("wl-avista-demo", 64),
      },
      grant: {
        id: "grant_" + seededHex("grant-avista", 16),
        at: "2025-11-11T09:12:00Z",
        ttlH: 24,
      },
      holdings: [
        {
          id: "h-av-1",
          units: 120,
          capital: 12e3,
          accrued: 1296,
          since: "2025-11-14",
          status: "en_wallet",
          tx: "0x" + seededHex("tx-avista", 64),
        },
      ],
    }),
    e
  );
}
