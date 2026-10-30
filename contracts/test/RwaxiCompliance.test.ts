import hre from "hardhat";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import { keccak256, toHex, getAddress, type Address } from "viem";

chai.use(chaiAsPromised);

const orgId = keccak256(toHex("org_avista"));
const offeringId = keccak256(toHex("off_avista_villas"));
const subId = (n: number) => keccak256(toHex(`sub_${n}`));
const ref = keccak256(toHex("payment-evidence"));

async function deployFixture() {
  const [rwaxi, tenantAdmin, officer, investor, outsider, recovery] = await hre.viem.getWalletClients();
  const factory = await hre.viem.deployContract("RwaxiTenantFactory", [rwaxi!.account.address]);

  await factory.write.deployTenantRegistry([
    orgId,
    "901.105.738-9",
    "SAGRILAFT_PTEE",
    tenantAdmin!.account.address,
    officer!.account.address,
  ]);
  const registryAddr = (await factory.read.tenantRegistries([orgId])) as Address;
  const registry = await hre.viem.getContractAt("RwaxiComplianceRegistry", registryAddr);

  await factory.write.deployOfferingToken([
    orgId,
    offeringId,
    {
      name: "Avista Villas Unit",
      symbol: "AVB",
      legalWrapperType: "SPV / Cuentas en Participacion",
      legalEntityName: "Avista Tokenization Fund I",
      maxSupplyCap: 120_000n,
      dataRoomMerkleRoot: keccak256(toHex("dataroom-v1")),
      platformFeeBps: 120,
    },
    tenantAdmin!.account.address,
    officer!.account.address,
  ]);
  const tokenAddr = (await factory.read.offeringTokens([offeringId])) as Address;
  const token = await hre.viem.getContractAt("RwaxiPropertyToken", tokenAddr);

  const asOfficer = { account: officer!.account };
  const asAdmin = { account: tenantAdmin!.account };
  return { factory, registry, token, rwaxi: rwaxi!, tenantAdmin: tenantAdmin!, officer: officer!, investor: investor!, outsider: outsider!, recovery: recovery!, asOfficer, asAdmin };
}

describe("RWAXI tenant factory", () => {
  it("isolates one compliance registry per organization", async () => {
    const { factory, tenantAdmin, officer } = await deployFixture();
    await expect(
      factory.write.deployTenantRegistry([orgId, "x", "SARLAFT", tenantAdmin.account.address, officer.account.address]),
    ).to.be.rejectedWith("TenantAlreadyRegistered");
  });

  it("refuses offerings for unknown tenants and duplicate offerings", async () => {
    const { factory, tenantAdmin, officer } = await deployFixture();
    const cfg = { name: "n", symbol: "s", legalWrapperType: "w", legalEntityName: "e", maxSupplyCap: 1n, dataRoomMerkleRoot: orgId, platformFeeBps: 100 };
    await expect(
      factory.write.deployOfferingToken([keccak256(toHex("ghost")), subId(9), cfg, tenantAdmin.account.address, officer.account.address]),
    ).to.be.rejectedWith("UnknownTenant");
    await expect(
      factory.write.deployOfferingToken([orgId, offeringId, cfg, tenantAdmin.account.address, officer.account.address]),
    ).to.be.rejectedWith("OfferingAlreadyDeployed");
  });

  it("only RWAXI operators can deploy", async () => {
    const { factory, outsider, tenantAdmin, officer } = await deployFixture();
    await expect(
      factory.write.deployTenantRegistry(
        [keccak256(toHex("org_x")), "x", "SARLAFT", tenantAdmin.account.address, officer.account.address],
        { account: outsider.account },
      ),
    ).to.be.rejectedWith("AccessControlUnauthorizedAccount");
  });
});

