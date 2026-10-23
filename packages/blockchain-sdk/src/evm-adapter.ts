/**
 * EVM implementation of RWAXI's ITokenizationAdapter (Viem).
 *
 * Signer roles — the contracts enforce them, the adapter only routes calls:
 *   RWAXI operator      deployTenantRegistry, deployOfferingToken (factory) · mintSubscription (MINTER_ROLE)
 *   Compliance officer  approveInvestor, revokeInvestor, setFrozen · pause / unpause
 *   Tenant admin        anchorDataRoomRoot (DATA_ROOM_ROLE) · forcedTransfer (LEGAL_ENFORCEMENT_ROLE) · pause
 * Use `connect(signer)` to act as a different role. RWAXI never holds pause, recovery or Data Room roles.
 */
import {
  createPublicClient,
  http,
  keccak256,
  parseEventLogs,
  toHex,
  type Account,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type Transport,
  type WalletClient,
} from "viem";
import { base, baseSepolia, hardhat, polygon, polygonAmoy } from "viem/chains";
import {
  rwaxiComplianceRegistryAbi,
  rwaxiPropertyTokenAbi,
  rwaxiTenantFactoryAbi,
  rwaxiTenantFactoryBytecode,
} from "./abi";
import type { Bytes32 } from "./merkle";

export type RwaxiNetwork = "POLYGON" | "BASE" | "POLYGON_AMOY" | "BASE_SEPOLIA" | "HARDHAT";

export const RWAXI_CHAINS: Record<RwaxiNetwork, Chain> = {
  POLYGON: polygon,
  BASE: base,
  POLYGON_AMOY: polygonAmoy,
  BASE_SEPOLIA: baseSepolia,
  HARDHAT: hardhat,
};

export type ComplianceRegime = "SAGRILAFT_PTEE" | "SARLAFT";

/** Deterministic bytes32 id for an off-chain id (Organization.id, Offering.id, Subscription.id). */
export const toOnchainId = (offchainId: string): Bytes32 => keccak256(toHex(offchainId));

/** ISO 3166-1 numeric country codes used by the compliance registry. */
export const ISO_NUMERIC = { CO: 170, US: 840, ES: 724, MX: 484, PA: 591 } as const;

export interface OfferingTokenConfig {
  name: string;
  symbol: string;
  legalWrapperType: string;
  legalEntityName: string;
  /** Whole units of the vehicle (token has 0 decimals). */
  maxSupplyCap: bigint;
  dataRoomMerkleRoot: Bytes32;
}

export interface TxResult<T = void> {
  hash: Hash;
  blockNumber: bigint;
  result: T;
}

export interface TokenState {
  symbol: string;
  totalSupply: bigint;
  maxSupplyCap: bigint;
  paused: boolean;
  dataRoomMerkleRoot: Bytes32;
  complianceRegistry: Address;
}

export interface ITokenizationAdapter {
  deployTenantRegistry(input: {
    organizationId: string;
    organizationTaxId: string;
    complianceRegime: ComplianceRegime;
    tenantAdmin: Address;
    complianceOfficer: Address;
  }): Promise<TxResult<{ registry: Address }>>;
  deployOfferingToken(input: {
    organizationId: string;
    offeringId: string;
    config: OfferingTokenConfig;
    tenantAdmin: Address;
    complianceOfficer: Address;
  }): Promise<TxResult<{ token: Address }>>;
  approveInvestor(input: {
    registry: Address;
    wallet: Address;
    countryCode: number;
    kycDossierHash: Bytes32;
  }): Promise<TxResult>;
  revokeInvestor(input: { registry: Address; wallet: Address }): Promise<TxResult>;
  setFrozen(input: { registry: Address; wallet: Address; frozen: boolean }): Promise<TxResult>;
  mintSubscription(input: {
    token: Address;
    subscriptionId: string;
    investor: Address;
    units: bigint;
    paymentEvidenceRef: Bytes32;
  }): Promise<TxResult>;
  anchorDataRoomRoot(input: { token: Address; root: Bytes32 }): Promise<TxResult<{ previousRoot: Bytes32 }>>;
  pause(token: Address): Promise<TxResult>;
  unpause(token: Address): Promise<TxResult>;
  forcedTransfer(input: {
    token: Address;
    from: Address;
    to: Address;
    units: bigint;
    legalActHash: Bytes32;
  }): Promise<TxResult>;
  isEligible(registry: Address, wallet: Address): Promise<boolean>;
  getTenantRegistry(organizationId: string): Promise<Address | null>;
  getOfferingToken(offeringId: string): Promise<Address | null>;
  getTokenState(token: Address): Promise<TokenState>;
}

