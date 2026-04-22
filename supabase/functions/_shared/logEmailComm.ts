// logEmailComm — shared helpers used by every "send email" edge function so
// every outbound email shows up in the unified Comms timeline (`communications`
// table) AND is deduplicated at the DB level via a deterministic dedupe_key.
//
// Two-phase pattern (preferred for new call sites):
//   1. const { proceed, rowId } = await reserveEmailSend({ ..., dedupeKey })
//      → atomically inserts a sentinel row (status = "sending"). If the key
//        already exists, proceed === false and the caller MUST NOT send.
//   2. caller sends via Resend, then calls finalizeEmailSend(rowId, { success, body, resendId })
//      → flips status to "sent" / "failed" and stores the final body.
//
// Legacy one-shot logger `logEmailComm` is preserved for back-compat but new
// call sites should use the two-phase helpers so duplicate sends are blocked
// BEFORE the Resend API call.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

// ── Dedupe key builder ───────────────────────────────────────────────────────
// Keeps key format consistent across call sites. Prefer confirmation_id over
// order_id when both are present (confirmation_id is stable/human-readable).
export interface DedupeKeyParts {
  orderId?: string | null;
  confirmationId?: string | null;
  slug: string;                 // template slug / event type
  recipient?: string | null;    // for per-recipient fan-out (admin lists)
  extra?: string | null;        // rare — include when the same slug legitimately re-fires
}

export function buildDedupeKey(p: DedupeKeyParts): string | null {
  const anchor = p.confirmationId ?? p.orderId ?? null;
  if (!anchor || !p.slug) return null;
  const parts = [anchor, p.slug];
  if (p.recipient) parts.push(p.recipient.trim().toLowerCase());
  if (p.extra) parts.push(p.extra);
  return parts.join(":");
}

// ── Two-phase send: reserve → send → finalize ────────────────────────────────
export interface ReserveEmailParams {
  supabase: SupabaseClient;
  orderId?: string | null;
  confirmationId?: string | null;
  to: string;
  from?: string | null;
  subject: string;
  slug: string;
  dedupeKey?: string | null;          // override if caller has a richer key
  extra?: string | null;              // forwarded to buildDedupeKey when dedupeKey not provided
  recipient?: string | null;          // forwarded to buildDedupeKey (per-recipient fan-out)
  templateSource?: "db" | "hardcoded" | string | null;
  sentBy?: string | null;
  type?: string;                      // defaults to "email"
}

export interface ReserveResult {
  proceed: boolean;
  rowId?: string | null;
  reason?: "duplicate" | "db_error";
  dedupeKey?: string | null;
}

