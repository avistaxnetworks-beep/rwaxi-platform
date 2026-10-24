// A Resend-compatible endpoint for the E2E suites (POST /emails): checks the API key, keeps every message it
// accepts in memory and answers like Resend ({ id }). The suites read what it received at GET /__fake/messages —
// the only copy of a mail once the app redacted its body from mail_outbox (status SENT).
const http = require("http");
const crypto = require("crypto");

/**
 * @param {{ port?: number, apiKey: string }} options
 * @returns {Promise<{ url: string, messages: object[], close: () => Promise<void> }>}
 */
function startFakeMail({ port = 4010, apiKey }) {
  const messages = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const reply = (status, body) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.method === "GET" && req.url === "/__fake/messages") return reply(200, { messages });
      if (req.method !== "POST" || req.url !== "/emails")
        return reply(404, { statusCode: 404, name: "not_found", message: "Not found" });
      if (req.headers.authorization !== `Bearer ${apiKey}`) {
        return reply(401, { statusCode: 401, name: "missing_api_key", message: "API key is invalid" });
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return reply(422, { statusCode: 422, name: "validation_error", message: "Invalid JSON" });
      }
      const idempotencyKey = req.headers["idempotency-key"] ?? null;
      // Resend: the same Idempotency-Key answers with the first message, nothing is sent again.
      const repeated = idempotencyKey && messages.find((m) => m.idempotencyKey === idempotencyKey);
      if (repeated) return reply(200, { id: repeated.id });
      if (!body.from || !Array.isArray(body.to) || !body.to.length || !body.subject || !body.text) {
        return reply(422, {
          statusCode: 422,
          name: "validation_error",
          message: "Missing from, to, subject or text",
        });
      }
      const id = crypto.randomUUID();
      messages.push({
        id,
        idempotencyKey,
        from: body.from,
        to: body.to,
        subject: body.subject,
        text: body.text,
        at: new Date().toISOString(),
      });
      return reply(200, { id });
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${port}`,
        messages,
        close: () => new Promise((r) => server.close(() => r())),
      }),
    );
  });
}

module.exports = { startFakeMail };

// As a process of its own (run-strict.cjs starts it so the runner's synchronous reseeds never block it):
//   E2E_MAIL_PORT, E2E_MAIL_API_KEY
if (require.main === module) {
  startFakeMail({
    port: Number(process.env.E2E_MAIL_PORT || 4010),
    apiKey: process.env.E2E_MAIL_API_KEY,
  }).then(
    (mail) => console.log(`fake mail en ${mail.url}`),
    (e) => {
      console.error(e.message);
      process.exit(1);
    },
  );
}