export type RwaxiSigner = WalletClient<Transport, Chain | undefined, Account>;

export interface EvmAdapterOptions {
  network: RwaxiNetwork;
  factoryAddress: Address;
  signer: RwaxiSigner;
  publicClient?: PublicClient;
  rpcUrl?: string;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const orNull = (a: Address): Address | null => (a === ZERO_ADDRESS ? null : a);

export class EvmTokenizationAdapter implements ITokenizationAdapter {
  readonly chain: Chain;
  readonly publicClient: PublicClient;

  constructor(private readonly opts: EvmAdapterOptions) {
    this.chain = RWAXI_CHAINS[opts.network];
    this.publicClient =
      opts.publicClient ?? (createPublicClient({ chain: this.chain, transport: http(opts.rpcUrl) }) as PublicClient);
  }

  /** Same network and factory, different signing role. */
  connect(signer: RwaxiSigner): EvmTokenizationAdapter {
    return new EvmTokenizationAdapter({ ...this.opts, signer, publicClient: this.publicClient });
  }

  static async deployFactory(signer: RwaxiSigner, publicClient: PublicClient, rwaxiAdmin: Address): Promise<Address> {
    const hash = await signer.deployContract({
      abi: rwaxiTenantFactoryAbi,
      bytecode: rwaxiTenantFactoryBytecode,
      args: [rwaxiAdmin],
      account: signer.account,
      chain: signer.chain,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) throw new Error(`Factory deployment failed: ${hash}`);
    return receipt.contractAddress;
  }

  private get tx() {
    return { account: this.opts.signer.account, chain: this.chain } as const;
  }

  private async confirm(hash: Hash): Promise<TransactionReceipt> {
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
    return receipt;
  }

  private async done(hash: Hash): Promise<TxResult> {
    const receipt = await this.confirm(hash);
    return { hash, blockNumber: receipt.blockNumber, result: undefined };
  }

  async deployTenantRegistry(input: Parameters<ITokenizationAdapter["deployTenantRegistry"]>[0]) {
    const hash = await this.opts.signer.writeContract({
      ...this.tx,
      address: this.opts.factoryAddress,
      abi: rwaxiTenantFactoryAbi,
      functionName: "deployTenantRegistry",
      args: [
        toOnchainId(input.organizationId),
        input.organizationTaxId,
        input.complianceRegime,
        input.tenantAdmin,
        input.complianceOfficer,
      ],
    });
    const receipt = await this.confirm(hash);
    const [event] = parseEventLogs({
      abi: rwaxiTenantFactoryAbi,
      logs: receipt.logs,
      eventName: "TenantRegistryDeployed",
    });
    if (!event) throw new Error(`TenantRegistryDeployed not emitted: ${hash}`);
    return { hash, blockNumber: receipt.blockNumber, result: { registry: event.args.registry } };
  }

  async deployOfferingToken(input: Parameters<ITokenizationAdapter["deployOfferingToken"]>[0]) {
    const hash = await this.opts.signer.writeContract({
      ...this.tx,
      address: this.opts.factoryAddress,
      abi: rwaxiTenantFactoryAbi,
      functionName: "deployOfferingToken",
      args: [
        toOnchainId(input.organizationId),
        toOnchainId(input.offeringId),
        input.config,
        input.tenantAdmin,
        input.complianceOfficer,
      ],
    });
    const receipt = await this.confirm(hash);
    const [event] = parseEventLogs({
      abi: rwaxiTenantFactoryAbi,
      logs: receipt.logs,
      eventName: "OfferingTokenDeployed",
    });
    if (!event) throw new Error(`OfferingTokenDeployed not emitted: ${hash}`);
    return { hash, blockNumber: receipt.blockNumber, result: { token: event.args.token } };
  }

  async approveInvestor(input: Parameters<ITokenizationAdapter["approveInvestor"]>[0]) {
    return this.done(
      await this.opts.signer.writeContract({
        ...this.tx,
        address: input.registry,
        abi: rwaxiComplianceRegistryAbi,
        functionName: "approveInvestor",
        args: [input.wallet, input.countryCode, input.kycDossierHash],
      }),
    );
  }

  async revokeInvestor(input: { registry: Address; wallet: Address }) {
    return this.done(
      await this.opts.signer.writeContract({
        ...this.tx,
        address: input.registry,
        abi: rwaxiComplianceRegistryAbi,
        functionName: "revokeInvestor",
        args: [input.wallet],
      }),
    );
  }

  async setFrozen(input: { registry: Address; wallet: Address; frozen: boolean }) {
    return this.done(
      await this.opts.signer.writeContract({
        ...this.tx,
        address: input.registry,
        abi: rwaxiComplianceRegistryAbi,
        functionName: "setFrozen",
        args: [input.wallet, input.frozen],
      }),
    );
  }

  async mintSubscription(input: Parameters<ITokenizationAdapter["mintSubscription"]>[0]) {
    return this.done(
      await this.opts.signer.writeContract({
        ...this.tx,
        address: input.token,
        abi: rwaxiPropertyTokenAbi,
        functionName: "mintSubscription",
        args: [toOnchainId(input.subscriptionId), input.investor, input.units, input.paymentEvidenceRef],
      }),
    );
  }

  async anchorDataRoomRoot(input: { token: Address; root: Bytes32 }) {
    const hash = await this.opts.signer.writeContract({
      ...this.tx,
      address: input.token,
      abi: rwaxiPropertyTokenAbi,
      functionName: "updateDataRoomMerkleRoot",
      args: [input.root],
    });
    const receipt = await this.confirm(hash);
    const [event] = parseEventLogs({
      abi: rwaxiPropertyTokenAbi,
      logs: receipt.logs,
      eventName: "DataRoomMerkleRootAnchored",
    });
    return { hash, blockNumber: receipt.blockNumber, result: { previousRoot: (event?.args.previousRoot ?? input.root) as Hex } };
  }

  async pause(token: Address) {
    return this.done(
      await this.opts.signer.writeContract({ ...this.tx, address: token, abi: rwaxiPropertyTokenAbi, functionName: "pause" }),
    );
  }

  async unpause(token: Address) {
    return this.done(
      await this.opts.signer.writeContract({ ...this.tx, address: token, abi: rwaxiPropertyTokenAbi, functionName: "unpause" }),
    );
  }

  async forcedTransfer(input: Parameters<ITokenizationAdapter["forcedTransfer"]>[0]) {
    return this.done(
      await this.opts.signer.writeContract({
        ...this.tx,
        address: input.token,
        abi: rwaxiPropertyTokenAbi,
        functionName: "forcedTransfer",
        args: [input.from, input.to, input.units, input.legalActHash],
      }),
    );
  }

  isEligible(registry: Address, wallet: Address) {
    return this.publicClient.readContract({
      address: registry,
      abi: rwaxiComplianceRegistryAbi,
      functionName: "isEligible",
      args: [wallet],
    });
  }

  async getTenantRegistry(organizationId: string) {
    return orNull(
      await this.publicClient.readContract({
        address: this.opts.factoryAddress,
        abi: rwaxiTenantFactoryAbi,
        functionName: "tenantRegistries",
        args: [toOnchainId(organizationId)],
      }),
    );
  }

  async getOfferingToken(offeringId: string) {
    return orNull(
      await this.publicClient.readContract({
        address: this.opts.factoryAddress,
        abi: rwaxiTenantFactoryAbi,
        functionName: "offeringTokens",
        args: [toOnchainId(offeringId)],
      }),
    );
  }

  async getTokenState(token: Address): Promise<TokenState> {
    const read = <F extends "symbol" | "totalSupply" | "maxSupplyCap" | "paused" | "dataRoomMerkleRoot" | "complianceRegistry">(
      functionName: F,
    ) => this.publicClient.readContract({ address: token, abi: rwaxiPropertyTokenAbi, functionName });
    const [symbol, totalSupply, maxSupplyCap, paused, dataRoomMerkleRoot, complianceRegistry] = await Promise.all([
      read("symbol"),
      read("totalSupply"),
      read("maxSupplyCap"),
      read("paused"),
      read("dataRoomMerkleRoot"),
      read("complianceRegistry"),
    ]);
    return {
      symbol: symbol as string,
      totalSupply: totalSupply as bigint,
      maxSupplyCap: maxSupplyCap as bigint,
      paused: paused as boolean,
      dataRoomMerkleRoot: dataRoomMerkleRoot as Bytes32,
      complianceRegistry: complianceRegistry as Address,
    };
  }
}
