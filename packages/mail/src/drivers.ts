import { createHmac } from "node:crypto";

/**
 * Mail providers behind the MailDispatcher. A driver only delivers: it never sees the database, and what it
 * returns decides the row's fate — "sent" (the provider holds the copy: the row's body is cleared) or "captured"
 * (the development sink: the body stays readable until what it carries is used or expires).
 */
export interface OutgoingMail {
  /** mail_outbox id: the provider's idempotency key, so a retried delivery is never sent twice */
  id: string;
  to: string;
  subject: string;
  text: string;
}

export type DeliveryResult = { kind: "sent"; providerMessageId: string | null } | { kind: "captured" };

/** A refused delivery. `permanent` ones (bad address, rejected message, wrong credentials) are not retried. */
export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}

export type DriverName = "resend" | "postmark" | "webhook" | "dev" | "none";

export interface MailDriver {
  readonly name: DriverName;
  send(mail: OutgoingMail): Promise<DeliveryResult>;
}

const TIMEOUT_MS = 10_000;
/** 408, 429 and 5xx are worth retrying; any other 4xx will fail the same way again. */
const retryable = (status: number) => status === 408 || status === 429 || status >= 500;

async function post(
  fetcher: typeof fetch,
  provider: string,
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<unknown> {
  let r: Response;
  try {
    r = await fetcher(url, { method: "POST", headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new DeliveryError(`${provider}: ${e instanceof Error ? e.message : String(e)}`, false); // network: retry
  }
  const json = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  if (!r.ok) {
    const detail = json?.message ?? json?.Message ?? json?.name ?? r.statusText;
    throw new DeliveryError(
      `${provider} ${r.status}: ${String(detail).slice(0, 200)}`,
      !retryable(r.status),
      r.status,
    );
  }
  return json;
}

/** Resend (POST /emails, Bearer API key; Idempotency-Key = the row id). */
export class ResendDriver implements MailDriver {
  readonly name = "resend" as const;
  constructor(
    private readonly options: { apiKey: string; from: string; baseUrl?: string; fetcher?: typeof fetch },
  ) {}

  async send(mail: OutgoingMail): Promise<DeliveryResult> {
    const base = (this.options.baseUrl || "https://api.resend.com").replace(/\/+$/, "");
    const json = (await post(
      this.options.fetcher ?? fetch,
      "Resend",
      `${base}/emails`,
      {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": `rwaxi-${mail.id}`,
      },
      JSON.stringify({ from: this.options.from, to: [mail.to], subject: mail.subject, text: mail.text }),
    )) as { id?: unknown } | null;
    return { kind: "sent", providerMessageId: typeof json?.id === "string" ? json.id : null };
  }
}

/** Postmark (POST /email, X-Postmark-Server-Token; the row id travels as metadata). */
export class PostmarkDriver implements MailDriver {
  readonly name = "postmark" as const;
  constructor(
    private readonly options: {
      serverToken: string;
      from: string;
      baseUrl?: string;
      stream?: string;
      fetcher?: typeof fetch;
    },
  ) {}

  async send(mail: OutgoingMail): Promise<DeliveryResult> {
    const base = (this.options.baseUrl || "https://api.postmarkapp.com").replace(/\/+$/, "");
    const json = (await post(
      this.options.fetcher ?? fetch,
      "Postmark",
      `${base}/email`,
      {
        accept: "application/json",
        "content-type": "application/json",
        "x-postmark-server-token": this.options.serverToken,
      },
      JSON.stringify({
        From: this.options.from,
        To: mail.to,
        Subject: mail.subject,
        TextBody: mail.text,
        MessageStream: this.options.stream ?? "outbound",
        Metadata: { mailId: mail.id },
      }),
    )) as { MessageID?: unknown; ErrorCode?: unknown; Message?: unknown } | null;
    // Postmark may answer 200 with a non-zero ErrorCode
    if (json && typeof json.ErrorCode === "number" && json.ErrorCode !== 0) {
      throw new DeliveryError(
        `Postmark ${json.ErrorCode}: ${String(json.Message ?? "").slice(0, 200)}`,
        true,
      );
    }
    return { kind: "sent", providerMessageId: typeof json?.MessageID === "string" ? json.MessageID : null };
  }
}

/**
 * A relay of our own (e.g. an SMTP bridge): JSON POST signed with HMAC-SHA256 over `timestamp.body`
 * (X-Rwaxi-Timestamp, X-Rwaxi-Signature: sha256=…), so the relay can reject anything RWAXI did not send.
 */
export class WebhookDriver implements MailDriver {
  readonly name = "webhook" as const;
  constructor(
    private readonly options: {
      url: string;
      secret: string;
      from: string;
      fetcher?: typeof fetch;
      now?: () => Date;
    },
  ) {}

  async send(mail: OutgoingMail): Promise<DeliveryResult> {
    const body = JSON.stringify({
      id: mail.id,
      from: this.options.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
    const timestamp = String(Math.floor((this.options.now?.() ?? new Date()).getTime() / 1000));
    const signature = createHmac("sha256", this.options.secret).update(`${timestamp}.${body}`).digest("hex");
    const json = (await post(
      this.options.fetcher ?? fetch,
      "Webhook",
      this.options.url,
      {
        "content-type": "application/json",
        "x-rwaxi-timestamp": timestamp,
        "x-rwaxi-signature": `sha256=${signature}`,
      },
      body,
    )) as { id?: unknown } | null;
    return { kind: "sent", providerMessageId: typeof json?.id === "string" ? json.id : null };
  }
}

/** Development: the message goes to the server log and stays readable in mail_outbox (E2E suites read it there). */
export class DevDriver implements MailDriver {
  readonly name = "dev" as const;
  constructor(private readonly log: (line: string) => void = (line) => console.info(line)) {}

  async send(mail: OutgoingMail): Promise<DeliveryResult> {
    this.log(`[mail:dev] → ${mail.to} · ${mail.subject}\n${mail.text}`);
    return { kind: "captured" };
  }
}

/** Production without a provider: nothing is delivered (and the body is cleared when what it carries expires). */
export class UnconfiguredDriver implements MailDriver {
  readonly name = "none" as const;
  async send(): Promise<DeliveryResult> {
    throw new DeliveryError(
      "Sin proveedor de correo configurado (RESEND_API_KEY, POSTMARK_SERVER_TOKEN o MAIL_WEBHOOK_URL)",
      false,
    );
  }
}

/**
 * The driver the environment configures:
 *   MAIL_DRIVER            resend | postmark | webhook | dev (default: the provider whose key is set; else dev
 *                          outside production — in production, none: mail stays undelivered)
 *   MAIL_FROM              sender, required by every provider (e.g. "RWAXI Real Estate <no-reply@notifications.rwaxirealestate.com>")
 *   RESEND_API_KEY         [RESEND_API_URL]              Resend
 *   POSTMARK_SERVER_TOKEN  [POSTMARK_API_URL, POSTMARK_STREAM]   Postmark
 *   MAIL_WEBHOOK_URL       MAIL_WEBHOOK_SECRET           a signed relay (e.g. to SMTP)
 */
export function mailDriverFromEnv(env: NodeJS.ProcessEnv = process.env, fetcher?: typeof fetch): MailDriver {
  const production = env.NODE_ENV === "production";
  const explicit = env.MAIL_DRIVER?.trim().toLowerCase() || null;
  const chosen =
    explicit ??
    (env.RESEND_API_KEY
      ? "resend"
      : env.POSTMARK_SERVER_TOKEN
        ? "postmark"
        : env.MAIL_WEBHOOK_URL
          ? "webhook"
          : production
            ? "none"
            : "dev");
  const from = () => {
    if (!env.MAIL_FROM) throw new Error(`MAIL_FROM es obligatorio con MAIL_DRIVER=${chosen}`);
    return env.MAIL_FROM;
  };
  const need = (key: string) => {
    if (!env[key]) throw new Error(`Falta ${key} para MAIL_DRIVER=${chosen}`);
    return env[key]!;
  };
  switch (chosen) {
    case "resend":
      return new ResendDriver({
        apiKey: need("RESEND_API_KEY"),
        from: from(),
        baseUrl: env.RESEND_API_URL,
        fetcher,
      });
    case "postmark":
      return new PostmarkDriver({
        serverToken: need("POSTMARK_SERVER_TOKEN"),
        from: from(),
        baseUrl: env.POSTMARK_API_URL,
        stream: env.POSTMARK_STREAM,
        fetcher,
      });
    case "webhook":
      return new WebhookDriver({
        url: need("MAIL_WEBHOOK_URL"),
        secret: need("MAIL_WEBHOOK_SECRET"),
        from: from(),
        fetcher,
      });
    case "dev":
      // A real recipient never gets a code from a development sink, and production never logs one.
      if (production) throw new Error("MAIL_DRIVER=dev no se permite en producción: el cuerpo iría al log");
      return new DevDriver();
    case "none":
      return new UnconfiguredDriver();
    default:
      throw new Error(`MAIL_DRIVER inválido: ${chosen} (resend | postmark | webhook | dev)`);
  }
}
