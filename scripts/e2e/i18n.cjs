// E2E · commercial i18n. Vitrina in its 10 languages (cookie rwaxi_vitrina_lang, first render already in the
// language, dir="rtl" in Arabic with LTR tabular figures, offering copy from Offering.translations, Korean
// keep-all and strict CJK line breaking): the commercial page — three anchors in the header, «Cómo Invertir»,
// «Inversión Supercargada» with its comparison, the B2B links to rwaxi.com and the legal disclosure — translated,
// and in every language, at 1360 px and on a 390 px phone, no text wider than its box, no horizontal page scroll and
// nothing overlapping in the header. White Label portal and
// backoffice in ES | EN | PT (cookie rwaxi_portal_lang shared by both), server messages and the On-Chain queue
// blockers rendered in the visitor's language, and Spanish untouched by default.
const fs = require("fs");
const path = require("path");
const {
  ROOT,
  launch,
  ownerDb,
  ok,
  fail,
  shot,
  url,
  waitText,
  clickText,
  fill,
  onboardInvestor,
  approveInvestor,
  subscribe,
  openBackofficeTab,
  confirmPayment,
} = require("./lib.cjs");

const db = ownerDb();
const BCP47 = {
  es: "es-CO",
  en: "en",
  pt: "pt-BR",
  fr: "fr",
  de: "de",
  ru: "ru",
  ar: "ar",
  zh: "zh-Hans",
  ja: "ja",
  ko: "ko",
};
const VITRINA = Object.keys(BCP47);
const TENANT = ["es", "en", "pt"];
const STAGE_LABEL = {
  operacion: "En Operación / Rentando",
  estructuracion: "En Estructuración / Construcción",
  preventa: "Pre-venta",
};
const CARD_LABELS = ["TIR Estimada", "Distribución Anual Est.", "Valorización Anual Proy.", "Ticket Mínimo"];
// The commercial page of the vitrina (header anchors, sections, B2B links, disclosure) and its Spanish sources.
const NAV = { oportunidades: "Oportunidades", "como-funciona": "Cómo Invertir", "beneficios-tokenizacion": "Inversión Supercargada" };
const B2B_URL = "https://rwaxi.com";
const B2B = { header: "¿Eres desarrollador? Tokeniza tu inmueble", band: "Conoce cómo estructurar tu inmueble en rwaxi.com" };
const HOW_TITLE = "Invierte en bienes raíces de grado institucional en 4 pasos claros";
const HOW_STEPS = [
  "Elige tu oportunidad y firma tu NDA digital",
  "Accede al Data Room y valida el respaldo",
  "Supera el proceso KYC y suscribe tus unidades",
  "Paga al vehículo del proyecto y recibe tus tokens",
];
const SUPER_TITLE = "No es solo finca raíz fraccionada. Es una Inversión Supercargada.";
const BENEFITS = [
  "Alcance Global con el Mismo Capital",
  "Respaldo Inmutable y Auditoría en Tiempo Real",
  "Propiedad Programable y Rendimientos Exactos",
  "Portabilidad y Estándar Abierto No-Custodial",
];
const COMPARISON = [
  "Acceso global 100 % digital",
  "Auditoría criptográfica del Data Room",
  "Trazabilidad on-chain en tiempo real",
  "Cálculo programable de rendimientos",
  "Custodia directa en tu wallet",
];
const DISCLOSURE = [
  "Naturaleza tecnológica B2B y no custodia",
  "Emisor autónomo y relación contractual directa",
  "Sin oferta pública no autorizada ni asesoría financiera",
  "Advertencia de riesgos y proyecciones",
];

