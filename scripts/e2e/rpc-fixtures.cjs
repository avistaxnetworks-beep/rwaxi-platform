// Deploys RwaxiComplianceRegistry + RwaxiPropertyToken on a local Hardhat node for tenant "avista" and
// points the tenant's rows at them (network HARDHAT), so CHAIN_EXECUTION=rpc runs against real contracts.
// The tenant's administrator and compliance officer get the Hardhat accounts that hold their roles on
// those contracts as their registered wallets (what the backoffice expects a browser wallet to sign with).
// It also deploys, once per node, the RwaxiTenantFactory administered by RWAXI's operator
// (RWAXI_FACTORY_ADDRESS of the RPC dev server), through which developers onboarded on HARDHAT get their
// registry. The next reseed restores the demo rows.
const fs = require("fs");
const path = require("path");
const { ROOT, viem, viemAccounts, viemChains, webEnv, hardhatAccount } = require("./lib.cjs");

const RPC_URL = process.env.E2E_RPC_URL || "http://127.0.0.1:8545";
const artifact = (name) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, `contracts/artifacts/src/${name}.sol/${name}.json`), "utf8"));

/**
 * @param {{ factory?: string }} [reuse] the factory an earlier call deployed on this node (the dev server keeps its address)
 * @returns {Promise<{ registry: string, token: string, factory: string, issuer: string, officer: string, operator: string, maxSupply: number }>}
 */
async function deployRpcFixtures(db, reuse = {}) {
  const operator = viemAccounts.privateKeyToAccount(webEnv("OPERATOR_PRIVATE_KEY"));
  const admin = hardhatAccount(0); // issuer admin
  const officer = hardhatAccount(1); // tenant compliance officer
  const transport = viem.http(RPC_URL);
  const chain = viem.createPublicClient({ chain: viemChains.hardhat, transport });
  const wallet = viem.createWalletClient({ account: admin, chain: viemChains.hardhat, transport });
  const org = await db.organization.findUniqueOrThrow({ where: { slug: "avista" } });
  const offering = await db.offering.findFirstOrThrow({
    where: { organizationId: org.id },
    include: { token: true },
  });

  const deploy = async (name, args) => {
    const { abi, bytecode } = artifact(name);
    const hash = await wallet.deployContract({ abi, bytecode, args });
    return (await chain.waitForTransactionReceipt({ hash })).contractAddress;
  };
  const registry = await deploy("RwaxiComplianceRegistry", [
    viem.keccak256(viem.toHex(org.id)),
    org.taxId,
    org.complianceRegime,
    admin.address,
    officer.address,
  ]);
  const token = await deploy("RwaxiPropertyToken", [
    {
      name: offering.token.name,
      symbol: offering.token.symbol,
      legalWrapperType: offering.legalWrapperType,
      legalEntityName: offering.legalEntityName,
      maxSupplyCap: BigInt(offering.token.maxSupply),
      dataRoomMerkleRoot: offering.dataRoomRoot,
    },
    registry,
    admin.address,
    officer.address,
    operator.address, // RWAXI only receives MINTER_ROLE
  ]);
  // RWAXI_OPERATOR_ROLE (and the factory's admin) is RWAXI's operator: the only key the app holds.
  const factory = reuse.factory ?? (await deploy("RwaxiTenantFactory", [operator.address]));
  // Gas for RWAXI's operator.
  await chain.waitForTransactionReceipt({
    hash: await wallet.sendTransaction({ to: operator.address, value: viem.parseEther("10") }),
  });

  await db.$transaction([
    db.organization.update({ where: { id: org.id }, data: { complianceRegistry: registry } }),
    db.offering.update({ where: { id: offering.id }, data: { network: "HARDHAT" } }),
    db.tokenDeployment.update({
      where: { offeringId: offering.id },
      data: { network: "HARDHAT", contractAddress: token },
    }),
    // Registered wallets of the staff (stored lowercase, like every wallet of a tenant).
    db.user.updateMany({
      where: { organizationId: org.id, role: "TENANT_ADMIN" },
      data: { walletAddress: admin.address.toLowerCase() },
    }),
    db.user.updateMany({
      where: { organizationId: org.id, role: "COMPLIANCE_OFFICER" },
      data: { walletAddress: officer.address.toLowerCase() },
    }),
  ]);
  return {
    registry,
    token,
    factory,
    issuer: admin.address,
    officer: officer.address,
    operator: operator.address,
    maxSupply: offering.token.maxSupply,
  };
}

module.exports = { RPC_URL, deployRpcFixtures };
