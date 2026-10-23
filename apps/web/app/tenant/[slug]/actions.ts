"use server";

/**
 * Investor onboarding Server Actions of the White Label portal ({slug}.rwaxi.com).
 *
 * The tenant comes from the host and the investor from the signed session cookie issued at
 * the NDA; the browser never sends organization or investor ids. Every write runs in one
 * tenant-bound transaction (withTenant → RLS), so a submission lands in this developer's
 * compliance inbox and nowhere else.
 */
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { evidenceHash, toOnchainId } from "@rwaxi/blockchain-sdk";
import { Prisma, isUniqueViolation, withTenant, type RiskProfile } from "@rwaxi/database";
import { ACTIVITIES, COUNTRIES, INCOME, REGIMES, RISK, validateStep } from "@/app/_lib/data/kyc";
import { REF_COOKIE, verifyReferral } from "@/app/_lib/referral";
import { readInvestorSession, startInvestorSession } from "@/app/_lib/server/investor-session";
import { paymentCodeOf } from "@/app/_lib/server/subscriptions";
import { TenantAccessError, requestMeta, requireHostTenant } from "@/app/_lib/server/tenant-context";
import { OFFERING_STATE_SELECT, PORTAL_OFFERING, isoSeconds, offeringState, toHolding, toHoldings } from "./_lib/journey";
import type {
  KycDocument,
  KycResult,
  KycSubmission,
  NdaResult,
  NdaSubmission,
  SubscriptionResult,
  SubscriptionSubmission,
} from "./_lib/journey-types";

