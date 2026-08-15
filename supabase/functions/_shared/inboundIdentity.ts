// _shared/inboundIdentity.ts
//
// UNIFIED-ADMIN-COMMAND-CENTER-UNKNOWN-SMS-CALLS-SEARCH-INLINE-SMS-GHL-SYNC-001
//
// THE canonical ingest contract for INBOUND provider events (SMS + calls).
//
// WHY THIS EXISTS
// ---------------
// LIVE forensics, 2026-08-15. Three defects, all in the inbound writers, all
// invisible because the rows looked fine in the Admin table:
//
//   1. PHONE STORED VERBATIM. `ghl-call-inbound` wrote the GHL payload value
//      straight into `phone_from`. GHL sends US national display format, so all
//      570 LIVE inbound-call rows read "(832) 726-0357". Every E.164-keyed
//      lookup — GHL contact match, conversation identity, admin search — missed
//      them. `select count(*) where phone_from like '+1832%'` returned ZERO
//      while 570 such calls sat in the table.
//
//   2. CONTACT ID MASQUERADING AS AN EVENT ID. Both writers stored
//      `twilio_sid = "ghl:" + contactId`. A contact id is stable across every
//      message that contact ever sends: 16 distinct inbound SMS on TEST share
//      `ghl:vdJZ4ZzqKMyY2JcfRNIg`. So there was NO per-event id, hence no
//      idempotency key, hence webhook replay duplicates and no possible
//      id-based reconciliation against GHL.
//      (`ghl-message-sync-webhook` already had this right for OUTBOUND. The
//      inbound writers were simply never brought in line.)
//
//   3. IDENTITY GUESSED FROM A FIRST MATCH. Both writers did
//         .ilike("phone", "%" + last10).limit(1)
//      which silently PICKS ONE when several customers share a number — and on
//      TEST +18323309603 belongs to four different customers. That is a guessed
//      identity written into the permanent record.
//
// This module fixes all three at the point of ingest and is the ONLY place the
// rules live, so the two webhooks cannot drift apart again.
//
// DIRECTION / LOOP PREVENTION
// ---------------------------
// Everything ingested here ARRIVED FROM GHL. GHL is therefore UPSTREAM for these
// events and already holds them. Rows are stamped `ghl_sync_state='ghl_origin'`
// so the reconciler can never push them back and create a sync loop.
//
// PRIVACY
// -------
// Nothing here logs a message body, an email body, a recording URL or a full
// phone number. `maskPhone` is used for every operator-facing log line.

import { normalizeE164 } from "./ghlSms.ts";

/** Last four digits only. Safe for logs and audit metadata. */
export function maskPhone(raw: string | null | undefined): string {
  const e164 = normalizeE164(raw);
  const s = e164 || String(raw ?? "");
  return s.length >= 4 ? `***${s.slice(-4)}` : "***";
}

/**
 * Pull the first present value at any of the given key paths.
 *
 * GHL's webhook payload shape varies by workflow version and by whether the
 * event came from a Conversations action or a custom-data automation, so every
 * field has to be probed at several paths rather than assumed.
 */
export function pick(obj: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    let cur: unknown = obj;
    for (const key of path) {
      if (cur && typeof cur === "object" && key in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[key];
      } else {
        cur = undefined;
        break;
      }
    }
    if (typeof cur === "string" && cur.trim()) return cur.trim();
    if (typeof cur === "number") return String(cur);
  }
  return null;
}

/**
 * The per-EVENT provider id, probed across every shape GHL is known to send.
 *
 * Deliberately does NOT fall back to `contactId`. A contact id is not an event
 * id, and pretending otherwise is defect #2 above: it produces a key that
 * collides across every message from the same person, which is worse than no
 * key at all because it looks like idempotency while providing none.
 */
export function extractProviderEventId(payload: unknown): string | null {
  return pick(payload, [
    ["messageId"], ["message_id"], ["message", "id"],
    ["callId"], ["call_id"], ["call", "id"],
    ["conversationMessageId"], ["id"],
    ["customData", "messageId"], ["customData", "callId"],
  ]);
}

/** GHL conversation id, when the payload carries one. Never invented. */
export function extractConversationId(payload: unknown): string | null {
  return pick(payload, [
    ["conversationId"], ["conversation_id"], ["conversation", "id"],
    ["customData", "conversationId"],
  ]);
}

export interface ResolvedIdentity {
  /** Set ONLY when exactly one customer could own this number. */
  orderId: string | null;
  confirmationId: string | null;
  /** How many distinct customers share this number. */
  candidateCount: number;
  /** 'linked' | 'ambiguous' | 'unknown' — mirrors admin_search_conversations. */
  state: "linked" | "ambiguous" | "unknown";
}

// Minimal structural type so this module does not depend on the supabase-js
// generic surface (the edge functions each construct their own client).
interface MinimalSupabase {
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any;
}

/**
 * Resolve an inbound phone number to an order — or refuse to.
 *
 * FAILS SAFE, in the priority order the Command Center spec requires:
 *   1. a UNIQUE complete-E.164 match against `orders.phone`  -> linked
 *   2. anything else                                          -> unknown
 * and, critically:
 *   a number reachable by MORE THAN ONE customer               -> ambiguous,
 *   and NO order is attached.
 *
 * The replaced `.limit(1)` behaviour attached the most recent of several
 * candidates, which is how a shared household or reused test number ends up
 * with one customer's name stamped on another customer's messages.
 *
 * NOTE the comparison is on NORMALISED values on BOTH sides. `orders.phone` is
 * itself a mix of formats on TEST (only 146 of 598 rows are stored E.164), so
 * comparing raw strings would miss most real matches.
 */
