/**
 * Seeds the three demo developers of the approved prototype:
 *   Andes Urbano (santabarbara) · Valle Alto Constructora (elpoblado) · Avista Hospitality Group (avista)
 *
 * Runs as the owner role (DIRECT_URL), which is not subject to RLS. Resets all data first.
 * Addresses and tx hashes are deterministic demo values, as in the prototype.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { computeDataRoomRoot, sha256Document, toOnchainId } from "@rwaxi/blockchain-sdk";
import { DATAROOM, DEVELOPERS, LEADS } from "./seed-data/developers";
import { LEGAL_COMPLIANCE, LEGAL_NDA } from "./seed-data/legal";

if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
  console.error("Refusing to reset a production database. Pass --force if you really mean it.");
  process.exit(1);
}

const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

const demoHash = (label: string) => sha256Document(`rwaxi-demo:${label}`);
const demoAddress = (label: string) => `0x${demoHash(label).slice(2, 42)}`;
const LEDGER_MONTHS = ["2026-08", "2026-09", "2026-10"];

async function reset() {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE "audit_events", "fee_ledger_entries", "chain_transactions", "subscriptions", "data_room_access_grants",
      "data_room_documents", "kyc_cases", "nda_acceptances", "leads", "investors", "token_deployments",
      "offerings", "users", "organizations" CASCADE`);
}

async function seedDeveloper(dev: (typeof DEVELOPERS)[number]) {
  const o = dev.offering;
  const orgId = dev.orgId;

  // 1 · Organization
  await db.organization.create({
    data: {
      id: orgId,
      slug: dev.slug,
      displayName: dev.displayName,
      legalName: dev.legalName,
      taxId: dev.taxId,
      brandColor: dev.brandColor,
      customDomain: dev.customDomain,
      domainStatus: dev.customDomain ? "VERIFIED" : "NOT_CONFIGURED",
      complianceRegime: dev.regime,
      complianceContactEmail: dev.complianceEmail,
      portalStatus: "ACTIVE",
      published: true,
      ndaTemplate: LEGAL_NDA,
      complianceTemplate: { [dev.regimeKey]: LEGAL_COMPLIANCE[dev.regimeKey] },
      onchainId: toOnchainId(orgId),
      // Every tenant gets its RwaxiComplianceRegistry at onboarding, before any token exists.
      complianceRegistry: demoAddress(`registry-${orgId}`),
      feeSetupUsd: dev.fees.setup,
      feeMonthlyUsd: dev.fees.monthly,
      feeUsagePct: dev.fees.usagePct,
      onboardedAt: new Date(dev.onboardedAt),
    },
  });

  // 2 · Users of the tenant
  const [, officer] = await Promise.all([
    db.user.create({
      data: { organizationId: orgId, email: dev.adminEmail, fullName: `Administrador ${dev.displayName}`, role: "TENANT_ADMIN" },
    }),
    db.user.create({
      data: {
        organizationId: orgId,
        email: dev.complianceEmail,
        fullName: `Oficial de Cumplimiento ${dev.displayName}`,
        role: "COMPLIANCE_OFFICER",
      },
    }),
  ]);

  // 9 · Data Room documents → Merkle root
  const documents = DATAROOM.flatMap((f) =>
    f.docs.map(([name, restricted]) => ({
      organizationId: orgId,
      offeringId: o.id,
      folder: f.folder,
      name,
      restricted,
      sha256: demoHash(`doc-${o.id}-${name}`),
      sizeBytes: 180_000 + (parseInt(demoHash(name).slice(2, 6), 16) % 900_000),
      uploadedAt: new Date("2026-09-30"),
    })),
  );
  const dataRoomRoot = computeDataRoomRoot(documents);

  // 3 · Offering
  await db.offering.create({
    data: {
      id: o.id,
      organizationId: orgId,
      code: o.code,
      assetName: o.assetName,
      city: o.city,
      region: o.region,
      assetType: o.assetType,
      stage: o.stage,
      renderKind: o.renderKind,
      legalEntityName: o.legalEntityName,
      legalWrapperType: o.legalWrapperType,
      legalWrapperNote: o.legalWrapperNote,
      economicRight: o.economicRight,
      targetIrrPct: o.targetIrrPct,
      distributionYieldPct: o.distributionYieldPct,
      appreciationPct: o.appreciationPct,
      minTicketUsd: o.minTicketUsd,
      unitPriceUsd: o.unitPriceUsd,
      raiseTargetUsd: o.raiseTargetUsd,
      assetValueUsd: o.assetValueUsd,
      totalUnits: Math.round(o.raiseTargetUsd / o.unitPriceUsd),
      rentStartMonths: o.rentStartMonths,
      network: o.network,
      pipeline: o.pipeline,
      dataRoomRoot,
      published: true,
    },
  });
  await db.dataRoomDocument.createMany({ data: documents });

  // 4 · Token deployment
  const tokenAddress = o.token.deployed ? demoAddress(`token-${o.id}`) : null;
  await db.tokenDeployment.create({
    data: {
      organizationId: orgId,
      offeringId: o.id,
      network: o.network,
      name: o.token.name,
      symbol: o.token.symbol,
      maxSupply: Math.round(o.raiseTargetUsd / o.unitPriceUsd),
      unitPriceUsd: o.unitPriceUsd,
      onchainId: toOnchainId(o.id),
      contractAddress: tokenAddress,
      deployTxHash: o.token.deployed ? demoHash(`deploy-${o.id}`) : null,
      status: o.token.deployed ? "DEPLOYED" : "NOT_DEPLOYED",
      deployedAt: o.token.deployed ? new Date("2025-10-01") : null,
    },
  });

  const chainTxs: Prisma.ChainTransactionCreateManyInput[] = [];
  const fees: Prisma.FeeLedgerEntryCreateManyInput[] = [];
  chainTxs.push({
    organizationId: orgId,
    network: o.network,
    kind: "TENANT_REGISTRY_DEPLOYED",
    contractAddress: demoAddress("factory"),
    method: "deployTenantRegistry(bytes32,string,string,address,address)",
    args: {
      organizationId: toOnchainId(orgId),
      organizationTaxId: dev.taxId,
      complianceRegime: dev.regime,
      registry: demoAddress(`registry-${orgId}`),
    },
    txHash: demoHash(`registry-tx-${orgId}`),
    status: "CONFIRMED",
    createdAt: new Date(dev.onboardedAt),
  });
  if (tokenAddress) {
    chainTxs.push({
      organizationId: orgId,
      offeringId: o.id,
      network: o.network,
      kind: "OFFERING_TOKEN_DEPLOYED",
      contractAddress: demoAddress("factory"),
      method: "deployOfferingToken(bytes32,bytes32,(string,string,string,string,uint256,bytes32),address,address)",
      args: { symbol: o.token.symbol, token: tokenAddress, dataRoomMerkleRoot: dataRoomRoot },
      txHash: demoHash(`deploy-${o.id}`),
      status: "CONFIRMED",
      createdAt: new Date("2025-10-01"),
    });
  }

  // 5–8 · Investors, leads, NDA, KYC (+ grants and subscriptions for approved investors)
  for (const [i, lead] of LEADS.entries()) {
    const investor = await db.investor.create({
      data: {
        organizationId: orgId,
        fullName: lead.fullName,
        docType: lead.docType,
        docNumber: lead.docNumber,
        email: `inversionista${i + 1}@ejemplo.co`,
        // The wallet is declared in the KYC wizard, so every investor who submitted KYC has one.
        walletAddress: lead.nda ? demoAddress(`wallet-${orgId}-${i}`) : null,
      },
    });
    const landedAt = new Date(`2026-10-${String(12 + i * 2).padStart(2, "0")}T14:00:00Z`);
    await db.lead.create({
      data: {
        organizationId: orgId,
        offeringId: o.id,
        investorId: investor.id,
        referralToken: `ref_rwx_${demoHash(`lead-${orgId}-${i}`).slice(2, 26)}`,
        source: lead.source,
        landedAt,
      },
    });
    if (!lead.nda) continue;

    const nda = await db.ndaAcceptance.create({
      data: {
        organizationId: orgId,
        offeringId: o.id,
        investorId: investor.id,
        signerName: lead.fullName,
        signerEmail: investor.email!,
        documentHash: demoHash(`nda-${orgId}-${i}`),
        acceptedAt: landedAt,
      },
    });
    const approved = lead.kyc === "APPROVED";
    const kyc = await db.kycCase.create({
      data: {
        organizationId: orgId,
        investorId: investor.id,
        offeringId: o.id,
        status: lead.kyc,
        activity: lead.activity,
        incomeBracket: lead.incomeBracket,
        riskProfile: lead.risk,
        listsResult: lead.lists,
        dossierHash: demoHash(`kyc-${orgId}-${i}`),
        submittedAt: landedAt,
        reviewedById: approved ? officer.id : null,
        reviewedAt: approved ? landedAt : null,
        whitelistTxHash: approved ? demoHash(`wl-${orgId}-${i}`) : null,
      },
    });
    if (!approved) continue;

    await db.dataRoomAccessGrant.create({
      data: {
        organizationId: orgId,
        offeringId: o.id,
        investorId: investor.id,
        ndaAcceptanceId: nda.id,
        kycCaseId: kyc.id,
        grantedAt: landedAt,
        expiresAt: new Date(landedAt.getTime() + 24 * 3600 * 1000),
      },
    });
    // Whitelisting lives in the tenant registry, so it does not depend on a minted token.
    chainTxs.push({
      organizationId: orgId,
      offeringId: o.id,
      network: o.network,
      kind: "INVESTOR_WHITELISTED",
      contractAddress: demoAddress(`registry-${orgId}`),
      method: "approveInvestor(address,uint16,bytes32)",
      args: { wallet: investor.walletAddress, countryCode: 170, kycDossierHash: kyc.dossierHash },
      txHash: kyc.whitelistTxHash,
      status: "CONFIRMED",
      createdAt: landedAt,
    });
    if (lead.subscriptionUsd) {
      const units = Math.round(lead.subscriptionUsd / o.unitPriceUsd);
      const sub = await db.subscription.create({
        data: {
          organizationId: orgId,
          offeringId: o.id,
          investorId: investor.id,
          units,
          capitalUsd: lead.subscriptionUsd,
          status: tokenAddress ? "MINTED" : "RESERVED",
          paymentEvidenceRef: tokenAddress ? demoHash(`pay-${orgId}-${i}`) : null,
          mintTxHash: tokenAddress ? demoHash(`mint-${orgId}-${i}`) : null,
        },
      });
      await db.subscription.update({ where: { id: sub.id }, data: { onchainId: toOnchainId(sub.id) } });
      if (tokenAddress) {
        chainTxs.push({
          organizationId: orgId,
          offeringId: o.id,
          network: o.network,
          kind: "SUBSCRIPTION_MINTED",
          contractAddress: tokenAddress,
          method: "mintSubscription(bytes32,address,uint256,bytes32)",
          args: { subscriptionId: toOnchainId(sub.id), investor: investor.walletAddress, amount: units },
          txHash: sub.mintTxHash,
          status: "CONFIRMED",
          createdAt: landedAt,
        });
        fees.push({
          organizationId: orgId,
          subscriptionId: sub.id,
          kind: "USAGE",
          amountUsd: (lead.subscriptionUsd * dev.fees.usagePct) / 100,
          baseUsd: lead.subscriptionUsd,
          accruedOn: landedAt,
          evidence: sub.mintTxHash!,
          status: "INVOICED",
        });
      }
    }
  }

  if (tokenAddress) {
    chainTxs.push({
      organizationId: orgId,
      offeringId: o.id,
      network: o.network,
      kind: "DATA_ROOM_ROOT_ANCHORED",
      contractAddress: tokenAddress,
      method: "updateDataRoomMerkleRoot(bytes32)",
      args: { newRoot: dataRoomRoot },
      txHash: demoHash(`anchor-${o.id}`),
      status: "CONFIRMED",
      createdAt: new Date("2026-09-30"),
    });
  }
  await db.chainTransaction.createMany({ data: chainTxs });

  // 13 · RWAXI fees: setup + monthly SaaS (last month invoiced)
  fees.push({
    organizationId: orgId,
    kind: "SETUP",
    amountUsd: dev.fees.setup,
    accruedOn: new Date(dev.onboardedAt),
    evidence: `Contrato de implementación White Label · ${dev.slug}`,
    status: "PAID",
  });
  const months = LEDGER_MONTHS.filter((m) => m >= dev.onboardedAt.slice(0, 7));
  months.forEach((period, idx) =>
    fees.push({
      organizationId: orgId,
      kind: "SAAS",
      amountUsd: dev.fees.monthly,
      period,
      accruedOn: new Date(`${period}-01`),
      evidence: `Suscripción ${period} · infraestructura, Data Room y nodo`,
      status: idx === months.length - 1 ? "INVOICED" : "PAID",
    }),
  );
  await db.feeLedgerEntry.createMany({ data: fees });

  return { slug: dev.slug, documents: documents.length, dataRoomRoot, chainTxs: chainTxs.length, fees: fees.length };
}

async function main() {
  await reset();
  await db.user.createMany({
    data: [
      { email: "direccion@rwaxi.com", fullName: "Dirección RWAXI", role: "SUPER_ADMIN" },
      { email: "operador@rwaxi.com", fullName: "Operador técnico RWAXI", role: "RWAXI_OPERATOR" },
    ],
  });
  for (const dev of DEVELOPERS) {
    const r = await seedDeveloper(dev);
    console.log(`✔ ${r.slug.padEnd(13)} docs=${r.documents} root=${r.dataRoomRoot.slice(0, 18)}… txs=${r.chainTxs} fees=${r.fees}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