// reserveEmailSend: atomically claim a dedupe_key. Returns proceed=false if a
// row with the same dedupe_key already exists (PG unique violation, code 23505).
// On any OTHER DB error, fails OPEN (proceed=true, rowId=null) so a transient
// logging outage never blocks a legitimate send.
export async function reserveEmailSend(p: ReserveEmailParams): Promise<ReserveResult> {
  try {
    // Resolve order_id from confirmation_id when only confirmation_id provided.
    let resolvedOrderId = p.orderId ?? null;
    if (!resolvedOrderId && p.confirmationId) {
      const { data } = await p.supabase
        .from("orders")
        .select("id")
        .eq("confirmation_id", p.confirmationId)
        .maybeSingle();
      resolvedOrderId = (data as { id?: string } | null)?.id ?? null;
    }

    const dedupeKey = p.dedupeKey
      ?? buildDedupeKey({
        orderId: resolvedOrderId,
        confirmationId: p.confirmationId ?? null,
        slug: p.slug,
        recipient: p.recipient ?? null,
        extra: p.extra ?? null,
      });

    if (!dedupeKey) {
      // Nothing to dedupe on (no order/confirmation anchor). Allow send, skip reservation.
      return { proceed: true, rowId: null, dedupeKey: null };
    }

    const { data, error } = await p.supabase
      .from("communications")
      .insert({
        order_id: resolvedOrderId,
        confirmation_id: p.confirmationId ?? null,
        type: p.type ?? "email",
        direction: "outbound",
        body: null,
        email_to: p.to,
        email_from: p.from ?? null,
        subject: p.subject,
        slug: p.slug,
        template_source: p.templateSource ?? null,
        status: "sending",
        sent_by: p.sentBy ?? "system",
        dedupe_key: dedupeKey,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      // PG unique_violation → duplicate send attempt, block it.
      if ((error as { code?: string }).code === "23505") {
        console.log(`[reserveEmailSend] DUPLICATE BLOCKED — key=${dedupeKey}`);
        return { proceed: false, reason: "duplicate", dedupeKey };
      }
      // Other DB error: fail OPEN (log + allow send) so transient logging issues don't kill email.
      console.error(`[reserveEmailSend] insert failed (non-unique) — proceeding without row`, error);
      return { proceed: true, rowId: null, reason: "db_error", dedupeKey };
    }

    return { proceed: true, rowId: (data as { id?: string } | null)?.id ?? null, dedupeKey };
  } catch (err) {
    console.error("[reserveEmailSend] unexpected error", err);
    return { proceed: true, rowId: null, reason: "db_error" };
  }
}

export interface FinalizeEmailParams {
  success: boolean;
  body?: string | null;
  resendId?: string | null;
  errorMessage?: string | null;
}

// finalizeEmailSend: flip the reserved row to sent/failed and store the final
// body + Resend message id. No-ops if rowId is falsy (reservation was skipped).
export async function finalizeEmailSend(
  supabase: SupabaseClient,
  rowId: string | null | undefined,
  opts: FinalizeEmailParams,
): Promise<void> {
  if (!rowId) return;
  try {
    const patch: Record<string, unknown> = {
      status: opts.success ? "sent" : "failed",
    };
    if (opts.body !== undefined) patch.body = opts.body;
    if (opts.resendId) patch.twilio_sid = opts.resendId; // reuse existing column for Resend message id
    if (!opts.success && opts.errorMessage) patch.body = `[send failed] ${opts.errorMessage}`;
    await supabase.from("communications").update(patch).eq("id", rowId);
  } catch (err) {
    console.error("[finalizeEmailSend] update failed", err);
  }
}

// ── Legacy one-shot logger (kept for back-compat) ────────────────────────────
// Writes a single row with status = sent/failed AFTER the email has been sent.
// Prefer reserveEmailSend + finalizeEmailSend for new call sites because the
// one-shot variant cannot block duplicates — it races the Resend call.
export interface LogEmailParams {
  supabase: SupabaseClient;
  orderId?: string | null;
  confirmationId?: string | null;
  to: string;
  from?: string | null;
  subject: string;
  body?: string | null;
  slug?: string | null;
  templateSource?: "db" | "hardcoded" | string | null;
  sentBy?: string | null;
  success?: boolean;
  type?: string;
  dedupeKey?: string | null;
}

export async function logEmailComm(p: LogEmailParams): Promise<void> {
  try {
    let resolvedOrderId = p.orderId ?? null;
    if (!resolvedOrderId && p.confirmationId) {
      const { data } = await p.supabase
        .from("orders")
        .select("id")
        .eq("confirmation_id", p.confirmationId)
        .maybeSingle();
      resolvedOrderId = (data as { id?: string } | null)?.id ?? null;
    }

    await p.supabase.from("communications").insert({
      order_id: resolvedOrderId,
      confirmation_id: p.confirmationId ?? null,
      type: p.type ?? "email",
      direction: "outbound",
      body: p.body ?? null,
      email_to: p.to,
      email_from: p.from ?? null,
      subject: p.subject,
      slug: p.slug ?? null,
      template_source: p.templateSource ?? null,
      status: p.success === false ? "failed" : "sent",
      sent_by: p.sentBy ?? "system",
      dedupe_key: p.dedupeKey ?? null,
    });
  } catch (err) {
    console.error("[logEmailComm] insert failed", err);
  }
}