export async function resolveInboundIdentity(
  supabase: MinimalSupabase,
  rawPhone: string | null | undefined,
): Promise<ResolvedIdentity> {
  const e164 = normalizeE164(rawPhone);
  if (!e164) return { orderId: null, confirmationId: null, candidateCount: 0, state: "unknown" };

  // Suffix-match to gather CANDIDATES cheaply, then normalise in JS to decide.
  // A DB-side `pt_normalize_e164(phone) = $1` would be exact but cannot use the
  // existing index; this narrows first and is exact afterwards.
  const last10 = e164.slice(-10);
  const { data } = await supabase
    .from("orders")
    .select("id, confirmation_id, email, phone, created_at")
    .ilike("phone", `%${last10}`)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as Array<{
    id: string; confirmation_id: string; email: string | null; phone: string | null; created_at: string;
  }>;

  // Exact E.164 equality — the `ilike` above is only a prefilter and would also
  // match, say, a 12-digit number that merely ends with the same ten digits.
  const exact = rows.filter((r) => normalizeE164(r.phone) === e164);
  if (exact.length === 0) {
    return { orderId: null, confirmationId: null, candidateCount: 0, state: "unknown" };
  }

  // DISTINCT PERSON, not distinct order. Four orders from one email address is
  // one customer with a repeat purchase — that is linked, not ambiguous.
  const people = new Set(exact.map((r) => (r.email ?? "").trim().toLowerCase()).filter(Boolean));
  if (people.size > 1) {
    return { orderId: null, confirmationId: null, candidateCount: people.size, state: "ambiguous" };
  }

  return {
    orderId: exact[0].id,
    confirmationId: exact[0].confirmation_id,
    candidateCount: people.size || 1,
    state: "linked",
  };
}

/**
 * Build the shared column set for an inbound `communications` insert.
 *
 * `dedupe_key` rides the EXISTING unique partial index
 * `communications_dedupe_key_uniq`, so a replayed webhook is rejected by the
 * database rather than by a read-then-write race in application code.
 *
 * When the provider sends no event id there is nothing honest to deduplicate
 * on, so `dedupe_key` stays NULL and the row is allowed through — losing a real
 * customer message is worse than tolerating a rare duplicate, and the Admin UI
 * shows the missing-id state rather than hiding it.
 */
export function buildInboundColumns(opts: {
  type: "sms_inbound" | "call_inbound";
  rawPhone: string | null;
  ourNumber: string | null;
  providerEventId: string | null;
  conversationId: string | null;
  contactId: string | null;
}): Record<string, unknown> {
  const e164 = normalizeE164(opts.rawPhone);
  const keyPrefix = opts.type === "sms_inbound" ? "ghl-in" : "ghl-call-in";
  return {
    // NORMALISED. This is the single line that would have prevented all 570
    // unreachable "(832) ..." rows.
    phone_from: e164 || opts.rawPhone || null,
    phone_to: opts.ourNumber,
    provider_event_id: opts.providerEventId,
    ghl_conversation_id: opts.conversationId,
    // `pending`, NOT `ghl_origin`.
    //
    // A GHL webhook delivered this event, so it is tempting to conclude GHL
    // holds it. A read-only reconciliation against the GHL Conversations API on
    // 2026-08-15 disproved that. The +16202539921 inbound SMS arrived at
    // 20:00:43Z, when GHL had NO contact for that number (the contact was
    // created at 20:11:41Z by a later outbound call). GHL fired the automation
    // webhook — so PawTenant recorded the message — but never filed it in the
    // Conversations inbox. GHL conversation L8TogKM7D3n9NrqUGnDi contains three
    // messages, ALL OUTBOUND; the customer's message is simply not there.
    //
    // So inbound presence in GHL is UNKNOWN at ingest and is resolved by
    // reconciling on the provider event id. Marking it `ghl_origin` here would
    // permanently exclude exactly the events that are missing from GHL — the
    // ones this task exists to find.
    ghl_sync_state: "pending",
    // Contact id kept in its historical column for continuity with existing
    // rows, but it is NOT the idempotency key — see defect #2 above.
    twilio_sid: opts.contactId ? `ghl:${opts.contactId}` : null,
    dedupe_key: opts.providerEventId ? `${keyPrefix}:${opts.providerEventId}` : null,
    // NOTE — LIVE/TEST SCHEMA DIVERGENCE, deliberate.
    //
    // The TEST copy of this module also writes `source: "inbound_webhook"`.
    // `public.communications` on LIVE has 23 columns and NO `source` column
    // (TEST has 24); the LIVE `ghl-call-inbound` never wrote one either. Setting
    // it here would make EVERY inbound insert fail on LIVE with
    // `column "source" does not exist`, silently dropping real customer SMS and
    // call events.
    //
    // Adding the column to LIVE was rejected as out of scope: `source` carries
    // no Command Center behaviour, so omitting it preserves LIVE's existing
    // behaviour exactly, which is what this promotion is required to do.
  };
}

/** Postgres unique-violation — a replayed webhook, which is a SUCCESS case. */
export function isDuplicateInsert(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "23505" || (err.message ?? "").includes("duplicate key value");
}