// The catalogues of the app (apps/web/app/_i18n/messages/<lang>.ts): an object literal keyed by the Spanish source.
function loadCatalog(lang) {
  if (lang === "es") return {};
  const src = fs.readFileSync(path.join(ROOT, "apps/web/app/_i18n/messages", `${lang}.ts`), "utf8");
  return new Function(`return ${src.slice(src.indexOf("= {") + 2, src.lastIndexOf("};") + 1)}`)();
}
const CAT = Object.fromEntries(VITRINA.map((l) => [l, loadCatalog(l)]));
/** The app's translation, re-implemented: catalogue entry (CLDR plural on `count`) or the Spanish source. */
function tr(lang, source, vars = {}) {
  const entry = CAT[lang][source];
  const text =
    entry === undefined
      ? source
      : typeof entry === "string"
        ? entry
        : (entry[new Intl.PluralRules(BCP47[lang]).select(Number(vars.count ?? 0))] ?? entry.other);
  return text.replace(/\{(\w+)\}/g, (whole, k) => (k in vars ? String(vars[k]) : whole));
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A regex for `template` with any placeholder values (all plural forms). */
const templateRe = (forms) =>
  new RegExp(`^(?:${forms.map((f) => escapeRe(f).replace(/\\\{\w+\\\}/g, "(.+?)")).join("|")})$`, "s");
const formsOf = (lang, source) => {
  const entry = lang === "es" ? source : (CAT[lang][source] ?? source);
  return typeof entry === "string" ? [entry] : Object.values(entry);
};
/** The Spanish source whose template matches a rendered Spanish text (the most specific one). */
const sourceOf = (spanishText) =>
  Object.keys(CAT.en)
    .filter((s) => templateRe([s]).test(spanishText))
    .sort((a, b) => b.replace(/\{\w+\}/g, "").length - a.replace(/\{\w+\}/g, "").length)[0];

// ── vitrina helpers ─────────────────────────────────────────────────────────
const vitrinaSnapshot = (page) =>
  page.evaluate(() => {
    const env = document.querySelector('[data-env="vitrina"]');
    const h3 = document.querySelector("article[data-offering] h3");
    const visible = (el) => el.getClientRects().length > 0;
    return {
      menu: document.querySelector("[data-lang-menu]")?.dataset.langMenu,
      lang: env?.getAttribute("lang"),
      dir: env?.getAttribute("dir"),
      html: document.documentElement.lang,
      wordBreak: h3 && getComputedStyle(h3).wordBreak,
      lineBreak: h3 && getComputedStyle(h3).lineBreak,
      stageSpacing: getComputedStyle(document.querySelector("[data-stage-label]")).letterSpacing,
      filters: [...document.querySelectorAll("[data-stage-filter]")].map((b) => ({
        stage: b.dataset.stageFilter,
        text: b.textContent.trim(),
      })),
      cards: [...document.querySelectorAll("article[data-offering]")].map((a) => ({
        code: a.dataset.offering,
        stage: a.dataset.stage,
        location: a.querySelector("[data-offering-location]")?.textContent.trim(),
        right: a.querySelector("[data-offering-right]")?.textContent.trim(),
        city: a.querySelector("[data-offering-city]")?.textContent.trim(),
        stageLabel: a.querySelector("[data-stage-label]")?.textContent.trim(),
        labels: [...a.querySelectorAll("dl dt")].map((d) => d.textContent.trim()),
        figures: [...a.querySelectorAll("dl dd bdi")].map((b) => ({
          dir: b.getAttribute("dir"),
          numeric: getComputedStyle(b).fontVariantNumeric,
          text: b.textContent,
        })),
        buttons: [...a.querySelectorAll("button")].map((b) => b.textContent.trim()),
      })),
      // Text wider than its box: buttons, tabs, badges and links of the vitrina, and the text blocks of its commercial
      // sections (ellipsis-truncated text is by design).
      overflow: [
        ...document.querySelectorAll(
          '[data-env="vitrina"] :is(button, [role="tab"], [data-stage-label], a[data-b2b-link]), [data-vitrina-section]:not([data-vitrina-section="oportunidades"]) :is(h2, h3, p, th, td, dt, dd), [data-b2b-band] :is(h2, p), [data-legal-disclosure] :is(h2, p)',
        ),
      ]
        .filter(
          (el) =>
            visible(el) &&
            getComputedStyle(el).textOverflow !== "ellipsis" &&
            el.scrollWidth > el.clientWidth + 1,
        )
        .map((el) => `${el.textContent.trim().slice(0, 48)} (${el.scrollWidth}>${el.clientWidth})`),
      // The page itself never scrolls sideways.
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      // Boxes of the header that intersect: logo, the three anchors, language menu and the B2B link.
      headerOverlap: (() => {
        const header = document.querySelector('[data-env="vitrina"] header');
        const items = [
          ...header.querySelectorAll("button.brand-logo, [data-nav-section], [data-lang-menu] > button, [data-b2b-link]"),
        ].filter(visible);
        const hits = [];
        for (let i = 0; i < items.length; i++)
          for (let j = i + 1; j < items.length; j++) {
            const a = items[i].getBoundingClientRect();
            const b = items[j].getBoundingClientRect();
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)
              hits.push(`«${items[i].textContent.trim().slice(0, 20)}»∩«${items[j].textContent.trim().slice(0, 20)}»`);
          }
        return hits;
      })(),
      nav: [...document.querySelectorAll("[data-nav-section]")].map((b) => ({ section: b.dataset.navSection, text: b.textContent.trim() })),
      sections: [...document.querySelectorAll("[data-vitrina-section]")].map((n) => n.dataset.vitrinaSection),
      legacy: !!document.getElementById("frontera-legal"),
      b2b: [...document.querySelectorAll("[data-b2b-link]")].map((a) => ({
        where: a.dataset.b2bLink,
        href: a.getAttribute("href"),
        text: a.textContent.replace("→", "").trim(),
      })),
      howTitle: document.querySelector("#como-funciona h2")?.textContent.trim(),
      howSteps: [...document.querySelectorAll("[data-invest-step] h3")].map((n) => n.textContent.trim()),
      superTitle: document.querySelector("#beneficios-tokenizacion h2")?.textContent.trim(),
      benefits: [...document.querySelectorAll("[data-benefit] h3")].map((n) => n.textContent.trim()),
      comparison: [...document.querySelectorAll("[data-comparison] [data-comparison-row]")]
        .filter(visible)
        .map((r) => (r.querySelector("th") ?? r.querySelector("p")).textContent.trim()),
      marks: [...document.querySelectorAll("[data-comparison] [data-mark]")].filter(visible).length,
      disclosure: [...document.querySelectorAll("[data-disclosure-point] p:first-child")].map((n) => n.textContent.trim()),
    };
  });

