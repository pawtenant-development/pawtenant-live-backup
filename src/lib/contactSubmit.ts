/**
 * contactSubmit — client-side helper that posts contact-form submissions to
 * the PawTenant `contact-submit` edge function.
 *
 * The edge function:
 *   - validates payload (name + email + message required),
 *   - inserts into public.contact_submissions,
 *   - emails hello@pawtenant.com via Resend (if RESEND_API_KEY is set),
 *   - returns { ok: true, id } on success.
 *
 * Callers stay agnostic of Resend / Supabase internals.
 */

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

export interface ContactSubmitPayload {
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
  source_page?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ContactSubmitResult {
  id: string;
}

export async function submitContactRequest(
  payload: ContactSubmitPayload,
): Promise<ContactSubmitResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Contact form is not configured. Please try again later.");
  }

  const body = {
    name: (payload.name ?? "").trim(),
    email: (payload.email ?? "").trim(),
    phone: payload.phone ? String(payload.phone).trim() : null,
    subject: payload.subject ? String(payload.subject).trim() : null,
    message: (payload.message ?? "").trim(),
    source_page:
      payload.source_page ??
      (typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : null),
    metadata: payload.metadata ?? {},
  };

  if (!body.name) throw new Error("Name is required.");
  if (!body.email) throw new Error("Email is required.");
  if (!body.message) throw new Error("Message is required.");

  const endpoint = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/contact-submit`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  let json: { ok?: boolean; id?: string; error?: string } = {};
  try {
    json = await res.json();
  } catch {
    /* ignore parse error — handled below */
  }

  if (!res.ok || !json?.ok || !json?.id) {
    const msg =
      json?.error ||
      `Submission failed (${res.status}). Please try again or email hello@pawtenant.com.`;
    throw new Error(msg);
  }

  return { id: json.id };
}

export interface ContactReplyPayload {
  submission_id: string;
  message: string;
  admin_id?: string | null;
  admin_email?: string | null;
  admin_name?: string | null;
}

export interface ContactReplyResult {
  reply_id: string;
  emailSent: boolean;
  emailError?: string;
}

export async function sendContactReply(
  payload: ContactReplyPayload,
): Promise<ContactReplyResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Reply service is not configured.");
  }
  const message = (payload.message ?? "").trim();
  if (!payload.submission_id) throw new Error("submission_id is required");
  if (!message) throw new Error("Reply message is required");

  const endpoint = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/contact-reply`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      submission_id: payload.submission_id,
      message,
      admin_id: payload.admin_id ?? null,
      admin_email: payload.admin_email ?? null,
      admin_name: payload.admin_name ?? null,
    }),
  });

  let json: {
    ok?: boolean;
    reply_id?: string;
    emailSent?: boolean;
    emailError?: string;
    error?: string;
  } = {};
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok || !json?.ok || !json?.reply_id) {
    throw new Error(
      json?.error || `Reply failed (${res.status}). Please try again.`,
    );
  }
  return {
    reply_id: json.reply_id,
    emailSent: !!json.emailSent,
    emailError: json.emailError,
  };
}
