// _shared/resendClient.ts — Centralized Resend HTTP wrapper.
//
// Phase 2 helper. Replaces duplicated `fetch("https://api.resend.com/emails", ...)`
// blocks across Edge Functions with a single, safer call site.
//
// Scope rules (do not violate):
//   - This helper does NOT auto-attach any BCC. Trustpilot BCC stays scoped to
//     send-review-request.
//   - This helper does NOT auto-write to the communications log. Each caller
//     keeps its existing logging behavior unchanged. Logging migration is a
//     separate phase.
//   - This helper does NOT mutate input. It only forwards exactly what the
//     caller passes to Resend.
//
// Returns a structured result so callers can preserve their current
// success/error handling shape:
//   { ok: true,  status, messageId, raw }
//   { ok: false, status, error,    raw }

export interface ResendTag {
  name: string;
  value: string;
}

export interface SendEmailInput {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  reply_to?: string | string[];
  tags?: ResendTag[];
  // Resend supports headers/attachments too, but we deliberately do not
  // expose them yet — add only when a caller actually needs them.
  metadata?: Record<string, string>;
}

export interface SendEmailSuccess {
  ok: true;
  status: number;
  messageId: string | null;
  raw: string;
}

export interface SendEmailFailure {
  ok: false;
  status: number;
  error: string;
  raw: string;
}

export type SendEmailResult = SendEmailSuccess | SendEmailFailure;

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function toArray(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

export async function sendEmailViaResend(
  input: SendEmailInput,
  apiKey?: string,
): Promise<SendEmailResult> {
  const key = apiKey ?? Deno.env.get("RESEND_API_KEY") ?? "";
  if (!key) {
    return {
      ok: false,
      status: 0,
      error: "RESEND_API_KEY not configured",
      raw: "",
    };
  }

  const payload: Record<string, unknown> = {
    from: input.from,
    to: toArray(input.to),
    subject: input.subject,
    html: input.html,
  };

  if (input.text !== undefined) payload.text = input.text;
  const cc = toArray(input.cc);
  if (cc && cc.length) payload.cc = cc;
  const bcc = toArray(input.bcc);
  if (bcc && bcc.length) payload.bcc = bcc;
  if (input.reply_to !== undefined) payload.reply_to = input.reply_to;
  if (input.tags && input.tags.length) payload.tags = input.tags;
  if (input.metadata && Object.keys(input.metadata).length) {
    payload.metadata = input.metadata;
  }

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, error: msg, raw: "" };
  }

  const raw = await res.text().catch(() => "");

  if (!res.ok) {
    const snippet = raw ? `: ${raw.slice(0, 200)}` : "";
    return {
      ok: false,
      status: res.status,
      error: `HTTP ${res.status}${snippet}`,
      raw,
    };
  }

  let messageId: string | null = null;
  try {
    const parsed = JSON.parse(raw) as { id?: string };
    messageId = parsed?.id ?? null;
  } catch {
    // non-JSON response — leave messageId null
  }

  return { ok: true, status: res.status, messageId, raw };
}
