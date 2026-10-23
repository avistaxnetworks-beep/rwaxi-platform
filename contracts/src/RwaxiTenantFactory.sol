// SPDX-License-Identifier: MIT
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
