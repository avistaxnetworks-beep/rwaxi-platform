import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  DeliveryError,
  DevDriver,
  PostmarkDriver,
  ResendDriver,
  UnconfiguredDriver,
  WebhookDriver,
  bodySha256,
  mailDriverFromEnv,
  transition,
  type OutgoingMail,
} from "./index";

/** The DeliveryError a send must end in. */
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => assert.fail("expected a refused delivery"),
    (e: unknown) => e as DeliveryError,
  );

const MAIL: OutgoingMail = {
  id: "mail_123",
  to: "inv@example.co",
  subject: "Tu código",
  text: "Tu código es 123456.",
};

/** A fetch that records the request and answers with `status` and `json`. */
function provider(status: number, json: unknown) {
  const calls: { url: string; headers: Record<string, string>; body: unknown }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input),
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
      ),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetcher };
}

test("Resend: POST /emails with the API key, the row id as idempotency key and the plain-text body", async () => {
  const p = provider(200, { id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
  const driver = new ResendDriver({
    apiKey: "re_test",
    from: "RWAXI <no-reply@rwaxi.com>",
    baseUrl: "http://127.0.0.1:4010/",
    fetcher: p.fetcher,
  });
  assert.deepEqual(await driver.send(MAIL), {
    kind: "sent",
    providerMessageId: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794",
  });
  assert.equal(p.calls[0]!.url, "http://127.0.0.1:4010/emails");
  assert.equal(p.calls[0]!.headers.authorization, "Bearer re_test");
  assert.equal(p.calls[0]!.headers["idempotency-key"], "rwaxi-mail_123");
  assert.deepEqual(p.calls[0]!.body, {
    from: "RWAXI <no-reply@rwaxi.com>",
    to: ["inv@example.co"],
    subject: "Tu código",
    text: "Tu código es 123456.",
  });
});

test("provider refusals: 4xx are permanent, 429/5xx and network errors are retried", async () => {
  const refuse = async (status: number) =>
    refusal(
      new ResendDriver({
        apiKey: "k",
        from: "f",
        fetcher: provider(status, { name: "validation_error", message: "Invalid `to`" }).fetcher,
      }).send(MAIL),
    );
  const bad = await refuse(422);
  assert.ok(bad instanceof DeliveryError);
  assert.equal(bad.permanent, true);
  assert.equal(bad.status, 422);
  assert.match(bad.message, /Resend 422: Invalid `to`/);
  assert.equal((await refuse(401)).permanent, true);
  assert.equal((await refuse(429)).permanent, false);
  assert.equal((await refuse(503)).permanent, false);
  const offline = await refusal(
    new ResendDriver({
      apiKey: "k",
      from: "f",
      fetcher: async () => {
        throw new TypeError("fetch failed");
      },
    }).send(MAIL),
  );
  assert.equal(offline.permanent, false);
});

test("Postmark: server token header, TextBody and the row id as metadata; ErrorCode ≠ 0 is a refusal", async () => {
  const p = provider(200, {
    To: MAIL.to,
    MessageID: "b7bc2f4a-e38e-4336-af7d-e6c392c2f817",
    ErrorCode: 0,
    Message: "OK",
  });
  const driver = new PostmarkDriver({
    serverToken: "pm_test",
    from: "no-reply@rwaxi.com",
    fetcher: p.fetcher,
  });
  assert.deepEqual(await driver.send(MAIL), {
    kind: "sent",
    providerMessageId: "b7bc2f4a-e38e-4336-af7d-e6c392c2f817",
  });
  assert.equal(p.calls[0]!.url, "https://api.postmarkapp.com/email");
  assert.equal(p.calls[0]!.headers["x-postmark-server-token"], "pm_test");
  assert.deepEqual(p.calls[0]!.body, {
    From: "no-reply@rwaxi.com",
    To: MAIL.to,
    Subject: MAIL.subject,
    TextBody: MAIL.text,
    MessageStream: "outbound",
    Metadata: { mailId: "mail_123" },
  });
  const rejected = await refusal(
    new PostmarkDriver({
      serverToken: "t",
      from: "f",
      fetcher: provider(200, { ErrorCode: 406, Message: "Inactive recipient" }).fetcher,
    }).send(MAIL),
  );
  assert.equal(rejected.permanent, true);
  assert.match(rejected.message, /406: Inactive recipient/);
});

test("webhook: the relay can verify RWAXI's HMAC-SHA256 over timestamp.body", async () => {
  const p = provider(202, { id: "relay-1" });
  const now = new Date("2026-10-24T12:00:00Z");
  const driver = new WebhookDriver({
    url: "https://relay.example/send",
    secret: "whsec",
    from: "RWAXI <no-reply@rwaxi.com>",
    fetcher: p.fetcher,
    now: () => now,
  });
  assert.deepEqual(await driver.send(MAIL), { kind: "sent", providerMessageId: "relay-1" });
  const { headers, body } = p.calls[0]!;
  const raw = JSON.stringify(body);
  assert.equal(headers["x-rwaxi-timestamp"], String(now.getTime() / 1000));
  assert.equal(
    headers["x-rwaxi-signature"],
    `sha256=${createHmac("sha256", "whsec").update(`${headers["x-rwaxi-timestamp"]}.${raw}`).digest("hex")}`,
  );
  assert.deepEqual(body, {
    id: "mail_123",
    from: "RWAXI <no-reply@rwaxi.com>",
    to: MAIL.to,
    subject: MAIL.subject,
    text: MAIL.text,
  });
});

test("the development sink logs the message and keeps it readable (captured)", async () => {
  const lines: string[] = [];
  assert.deepEqual(await new DevDriver((l) => lines.push(l)).send(MAIL), { kind: "captured" });
  assert.match(lines[0]!, /\[mail:dev\] → inv@example\.co · Tu código\nTu código es 123456\./);
  await assert.rejects(
    new UnconfiguredDriver().send(),
    (e: unknown) => e instanceof DeliveryError && !e.permanent,
  );
});

test("the environment picks the driver; production never falls back to the log", () => {
  assert.equal(mailDriverFromEnv({ NODE_ENV: "development" }).name, "dev");
  assert.equal(mailDriverFromEnv({ NODE_ENV: "production" }).name, "none");
  assert.equal(mailDriverFromEnv({ RESEND_API_KEY: "k", MAIL_FROM: "a@b.co" }).name, "resend");
  assert.equal(mailDriverFromEnv({ POSTMARK_SERVER_TOKEN: "t", MAIL_FROM: "a@b.co" }).name, "postmark");
  assert.equal(
    mailDriverFromEnv({ MAIL_WEBHOOK_URL: "https://r", MAIL_WEBHOOK_SECRET: "s", MAIL_FROM: "a@b.co" }).name,
    "webhook",
  );
  assert.equal(mailDriverFromEnv({ MAIL_DRIVER: "dev", RESEND_API_KEY: "k" }).name, "dev");
  assert.throws(() => mailDriverFromEnv({ RESEND_API_KEY: "k" }), /MAIL_FROM/);
  assert.throws(
    () => mailDriverFromEnv({ MAIL_DRIVER: "webhook", MAIL_WEBHOOK_URL: "https://r", MAIL_FROM: "a@b.co" }),
    /MAIL_WEBHOOK_SECRET/,
  );
  assert.throws(() => mailDriverFromEnv({ NODE_ENV: "production", MAIL_DRIVER: "dev" }), /producción/);
  assert.throws(() => mailDriverFromEnv({ MAIL_DRIVER: "smtp" }), /MAIL_DRIVER inválido/);
});

test("one attempt's outcome: sent, captured, retried, or failed (permanent refusal or attempts used up)", () => {
  assert.deepEqual(transition({ kind: "sent", providerMessageId: "m1" }, 1), {
    status: "SENT",
    providerMessageId: "m1",
  });
  assert.deepEqual(transition({ kind: "captured" }, 1), { status: "CAPTURED" });
  assert.deepEqual(transition(new DeliveryError("Resend 503: busy", false, 503), 1), {
    status: "PENDING",
    error: "Resend 503: busy",
  });
  assert.deepEqual(transition(new DeliveryError("Resend 503: busy", false, 503), 5), {
    status: "FAILED",
    error: "Resend 503: busy",
  });
  assert.deepEqual(transition(new DeliveryError("Resend 422: bad to", true, 422), 1), {
    status: "FAILED",
    error: "Resend 422: bad to",
  });
  assert.deepEqual(transition(new Error("boom"), 2, 3), { status: "PENDING", error: "boom" });
  assert.equal(
    bodySha256("Tu código es 123456."),
    createHash("sha256").update("Tu código es 123456.", "utf8").digest("hex"),
  );
});