async function chooseVitrinaLanguage(page, lang) {
  await page.click("[data-lang-menu] > button");
  await page.waitForSelector(`[data-lang-option="${lang}"]`, { timeout: 30000 });
  await page.click(`[data-lang-option="${lang}"]`);
  await page.waitForSelector(`[data-lang-menu="${lang}"]`, { timeout: 60000 });
  await page.waitForFunction(
    (l) => document.querySelector('[data-env="vitrina"]')?.getAttribute("lang") === l,
    { timeout: 30000 },
    BCP47[lang],
  );
}

/** The commercial page of the vitrina against the catalogue of `lang`. */
function checkPage(lang, snap) {
  const problems = [];
  const want = (label, got, expected) => {
    if (JSON.stringify(got) !== JSON.stringify(expected)) problems.push(`${label} «${JSON.stringify(got)}» ≠ «${JSON.stringify(expected)}»`);
  };
  want("anclas", snap.nav, Object.entries(NAV).map(([section, label]) => ({ section, text: tr(lang, label) })));
  want("secciones", snap.sections, Object.keys(NAV));
  if (snap.legacy) problems.push("sigue la sección «Frontera legal»");
  want("enlaces B2B", snap.b2b, Object.entries(B2B).map(([where, label]) => ({ where, href: B2B_URL, text: tr(lang, label) })));
  want("título Cómo Invertir", snap.howTitle, tr(lang, HOW_TITLE));
  want("pasos", snap.howSteps, HOW_STEPS.map((x) => tr(lang, x)));
  want("título Inversión Supercargada", snap.superTitle, tr(lang, SUPER_TITLE));
  want("beneficios", snap.benefits, BENEFITS.map((x) => tr(lang, x)));
  want("comparativo", snap.comparison, COMPARISON.map((x) => tr(lang, x)));
  if (snap.marks !== COMPARISON.length * 3) problems.push(`${snap.marks} celdas del comparativo`);
  want("aviso legal", snap.disclosure, DISCLOSURE.map((x) => tr(lang, x)));
  return problems;
}
/** Layout at the current viewport: overflowing text, sideways page scroll, overlapping header items. */
const layoutProblems = (snap) => [
  ...snap.overflow,
  ...(snap.pageOverflow > 0 ? [`página ${snap.pageOverflow}px más ancha que la pantalla`] : []),
  ...snap.headerOverlap.map((h) => `cabecera ${h}`),
];

/** The vitrina cards against the catalogue and the offering copy stored in PostgreSQL. */
function checkCards(lang, snap, offerings) {
  const problems = [];
  if (snap.cards.length !== offerings.length)
    problems.push(`${snap.cards.length} tarjetas, ${offerings.length} ofertas publicadas`);
  for (const card of snap.cards) {
    const o = offerings.find((x) => x.code === card.code);
    if (!o) {
      problems.push(`tarjeta ${card.code} sin oferta`);
      continue;
    }
    const copy = (lang !== "es" && o.translations?.[lang]) || {};
    const location = `${copy.assetType ?? o.assetType} · ${copy.region ?? o.region}`;
    const right = `${copy.economicRight ?? o.economicRight}. ${tr(lang, "Escenario Estimado.")}`;
    const city = (copy.city ?? o.city).toUpperCase();
    if (card.location !== location)
      problems.push(`${card.code} ubicación «${card.location}» ≠ «${location}»`);
    if (card.right !== right) problems.push(`${card.code} derecho «${card.right}» ≠ «${right}»`);
    if (card.city !== city) problems.push(`${card.code} ciudad «${card.city}» ≠ «${city}»`);
    if (card.stageLabel !== tr(lang, STAGE_LABEL[card.stage]))
      problems.push(`${card.code} etapa «${card.stageLabel}»`);
    const labels = CARD_LABELS.map((l) => tr(lang, l));
    if (card.labels.join("|") !== labels.join("|"))
      problems.push(`${card.code} etiquetas «${card.labels.join("|")}»`);
    if (!card.buttons.some((b) => b.startsWith(tr(lang, "Ir al Portal Oficial del Desarrollador"))))
      problems.push(`${card.code} CTA «${card.buttons.join("|")}»`);
    if (lang !== "es" && copy.assetType === undefined)
      problems.push(`${card.code} sin traducción en BD para ${lang}`);
  }
  return problems;
}

