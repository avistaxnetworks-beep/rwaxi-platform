import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-viem";

const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {},
    polygonAmoy: {
      url: process.env.RPC_URL_POLYGON_AMOY || "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      accounts,
    },
    baseSepolia: {
      url: process.env.RPC_URL_BASE_SEPOLIA || "https://sepolia.base.org",
      chainId: 84532,
      accounts,
    },
  },
};

export default config;
