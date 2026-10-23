// E2E · backoffice compliance inbox on real Neon data: per-tenant isolation (RLS), approve/reject,
// tampered Server Action requests and the append-only audit trail.
const { PrismaClient, launch, ownerDb, ok, fail, shot, openBackofficeTab, clickIn, toastText } = require("./lib.cjs");

const CARLOS = "Carlos A. Méndez Pardo";
const JORGE = "Jorge Iván Toro";
const db = ownerDb();

const rows = (page) =>
  page.$$eval("tr[data-investor]", (trs) =>
    trs.map((tr) => {
      const tds = tr.querySelectorAll("td");
      return {
        id: tr.dataset.investor,
        name: tds[0].querySelector("p").textContent.trim(),
        token: tds[1].querySelectorAll("p")[1].textContent.replace("…", ""),
        kyc: tr.querySelector("[data-kyc]").dataset.kyc,
        queued: tr.textContent.includes("en cola"),
      };
    }),
  );
const audits = (page) => page.$$eval("[data-audit]", (li) => li.map((l) => l.dataset.audit));

async function openCompliance(page, slug) {
  await openBackofficeTab(page, slug, "Cumplimiento");
  await page.waitForSelector("tr[data-investor], [role=alert]", { timeout: 90000 });
  return rows(page);
}
const rowOf = (name) => `tr[data-investor="${name}"]`;
async function clickInRow(page, name, label) {
  const id = await page.evaluate(
    (name) => [...document.querySelectorAll("tr[data-investor]")].find((t) => t.querySelector("td p").textContent.trim() === name)?.dataset.investor,
    name,
  );
  await clickIn(page, rowOf(id), label);
}
const waitKyc = (page, name, kyc) =>
  page.waitForFunction(
    (name, kyc) => {
      const tr = [...document.querySelectorAll("tr[data-investor]")].find((t) => t.querySelector("td p").textContent.trim() === name);
      return tr && tr.querySelector("[data-kyc]").dataset.kyc === kyc;
    },
    { timeout: 90000 },
    name,
    kyc,
  );
const caseOf = async (slug, name) => (await db.kycCase.findFirstOrThrow({ where: { organization: { slug }, investor: { fullName: name } } })).id;