// ── tenant helpers ──────────────────────────────────────────────────────────
async function chooseTenantLanguage(page, lang) {
  await page.waitForSelector("[data-lang-toggle]", { timeout: 120000 });
  await page.click(`[data-lang-toggle] [data-lang-option="${lang}"]`);
  await page.waitForSelector(`[data-lang-toggle="${lang}"]`, { timeout: 60000 });
}
const tabLabels = (page) => page.$$eval('[role="tab"]', (tabs) => tabs.map((t) => t.textContent.trim()));
const apiQueue = (page) =>
  page.evaluate(() =>
    fetch("/api/chain/transactions?scope=pending", { cache: "no-store" }).then((r) => r.json()),
  );
const cookie = async (page, host, name) => (await page.cookies(url(host))).find((c) => c.name === name);

/** State of the inspector's contract viewer: source or public interface, and what it shows. */
const codeViewer = (page) =>
  page.evaluate(() => {
    const root = document.querySelector("[data-code-view]");
    return {
      view: root?.dataset.codeView,
      access: root?.dataset.sourceAccess,
      notice: !!root?.querySelector("[data-source-restricted]"),
      source: /pragma solidity|SPDX-License-Identifier: UNLICENSED/.test(root?.innerText ?? ""),
      functions: (root?.innerText.match(/\) · (view|pure|nonpayable|payable)/g) ?? []).length,
      invariants: root?.querySelectorAll("li").length ?? 0,
    };
  });
const openInspectorTab = (page, label) =>
  page.evaluate(
    (l) =>
      [...document.querySelectorAll('[role="dialog"] [role="tab"]')]
        .find((t) => t.textContent.includes(l))
        .click(),
    label,
  );
