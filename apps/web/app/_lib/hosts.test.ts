import { test } from "node:test";
import assert from "node:assert/strict";
import { internalPath, resolveHost } from "./hosts";

test("production hosts map to the 4 environments", () => {
  const root = "rwaxi.com";
  assert.deepEqual(resolveHost("www.rwaxi.com", root), { kind: "www" });
  assert.deepEqual(resolveHost("rwaxi.com", root), { kind: "www" });
  assert.deepEqual(resolveHost("admin.rwaxi.com", root), { kind: "admin" });
  assert.deepEqual(resolveHost("avista.rwaxi.com", root), { kind: "tenant", slug: "avista", via: "subdomain" });
  assert.deepEqual(resolveHost("AVISTA.RWAXI.COM.", root), { kind: "tenant", slug: "avista", via: "subdomain" });
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
  assert.deepEqual(resolveHost("invest.avistaresort.co", "rwaxi.com"), {
    kind: "tenant",
    slug: "avista",
    via: "custom-domain",
  });
});

test("reserved, nested and foreign hosts are not tenants", () => {
  const root = "rwaxi.com";
  assert.equal(resolveHost("api.rwaxi.com", root).kind, "unknown");
  assert.equal(resolveHost("a.b.rwaxi.com", root).kind, "unknown");
  assert.equal(resolveHost("evil-rwaxi.com", root).kind, "unknown");
  assert.equal(resolveHost("rwaxi.com.evil.io", root).kind, "unknown");
  assert.equal(resolveHost(null, root).kind, "unknown");
});

test("internal rewrite paths", () => {
  assert.equal(internalPath({ kind: "www" }, "/"), "/vitrina");
  assert.equal(internalPath({ kind: "admin" }, "/"), "/superadmin");
  assert.equal(internalPath({ kind: "tenant", slug: "avista", via: "subdomain" }, "/backoffice"), "/tenant/avista/backoffice");
  assert.equal(internalPath({ kind: "unknown", host: "x" }, "/"), null);
});
