// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
export const SOL_SOURCES = {
  RwaxiTenantFactory: `// SPDX-License-Identifier: MIT
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
    event OfferingTokenDeployed(bytes32 indexed organizationId, bytes32 indexed offeringId, address token);

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
        emit OfferingTokenDeployed(organizationId, offeringId, token);
    }
}
`,
  RwaxiComplianceRegistry: `// SPDX-License-Identifier: MIT
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
  RwaxiPropertyToken: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IRwaxiComplianceRegistry {
    function isEligible(address wallet) external view returns (bool);
    function isFrozen(address wallet) external view returns (bool);
}

/// @title RwaxiPropertyToken
/// @notice Unidad digital permisionada de un vehículo jurídico (Legal Wrapper). Solo circula
///         entre wallets aprobadas en el registro de cumplimiento del desarrollador.
contract RwaxiPropertyToken is ERC20, ERC20Pausable, AccessControl {
    bytes32 public constant ISSUER_ADMIN_ROLE = keccak256("ISSUER_ADMIN_ROLE");
    bytes32 public constant COMPLIANCE_OFFICER_ROLE = keccak256("COMPLIANCE_OFFICER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant DATA_ROOM_ROLE = keccak256("DATA_ROOM_ROLE");
    bytes32 public constant LEGAL_ENFORCEMENT_ROLE = keccak256("LEGAL_ENFORCEMENT_ROLE");

    IRwaxiComplianceRegistry public immutable complianceRegistry;
    uint256 public immutable maxSupplyCap;
    string public legalWrapperType;
    string public legalEntityName;
    bytes32 public dataRoomMerkleRoot;

    mapping(bytes32 subscriptionId => bool) public processedSubscriptionIds;

    bool private _forcedRecovery;

    event SubscriptionTokensMinted(
        bytes32 indexed subscriptionId, address indexed investor, uint256 amount, bytes32 paymentEvidenceRef
    );
    event DataRoomMerkleRootAnchored(bytes32 previousRoot, bytes32 newRoot);
    event ForcedRecoveryExecuted(address indexed from, address indexed to, uint256 amount, bytes32 legalActHash);

    error SubscriptionAlreadyProcessed(bytes32 subscriptionId);
    error SupplyCapExceeded(uint256 requested, uint256 available);
    error LegalActHashRequired();
    error NotIssuerOrComplianceOfficer(address account);

    struct TokenConfig {
        string name;
        string symbol;
        string legalWrapperType;
        string legalEntityName;
        uint256 maxSupplyCap;
        bytes32 dataRoomMerkleRoot;
    }

    /// @param tenantAdmin       administrador del emisor (desarrollador)
    /// @param complianceOfficer oficial de cumplimiento del desarrollador
    /// @param rwaxiMinter       adaptador tecnológico de RWAXI: solo ejecuta mintSubscription
    constructor(TokenConfig memory cfg, address registry, address tenantAdmin, address complianceOfficer, address rwaxiMinter)
        ERC20(cfg.name, cfg.symbol)
    {
        complianceRegistry = IRwaxiComplianceRegistry(registry);
        maxSupplyCap = cfg.maxSupplyCap;
        legalWrapperType = cfg.legalWrapperType;
        legalEntityName = cfg.legalEntityName;
        dataRoomMerkleRoot = cfg.dataRoomMerkleRoot;
        _grantRole(DEFAULT_ADMIN_ROLE, tenantAdmin);
        _grantRole(ISSUER_ADMIN_ROLE, tenantAdmin);
        _grantRole(DATA_ROOM_ROLE, tenantAdmin);
        _grantRole(LEGAL_ENFORCEMENT_ROLE, tenantAdmin);
        _grantRole(COMPLIANCE_OFFICER_ROLE, complianceOfficer);
        // RWAXI no administra el valor emitido: no recibe roles de pausa, recuperación ni Data Room.
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

    /// @dev Hook único de OpenZeppelin v5 para mint, transfer y burn.
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
    }
}
`,
};

export const SOL_SIZES = {
  RwaxiTenantFactory: 13820,
  RwaxiComplianceRegistry: 2816,
  RwaxiPropertyToken: 5385,
};