describe("RwaxiPropertyToken compliance hook", () => {
  it("has zero decimals (1 token = 1 unit of the vehicle)", async () => {
    const { token } = await deployFixture();
    expect(await token.read.decimals()).to.equal(0);
  });

  it("blocks minting to wallets outside the tenant whitelist", async () => {
    const { token, investor } = await deployFixture();
    await expect(token.write.mintSubscription([subId(1), investor.account.address, 10n, ref])).to.be.rejectedWith(
      "Receiver wallet is not approved in Tenant Whitelist",
    );
  });

  it("mints approved subscriptions once and enforces the supply cap", async () => {
    const { token, registry, investor, asOfficer } = await deployFixture();
    await registry.write.approveInvestor([investor.account.address, 170, keccak256(toHex("kyc-dossier"))], asOfficer);
    await token.write.mintSubscription([subId(1), investor.account.address, 120n, ref]);
    expect(await token.read.balanceOf([investor.account.address])).to.equal(120n);
    await expect(token.write.mintSubscription([subId(1), investor.account.address, 1n, ref])).to.be.rejectedWith(
      "SubscriptionAlreadyProcessed",
    );
    await expect(token.write.mintSubscription([subId(2), investor.account.address, 120_000n, ref])).to.be.rejectedWith(
      "SupplyCapExceeded",
    );
  });

  it("only the tenant compliance officer manages the whitelist", async () => {
    const { registry, investor, rwaxi } = await deployFixture();
    await expect(
      registry.write.approveInvestor([investor.account.address, 170, keccak256(toHex("k"))], { account: rwaxi.account }),
    ).to.be.rejectedWith("AccessControlUnauthorizedAccount");
  });

  it("frozen senders cannot transfer; legal enforcement can recover to a verified wallet", async () => {
    const { token, registry, investor, recovery, asOfficer, asAdmin } = await deployFixture();
    const dossier = keccak256(toHex("kyc"));
    await registry.write.approveInvestor([investor.account.address, 170, dossier], asOfficer);
    await registry.write.approveInvestor([recovery.account.address, 170, dossier], asOfficer);
    await token.write.mintSubscription([subId(1), investor.account.address, 50n, ref]);
    await registry.write.setFrozen([investor.account.address, true], asOfficer);

    await expect(
      token.write.transfer([recovery.account.address, 10n], { account: investor.account }),
    ).to.be.rejectedWith("Sender wallet is frozen");
    await expect(
      token.write.forcedTransfer([investor.account.address, recovery.account.address, 50n, "0x" + "00".repeat(32) as `0x${string}`], asAdmin),
    ).to.be.rejectedWith("LegalActHashRequired");

    await token.write.forcedTransfer([investor.account.address, recovery.account.address, 50n, keccak256(toHex("court-order"))], asAdmin);
    expect(await token.read.balanceOf([recovery.account.address])).to.equal(50n);
  });

  it("RWAXI cannot pause or touch the Data Room root; the issuer can", async () => {
    const { token, rwaxi, asAdmin, asOfficer } = await deployFixture();
    await expect(token.write.pause([], { account: rwaxi.account })).to.be.rejectedWith("NotIssuerOrComplianceOfficer");
    await expect(
      token.write.updateDataRoomMerkleRoot([keccak256(toHex("v2"))], { account: rwaxi.account }),
    ).to.be.rejectedWith("AccessControlUnauthorizedAccount");

    await token.write.updateDataRoomMerkleRoot([keccak256(toHex("v2"))], asAdmin);
    expect(await token.read.dataRoomMerkleRoot()).to.equal(keccak256(toHex("v2")));
    await token.write.pause([], asOfficer);
    expect(await token.read.paused()).to.equal(true);
  });

  it("records the minter as the RWAXI operator that called the factory", async () => {
    const { token, rwaxi } = await deployFixture();
    const MINTER_ROLE = await token.read.MINTER_ROLE();
    expect(await token.read.hasRole([MINTER_ROLE, getAddress(rwaxi.account.address)])).to.equal(true);
  });
});

