// Extracts the Spanish source messages of the app: the literal first argument of tr(), rich(), msg(), vmsg(),
// reason() and of the app's own errors (new XxxError(source), see LocalizedError). The Super-Admin console is
// Spanish only and is not extracted. Used by catalogs.test.ts and, as a CLI, to hand the sources to translators:
//   pnpm --filter @rwaxi/web exec tsx app/_i18n/extract.ts > sources.json
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export type MessageScope = "vitrina" | "tenant";

export interface SourceMessage {
  source: string;
  /** vitrina: needed in its 10 languages; tenant: in Spanish, English and Portuguese */
  scope: MessageScope;
  files: string[];
}

const CALL =
  /(?<![\w.$])(tr|rich|msg|vmsg|reason|new\s+(?!Error\b)[A-Z]\w*Error)\(\s*(?:"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`)/g;
const SPANISH_ONLY = ["superadmin/"];

/** Files whose texts the vitrina shows (with vmsg() anywhere else). */
const VITRINA_PATHS = ["_components/vitrina/", "vitrina/", "_components/ui/", "_components/shell/", "_i18n/"];

function unescape(raw: string): string {
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/gs, (_, esc: string) => {
    if (esc.startsWith("u{")) return String.fromCodePoint(parseInt(esc.slice(2, -1), 16));
    if (esc[0] === "u" && esc.length === 5) return String.fromCharCode(parseInt(esc.slice(1), 16));
    if (esc[0] === "x" && esc.length === 3) return String.fromCharCode(parseInt(esc.slice(1), 16));
    return ({ n: "\n", t: "\t", r: "\r", "0": "\0" } as Record<string, string>)[esc] ?? esc;
  });
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "node_modules" && name !== "messages") walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full);
  }
  return out;
}

/** Every source message under `appDir` (apps/web/app), keyed by its Spanish text. */
export function extractMessages(appDir: string): Map<string, SourceMessage> {
  const messages = new Map<string, SourceMessage>();
  for (const file of walk(appDir)) {
    const rel = path.relative(appDir, file).split(path.sep).join("/");
    if (SPANISH_ONLY.some((p) => rel.startsWith(p))) continue;
    const inVitrina = VITRINA_PATHS.some((p) => rel.startsWith(p));
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(CALL)) {
      const [, fn, dq, sq, tpl] = m;
      if (tpl !== undefined && tpl.includes("${"))
        throw new Error(`${rel}: ${fn}() with an interpolated template literal: use {placeholders}`);
      const source = unescape(dq ?? sq ?? tpl ?? "");
      const scope: MessageScope = fn === "vmsg" || inVitrina ? "vitrina" : "tenant";
      const known = messages.get(source);
      if (known) {
        if (scope === "vitrina") known.scope = "vitrina";
        if (!known.files.includes(rel)) known.files.push(rel);
      } else messages.set(source, { source, scope, files: [rel] });
    }
  }
  return messages;
}

/** `{name}` placeholders of a message. */
export const placeholders = (text: string): string[] =>
  [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();

if (require.main === module) {
  const list = [...extractMessages(path.join(process.cwd(), "app")).values()].sort((a, b) =>
    a.source.localeCompare(b.source, "es"),
  );
  process.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
}