const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HEX64 = /^(0x)?[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_DOC_BYTES = 10 * 1024 * 1024;
/** Client clocks may drift; the NDA hash embeds the client's signing time. */
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;

/** ISO 3166-1 numeric codes for RwaxiComplianceRegistry.approveInvestor(countryCode). */
const ISO_NUMERIC: Record<string, number> = {
  Colombia: 170,
  "Estados Unidos": 840,
  España: 724,
  México: 484,
  Panamá: 591,
  Perú: 604,
  Chile: 152,
  Ecuador: 218,
  Canadá: 124,
  "Otro país": 0,
};
const RISK_ENUM: Record<string, RiskProfile> = { conservador: "CONSERVATIVE", moderado: "MODERATE", dinamico: "DYNAMIC" };

class OnboardingError extends Error {}

function failure(e: unknown): { ok: false; error: string } {
  if (e instanceof OnboardingError || e instanceof TenantAccessError) return { ok: false, error: e.message };
  if (isUniqueViolation(e)) {
    return { ok: false, error: "El correo, el documento o la wallet ya están registrados por otro inversionista de este portal." };
  }
  console.error("[portal] onboarding action failed", e);
  return { ok: false, error: "No se pudo guardar tu información. Inténtalo de nuevo." };
}

/** Portal and backoffice of this tenant both render this state. */
function refresh() {
  revalidatePath("/tenant/[slug]", "page");
  revalidatePath("/tenant/[slug]/backoffice", "page");
}

const hex0x = (h: string) => (h.startsWith("0x") ? h : `0x${h}`).toLowerCase();
const newRefToken = () => `ref_rwx_${crypto.randomBytes(12).toString("hex")}`;

async function activeTenant() {
  const tenant = await requireHostTenant();
  if (tenant.portalStatus === "SUSPENDED") {
    throw new OnboardingError("Portal temporalmente suspendido para nuevas operaciones.");
  }
  return tenant;
}

// ───────────────────────────────────────────────────────────── Paso 1 · NDA

/** Signs the NDA: creates Investor + NdaAcceptance + Lead (RWAXI attribution) and the session. */
export async function signNda(input: NdaSubmission): Promise<NdaResult> {
  try {
    const signerName = typeof input?.signerName === "string" ? input.signerName.trim().slice(0, 120) : "";
    const email = typeof input?.signerEmail === "string" ? input.signerEmail.trim().toLowerCase().slice(0, 254) : "";
    if (signerName.split(/\s+/).length < 2 || !EMAIL.test(email)) {
      throw new OnboardingError("Escribe tu nombre completo y un correo válido.");
    }
    if (typeof input.documentHash !== "string" || !HEX64.test(input.documentHash)) {
      throw new OnboardingError("El hash del acuerdo no es válido.");
    }
    const at = new Date(input.at);
    if (Number.isNaN(at.getTime()) || Math.abs(Date.now() - at.getTime()) > MAX_CLOCK_SKEW_MS) {
      throw new OnboardingError("La hora de la firma no es válida; recarga la página e inténtalo de nuevo.");
    }

    const tenant = await activeTenant();
    const session = await readInvestorSession(tenant.id);
    // HMAC-verified for this tenant and not expired; single use is enforced by Lead.referralToken.
    const referralCheck = await verifyReferral((await cookies()).get(REF_COOKIE)?.value, {
      slug: tenant.slug,
      secret: process.env.REFERRAL_SECRET,
    });
    const referral = referralCheck.ok ? referralCheck.claims : null;
    const meta = await requestMeta();

    const { investor, nda, lead } = await withTenant(
      tenant.id,
      async (tx) => {
        const offering = await tx.offering.findFirst({ ...PORTAL_OFFERING, select: { id: true } });
        if (!offering) throw new OnboardingError("Este portal no tiene una oferta publicada.");

        let investor = session ? await tx.investor.findUnique({ where: { id: session.investorId } }) : null;
        if (!investor) {
          // No email verification yet: never attach a new browser to an existing investor.
          const taken = await tx.investor.findUnique({
            where: { organizationId_email: { organizationId: tenant.id, email } },
            select: { id: true },
          });
          if (taken) {
            throw new OnboardingError(
              "Este correo ya tiene un proceso de inversión en este portal. Continúa desde el navegador donde lo iniciaste o escribe al Oficial de Cumplimiento.",
            );
          }
          investor = await tx.investor.create({ data: { organizationId: tenant.id, fullName: signerName, email } });
        }

        const nda =
          (await tx.ndaAcceptance.findUnique({
            where: { offeringId_investorId: { offeringId: offering.id, investorId: investor.id } },
          })) ??
          (await tx.ndaAcceptance.create({
            data: {
              organizationId: tenant.id,
              offeringId: offering.id,
              investorId: investor.id,
              signerName,
              signerEmail: email,
              documentHash: hex0x(input.documentHash),
              ipAddress: meta.ipAddress,
              acceptedAt: at,
            },
          }));

        let lead = await tx.lead.findFirst({
          where: { offeringId: offering.id, investorId: investor.id },
          orderBy: { landedAt: "asc" },
        });
        if (!lead) {
          const base = { organizationId: tenant.id, offeringId: offering.id, investorId: investor.id };
          // Referral ids are globally unique: a replayed token inserts nothing and falls back to DIRECT.
          const attributed = referral
            ? (
                await tx.lead.createMany({
                  data: [{ ...base, referralToken: referral.referralId, source: "REFERRAL", landedAt: referral.issuedAt }],
                  skipDuplicates: true,
                })
              ).count === 1
            : false;
          if (!attributed) await tx.lead.create({ data: { ...base, referralToken: newRefToken(), source: "DIRECT" } });
          lead = await tx.lead.findFirstOrThrow({ where: { offeringId: offering.id, investorId: investor.id } });
        }
        return { investor, nda, lead };
      },
      TX_OPTIONS,
    );

    await startInvestorSession(investor.id, tenant.id);
    refresh();
    return {
      ok: true,
      nda: { id: nda.id, signer: nda.signerName, email: nda.signerEmail, at: isoSeconds(nda.acceptedAt), hash: nda.documentHash },
      lead: {
        token: lead.referralToken,
        at: isoSeconds(lead.landedAt),
        source: lead.source === "REFERRAL" ? "RWAXI" : "DIRECT",
      },
    };
  } catch (e) {
    return failure(e);
  }
}

// ───────────────────────────────────────────────────────────── Paso 2 · KYC

function documentOf(value: unknown, label: string): KycDocument | null {
  if (value === null || value === undefined) return null;
  const d = value as Partial<KycDocument>;
  const ok =
    typeof d.name === "string" &&
    d.name.length > 0 &&
    d.name.length <= 200 &&
    Number.isInteger(d.size) &&
    (d.size as number) > 0 &&
    (d.size as number) <= MAX_DOC_BYTES &&
    typeof d.type === "string" &&
    /^(image\/[a-z0-9.+-]+|application\/pdf)$/.test(d.type) &&
    typeof d.sha256 === "string" &&
    HEX64.test(d.sha256);
  if (!ok) throw new OnboardingError(`El archivo "${label}" no es válido; vuelve a cargarlo.`);
  return { name: d.name!, size: d.size!, type: d.type!, sha256: hex0x(d.sha256!) };
}

/** Same rules as the wizard (validateStep), re-applied on the server, plus closed lists. */
function sanitizeKyc(input: KycSubmission, regimeKey: "sagrilaft" | "sarlaft") {
  const i = (input ?? {}) as unknown as Record<string, unknown>;
  const str = (k: string, max: number) => (typeof i[k] === "string" ? (i[k] as string).trim().slice(0, max) : "");
  const bool = (k: string) => i[k] === true;
  const data = {
    fullName: str("fullName", 120),
    docType: str("docType", 4),
    docNumber: str("docNumber", 20),
    country: str("country", 40),
    wallet: str("wallet", 42).toLowerCase(),
    activity: str("activity", 80),
    activityOther: str("activityOther", 160),
    income: Number.isInteger(i.income) ? (i.income as number) : null,
    risk: str("risk", 20),
    docFront: documentOf(i.docFront, "frente del documento"),
    docBack: documentOf(i.docBack, "reverso del documento"),
    liveness: str("liveness", 10),
    noPep: bool("noPep"),
    dataPolicy: bool("dataPolicy"),
    terms: bool("terms"),
    sarlaft: bool("sarlaft"),
    ptee: bool("ptee"),
    listas: bool("listas"),
  };
  if (!["CC", "PA"].includes(data.docType)) throw new OnboardingError("Tipo de documento no admitido.");
  if (!(COUNTRIES as string[]).includes(data.country)) throw new OnboardingError("País de residencia no admitido.");
  if (data.activity && !(ACTIVITIES as string[]).includes(data.activity)) {
    throw new OnboardingError("Actividad económica no admitida.");
  }
  if (data.income !== null && (data.income < 0 || data.income >= INCOME.length)) {
    throw new OnboardingError("Rango de ingresos no admitido.");
  }
  if (data.risk && !RISK.some((r) => r[0] === data.risk)) throw new OnboardingError("Perfil de riesgo no admitido.");
  for (let step = 0; step < 4; step++) {
    const first = Object.values(validateStep(step, data, regimeKey) as Record<string, string>)[0];
    if (first) throw new OnboardingError(first);
  }
  if (!ADDRESS.test(data.wallet)) throw new OnboardingError("La wallet EVM no es válida.");
  return data;
}

/** Submits the KYC dossier: KycCase PENDING with a server-computed dossierHash. */
export async function submitKyc(input: KycSubmission): Promise<KycResult> {
  try {
    const tenant = await activeTenant();
    const session = await readInvestorSession(tenant.id);
    if (!session) throw new OnboardingError("Firma primero el NDA (Paso 1) para iniciar tu verificación.");

    const kyc = await withTenant(
      tenant.id,
      async (tx) => {
        // Serialises submissions of the same investor (double clicks, two tabs).
        await tx.$queryRaw`SELECT id FROM investors WHERE id = ${session.investorId} FOR UPDATE`;
        const investor = await tx.investor.findUnique({ where: { id: session.investorId } });
        if (!investor) throw new OnboardingError("Tu sesión ya no es válida; firma de nuevo el NDA.");
        const org = await tx.organization.findUniqueOrThrow({
          where: { id: tenant.id },
          select: { id: true, taxId: true, complianceRegime: true },
        });
        const offering = await tx.offering.findFirst({ ...PORTAL_OFFERING, select: { id: true, code: true } });
        if (!offering) throw new OnboardingError("Este portal no tiene una oferta publicada.");
        const nda = await tx.ndaAcceptance.findUnique({
          where: { offeringId_investorId: { offeringId: offering.id, investorId: investor.id } },
        });
        if (!nda) throw new OnboardingError("Firma primero el NDA (Paso 1) para iniciar tu verificación.");

        const latest = await tx.kycCase.findFirst({
          where: { investorId: investor.id, offeringId: offering.id },
          orderBy: { createdAt: "desc" },
          select: { status: true },
        });
        if (latest?.status === "PENDING") throw new OnboardingError("Tu expediente ya está en revisión.");
        if (latest?.status === "APPROVED") throw new OnboardingError("Tu perfil ya fue aprobado.");

        const regimeKey = org.complianceRegime === "SARLAFT" ? "sarlaft" : "sagrilaft";
        const data = sanitizeKyc(input, regimeKey);
        const [docTaken, walletTaken] = await Promise.all([
          tx.investor.findFirst({
            where: { docType: data.docType, docNumber: data.docNumber, NOT: { id: investor.id } },
            select: { id: true },
          }),
          tx.investor.findFirst({ where: { walletAddress: data.wallet, NOT: { id: investor.id } }, select: { id: true } }),
        ]);
        if (docTaken) throw new OnboardingError("Ese documento ya está registrado por otro inversionista de este portal.");
        if (walletTaken) throw new OnboardingError("Esa wallet ya está registrada por otro inversionista de este portal.");

        const submittedAt = new Date();
        const countryCode = ISO_NUMERIC[data.country] ?? 0;
        // Canonical dossier: anyone holding it can recompute dossierHash = sha256(canonicalJson(evidence)).
        const evidence = {
          version: 1,
          organization: { id: org.id, taxId: org.taxId, regime: org.complianceRegime },
          offering: { id: offering.id, code: offering.code },
          investor: {
            id: investor.id,
            fullName: data.fullName,
            docType: data.docType,
            docNumber: data.docNumber,
            country: data.country,
            countryCode,
            wallet: data.wallet,
          },
          sourceOfFunds: {
            activity: data.activity,
            activityOther: data.activity === "Otra actividad" ? data.activityOther : null,
            incomeBracket: data.income,
            riskProfile: data.risk,
          },
          documents: [
            ...(data.docFront ? [{ kind: "front", ...data.docFront }] : []),
            ...(data.docBack ? [{ kind: "back", ...data.docBack }] : []),
          ],
          liveness: { result: data.liveness, method: "simulated" },
          declarations: {
            noPep: data.noPep,
            dataPolicy: data.dataPolicy,
            terms: data.terms,
            sarlaft: data.sarlaft,
            ptee: REGIMES[regimeKey].ptee ? data.ptee : null,
            listas: data.listas,
          },
          nda: { id: nda.id, documentHash: nda.documentHash },
          submittedAt: submittedAt.toISOString(),
        };
        const dossierHash = evidenceHash(evidence);

        await tx.investor.update({
          where: { id: investor.id },
          data: {
            fullName: data.fullName,
            docType: data.docType,
            docNumber: data.docNumber,
            countryCode,
            walletAddress: data.wallet,
          },
        });
        const kycCase = await tx.kycCase.create({
          data: {
            organizationId: tenant.id,
            investorId: investor.id,
            offeringId: offering.id,
            status: "PENDING",
            activity: data.activity === "Otra actividad" ? `Otra actividad: ${data.activityOther}` : data.activity,
            incomeBracket: data.income,
            riskProfile: RISK_ENUM[data.risk] ?? null,
            isPep: !data.noPep,
            // Screening against OFAC/ONU lists is not integrated yet: never report "sin coincidencias".
            listsResult: "Pendiente de consulta",
            dossierHash,
            evidence: evidence as Prisma.InputJsonValue,
            submittedAt,
          },
        });
        return { kycCaseId: kycCase.id, dossierHash, wallet: data.wallet };
      },
      TX_OPTIONS,
    );

    refresh();
    return {
      ok: true,
      kyc: {
        kycCaseId: kyc.kycCaseId,
        status: "pendiente",
        reason: null,
        dossierHash: kyc.dossierHash,
        wallet: kyc.wallet,
        whitelistTx: null,
        whitelistQueued: false,
      },
    };
  } catch (e) {
    return failure(e);
  }
}

// ───────────────────────────────────────────────────────────── Paso 4 · Suscripción

const CAPTURE_PAUSED = "La captación de esta oferta está pausada temporalmente por la plataforma: no se reciben nuevas suscripciones.";

/** Ceiling of the prototype's amount slider (SubscriptionPanel), enforced server-side. */
const MAX_SUBSCRIPTION_USD = 250_000;
const usd = (n: Prisma.Decimal | number) =>
  `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Number(n))} USD`;

/**
 * Signs a subscription for an approved investor and commits its units on the Offering.
 * Deployed token → PAYMENT_PENDING: the developer reconciles the fiduciary payment in the
 * backoffice (confirmPayment), which queues mintSubscription() and accrues RWAXI's fee.
 * Pre-sale (no token yet) → RESERVED: no payment flow, mint or fee until a token exists.
 * Always records an AuditEvent with the canonical agreement (agreementHash).
 */
export async function subscribe(input: SubscriptionSubmission): Promise<SubscriptionResult> {
  try {
    const units = Number(input?.units);
    if (!Number.isSafeInteger(units) || units < 1) throw new OnboardingError("Cantidad de unidades inválida.");
    const ack = input?.acknowledgments;
    if (!ack || ack.contract !== true || ack.risk !== true || ack.layers !== true) {
      throw new OnboardingError("Debes aceptar el contrato, los riesgos y las 4 capas estructurales.");
    }
    const tenant = await activeTenant();
    const session = await readInvestorSession(tenant.id);
    if (!session) throw new OnboardingError("Tu sesión no es válida; firma de nuevo el NDA.");
    const meta = await requestMeta();

    const out = await withTenant(
      tenant.id,
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM investors WHERE id = ${session.investorId} FOR UPDATE`;
        const investor = await tx.investor.findUnique({ where: { id: session.investorId } });
        if (!investor) throw new OnboardingError("Tu sesión ya no es válida; firma de nuevo el NDA.");
        const org = await tx.organization.findUniqueOrThrow({
          where: { id: tenant.id },
          select: { taxId: true },
        });
        const offering = await tx.offering.findFirst({ ...PORTAL_OFFERING, select: OFFERING_STATE_SELECT });
        if (!offering) throw new OnboardingError("Este portal no tiene una oferta publicada.");
        const kyc = await tx.kycCase.findFirst({
          where: { investorId: investor.id, offeringId: offering.id },
          orderBy: { createdAt: "desc" },
          select: { status: true, dossierHash: true },
        });
        if (kyc?.status !== "APPROVED") {
          throw new OnboardingError("Tu KYC debe estar aprobado por el Oficial de Cumplimiento para suscribir.");
        }
        const wallet = investor.walletAddress;
        if (!wallet || !ADDRESS.test(wallet)) throw new OnboardingError("No tienes una wallet registrada.");
        const state = offeringState(offering);
        if (state.tokenPaused) throw new OnboardingError("El emisor pausó el token: no se pueden emitir nuevas unidades.");
        if (state.capturePaused) throw new OnboardingError(CAPTURE_PAUSED);

        const capital = offering.unitPriceUsd.mul(units);
        if (capital.lt(offering.minTicketUsd)) throw new OnboardingError(`El ticket mínimo es ${usd(offering.minTicketUsd)}.`);
        if (capital.gt(MAX_SUBSCRIPTION_USD)) throw new OnboardingError(`El máximo por suscripción es ${usd(MAX_SUBSCRIPTION_USD)}.`);

        // Atomic availability check (backed by the offerings_units_subscribed_range CHECK); a pause
        // decided by the platform in the meantime also makes it match no row.
        const committed = await tx.$executeRaw`
          UPDATE offerings SET units_subscribed = units_subscribed + ${units}::int
          WHERE id = ${offering.id} AND capture_paused_at IS NULL AND units_subscribed + ${units}::int <= total_units`;
        if (committed !== 1) {
          const current = await tx.offering.findUniqueOrThrow({ where: { id: offering.id }, select: { capturePausedAt: true } });
          if (current.capturePausedAt) throw new OnboardingError(CAPTURE_PAUSED);
          throw new OnboardingError(`No hay unidades suficientes: quedan ${state.totalUnits - state.unitsSubscribed}.`);
        }

        const now = new Date();
        // Deployed token: the signature reserves units and waits for the developer to reconcile the
        // fiduciary payment (backoffice), which queues the mint. Pre-sale: a reservation only.
        const awaitsPayment = state.tokenDeployed;
        const created = await tx.subscription.create({
          data: {
            organizationId: tenant.id,
            offeringId: offering.id,
            investorId: investor.id,
            units,
            capitalUsd: capital,
            status: awaitsPayment ? "PAYMENT_PENDING" : "RESERVED",
          },
        });
        const onchainId = toOnchainId(created.id);
        // The agreement the investor signed; its hash is combined with the payment reference later.
        const agreement = {
          version: 1,
          subscription: { id: created.id, onchainId },
          organization: { id: tenant.id, taxId: org.taxId },
          offering: { id: offering.id, code: offering.code },
          investor: { id: investor.id, wallet, docType: investor.docType, docNumber: investor.docNumber },
          units,
          unitPriceUsd: offering.unitPriceUsd.toFixed(2),
          capitalUsd: capital.toFixed(2),
          acknowledgments: { contract: true, risk: true, layers: true },
          kycDossierHash: kyc.dossierHash,
          createdAt: now.toISOString(),
        };
        const agreementHash = evidenceHash(agreement);

        const subscription = await tx.subscription.update({
          where: { id: created.id },
          data: { onchainId, agreementHash },
        });
        await tx.auditEvent.create({
          data: {
            organizationId: tenant.id,
            action: "SUBSCRIPTION_CREATED",
            actorUserId: null,
            actorEmail: investor.email ?? "inversionista",
            entityType: "Subscription",
            entityId: created.id,
            subjectHash: agreementHash,
            payload: {
              investorId: investor.id,
              investorName: investor.fullName,
              units,
              capitalUsd: capital.toFixed(2),
              status: subscription.status,
              paymentCode: awaitsPayment ? paymentCodeOf(onchainId) : null,
              agreement,
            },
            ...meta,
            createdAt: now,
          },
        });

        const all = await tx.subscription.findMany({
          where: { investorId: investor.id, offeringId: offering.id },
          orderBy: { createdAt: "asc" },
        });
        const fresh = await tx.offering.findUniqueOrThrow({ where: { id: offering.id }, select: OFFERING_STATE_SELECT });
        return {
          holding: toHolding(subscription)!,
          holdings: toHoldings(all),
          offering: offeringState(fresh),
          paymentCode: awaitsPayment ? paymentCodeOf(onchainId) : null,
        };
      },
      TX_OPTIONS,
    );

    refresh();
    const { paymentCode, ...data } = out;
    return {
      ok: true,
      message: paymentCode
        ? `Suscripción firmada: ${units} unidades reservadas · transfiere el pago con la referencia ${paymentCode}`
        : `Reserva registrada: ${units} unidades (el token aún no está emitido)`,
      ...data,
    };
  } catch (e) {
    return failure(e);
  }
}