describe("RwaxiPropertyToken distribution roots", () => {
  const distId = keccak256(toHex("dist_avista_2026_t3"));
  const root = keccak256(toHex("allocations-root"));
  const evidence = keccak256(toHex("fiduciary-certificate.pdf"));
  const ZERO32 = `0x${"0".repeat(64)}` as const;

  /** Two whitelisted holders: 300 tokens, then (an hour later) 150 more; returns the instant between both mints. */
  async function withHolders() {
    const fx = await deployFixture();
    const { token, registry, investor, recovery, asOfficer } = fx;
    const publicClient = await hre.viem.getPublicClient();
    const testClient = await hre.viem.getTestClient();
    const dossier = keccak256(toHex("kyc"));
    await registry.write.approveInvestor([investor.account.address, 170, dossier], asOfficer);
    await registry.write.approveInvestor([recovery.account.address, 170, dossier], asOfficer);
    await token.write.mintSubscription([subId(1), investor.account.address, 300n, ref]);
    const firstMint = (await publicClient.getBlock()).timestamp;
    await testClient.increaseTime({ seconds: 3600 });
    await testClient.mine({ blocks: 1 });
    await token.write.mintSubscription([subId(2), recovery.account.address, 150n, ref]);
    const secondMint = (await publicClient.getBlock()).timestamp;
    await testClient.mine({ blocks: 1 });
    return { ...fx, publicClient, testClient, firstMint, secondMint, between: firstMint + 1800n };
  }

  it("only the issuer anchors a distribution root, once, with evidence, and never an empty one", async () => {
    const { token, rwaxi, officer, asAdmin, secondMint } = await withHolders();
    const args = (over: Partial<{ root: `0x${string}`; total: bigint; supply: bigint; evidence: `0x${string}` }> = {}) =>
      [distId, over.root ?? root, over.total ?? 1_000_000n, over.supply ?? 450n, secondMint, "COP", over.evidence ?? evidence] as const;
    await expect(token.write.anchorDistributionRoot(args(), { account: rwaxi.account })).to.be.rejectedWith(
      "AccessControlUnauthorizedAccount",
    );
    await expect(token.write.anchorDistributionRoot(args(), { account: officer.account })).to.be.rejectedWith(
      "AccessControlUnauthorizedAccount",
    );
    await expect(token.write.anchorDistributionRoot(args({ root: ZERO32 }), asAdmin)).to.be.rejectedWith("EmptyDistributionRoot");
    await expect(token.write.anchorDistributionRoot(args({ total: 0n }), asAdmin)).to.be.rejectedWith("EmptyDistribution");
    await expect(token.write.anchorDistributionRoot(args({ evidence: ZERO32 }), asAdmin)).to.be.rejectedWith(
      "DistributionEvidenceRequired",
    );

    await token.write.anchorDistributionRoot(args(), asAdmin);
    expect(await token.read.distributionRoots([distId])).to.equal(root);
    await expect(token.write.anchorDistributionRoot(args(), asAdmin)).to.be.rejectedWith("DistributionAlreadyAnchored");
  });

  it("verifies the snapshot supply against the token's own history at the record date", async () => {
    const { token, asAdmin, between, secondMint } = await withHolders();
    // Between both mints only the first 300 tokens existed: 450 is refused, 300 is the supply of record.
    await expect(
      token.write.anchorDistributionRoot([distId, root, 1_000_000n, 450n, between, "USD", evidence], asAdmin),
    ).to.be.rejectedWith("SnapshotSupplyMismatch");
    await token.write.anchorDistributionRoot([distId, root, 1_000_000n, 300n, between, "USD", evidence], asAdmin);
    const later = keccak256(toHex("dist_avista_2026_10"));
    await token.write.anchorDistributionRoot([later, root, 5_000n, 450n, secondMint, "USDC", evidence], asAdmin);
    expect(await token.read.distributionRoots([later])).to.equal(root);
  });

  it("refuses a record date that has not elapsed yet (FutureLookup)", async () => {
    const { token, asAdmin, publicClient } = await withHolders();
    const now = (await publicClient.getBlock()).timestamp;
    await expect(
      token.write.anchorDistributionRoot([distId, root, 1_000_000n, 450n, now + 3600n, "COP", evidence], asAdmin),
    ).to.be.rejectedWith("FutureLookup");
    await expect(token.read.totalSupplyAt([now + 3600n])).to.be.rejectedWith("FutureLookup");
  });

  it("keeps each holder's balance history across mints and transfers (balanceOfAt, totalSupplyAt)", async () => {
    const { token, investor, recovery, testClient, publicClient, firstMint, between, secondMint } = await withHolders();
    await token.write.transfer([recovery.account.address, 100n], { account: investor.account });
    const transferAt = (await publicClient.getBlock()).timestamp;
    await testClient.mine({ blocks: 1 });
    expect(await token.read.balanceOfAt([investor.account.address, firstMint - 1n])).to.equal(0n);
    expect(await token.read.balanceOfAt([investor.account.address, between])).to.equal(300n);
    expect(await token.read.balanceOfAt([recovery.account.address, between])).to.equal(0n);
    expect(await token.read.balanceOfAt([recovery.account.address, secondMint])).to.equal(150n);
    expect(await token.read.balanceOfAt([investor.account.address, transferAt])).to.equal(200n);
    expect(await token.read.balanceOfAt([recovery.account.address, transferAt])).to.equal(250n);
    expect(await token.read.totalSupplyAt([between])).to.equal(300n);
    expect(await token.read.totalSupplyAt([transferAt])).to.equal(450n);
  });

  it("emits DistributionRootAnchored with the record date, the payment currency and the evidence hash", async () => {
    const { token, asAdmin, secondMint } = await withHolders();
    await token.write.anchorDistributionRoot([distId, root, 1_000_000n, 450n, secondMint, "COP", evidence], asAdmin);
    const [event] = await token.getEvents.DistributionRootAnchored();
    expect(event?.args).to.deep.equal({
      distributionId: distId,
      merkleRoot: root,
      totalAmountCents: 1_000_000n,
      snapshotSupply: 450n,
      recordTimestamp: secondMint,
      currency: "COP",
      evidenceHash: evidence,
    });
  });
});

