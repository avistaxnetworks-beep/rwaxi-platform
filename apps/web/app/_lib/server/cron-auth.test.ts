import { test } from "node:test";
import assert from "node:assert/strict";
import { CRON_SECRET_MIN_LENGTH, checkCronAuthorization } from "./cron-auth";

const SECRET = "c".repeat(24) + "0123456789abcdef"; // 40 characters

test("sin CRON_SECRET utilizable el endpoint falla cerrado (503), con o sin cabecera", () => {
  for (const configured of [undefined, "", "   ", "x".repeat(CRON_SECRET_MIN_LENGTH - 1)]) {
    const r = checkCronAuthorization(`Bearer ${configured ?? ""}`, configured);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.status, 503);
  }
  assert.equal(checkCronAuthorization(null, undefined).ok, false);
});

test("el secreto exacto en Authorization: Bearer autoriza", () => {
  assert.deepEqual(checkCronAuthorization(`Bearer ${SECRET}`, SECRET), { ok: true });
  // the scheme is case-insensitive (RFC 6750); surrounding blanks of the header and of the variable do not count
  assert.deepEqual(checkCronAuthorization(`bearer ${SECRET}  `, `${SECRET}\n`), { ok: true });
});

test("todo lo demás es 401: sin cabecera, otro esquema, otro secreto, un prefijo o el secreto con añadidos", () => {
  const refused = [
    null,
    undefined,
    "",
    "Bearer",
    "Bearer ",
    SECRET,
    `Basic ${SECRET}`,
    `Token ${SECRET}`,
    `Bearer ${SECRET.slice(0, -1)}`,
    `Bearer ${SECRET.slice(0, 16)}`,
    `Bearer ${SECRET}x`,
    `Bearer ${SECRET} ${SECRET}`,
    `Bearer ${SECRET.toUpperCase()}`,
  ];
  for (const header of refused) {
    const r = checkCronAuthorization(header, SECRET);
    assert.equal(r.ok, false, `debería rechazar ${JSON.stringify(header)}`);
    assert.equal(!r.ok && r.status, 401);
  }
});
