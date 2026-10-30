import { test } from "node:test";
import assert from "node:assert/strict";
import { internalPath, PLATFORM_DOMAIN, resolveHost } from "./hosts";
import { RWAXI_B2B_URL } from "../vitrina/_lib/links";

test("production hosts map to the 4 environments", () => {
  const root = "rwaxirealestate.com";
  assert.equal(PLATFORM_DOMAIN, root);
  assert.deepEqual(resolveHost("www.rwaxirealestate.com", root), { kind: "www" });
  assert.deepEqual(resolveHost("rwaxirealestate.com", root), { kind: "www" });
  assert.deepEqual(resolveHost("admin.rwaxirealestate.com", root), { kind: "admin" });
  assert.deepEqual(resolveHost("avista.rwaxirealestate.com", root), { kind: "tenant", slug: "avista", via: "subdomain" });
  assert.deepEqual(resolveHost("AVISTA.RWAXIREALESTATE.COM.", root), {
    kind: "tenant",
    slug: "avista",
    via: "subdomain",
  });
});

test("rwaxi.com is RWAXI's separate B2B site: the platform never serves it and the vitrina links out to it", () => {
  const root = "rwaxirealestate.com";
  assert.equal(resolveHost("rwaxi.com", root).kind, "unknown");
  assert.equal(resolveHost("www.rwaxi.com", root).kind, "unknown");
  assert.equal(resolveHost("avista.rwaxi.com", root).kind, "unknown");
  assert.equal(resolveHost(new URL(RWAXI_B2B_URL).host, root).kind, "unknown");
});

test("development hosts on *.localhost keep the port out of the slug", () => {
  const root = "localhost:3000";
  assert.deepEqual(resolveHost("localhost:3000", root), { kind: "www" });
  assert.deepEqual(resolveHost("admin.localhost:3000", root), { kind: "admin" });
  assert.deepEqual(resolveHost("elpoblado.localhost:3000", root), {
    kind: "tenant",
    slug: "elpoblado",
    via: "subdomain",
  });
});

test("verified custom domains resolve to their tenant", () => {
  assert.deepEqual(resolveHost("invest.avistaresort.co", "rwaxirealestate.com"), {
    kind: "tenant",
    slug: "avista",
    via: "custom-domain",
  });
});

test("reserved, nested and foreign hosts are not tenants", () => {
  const root = "rwaxirealestate.com";
  assert.equal(resolveHost("api.rwaxirealestate.com", root).kind, "unknown");
  assert.equal(resolveHost("a.b.rwaxirealestate.com", root).kind, "unknown");
  assert.equal(resolveHost("evil-rwaxirealestate.com", root).kind, "unknown");
  assert.equal(resolveHost("rwaxirealestate.com.evil.io", root).kind, "unknown");
  assert.equal(resolveHost(null, root).kind, "unknown");
});

test("internal rewrite paths", () => {
  assert.equal(internalPath({ kind: "www" }, "/"), "/vitrina");
  assert.equal(internalPath({ kind: "admin" }, "/"), "/superadmin");
  assert.equal(internalPath({ kind: "tenant", slug: "avista", via: "subdomain" }, "/backoffice"), "/tenant/avista/backoffice");
  assert.equal(internalPath({ kind: "unknown", host: "x" }, "/"), null);
});

test("the vitrina's legal documents are served outside /vitrina (and its legal wall), only on www", () => {
  assert.equal(internalPath({ kind: "www" }, "/legal/terms"), "/legal/terms");
  assert.equal(internalPath({ kind: "www" }, "/legal/cookies/"), "/legal/cookies");
  assert.equal(internalPath({ kind: "www" }, "/legal"), "/legal");
  // anything deeper or differently shaped stays a vitrina path (→ 404), never another internal route
  assert.equal(internalPath({ kind: "www" }, "/legal/terms/x"), "/vitrina/legal/terms/x");
  assert.equal(internalPath({ kind: "www" }, "/legalese"), "/vitrina/legalese");
  assert.equal(internalPath({ kind: "tenant", slug: "avista", via: "subdomain" }, "/legal/terms"), "/tenant/avista/legal/terms");
  assert.equal(internalPath({ kind: "admin" }, "/legal/terms"), "/superadmin/legal/terms");
});