/** Clicks an approve button but rewrites the server-action request in flight. */
async function tamperedApprove(page, clickName, fromId, toId, spoofTenant) {
  let seen = null;
  await page.setRequestInterception(true);
  const handler = (req) => {
    if (req.method() === "POST" && req.headers()["next-action"] && !seen) {
      const body = req.postData() || "";
      seen = { containsId: body.includes(fromId) };
      const headers = { ...req.headers() };
      if (spoofTenant) headers["x-rwaxi-tenant"] = spoofTenant;
      req.continue({ postData: body.replaceAll(fromId, toId), headers });
    } else req.continue();
  };
  page.on("request", handler);
  await clickInRow(page, clickName, "Aprobar Inversionista");
  await page.waitForSelector("[role=alert]", { timeout: 90000 });
  const alert = await page.$eval("[role=alert]", (n) => n.textContent.trim());
  page.off("request", handler);
  await page.setRequestInterception(false);
  return { seen, alert };
}

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

    // 1 · Listing isolation
    const seenIds = [];
    for (const slug of ["avista", "elpoblado", "santabarbara"]) {
      const ui = await openCompliance(page, slug);
      const org = await db.organization.findUniqueOrThrow({ where: { slug } });
      const investors = await db.investor.findMany({ where: { organizationId: org.id }, include: { leads: true } });
      const dbIds = new Set(investors.map((i) => i.id));
      const tokens = investors.flatMap((i) => i.leads.map((l) => l.referralToken));
      seenIds.push(...ui.map((r) => r.id));
      ok(
        `${slug}: ${ui.length} inversionistas, todos del tenant en BD`,
        ui.length === 4 && ui.every((r) => dbIds.has(r.id)),
        ui.map((r) => `${r.name.split(" ")[0]}=${r.kyc}`).join(" "),
      );
      ok(`${slug}: tokens LeadReferral pertenecen al tenant`, ui.every((r) => tokens.some((t) => t.startsWith(r.token))));
    }
    ok("ningún inversionista aparece en dos tenants", new Set(seenIds).size === seenIds.length, `${seenIds.length} filas únicas`);

    // 2 · Cross-tenant tampering through the real server-action endpoint
    const elCarlos = await caseOf("elpoblado", CARLOS);
    const sbCarlos = await caseOf("santabarbara", CARLOS);
    await openCompliance(page, "elpoblado");
    const t1 = await tamperedApprove(page, CARLOS, elCarlos, sbCarlos, "santabarbara");
    const [sbA, elA] = await Promise.all([
      db.kycCase.findUniqueOrThrow({ where: { id: sbCarlos } }),
      db.kycCase.findUniqueOrThrow({ where: { id: elCarlos } }),
    ]);
    ok("id de otro tenant + x-rwaxi-tenant falsificado → rechazado", !!t1.seen?.containsId && /no encontrado/i.test(t1.alert), t1.alert);
    ok("…sin cambios en ningún expediente", sbA.status === "PENDING" && elA.status === "PENDING", `santabarbara=${sbA.status} elpoblado=${elA.status}`);

    // 3 · Approve and reject in avista
    await openCompliance(page, "avista");
    await clickInRow(page, CARLOS, "Aprobar Inversionista");
    await waitKyc(page, CARLOS, "aprobado");
    ok("avista: Carlos aprobado y la vista se refresca sin recargar", true, await toastText(page));
    await clickInRow(page, JORGE, "Revisar formulario");
    await page.waitForSelector("#rej-reason");
    await page.select("#rej-reason", "2");
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Rechazar con motivo")).click());
    await waitKyc(page, JORGE, "rechazado");
    ok("avista: Jorge rechazado con motivo", true, await toastText(page));

    // 4 · Persistence across reloads
    const after = Object.fromEntries((await openCompliance(page, "avista")).map((r) => [r.name, r]));
    ok("tras recargar: Carlos aprobado con whitelist en cola", after[CARLOS].kyc === "aprobado" && after[CARLOS].queued);
    ok("tras recargar: Jorge rechazado", after[JORGE].kyc === "rechazado");
    const au = await audits(page);
    ok("registro de auditoría muestra 2 eventos", au.length === 2, au.join(", "));
    await shot(page, "backoffice-avista-compliance", { fullPage: true });

    // 5 · Other tenants untouched
    for (const slug of ["elpoblado", "santabarbara"]) {
      const ui = await openCompliance(page, slug);
      const n = (await audits(page)).length;
      ok(`${slug}: intacto (2 pendientes, 0 auditorías)`, ui.filter((r) => r.kyc === "pendiente").length === 2 && n === 0);
    }

    // 6 · Server-side state guard: approve an already-resolved case by forging the request
    await openCompliance(page, "santabarbara");
    await clickInRow(page, CARLOS, "Aprobar Inversionista");
    await waitKyc(page, CARLOS, "aprobado");
    const sbJorge = await caseOf("santabarbara", JORGE);
    const t2 = await tamperedApprove(page, JORGE, sbJorge, sbCarlos, null);
    const sbAudits = await db.auditEvent.count({ where: { organization: { slug: "santabarbara" } } });
    const jorgeSb = await db.kycCase.findUniqueOrThrow({ where: { id: sbJorge } });
    ok("aprobar dos veces el mismo expediente → rechazado en servidor", /ya está aprobado/i.test(t2.alert), t2.alert);
    ok("…1 sola auditoría y Jorge sigue pendiente", sbAudits === 1 && jorgeSb.status === "PENDING");

    // 7 · Database evidence (owner connection)
    const av = await db.organization.findUniqueOrThrow({ where: { slug: "avista" } });
    const carlos = await db.kycCase.findFirstOrThrow({
      where: { organizationId: av.id, investor: { fullName: CARLOS } },
      include: { investor: true, reviewedBy: true },
    });
    const jorge = await db.kycCase.findFirstOrThrow({ where: { organizationId: av.id, investor: { fullName: JORGE } } });
    const events = await db.auditEvent.findMany({ where: { organizationId: av.id }, orderBy: { createdAt: "asc" } });
    const wl = await db.chainTransaction.findFirst({ where: { organizationId: av.id, kind: "INVESTOR_WHITELISTED", status: "PENDING" } });
    const grant = await db.dataRoomAccessGrant.findFirst({ where: { kycCaseId: carlos.id } });
    const approved = events.find((e) => e.action === "KYC_APPROVED");
    const rejected = events.find((e) => e.action === "KYC_REJECTED");
    ok("BD: Carlos APPROVED por el Oficial de Cumplimiento", carlos.status === "APPROVED" && carlos.reviewedBy?.role === "COMPLIANCE_OFFICER", carlos.reviewedBy?.email);
    ok("BD: Jorge REJECTED con motivo guardado", jorge.status === "REJECTED" && !!jorge.rejectionReason, (jorge.rejectionReason || "").slice(0, 60) + "…");
    ok("BD: AuditEvent KYC_APPROVED con SHA-256 del expediente", approved?.subjectHash === carlos.dossierHash, `${approved?.subjectHash?.slice(0, 18)}…`);
    ok("BD: AuditEvent KYC_REJECTED con SHA-256 del expediente", rejected?.subjectHash === jorge.dossierHash);
    ok(
      "BD: ChainTransaction PENDING approveInvestor(wallet, 170, dossierHash) al registry del tenant",
      wl?.args?.kycDossierHash === carlos.dossierHash &&
        wl?.args?.wallet === carlos.investor.walletAddress &&
        wl?.args?.countryCode === 170 &&
        wl?.contractAddress === av.complianceRegistry &&
        wl?.txHash === null,
    );
    ok(
      "BD: AuditEvent enlaza ChainTransaction y DataRoomAccessGrant (24 h)",
      approved?.payload?.chainTransactionId === wl?.id &&
        approved?.payload?.accessGrantId === grant?.id &&
        !!grant &&
        Math.round((grant.expiresAt - grant.grantedAt) / 3600000) === 24,
    );

    // 8 · Append-only audit trail for the app role
    const app = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    try {
      for (const [verb, sql] of [
        ["UPDATE", `UPDATE audit_events SET actor_email = 'tampered@x.co'`],
        ["DELETE", `DELETE FROM audit_events`],
      ]) {
        try {
          await app.$transaction([
            app.$executeRaw`SELECT set_config('app.current_organization_id', ${av.id}, TRUE)`,
            app.$executeRawUnsafe(sql),
          ]);
          ok(`rwaxi_app no puede ${verb} audit_events`, false, "se ejecutó");
        } catch (e) {
          const m = (e.meta?.message || e.message || "").split("\n").find(Boolean) || "";
          ok(`rwaxi_app no puede ${verb} audit_events`, /permission denied/i.test(m), m.slice(0, 70));
        }
      }
    } finally {
      await app.$disconnect();
    }
    ok("auditoría intacta tras los intentos", (await db.auditEvent.count({ where: { organizationId: av.id } })) === 2);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})().catch(fail);
