// SPDX-License-Identifier: UNLICENSED
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
