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
    const cfg = { name: "n", symbol: "s", legalWrapperType: "w", legalEntityName: "e", maxSupplyCap: 1n, dataRoomMerkleRoot: orgId };
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