describe("RwaxiPropertyToken platform fee", () => {
  const cfgWith = (platformFeeBps: number) => ({
    name: "Fee Unit",
    symbol: "FEE",
    legalWrapperType: "SPV",
    legalEntityName: "Fee Vehicle",
    maxSupplyCap: 1_000n,
    dataRoomMerkleRoot: keccak256(toHex("dataroom-fee")),
    platformFeeBps,
  });

  it("fixes the agreed fee at deployment and publishes it in the factory event", async () => {
    const { factory, token } = await deployFixture();
    expect(await token.read.platformFeeBps()).to.equal(120);
    expect(await token.read.MIN_PLATFORM_FEE_BPS()).to.equal(25);
    expect(await token.read.MAX_PLATFORM_FEE_BPS()).to.equal(500);
    const [event] = await factory.getEvents.OfferingTokenDeployed();
    expect((event?.args as { platformFeeBps?: number } | undefined)?.platformFeeBps).to.equal(120);
  });

  it("refuses fees outside 25–500 basis points (0.25 %–5 %) and accepts both bounds", async () => {
    const { factory, tenantAdmin, officer } = await deployFixture();
    const deploy = (n: number, bps: number) =>
      factory.write.deployOfferingToken([orgId, keccak256(toHex(`off_fee_${n}`)), cfgWith(bps), tenantAdmin.account.address, officer.account.address]);
    await expect(deploy(1, 24)).to.be.rejectedWith("InvalidPlatformFee");
    await expect(deploy(2, 501)).to.be.rejectedWith("InvalidPlatformFee");
    await expect(deploy(3, 0)).to.be.rejectedWith("InvalidPlatformFee");
    await deploy(4, 25);
    await deploy(5, 500);
    const at = async (n: number) =>
      hre.viem.getContractAt("RwaxiPropertyToken", (await factory.read.offeringTokens([keccak256(toHex(`off_fee_${n}`))])) as Address);
    expect(await (await at(4)).read.platformFeeBps()).to.equal(25);
    expect(await (await at(5)).read.platformFeeBps()).to.equal(500);
  });

  it("refuses an out-of-range fee also when the token is deployed without the factory", async () => {
    const { registry, tenantAdmin, officer, rwaxi } = await deployFixture();
    await expect(
      hre.viem.deployContract("RwaxiPropertyToken", [cfgWith(501), registry.address, tenantAdmin.account.address, officer.account.address, rwaxi.account.address]),
    ).to.be.rejectedWith("InvalidPlatformFee");
  });

  it("declares the fee on every mint and never moves units or value to RWAXI", async () => {
    const { token, registry, investor, rwaxi, asOfficer } = await deployFixture();
    await registry.write.approveInvestor([investor.account.address, 170, keccak256(toHex("kyc-dossier"))], asOfficer);
    await token.write.mintSubscription([subId(7), investor.account.address, 250n, ref]);
    const [event] = await token.getEvents.PlatformFeeAccrued();
    expect(event?.args).to.deep.equal({ subscriptionId: subId(7), investor: getAddress(investor.account.address), amount: 250n, platformFeeBps: 120 });
    expect(await token.read.balanceOf([investor.account.address])).to.equal(250n);
    expect(await token.read.balanceOf([rwaxi.account.address])).to.equal(0n);
    expect(await token.read.totalSupply()).to.equal(250n);
  });
});
