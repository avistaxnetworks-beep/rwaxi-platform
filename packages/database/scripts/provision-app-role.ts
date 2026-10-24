/**
 * Provisions the RLS-bound application role (default `rwaxi_app`) in a target database.
 * Idempotent: safe to re-run after every `prisma migrate deploy` in staging / production.
 *
 *   pnpm db:provision-app-role [options]                      (from the repo root)
 *
 *   --role <name>        role to provision (default: rwaxi_app)
 *   --owner-env <VAR>    env var holding the owner/migration connection (default: DIRECT_URL)
 *   --rotate             set a new password when the role already exists
 *   --write-env <file>   replace DATABASE_URL in this env file (repeatable; relative to where pnpm runs)
 *   --print-url          print the resulting DATABASE_URL to stdout, e.g.
 *                          pnpm -s db:provision-app-role --rotate --print-url | vercel env add DATABASE_URL production
 *   --no-pooler          keep the owner host (default: Neon pooled host, "-pooler")
 *   --dry-run            print the SQL with the password masked and exit
 *
 * The password is generated (40 chars, [A-Za-z0-9]) unless RWAXI_APP_PASSWORD is set.
 * Secrets are never logged: diagnostics go to stderr, only --print-url writes to stdout.
 * Without --rotate an existing role keeps its password (deployed DATABASE_URLs keep working).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const log = (...msg: unknown[]) => console.error(...msg);

interface Options {
  role: string;
  ownerEnv: string;
  rotate: boolean;
  writeEnv: string[];
  printUrl: boolean;
  pooler: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  const o: Options = {
    role: "rwaxi_app",
    ownerEnv: "DIRECT_URL",
    rotate: false,
    writeEnv: [],
    printUrl: false,
    pooler: true,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = () => {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`${a} requires a value`);
      return v;
    };
    if (a === "--") continue;
    else if (a === "--role") o.role = value();
    else if (a === "--owner-env") o.ownerEnv = value();
    else if (a === "--rotate") o.rotate = true;
    else if (a === "--write-env") o.writeEnv.push(value());
    else if (a === "--print-url") o.printUrl = true;
    else if (a === "--no-pooler") o.pooler = false;
    else if (a === "--dry-run") o.dryRun = true;
    else throw new Error(`Unknown option ${a}`);
  }
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(o.role)) throw new Error(`Invalid role name: ${o.role}`);
  return o;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function newPassword(): string {
  const fromEnv = process.env.RWAXI_APP_PASSWORD;
  if (fromEnv) {
    if (!/^[A-Za-z0-9._~-]{24,128}$/.test(fromEnv)) {
      throw new Error("RWAXI_APP_PASSWORD must be 24-128 chars of [A-Za-z0-9._~-]");
    }
    return fromEnv;
  }
  // Rejection sampling keeps the distribution uniform over the 62 symbols.
  let out = "";
  while (out.length < 40) {
    for (const b of crypto.randomBytes(48)) if (b < 248 && out.length < 40) out += ALPHABET[b % 62];
  }
  return out;
}

function appUrl(ownerUrl: string, role: string, password: string, pooler: boolean): string {
  const u = new URL(ownerUrl.trim());
  u.username = role;
  u.password = password;
  const neon = /^(ep-[a-z0-9-]+?)(-pooler)?(\..+\.neon\.tech)$/.exec(u.hostname);
  if (pooler && neon && !neon[2]) u.hostname = `${neon[1]}-pooler${neon[3]}`;
  // Neon suspends idle computes; Prisma's default 5 s connect timeout can miss the cold start.
  if (neon && !u.searchParams.has("connect_timeout")) u.searchParams.set("connect_timeout", "15");
  return u.toString();
}

function writeEnvFile(file: string, url: string) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  const i = lines.findIndex((l) => l.startsWith("DATABASE_URL="));
  const entry = `DATABASE_URL="${url}"`;
  if (i >= 0) lines[i] = entry;
  else lines.push("# RLS-bound application role (db:provision-app-role)", entry);
  fs.writeFileSync(file, lines.join("\n"));
}

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ownerUrl = process.env[opts.ownerEnv];
  if (!ownerUrl) throw new Error(`${opts.ownerEnv} is not set (owner connection used for migrations)`);

  const owner = new PrismaClient({ datasourceUrl: ownerUrl });
  let password: string | null = null;
  try {
    const [me] = await owner.$queryRaw<
      {
        usr: string;
        db: string;
        rolsuper: boolean;
        rolcreaterole: boolean;
        rolcreatedb: boolean;
        rolbypassrls: boolean;
        rolreplication: boolean;
      }[]
    >`SELECT current_user AS usr, current_database() AS db,
             rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication
      FROM pg_roles WHERE rolname = current_user`;
    if (!me) throw new Error("Cannot read the owner role");
    if (!me.rolsuper && !me.rolcreaterole) throw new Error(`${me.usr} lacks CREATEROLE; use the database owner`);

    const [existsRow] = await owner.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${opts.role}) AS exists`;
    const exists = existsRow?.exists ?? false;
    const [obj] = await owner.$queryRaw<
      { migrations: boolean; audit: boolean; allocations: boolean; vault: boolean; curOrg: boolean; resolve: boolean; catalog: boolean; nonce: boolean; factory: boolean }[]
    >`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS migrations,
             to_regclass('public.audit_events') IS NOT NULL AS audit,
             to_regclass('public.distribution_allocations') IS NOT NULL AS allocations,
             to_regclass('public.vault_objects') IS NOT NULL AS vault,
             to_regprocedure('public.rwaxi_current_org()') IS NOT NULL AS "curOrg",
             to_regprocedure('public.rwaxi_resolve_tenant(text)') IS NOT NULL AS resolve,
             to_regprocedure('public.rwaxi_public_offerings()') IS NOT NULL AS catalog,
             to_regprocedure('public.rwaxi_next_simulated_nonce("ChainNetwork",text)') IS NOT NULL AS nonce,
             to_regprocedure('public.rwaxi_factory_creations("ChainNetwork",text)') IS NOT NULL AS factory`;

    if (!exists || opts.rotate) password = newPassword();
    const role = q(opts.role);
    // CREATE ROLE accepts every NO* attribute. ALTER ROLE (PostgreSQL 16+) rejects even mentioning an
    // attribute the caller does not hold, so only those are restated; the check below still fails the
    // run if the role ended up with SUPERUSER or BYPASSRLS.
    const attrs = exists
      ? [
          "LOGIN",
          me.rolsuper && "NOSUPERUSER",
          (me.rolsuper || me.rolbypassrls) && "NOBYPASSRLS",
          (me.rolsuper || me.rolcreatedb) && "NOCREATEDB",
          "NOCREATEROLE",
          (me.rolsuper || me.rolreplication) && "NOREPLICATION",
        ]
          .filter(Boolean)
          .join(" ")
      : "LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION";
    const pw = password ? ` PASSWORD '${password}'` : "";
    const statements = [
      `${exists ? "ALTER" : "CREATE"} ROLE ${role} WITH ${attrs}${pw}`,
      `GRANT CONNECT ON DATABASE ${q(me.db)} TO ${role}`,
      `GRANT USAGE ON SCHEMA public TO ${role}`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${q(me.usr)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${q(me.usr)} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
      ...(obj?.curOrg ? [`GRANT EXECUTE ON FUNCTION rwaxi_current_org() TO ${role}`] : []),
      ...(obj?.resolve ? [`GRANT EXECUTE ON FUNCTION rwaxi_resolve_tenant(text) TO ${role}`] : []),
      ...(obj?.catalog ? [`GRANT EXECUTE ON FUNCTION rwaxi_public_offerings() TO ${role}`] : []),
      ...(obj?.nonce ? [`GRANT EXECUTE ON FUNCTION rwaxi_next_simulated_nonce("ChainNetwork", text) TO ${role}`] : []),
      ...(obj?.factory ? [`GRANT EXECUTE ON FUNCTION rwaxi_factory_creations("ChainNetwork", text) TO ${role}`] : []),
      // the app never touches the migration history; the audit trail, distribution allocations and vault
      // objects are append-only
      ...(obj?.migrations ? [`REVOKE ALL ON TABLE _prisma_migrations FROM ${role}`] : []),
      ...(obj?.audit ? [`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_events FROM ${role}`] : []),
      ...(obj?.allocations ? [`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE distribution_allocations FROM ${role}`] : []),
      ...(obj?.vault ? [`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE vault_objects FROM ${role}`] : []),
    ];

    if (opts.dryRun) {
      for (const s of statements) log(`${password ? s.replace(password, "****") : s};`);
      return;
    }
    await owner.$transaction(statements.map((s) => owner.$executeRawUnsafe(s)));
    log(
      `✔ role ${opts.role} ${exists ? "updated" : "created"} in ${me.db} · ${statements.length - 1} grants/revokes` +
        (password ? (exists ? " · password rotated" : "") : " · password unchanged"),
    );

    const [check] = await owner.$queryRaw<
      { rolcanlogin: boolean; rolsuper: boolean; rolbypassrls: boolean; member_of: string[] }[]
    >`SELECT r.rolcanlogin, r.rolsuper, r.rolbypassrls,
             ARRAY(SELECT g.rolname::text FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
                   WHERE m.member = r.oid) AS member_of
      FROM pg_roles r WHERE r.rolname = ${opts.role}`;
    if (!check?.rolcanlogin || check.rolsuper || check.rolbypassrls || check.member_of.length) {
      throw new Error(`Role check failed: ${JSON.stringify(check)} (must log in, no SUPERUSER/BYPASSRLS, no memberships)`);
    }
    log("✔ attributes: LOGIN · NOSUPERUSER · NOBYPASSRLS · member of no role");
  } finally {
    await owner.$disconnect();
  }

  if (!password) {
    if (opts.writeEnv.length || opts.printUrl) log("· --write-env / --print-url skipped: password unchanged (use --rotate)");
    return;
  }

  const url = appUrl(ownerUrl, opts.role, password, opts.pooler);
  const app = new PrismaClient({ datasourceUrl: url });
  try {
    const [who] = await app.$queryRaw<{ usr: string }[]>`SELECT current_user AS usr`;
    const [probe] = await app.$queryRaw<{ visible: number }[]>`
      SELECT CASE WHEN to_regclass('public.organizations') IS NULL THEN -1
                  ELSE (SELECT count(*)::int FROM organizations) END AS visible`;
    const usr = who?.usr;
    const visible = probe?.visible ?? -1;
    if (usr !== opts.role) throw new Error(`Smoke test connected as ${usr}`);
    if (visible > 0) throw new Error(`RLS not enforced: ${visible} organizations visible without tenant context`);
    log(`✔ smoke test as ${usr} via ${new URL(url).hostname}: ${visible < 0 ? "no tables yet" : "0 rows without tenant context (RLS fail-closed)"}`);
  } finally {
    await app.$disconnect();
  }

  const base = process.env.INIT_CWD ?? process.cwd();
  for (const f of opts.writeEnv) {
    const file = path.resolve(base, f);
    writeEnvFile(file, url);
    log(`✔ DATABASE_URL updated in ${path.relative(base, file) || file}`);
  }
  if (opts.printUrl) process.stdout.write(url + "\n");
}

main().catch((e: unknown) => {
  const pw = process.env.RWAXI_APP_PASSWORD;
  let msg = e instanceof Error ? e.message : String(e);
  if (pw) msg = msg.replaceAll(pw, "****");
  msg = msg.replace(/PASSWORD '[^']*'/g, "PASSWORD '****'").replace(/(:\/\/[^:/@]+:)[^@]*@/g, "$1****@");
  log(`✖ ${msg}`);
  process.exit(1);
});
