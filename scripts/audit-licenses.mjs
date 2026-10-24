// License audit of the dependency tree (`pnpm audit:licenses`). Fails when a production dependency of any
// workspace package — direct or transitive — is under a strong copyleft licence (GPL, AGPL, SSPL), which is
// incompatible with RWAXI's proprietary code. Permissive and weak copyleft licences (LGPL, MPL) pass; an
// unknown or non-SPDX licence is listed for manual review without failing (unless --strict).
//   pnpm audit:licenses                  dependencies + optionalDependencies of every workspace package
//   pnpm audit:licenses --include-dev    also devDependencies
//   pnpm audit:licenses --strict         also fail on licences that need review
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Strong copyleft: no permissive alternative → the dependency contaminates the product. */
const DENIED = [/^A?GPL(?:v?\d|-|\+|$)/i, /^SSPL/i];
/** Licences accepted without review (SPDX ids; weak copyleft libraries included). */
const ALLOWED = new Set(
  [
    "0BSD",
    "Apache-1.1",
    "Apache-2.0",
    "Artistic-2.0",
    "BlueOak-1.0.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "BSD-3-Clause-Clear",
    "BSL-1.0",
    "CC-BY-3.0",
    "CC-BY-4.0",
    "CC0-1.0",
    "EPL-2.0",
    "ISC",
    "LGPL-2.1",
    "LGPL-2.1-only",
    "LGPL-2.1-or-later",
    "LGPL-3.0",
    "LGPL-3.0-only",
    "LGPL-3.0-or-later",
    "MIT",
    "MIT-0",
    "MPL-2.0",
    "OFL-1.1",
    "PSF-2.0",
    "Python-2.0",
    "Unicode-3.0",
    "Unicode-DFS-2016",
    "Unlicense",
    "WTFPL",
    "X11",
    "Zlib",
  ].map((id) => id.toLowerCase()),
);
const RANK = { allowed: 0, review: 1, denied: 2 };
const worst = (a, b) => (RANK[a] >= RANK[b] ? a : b);
const best = (a, b) => (RANK[a] <= RANK[b] ? a : b);

/**
 * Verdict of an SPDX licence expression: "denied" when every way of satisfying it includes a strong copyleft
 * licence, "allowed" when some way uses only accepted licences, "review" otherwise (unknown id, UNLICENSED,
 * "SEE LICENSE IN …", malformed). OR takes the best alternative; AND and WITH keep the worst part.
 */
export function verdict(expression) {
  const tokens = String(expression ?? "")
    .replace(/[()]/g, " $& ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let i = 0;
  const peek = () => tokens[i]?.toUpperCase();
  const id = (raw) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9.+-]*$/.test(raw)) throw new Error(`not an SPDX id: ${raw}`);
    if (DENIED.some((re) => re.test(raw))) return "denied";
    return ALLOWED.has(raw.replace(/\+$/, "").toLowerCase()) ? "allowed" : "review";
  };
  const term = () => {
    if (tokens[i] === "(") {
      i++;
      const inner = or();
      if (tokens[i++] !== ")") throw new Error("unbalanced parenthesis");
      return inner;
    }
    const raw = tokens[i++];
    if (raw === undefined || ["AND", "OR", "WITH", ")"].includes(raw.toUpperCase()))
      throw new Error("licence expected");
    let v = id(raw);
    if (peek() === "WITH") {
      i++;
      if (tokens[i++] === undefined) throw new Error("exception expected");
      v = worst(v, "allowed"); // an exception never removes the copyleft of its licence for this policy
    }
    return v;
  };
  const and = () => {
    let v = term();
    while (peek() === "AND") {
      i++;
      v = worst(v, term());
    }
    return v;
  };
  const or = () => {
    let v = and();
    while (peek() === "OR") {
      i++;
      v = best(v, and());
    }
    return v;
  };
  try {
    if (!tokens.length) return "review";
    const v = or();
    if (i !== tokens.length) throw new Error("trailing tokens");
    return v;
  } catch {
    return "review";
  }
}

/** pnpm's report ({ licence: [{ name, versions, … }] }) as one row per package, own workspace packages excluded. */
export function rows(report) {
  return Object.entries(report)
    .flatMap(([license, pkgs]) =>
      pkgs.map((p) => ({ name: p.name, versions: p.versions ?? [], license: p.license ?? license })),
    )
    .filter((p) => !p.name.startsWith("@rwaxi/"))
    .map((p) => ({ ...p, verdict: verdict(p.license) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Prints the report of pnpm's licence list and returns the exit code: 1 on strong copyleft (or review with --strict). */
export function check(
  report,
  { strict = false, scope = "producción", log = console.log, error = console.error } = {},
) {
  const all = rows(report);
  const byLicense = new Map();
  for (const p of all) byLicense.set(p.license, (byLicense.get(p.license) ?? 0) + 1);
  log(`Licencias de las dependencias de ${scope} (directas y transitivas): ${all.length} paquetes`);
  for (const [license, n] of [...byLicense].sort((a, b) => b[1] - a[1]))
    log(`  ${String(n).padStart(4)}  ${license}`);

  const show = (p) => `${p.name}@${p.versions.join(", ")} (${p.license}) · origen: pnpm why ${p.name} -r`;
  const review = all.filter((p) => p.verdict === "review");
  const denied = all.filter((p) => p.verdict === "denied");
  if (review.length)
    log(
      `\n⚠ Revisar a mano (licencia desconocida, no SPDX o propietaria):\n${review.map((p) => `  ${show(p)}`).join("\n")}`,
    );
  if (denied.length) {
    error(
      `\n✖ ${denied.length} paquete(s) con copyleft fuerte (GPL, AGPL o SSPL), incompatible con el código propietario de RWAXI:`,
    );
    for (const p of denied) error(`  ${show(p)}`);
    return 1;
  }
  if (strict && review.length) {
    error("\n✖ --strict: hay licencias pendientes de revisión.");
    return 1;
  }
  log("\n✔ Sin licencias copyleft fuerte (GPL, AGPL, SSPL).");
  return 0;
}

function main(argv) {
  const includeDev = argv.includes("--include-dev");
  const args = ["licenses", "list", "--json", "--recursive", ...(includeDev ? [] : ["--prod"])];
  // Fixed arguments only (no user input): one command line, so Windows resolves pnpm.cmd through the shell.
  const run = spawnSync(`pnpm ${args.join(" ")}`, {
    encoding: "utf8",
    shell: true,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0) {
    console.error(`No se pudo ejecutar pnpm ${args.join(" ")}:\n${run.stderr || run.stdout}`);
    return 1;
  }
  let report;
  try {
    report = JSON.parse(run.stdout || "{}");
  } catch (e) {
    console.error(`Salida de pnpm licenses no es JSON: ${e.message}`);
    return 1;
  }
  return check(report, {
    strict: argv.includes("--strict"),
    scope: includeDev ? "producción y desarrollo" : "producción",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main(process.argv.slice(2));
