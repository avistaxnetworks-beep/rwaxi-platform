import { test } from "node:test";
import assert from "node:assert/strict";
import { officialWallets, readinessGaps } from "./raising-readiness";

const ADMIN = `0x${"a".repeat(40)}`;
const OFFICER = `0x${"b".repeat(40)}`;
const OPERATOR = `0x${"c".repeat(40)}`;
const REGISTRY = `0x${"1".repeat(40)}`;
const staff = (admin: string | null, officer: string | null, officerActive = true) => [
  { role: "TENANT_ADMIN", active: true, walletAddress: admin },
  { role: "COMPLIANCE_OFFICER", active: officerActive, walletAddress: officer },
];

test("ready: registry deployed, both official wallets declared, an active compliance officer", () => {
  assert.deepEqual(readinessGaps({ complianceRegistry: REGISTRY, staff: staff(ADMIN, OFFICER), operator: OPERATOR }), []);
  assert.deepEqual(officialWallets(staff(ADMIN.toUpperCase().replace("0X", "0x"), OFFICER)), { tenantAdmin: ADMIN, complianceOfficer: OFFICER });
});

test("each missing requirement is named, in order", () => {
  assert.deepEqual(readinessGaps({ complianceRegistry: null, staff: staff(null, null) }), ["registry", "adminWallet", "officerWallet"]);
  assert.deepEqual(readinessGaps({ complianceRegistry: REGISTRY, staff: staff(ADMIN, OFFICER, false) }), ["officer"]);
  assert.deepEqual(readinessGaps({ complianceRegistry: REGISTRY, staff: [{ role: "TENANT_ADMIN", active: true, walletAddress: ADMIN }] }), ["officer"]);
  assert.deepEqual(readinessGaps({ complianceRegistry: REGISTRY, staff: staff(ADMIN, "0x123") }), ["officerWallet"]);
  assert.equal(officialWallets(staff(ADMIN, null)), null);
});

test("the official wallets are distinct and never RWAXI's operator", () => {
  assert.deepEqual(readinessGaps({ complianceRegistry: REGISTRY, staff: staff(ADMIN, ADMIN.toUpperCase().replace("0X", "0x")) }), ["sameWallet"]);
  assert.deepEqual(readinessGaps({ complianceRegistry: REGISTRY, staff: staff(OPERATOR, OFFICER), operator: OPERATOR }), ["operatorWallet"]);
});