/** GET on the dev server with a chosen Host header (Node's fetch cannot set it): status of the response. */
const hostStatus = (host, pathname) =>
  new Promise((resolve, reject) => {
    const req = require("http").request(
      {
        host: "127.0.0.1",
        port: new URL(url(null)).port,
        path: pathname,
        headers: { host: new URL(url(host)).host },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });

/** Visible layers of the portal's pitch video that intersect (badge, chip, title, chapter card, subtitles, controls). */
const videoOverlaps = (page) =>
  page.evaluate(() => {
    const box = document.querySelector(".vp-box");
    const slider = box.querySelector('[role="slider"]');
    const layers = {
      badge: box.querySelector(".pointer-events-none > span"),
      chip: box.querySelector(".pointer-events-none > span + span"),
      title: box.querySelector('[data-video-title="overlay"]'),
      card: box.querySelector(".vp-card"),
      subtitle: box.querySelector('p[class*="bottom-["]'),
      play: box.querySelector("button.vp-play"),
      progress: slider,
      buttons: slider?.nextElementSibling,
    };
    const rects = Object.entries(layers)
      .filter(([, el]) => el && el.getClientRects().length)
      .map(([name, el]) => [name, el.getBoundingClientRect()]);
    const hits = [];
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const [an, a] = rects[i];
        const [bn, b] = rects[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)
          hits.push(`${an}∩${bn}`);
      }
    return hits;
  });

(async () => {
  const browser = await launch();
  try {
    const offerings = await db.offering.findMany({
      where: { published: true, organization: { published: true } },
      select: {
        code: true,
        assetType: true,
        region: true,
        city: true,
        economicRight: true,
        translations: true,
      },
    });

    // ── A · vitrina: Spanish by default, then each of its languages ─────────
    const ctxV = await browser.createBrowserContext();
    const v = await ctxV.newPage();
    v.on("pageerror", (e) => console.log("PAGEERROR(vitrina)", e.message));
    await v.goto(url(null), { waitUntil: "domcontentloaded", timeout: 180000 });
    await v.waitForSelector("[data-lang-menu] ~ *, [data-lang-menu]", { timeout: 180000 });
    await v.waitForSelector("article[data-offering]", { timeout: 180000 });
    let snap = await vitrinaSnapshot(v);
    ok(
      "vitrina en español por defecto (lang es-CO, ltr)",
      snap.menu === "es" && snap.lang === "es-CO" && snap.dir === "ltr" && snap.html === "es-CO",
      `${snap.menu} ${snap.lang} ${snap.dir} ${snap.html}`,
    );
    ok("sin cookie de idioma hasta que el visitante elige", !(await cookie(v, null, "rwaxi_vitrina_lang")));
    const latinTracking = snap.stageSpacing;
    let problems = checkCards("es", snap, offerings);
    ok(
      "tarjetas en español: etiquetas, etapa, ubicación y derecho económico de la BD",
      !problems.length,
      problems.join(" | "),
    );
    problems = checkPage("es", snap);
    ok(
      "página comercial en español: 3 anclas (Oportunidades · Cómo Invertir · Inversión Supercargada), secciones, comparativo, enlaces B2B a https://rwaxi.com y aviso legal; sin «Frontera legal»",
      !problems.length,
      problems.join(" | "),
    );

    await v.click("[data-lang-menu] > button");
    const options = await v.$$eval("[data-lang-option]", (bs) =>
      bs.map((b) => `${b.dataset.langOption}:${b.getAttribute("lang")}:${b.getAttribute("dir")}`),
    );
    ok(
      "selector con los 10 idiomas, cada uno con su lang y dir",
      options.join(",") === VITRINA.map((l) => `${l}:${BCP47[l]}:${l === "ar" ? "rtl" : "ltr"}`).join(","),
      options.join(" "),
    );
    await v.keyboard.press("Escape");

    for (const lang of VITRINA.filter((l) => l !== "es")) {
      await chooseVitrinaLanguage(v, lang);
      snap = await vitrinaSnapshot(v);
      const c = await cookie(v, null, "rwaxi_vitrina_lang");
      ok(
        `[${lang}] cambio instantáneo: lang ${BCP47[lang]}, dir ${lang === "ar" ? "rtl" : "ltr"}, cookie rwaxi_vitrina_lang`,
        snap.lang === BCP47[lang] &&
          snap.html === BCP47[lang] &&
          snap.dir === (lang === "ar" ? "rtl" : "ltr") &&
          c?.value === lang &&
          c.sameSite === "Lax",
        `${snap.lang} ${snap.dir} cookie=${c?.value}`,
      );
      problems = checkCards(lang, snap, offerings);
      ok(
        `[${lang}] tarjetas traducidas: etiquetas, etapa, CTA y textos comerciales de Offering.translations`,
        !problems.length,
        problems.join(" | "),
      );
      problems = checkPage(lang, snap);
      ok(
        `[${lang}] página comercial traducida: anclas, Cómo Invertir, Inversión Supercargada y comparativo, enlaces B2B y aviso legal`,
        !problems.length,
        problems.join(" | "),
      );
      problems = layoutProblems(snap);
      ok(`[${lang}] 1360 px: sin textos desbordados, sin scroll horizontal ni solapamientos en la cabecera`, !problems.length, problems.join(" | "));
      await v.setViewport({ width: 390, height: 900 });
      await new Promise((r) => setTimeout(r, 500));
      const phone = await vitrinaSnapshot(v);
      problems = [...layoutProblems(phone), ...(phone.comparison.length === COMPARISON.length ? [] : ["comparativo apilado incompleto"])];
      ok(`[${lang}] móvil 390 px: sin textos desbordados, sin scroll horizontal ni solapamientos en la cabecera`, !problems.length, problems.join(" | "));
      if (["de", "ar", "zh", "ja", "ko"].includes(lang)) await shot(v, `i18n-vitrina-${lang}-mobile`, { fullPage: true });
      await v.setViewport({ width: 1360, height: 1000 });
      await new Promise((r) => setTimeout(r, 300));
      const filters = snap.filters.map((f) => f.text.replace(/\s*\d+$/, ""));
      ok(
        `[${lang}] filtros de etapa traducidos`,
        filters.join("|") === ["Todos", ...Object.values(STAGE_LABEL)].map((s) => tr(lang, s)).join("|"),
        filters.join("|"),
      );
      if (lang === "ar") {
        const figures = snap.cards.flatMap((card) => card.figures);
        ok(
          "[ar] cifras, porcentajes y códigos en <bdi dir=ltr> con tabular-nums y dígitos latinos",
          figures.length >= 8 &&
            figures.every(
              (f) =>
                f.dir === "ltr" &&
                f.numeric.includes("tabular-nums") &&
                /[0-9]/.test(f.text) &&
                !/[٠-٩]/.test(f.text),
            ),
          JSON.stringify(figures.slice(0, 2)),
        );
        await shot(v, "i18n-vitrina-ar");
      }
      if (lang === "ko") ok("[ko] word-break: keep-all", snap.wordBreak === "keep-all", snap.wordBreak);
      if (lang === "ja" || lang === "zh")
        ok(
          `[${lang}] salto de línea estricto (line-break: strict)`,
          snap.lineBreak === "strict",
          `${snap.lineBreak} ${snap.wordBreak}`,
        );
      // Latin tracking (letter-spacing) splits Arabic ligatures and loosens CJK/Hangul: computed 0 ("normal").
      if (["ar", "zh", "ja", "ko"].includes(lang))
        ok(
          `[${lang}] sin tracking latino en badges`,
          ["0px", "normal"].includes(snap.stageSpacing) && !["0px", "normal"].includes(latinTracking),
          `${snap.stageSpacing} (es: ${latinTracking})`,
        );
      if (lang === "de") {
        // The inspector is translated to es · en · pt only: from a German vitrina it opens in English.
        const inspectorLabel = tr("de", "Inspector On-Chain (OpenZeppelin v5)");
        await clickText(v, inspectorLabel);
        await v.waitForSelector('[role="dialog"][lang]', { timeout: 30000 });
        const dialog = await v.$eval('[role="dialog"][lang]', (d) => ({
          lang: d.getAttribute("lang"),
          dir: d.getAttribute("dir"),
          tabs: [...d.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim()),
        }));
        ok(
          "[de] Inspector On-Chain en inglés (fuera de es/en/pt), siempre ltr",
          dialog.lang === "en" &&
            dialog.dir === "ltr" &&
            dialog.tabs.some((t) => t.includes(tr("en", "Cola PostgreSQL · ChainTransaction"))),
          `${dialog.lang} ${dialog.tabs.join(" | ")}`,
        );

        // Contracts from the public vitrina: public interface and invariants, never the Solidity source.
        await openInspectorTab(v, tr("en", "Compliance Simulator"));
        await v.waitForSelector("[data-code-view]", { timeout: 30000 });
        await v.waitForFunction(
          () => /\) · (view|nonpayable)/.test(document.querySelector("[data-code-view]")?.innerText ?? ""),
          {
            timeout: 30000,
          },
        );
        const viewer = await codeViewer(v);
        ok(
          "[vitrina] Inspector: interfaz pública (ABI) e invariantes de seguridad, sin código fuente .sol",
          viewer.access === "restricted" &&
            viewer.notice &&
            !viewer.source &&
            viewer.functions > 0 &&
            viewer.invariants > 0,
          JSON.stringify(viewer),
        );
        const status = (q) =>
          v.evaluate(
            (s) => fetch(`/api/inspector/sources${s}`, { cache: "no-store" }).then((r) => r.status),
            q,
          );
        ok(
          "[vitrina] /api/inspector/sources → 403, también pidiendo la sesión del backoffice o de la consola",
          (await status("")) === 403 &&
            (await status("?as=backoffice")) === 403 &&
            (await status("?as=platform")) === 403,
        );
        // Every script the browser loaded (initial and lazy chunks): none carries the Solidity source.
        const chunks = await v.evaluate(() =>
          performance
            .getEntriesByType("resource")
            .map((e) => e.name)
            .filter((n) => /\.js(\?|$)/.test(n)),
        );
        const leaked = [];
        for (const chunk of chunks)
          if (/pragma solidity|SPDX-License-Identifier: UNLICENSED/.test(await (await fetch(chunk)).text()))
            leaked.push(chunk);
        ok(
          "ningún bundle JavaScript del navegador contiene el código Solidity",
          chunks.length > 5 && !leaked.length,
          leaked.join(" ") || `${chunks.length} scripts`,
        );
        await v.keyboard.press("Escape");
      }
    }

    // Persistence: the server reads the cookie, so the first render (and the boot placeholder) is already Arabic.
    await chooseVitrinaLanguage(v, "ar");
    await v.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
    await v.waitForSelector("[data-lang-menu]", { timeout: 180000 });
    snap = await vitrinaSnapshot(v);
    ok(
      "recarga: la vitrina vuelve en árabe sin elegir de nuevo (rtl)",
      snap.menu === "ar" && snap.dir === "rtl",
      `${snap.menu} ${snap.dir}`,
    );
    const ssr = await (await fetch(url(null), { headers: { cookie: "rwaxi_vitrina_lang=ar" } })).text();
    const boot = /class="boot">([^<]*)</.exec(ssr)?.[1];
    ok(
      "HTML del servidor ya en árabe: <html lang=ar> y placeholder de carga traducido",
      ssr.includes('<html lang="ar"') && boot === tr("ar", "RWAXI · CARGANDO PLATAFORMA"),
      boot,
    );
    const ssrDe = await (await fetch(url(null), { headers: { cookie: "rwaxi_vitrina_lang=de" } })).text();
    ok(
      "meta description de la vitrina en el idioma de la cookie",
      ssrDe.includes(
        tr(
          "de",
          "Activos reales · Inversiones digitales. Infraestructura de tokenización inmobiliaria White Label.",
        ),
      ),
    );
    const missing = await fetch(url(null, "/no-existe-i18n"), {
      headers: { cookie: "rwaxi_vitrina_lang=fr" },
    });
    const missingHtml = await missing.text();
    ok(
      "404 de la vitrina en francés",
      missing.status === 404 && missingHtml.includes(tr("fr", "Este portal no existe")),
      String(missing.status),
    );
    const bogus = await (await fetch(url(null), { headers: { cookie: "rwaxi_vitrina_lang=xx" } })).text();
    ok("cookie con un idioma desconocido → español", bogus.includes('<html lang="es-CO"'));

    await chooseVitrinaLanguage(v, "es");
    snap = await vitrinaSnapshot(v);
    problems = checkCards("es", snap, offerings);
    ok(
      "de vuelta a español: textos originales y ltr",
      snap.dir === "ltr" && !problems.length,
      problems.join(" | "),
    );
    await ctxV.close();

    // ── B · portal: ES | EN | PT and a server message in English ────────────
    const ctxP = await browser.createBrowserContext();
    const p = await ctxP.newPage();
    p.on("pageerror", (e) => console.log("PAGEERROR(portal)", e.message));
    await p.goto(url("avista"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitText(p, "Firmar NDA con un clic", 180000);
    const toggle = await p.$$eval("[data-lang-toggle] [data-lang-option]", (bs) =>
      bs.map((b) => b.textContent.trim()),
    );
    ok(
      "portal: selector ES | EN | PT, español por defecto",
      toggle.join("|") === "ES|EN|PT" && !!(await p.$('[data-lang-toggle="es"]')),
      toggle.join("|"),
    );
    ok(
      "la cookie de la vitrina no se comparte con el portal",
      !(await cookie(p, "avista", "rwaxi_vitrina_lang")),
    );

    await chooseTenantLanguage(p, "en");
    await waitText(p, tr("en", "Firmar NDA con un clic"), 30000);
    // The funnel in its order — NDA, Data Room, KYC, subscription — with its steps in English (avista: SAGRILAFT + PTEE).
    const funnel = await p.$$eval('[id^="funnel-"]', (bs) => bs.map((b) => b.textContent));
    const stepLabels = [
      tr("en", "Firma de NDA digital"),
      tr("en", "Data Room inmobiliario"),
      tr("en", "KYC/AML + {regime}", { regime: "SAGRILAFT + PTEE" }),
      tr("en", "Suscripción y portafolio"),
    ];
    ok(
      "portal en inglés: el embudo NDA → Data Room → KYC → Suscripción con sus pasos traducidos",
      funnel.length === 4 && stepLabels.every((label, i) => funnel[i].includes(label)),
      funnel.map((f) => f.slice(0, 48)).join(" | "),
    );
    const enCookie = await cookie(p, "avista", "rwaxi_portal_lang");
    ok(
      "portal en inglés: textos del embudo NDA y cookie rwaxi_portal_lang",
      enCookie?.value === "en" &&
        (await p.evaluate(() => document.documentElement.lang)) === "en" &&
        !(await p.evaluate(() => document.body.innerText.includes("Firmar NDA con un clic"))),
    );
    // Server message: an email already registered in this tenant is never attached to a new browser.
    const taken = await db.investor.findFirstOrThrow({
      where: { organization: { slug: "avista" }, email: { not: null } },
      select: { email: true },
    });
    await clickText(p, tr("en", "Completar con datos de ejemplo"));
    await fill(p, "#nda-email", taken.email);
    await clickText(p, tr("en", "Firmar NDA con un clic"));
    const conflict = tr(
      "en",
      "Este correo ya tiene un proceso de inversión en este portal. Para continuar en este navegador, usa «Recuperar mi sesión»: te enviaremos un código a ese correo.",
    );
    await p.waitForFunction(
      (t) => [...document.querySelectorAll('[role="alert"]')].some((n) => n.textContent.includes(t)),
      { timeout: 60000 },
      conflict,
    );
    ok("error del servidor (signNda) en inglés", true, conflict.slice(0, 60));

    await chooseTenantLanguage(p, "pt");
    await waitText(p, tr("pt", "Firmar NDA con un clic"), 30000);
    await p.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
    await p.waitForSelector('[data-lang-toggle="pt"]', { timeout: 180000 });
    ok(
      "portal: el portugués persiste tras recargar",
      await p.evaluate((t) => document.body.innerText.includes(t), tr("pt", "Firmar NDA con un clic")),
    );

    // Pitch video on a phone (390 px): badge, title, play button, subtitles and controls never overlap.
    await p.setViewport({ width: 390, height: 900 });
    for (const lang of ["pt", "es"]) {
      if (lang !== "pt") await chooseTenantLanguage(p, lang);
      await p.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
      await p.waitForSelector(".vp-box button.vp-play", { timeout: 180000 });
      const paused = await videoOverlaps(p);
      const below = await p.$eval(
        '[data-video-title="below"]',
        (n) => n.getClientRects().length > 0 && n.textContent.trim(),
      );
      await p.click(".vp-box button.vp-play");
      await new Promise((r) => setTimeout(r, 2500));
      const playing = await videoOverlaps(p);
      ok(
        `[${lang}] video a 390 px: título bajo el reproductor y ninguna capa solapada (pausa y reproducción)`,
        !!below && !paused.length && !playing.length,
        [...paused, ...playing.map((h) => `▶ ${h}`)].join(" ") || String(below).slice(0, 40),
      );
    }
    await p.setViewport({ width: 1360, height: 1000 });
    await ctxP.close();

    // ── C · backoffice + On-Chain queue: blockers and notes in EN and PT ────
    // The investor journey runs in Spanish (the default) with the shared helpers.
    const { page: inv, investor } = await onboardInvestor(browser, db, "avista");
    const ctxO = await browser.createBrowserContext();
    const off = await ctxO.newPage();
    off.on("pageerror", (e) => console.log("PAGEERROR(backoffice)", e.message));
    await approveInvestor(off, "avista", investor.id);
    await subscribe(inv, "avista");
    const sub = await db.subscription.findFirstOrThrow({
      where: { investorId: investor.id },
      orderBy: { createdAt: "desc" },
    });
    await openBackofficeTab(off, "avista", "Suscripciones y Pagos");
    await confirmPayment(off, sub.id, `TRF-I18N-${Date.now().toString(36).toUpperCase()}`);

    const mintTx = await db.chainTransaction.findFirstOrThrow({
      where: {
        kind: "SUBSCRIPTION_MINTED",
        status: "PENDING",
        args: { path: ["subscriptionId"], equals: sub.onchainId },
      },
    });
    const es = await apiQueue(off);
    const mintEs = es.items?.find((t) => t.id === mintTx.id);
    ok(
      "cola en español: mint bloqueado por la prelación (approveInvestor pendiente)",
      !!mintEs?.blockedReason && !!mintEs.note,
      mintEs?.blockedReason,
    );
    const blockerSource = mintEs?.blockedReason && sourceOf(mintEs.blockedReason);
    const noteSource = mintEs?.note && sourceOf(mintEs.note);
    ok(
      "bloqueo y nota del servidor salen de mensajes del catálogo",
      !!blockerSource && !!noteSource,
      `${blockerSource?.slice(0, 50)} · ${noteSource?.slice(0, 50)}`,
    );

    const boTabs = ["Cumplimiento y Leads", "Suscripciones y Pagos", "Distribuciones y Rendimientos"];
    for (const lang of ["en", "pt"]) {
      await chooseTenantLanguage(off, lang);
      const tabs = await tabLabels(off);
      ok(
        `[${lang}] pestañas del backoffice traducidas`,
        boTabs.every((t) => tabs.some((x) => x.includes(tr(lang, t)))),
        tabs.join(" | "),
      );
      const q = await apiQueue(off);
      const mint = q.items?.find((t) => t.id === mintEs?.id);
      ok(
        `[${lang}] /api/chain/transactions: bloqueo y nota en el idioma de la cookie`,
        !!mint &&
          templateRe(formsOf(lang, blockerSource)).test(mint.blockedReason) &&
          templateRe(formsOf(lang, noteSource)).test(mint.note) &&
          mint.blockedReason !== mintEs.blockedReason,
        mint?.blockedReason,
      );
      await clickText(off, tr(lang, "Inspector On-Chain"));
      await off.waitForSelector('[role="dialog"][lang]', { timeout: 30000 });
      await off.evaluate(
        (label) =>
          [...document.querySelectorAll('[role="dialog"] [role="tab"]')]
            .find((t) => t.textContent.includes(label))
            .click(),
        tr(lang, "Cola PostgreSQL · ChainTransaction"),
      );
      await off.waitForSelector(`[data-chain-tx="PENDING"] [data-blocked="true"]`, { timeout: 60000 });
      const ui = await off.$$eval('[data-chain-tx="PENDING"] [data-blocked="true"]', (ns) =>
        ns.map((n) => n.textContent.trim()),
      );
      ok(
        `[${lang}] Inspector On-Chain: bloqueo de prelación en ${lang.toUpperCase()}`,
        ui.includes(`⛔ ${mint?.blockedReason}`),
        ui[0],
      );
      ok(
        `[${lang}] botón «Procesar cola en orden» traducido`,
        await off.evaluate(
          (t) =>
            [...document.querySelectorAll('[role="dialog"] button')].some((b) => b.textContent.includes(t)),
          tr(lang, "Procesar cola en orden"),
        ),
      );
      if (lang === "en") {
        await shot(off, "i18n-inspector-en");
        // The backoffice session unlocks the contracts' source; without naming it, the same host gets 403.
        await openInspectorTab(off, tr("en", "Compliance Simulator"));
        await off.waitForSelector('[data-code-view="source"]', { timeout: 30000 });
        const viewer = await codeViewer(off);
        const status = (q) =>
          off.evaluate(
            (s) => fetch(`/api/inspector/sources${s}`, { cache: "no-store" }).then((r) => r.status),
            q,
          );
        ok(
          "[backoffice] Inspector: código fuente .sol con su cabecera UNLICENSED (sesión del backoffice)",
          viewer.access === "granted" &&
            viewer.source &&
            (await status("?as=backoffice")) === 200 &&
            (await status("")) === 403,
          JSON.stringify(viewer),
        );
        ok(
          "[consola] /api/inspector/sources?as=platform → 200 en admin, 403 en un host de tenant",
          (await hostStatus("admin", "/api/inspector/sources?as=platform")) === 200 &&
            (await hostStatus("avista", "/api/inspector/sources?as=platform")) === 403,
        );
      }
      await off.keyboard.press("Escape");
    }

    // One cookie per host: the portal of the same browser opens in the backoffice's language.
    await off.goto(url("avista"), { waitUntil: "domcontentloaded", timeout: 180000 });
    await off.waitForSelector('[data-lang-toggle="pt"]', { timeout: 180000 });
    ok("portal y backoffice comparten rwaxi_portal_lang (pt)", true);
    await chooseTenantLanguage(off, "es");
    await openBackofficeTab(off, "avista", "Suscripciones y Pagos");
    const back = await apiQueue(off);
    ok(
      "de vuelta a español: bloqueo original",
      back.items?.find((t) => t.id === mintEs?.id)?.blockedReason === mintEs?.blockedReason,
    );
    ok(
      "el idioma del inversionista no cambia por el del backoffice",
      !!(await inv.$('[data-lang-toggle="es"]')),
    );
  } catch (e) {
    fail(e);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})();
