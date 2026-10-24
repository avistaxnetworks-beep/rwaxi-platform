// RWAXI's contracts as the On-Chain Inspector shows them to everyone: names, runtime sizes and the security
// invariants they enforce on-chain. Their Solidity source is proprietary and confidential: it never ships to the
// browser bundle and only /api/inspector/sources returns it, to an authorized session.
import { msg } from "@/app/_i18n/marks";

export const CONTRACTS = ["RwaxiTenantFactory", "RwaxiComplianceRegistry", "RwaxiPropertyToken"] as const;
export type ContractName = (typeof CONTRACTS)[number];

/** Runtime bytecode sizes of contracts/artifacts (pnpm contracts:compile); sol-sources.test.ts checks them. */
export const RUNTIME_SIZES: Record<ContractName, number> = {
  RwaxiTenantFactory: 14509,
  RwaxiComplianceRegistry: 2870,
  RwaxiPropertyToken: 5857,
};

/** What each contract guarantees, stated without its source (every item is enforced by its code). */
export const INVARIANTS: Record<ContractName, string[]> = {
  RwaxiTenantFactory: [
    msg(
      "Solo el operador RWAXI (RWAXI_OPERATOR_ROLE) despliega registros y tokens: uno por organización y uno por oferta (TenantAlreadyRegistered, OfferingAlreadyDeployed).",
    ),
    msg(
      "Un token solo se despliega sobre el registro de su propio tenant (UnknownTenant), aislado de los demás desarrolladores.",
    ),
    msg(
      "Los roles de administración del registro y del token quedan en las wallets del tenant, no en las de RWAXI.",
    ),
  ],
  RwaxiComplianceRegistry: [
    msg(
      "Solo el oficial de cumplimiento del tenant aprueba, revoca o congela wallets (COMPLIANCE_OFFICER_ROLE).",
    ),
    msg(
      "Toda aprobación registra el hash del expediente KYC; una aprobación sin hash se rechaza (EmptyDossierHash).",
    ),
    msg("La organización, su NIT y su régimen de cumplimiento quedan fijados al desplegar el registro."),
  ],
  RwaxiPropertyToken: [
    msg(
      "Solo una wallet aprobada y no congelada en el registro del tenant puede recibir tokens: el hook _update consulta isEligible() en cada emisión y transferencia.",
    ),
    msg("Una wallet congelada no puede transferir; únicamente la recuperación forzosa omite ese bloqueo."),
    msg(
      "Cada suscripción se acuña una sola vez y nunca por encima del tope de emisión (SubscriptionAlreadyProcessed, SupplyCapExceeded).",
    ),
    msg(
      "RWAXI solo tiene MINTER_ROLE: no puede pausar el token, anclar el Data Room o distribuciones ni ejecutar recuperaciones.",
    ),
    msg(
      "Pausar y reanudar es exclusivo del emisor y del oficial de cumplimiento (ISSUER_ADMIN_ROLE, COMPLIANCE_OFFICER_ROLE).",
    ),
    msg(
      "La recuperación forzosa exige LEGAL_ENFORCEMENT_ROLE del emisor y el hash del acto legal que la respalda (LegalActHashRequired); el receptor debe estar en la whitelist.",
    ),
    msg(
      "Cada raíz de distribución la ancla el emisor (DISTRIBUTION_ROLE) una sola vez y nunca vacía (DistributionAlreadyAnchored, EmptyDistributionRoot).",
    ),
  ],
};
