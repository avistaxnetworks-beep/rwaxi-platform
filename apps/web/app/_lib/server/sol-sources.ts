// Solidity source of RWAXI's contracts (contracts/src, verbatim): proprietary and confidential. Server-only:
// /api/inspector/sources serves it to an authorized session (see inspector-access.ts); browsers only ever get
// the public interface. sol-sources.test.ts keeps this copy equal to contracts/src.
import "server-only";
import type { ContractName } from "@/app/_lib/chain/contracts";

export const SOL_SOURCES: Record<ContractName, string> = {
  RwaxiTenantFactory: `// SPDX-License-Identifier: UNLICENSED
// Copyright (c) 2026 RWAXI. All rights reserved. Proprietary and confidential.
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {RwaxiComplianceRegistry} from "./RwaxiComplianceRegistry.sol";
import {RwaxiPropertyToken} from "./RwaxiPropertyToken.sol";

/// @title RwaxiTenantFactory
/// @notice Infraestructura maestra de RWAXI (ITokenizationAdapter → EVM). Despliega un registro
///         de cumplimiento por desarrollador y un token por oferta, aislados entre tenants.
contract RwaxiTenantFactory is AccessControl {
    bytes32 public constant RWAXI_OPERATOR_ROLE = keccak256("RWAXI_OPERATOR_ROLE");

    mapping(bytes32 organizationId => address registry) public tenantRegistries;
    mapping(bytes32 offeringId => address token) public offeringTokens;
    mapping(bytes32 offeringId => bytes32 organizationId) public offeringOrganization;

    event TenantRegistryDeployed(bytes32 indexed organizationId, address registry, string organizationTaxId);
    /// @param platformFeeBps comisión de plataforma pactada con el desarrollador, fijada en el token desplegado
    event OfferingTokenDeployed(bytes32 indexed organizationId, bytes32 indexed offeringId, address token, uint16 platformFeeBps);

    error TenantAlreadyRegistered(bytes32 organizationId);
    error UnknownTenant(bytes32 organizationId);
    error OfferingAlreadyDeployed(bytes32 offeringId);

    constructor(address rwaxiAdmin) {
        _grantRole(DEFAULT_ADMIN_ROLE, rwaxiAdmin);
        _grantRole(RWAXI_OPERATOR_ROLE, rwaxiAdmin);
    }

    function deployTenantRegistry(
        bytes32 organizationId,
        string calldata organizationTaxId,
        string calldata complianceRegime,
        address tenantAdmin,
        address complianceOfficer
    ) external onlyRole(RWAXI_OPERATOR_ROLE) returns (address registry) {
        if (tenantRegistries[organizationId] != address(0)) revert TenantAlreadyRegistered(organizationId);
        registry = address(
            new RwaxiComplianceRegistry(organizationId, organizationTaxId, complianceRegime, tenantAdmin, complianceOfficer)
        );
        tenantRegistries[organizationId] = registry;
        emit TenantRegistryDeployed(organizationId, registry, organizationTaxId);
    }

    /// @param cfg incluye platformFeeBps, la comisión pactada con el desarrollador (25–500 puntos básicos): el token
    ///            la fija para siempre y la declara en cada emisión; fuera de rango, InvalidPlatformFee.
    function deployOfferingToken(
        bytes32 organizationId,
        bytes32 offeringId,
        RwaxiPropertyToken.TokenConfig calldata cfg,
        address tenantAdmin,
        address complianceOfficer
    ) external onlyRole(RWAXI_OPERATOR_ROLE) returns (address token) {
        address registry = tenantRegistries[organizationId];
        if (registry == address(0)) revert UnknownTenant(organizationId);
        if (offeringTokens[offeringId] != address(0)) revert OfferingAlreadyDeployed(offeringId);
        token = address(new RwaxiPropertyToken(cfg, registry, tenantAdmin, complianceOfficer, msg.sender));
        offeringTokens[offeringId] = token;
        offeringOrganization[offeringId] = organizationId;
        emit OfferingTokenDeployed(organizationId, offeringId, token, cfg.platformFeeBps);
    }
}
`,
  RwaxiComplianceRegistry: `// SPDX-License-Identifier: UNLICENSED
// Copyright (c) 2026 RWAXI. All rights reserved. Proprietary and confidential.
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title RwaxiComplianceRegistry
/// @notice Whitelist KYC/AML aislada por desarrollador (Organization). El oficial de
///         cumplimiento del tenant aprueba, congela o revoca wallets de inversionistas.
contract RwaxiComplianceRegistry is AccessControl {
    bytes32 public constant COMPLIANCE_OFFICER_ROLE = keccak256("COMPLIANCE_OFFICER_ROLE");

    struct Investor {
        bool isApproved;
        bool isFrozen;
        uint16 countryCode; // ISO 3166-1 numérico (170 = Colombia)
        uint64 approvedAt;
        bytes32 kycDossierHash; // SHA-256 del expediente KYC + NDA (off-chain)
    }

    bytes32 public immutable organizationId;
    string public organizationTaxId; // NIT
    string public complianceRegime; // "SAGRILAFT_PTEE" | "SARLAFT"

    mapping(address wallet => Investor) private _investors;

    event InvestorWhitelisted(address indexed wallet, uint16 countryCode, bytes32 kycDossierHash);
    event InvestorRevoked(address indexed wallet);
    event InvestorFreezeUpdated(address indexed wallet, bool isFrozen);

    error InvalidWallet();
    error EmptyDossierHash();
    error InvestorNotApproved(address wallet);

    constructor(
        bytes32 organizationId_,
        string memory organizationTaxId_,
        string memory complianceRegime_,
        address tenantAdmin,
        address complianceOfficer
    ) {
        organizationId = organizationId_;
        organizationTaxId = organizationTaxId_;
        complianceRegime = complianceRegime_;
        _grantRole(DEFAULT_ADMIN_ROLE, tenantAdmin);
        _grantRole(COMPLIANCE_OFFICER_ROLE, complianceOfficer);
    }

    function approveInvestor(address wallet, uint16 countryCode, bytes32 kycDossierHash)
        external
        onlyRole(COMPLIANCE_OFFICER_ROLE)
    {
        if (wallet == address(0)) revert InvalidWallet();
        if (kycDossierHash == bytes32(0)) revert EmptyDossierHash();
        _investors[wallet] = Investor({
            isApproved: true,
            isFrozen: false,
            countryCode: countryCode,
            approvedAt: uint64(block.timestamp),
            kycDossierHash: kycDossierHash
        });
        emit InvestorWhitelisted(wallet, countryCode, kycDossierHash);
    }

    function revokeInvestor(address wallet) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        if (!_investors[wallet].isApproved) revert InvestorNotApproved(wallet);
        _investors[wallet].isApproved = false;
        emit InvestorRevoked(wallet);
    }

    function setFrozen(address wallet, bool frozen) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        _investors[wallet].isFrozen = frozen;
        emit InvestorFreezeUpdated(wallet, frozen);
    }

    function isEligible(address wallet) external view returns (bool) {
        Investor storage inv = _investors[wallet];
        return inv.isApproved && !inv.isFrozen;
    }

    function isFrozen(address wallet) external view returns (bool) {
        return _investors[wallet].isFrozen;
    }

    function investor(address wallet) external view returns (Investor memory) {
        return _investors[wallet];
    }
}
`,
  RwaxiPropertyToken: `// SPDX-License-Identifier: UNLICENSED
// Copyright (c) 2026 RWAXI. All rights reserved. Proprietary and confidential.
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

interface IRwaxiComplianceRegistry {
    function isEligible(address wallet) external view returns (bool);
    function isFrozen(address wallet) external view returns (bool);
}

/// @title RwaxiPropertyToken
/// @notice Unidad digital permisionada de un vehículo jurídico (Legal Wrapper). Solo circula
///         entre wallets aprobadas en el registro de cumplimiento del desarrollador. Guarda el historial
///         de saldos y de la oferta total, la base del snapshot de cada distribución de rendimientos.
contract RwaxiPropertyToken is ERC20, ERC20Pausable, AccessControl {
    using Checkpoints for Checkpoints.Trace208;

    bytes32 public constant ISSUER_ADMIN_ROLE = keccak256("ISSUER_ADMIN_ROLE");
    bytes32 public constant COMPLIANCE_OFFICER_ROLE = keccak256("COMPLIANCE_OFFICER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant DATA_ROOM_ROLE = keccak256("DATA_ROOM_ROLE");
    bytes32 public constant LEGAL_ENFORCEMENT_ROLE = keccak256("LEGAL_ENFORCEMENT_ROLE");
    bytes32 public constant DISTRIBUTION_ROLE = keccak256("DISTRIBUTION_ROLE");
    /// @notice Rango de la comisión de plataforma pactada con cada desarrollador: 0,25 % a 5 %.
    uint16 public constant MIN_PLATFORM_FEE_BPS = 25;
    uint16 public constant MAX_PLATFORM_FEE_BPS = 500;

    IRwaxiComplianceRegistry public immutable complianceRegistry;
    uint256 public immutable maxSupplyCap;
    /// @notice Comisión de plataforma pactada entre RWAXI y el desarrollador, en puntos básicos (120 = 1,20 %),
    ///         fijada al desplegar el token y sin forma de cambiarla. Cada emisión la declara en PlatformFeeAccrued;
    ///         RWAXI la factura al emisor fuera de la cadena: el token nunca transfiere unidades ni valor a RWAXI.
    uint16 public immutable platformFeeBps;
    string public legalWrapperType;
    string public legalEntityName;
    bytes32 public dataRoomMerkleRoot;

    mapping(bytes32 subscriptionId => bool) public processedSubscriptionIds;
    /// @notice Raíz de Merkle (SHA-256) de las asignaciones de cada distribución de rendimientos.
    mapping(bytes32 distributionId => bytes32 merkleRoot) public distributionRoots;

    /// @dev Saldo de cada wallet y oferta total por timestamp de bloque (balanceOfAt, totalSupplyAt).
    mapping(address account => Checkpoints.Trace208) private _balanceHistory;
    Checkpoints.Trace208 private _supplyHistory;

    bool private _forcedRecovery;

    event SubscriptionTokensMinted(
        bytes32 indexed subscriptionId, address indexed investor, uint256 amount, bytes32 paymentEvidenceRef
    );
    /// @notice Comisión de plataforma devengada por una emisión: \`amount\` unidades a \`platformFeeBps\` puntos básicos.
    event PlatformFeeAccrued(bytes32 indexed subscriptionId, address indexed investor, uint256 amount, uint16 platformFeeBps);
    event DataRoomMerkleRootAnchored(bytes32 previousRoot, bytes32 newRoot);
    event ForcedRecoveryExecuted(address indexed from, address indexed to, uint256 amount, bytes32 legalActHash);
    /// @notice Distribución anclada por el emisor: raíz de las asignaciones, total en centavos de la moneda de pago,
    ///         oferta total a la fecha de corte (verificada contra el historial del token), la moneda o stablecoin
    ///         de pago y el SHA-256 de su soporte documental (comprobante fiduciario).
    event DistributionRootAnchored(
        bytes32 indexed distributionId,
        bytes32 merkleRoot,
        uint256 totalAmountCents,
        uint256 snapshotSupply,
        uint64 recordTimestamp,
        string currency,
        bytes32 evidenceHash
    );

    error SubscriptionAlreadyProcessed(bytes32 subscriptionId);
    error SupplyCapExceeded(uint256 requested, uint256 available);
    error LegalActHashRequired();
    error NotIssuerOrComplianceOfficer(address account);
    error EmptyDistributionRoot();
    error EmptyDistribution();
    error DistributionEvidenceRequired();
    error DistributionAlreadyAnchored(bytes32 distributionId);
    error SnapshotSupplyMismatch(uint256 declared, uint256 recorded);
    error FutureLookup(uint256 timestamp, uint256 current);
    error InvalidPlatformFee(uint16 platformFeeBps);

    struct TokenConfig {
        string name;
        string symbol;
        string legalWrapperType;
        string legalEntityName;
        uint256 maxSupplyCap;
        bytes32 dataRoomMerkleRoot;
        /// comisión de plataforma pactada con el desarrollador, en puntos básicos (25–500)
        uint16 platformFeeBps;
    }

    /// @param tenantAdmin       administrador del emisor (desarrollador)
    /// @param complianceOfficer oficial de cumplimiento del desarrollador
    /// @param rwaxiMinter       adaptador tecnológico de RWAXI: solo ejecuta mintSubscription
    constructor(TokenConfig memory cfg, address registry, address tenantAdmin, address complianceOfficer, address rwaxiMinter)
        ERC20(cfg.name, cfg.symbol)
    {
        if (cfg.platformFeeBps < MIN_PLATFORM_FEE_BPS || cfg.platformFeeBps > MAX_PLATFORM_FEE_BPS) {
            revert InvalidPlatformFee(cfg.platformFeeBps);
        }
        complianceRegistry = IRwaxiComplianceRegistry(registry);
        maxSupplyCap = cfg.maxSupplyCap;
        platformFeeBps = cfg.platformFeeBps;
        legalWrapperType = cfg.legalWrapperType;
        legalEntityName = cfg.legalEntityName;
        dataRoomMerkleRoot = cfg.dataRoomMerkleRoot;
        _grantRole(DEFAULT_ADMIN_ROLE, tenantAdmin);
        _grantRole(ISSUER_ADMIN_ROLE, tenantAdmin);
        _grantRole(DATA_ROOM_ROLE, tenantAdmin);
        _grantRole(LEGAL_ENFORCEMENT_ROLE, tenantAdmin);
        _grantRole(DISTRIBUTION_ROLE, tenantAdmin);
        _grantRole(COMPLIANCE_OFFICER_ROLE, complianceOfficer);
        // RWAXI no administra el valor emitido: no recibe roles de pausa, recuperación, Data Room ni distribuciones.
        _grantRole(MINTER_ROLE, rwaxiMinter);
    }

    /// @dev 1 token = 1 unidad del vehículo; sin fracciones.
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function mintSubscription(bytes32 subscriptionId, address investor, uint256 amount, bytes32 paymentEvidenceRef)
        external
        onlyRole(MINTER_ROLE)
    {
        if (processedSubscriptionIds[subscriptionId]) revert SubscriptionAlreadyProcessed(subscriptionId);
        uint256 available = maxSupplyCap - totalSupply();
        if (amount > available) revert SupplyCapExceeded(amount, available);
        processedSubscriptionIds[subscriptionId] = true;
        _mint(investor, amount); // _update valida la whitelist del receptor
        emit SubscriptionTokensMinted(subscriptionId, investor, amount, paymentEvidenceRef);
        emit PlatformFeeAccrued(subscriptionId, investor, amount, platformFeeBps);
    }

    /// @notice El emisor ancla la raíz de las asignaciones prorrata de una distribución, que paga fuera de la
    ///         cadena el vehículo (o la tesorería del emisor, en stablecoin). \`snapshotSupply\` debe ser la oferta
    ///         total del token a la fecha de corte \`recordTimestamp\`, ya transcurrida, según su propio historial;
    ///         \`evidenceHash\` es el SHA-256 del soporte documental. Cada inversionista verifica su asignación con
    ///         su prueba de Merkle contra esta raíz.
    function anchorDistributionRoot(
        bytes32 distributionId,
        bytes32 merkleRoot,
        uint256 totalAmountCents,
        uint256 snapshotSupply,
        uint64 recordTimestamp,
        string calldata currency,
        bytes32 evidenceHash
    ) external onlyRole(DISTRIBUTION_ROLE) {
        if (merkleRoot == bytes32(0)) revert EmptyDistributionRoot();
        if (totalAmountCents == 0 || snapshotSupply == 0) revert EmptyDistribution();
        if (evidenceHash == bytes32(0)) revert DistributionEvidenceRequired();
        if (distributionRoots[distributionId] != bytes32(0)) revert DistributionAlreadyAnchored(distributionId);
        uint256 recorded = totalSupplyAt(recordTimestamp);
        if (snapshotSupply != recorded) revert SnapshotSupplyMismatch(snapshotSupply, recorded);
        distributionRoots[distributionId] = merkleRoot;
        emit DistributionRootAnchored(
            distributionId, merkleRoot, totalAmountCents, snapshotSupply, recordTimestamp, currency, evidenceHash
        );
    }

    /// @notice Saldo de \`account\` al cierre del instante \`timestamp\`, ya transcurrido (snapshot de una distribución).
    function balanceOfAt(address account, uint256 timestamp) external view returns (uint256) {
        return _balanceHistory[account].upperLookupRecent(_pastKey(timestamp));
    }

    /// @notice Oferta total del token al cierre del instante \`timestamp\`, ya transcurrido.
    function totalSupplyAt(uint256 timestamp) public view returns (uint256) {
        return _supplyHistory.upperLookupRecent(_pastKey(timestamp));
    }

    /// @dev Solo instantes ya transcurridos: en el bloque en curso aún pueden entrar movimientos.
    function _pastKey(uint256 timestamp) private view returns (uint48) {
        if (timestamp >= block.timestamp) revert FutureLookup(timestamp, block.timestamp);
        return SafeCast.toUint48(timestamp);
    }

    function updateDataRoomMerkleRoot(bytes32 newRoot) external onlyRole(DATA_ROOM_ROLE) {
        bytes32 previous = dataRoomMerkleRoot;
        dataRoomMerkleRoot = newRoot;
        emit DataRoomMerkleRootAnchored(previous, newRoot);
    }

    /// @notice Recuperación regulatoria u orden judicial (clawback) hacia una wallet verificada del titular.
    function forcedTransfer(address from, address to, uint256 amount, bytes32 legalActHash)
        external
        onlyRole(LEGAL_ENFORCEMENT_ROLE)
    {
        if (legalActHash == bytes32(0)) revert LegalActHashRequired();
        _forcedRecovery = true;
        _update(from, to, amount);
        _forcedRecovery = false;
        emit ForcedRecoveryExecuted(from, to, amount, legalActHash);
    }

    /// @dev Solo el emisor o su oficial de cumplimiento pueden pausar; RWAXI no tiene esta facultad.
    modifier onlyIssuerOrCompliance() {
        if (!hasRole(ISSUER_ADMIN_ROLE, msg.sender) && !hasRole(COMPLIANCE_OFFICER_ROLE, msg.sender)) {
            revert NotIssuerOrComplianceOfficer(msg.sender);
        }
        _;
    }

    function pause() external onlyIssuerOrCompliance {
        _pause();
    }

    function unpause() external onlyIssuerOrCompliance {
        _unpause();
    }

    /// @dev Hook único de OpenZeppelin v5 para mint, transfer y burn; deja constancia de los saldos resultantes.
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Pausable) {
        if (to != address(0)) {
            require(
                complianceRegistry.isEligible(to), "RWAXI Compliance: Receiver wallet is not approved in Tenant Whitelist"
            );
        }
        if (from != address(0) && to != address(0) && !_forcedRecovery) {
            require(!complianceRegistry.isFrozen(from), "RWAXI Compliance: Sender wallet is frozen");
        }
        super._update(from, to, value);
        uint48 at = SafeCast.toUint48(block.timestamp);
        if (from == address(0) || to == address(0)) _supplyHistory.push(at, SafeCast.toUint208(totalSupply()));
        if (from != address(0)) _balanceHistory[from].push(at, SafeCast.toUint208(balanceOf(from)));
        if (to != address(0)) _balanceHistory[to].push(at, SafeCast.toUint208(balanceOf(to)));
    }
}
`,
};
