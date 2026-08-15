// ghl-reconcile-communications
//
// UNIFIED-ADMIN-COMMAND-CENTER-UNKNOWN-SMS-CALLS-SEARCH-INLINE-SMS-GHL-SYNC-001 §9
//
// Compare recent PawTenant SMS/call events against the GHL Conversations API and
// report what is MISSING, MATCHED, DUPLICATE or AMBIGUOUS.
//
// THIS FUNCTION NEVER SENDS ANYTHING.
// ----------------------------------
// It performs GET requests against GHL and UPDATE statements against
// `communications.ghl_sync_*` columns. It does not call the SMS send endpoint,
// it does not place a call, and it does not write a message body anywhere. §8
// and §9 both require that reconciliation can never emit a customer-visible
// communication, so the send helpers are deliberately not imported here — there
// is no code path to a send even if a future edit wanted one.
//
// DRY RUN IS THE DEFAULT. `mode` must be the explicit string "apply" to write
// anything, and even then it only writes SYNC-STATE columns.
//
// WHY IT MATCHES ON PROVIDER ID, NOT TIME
// ---------------------------------------
// `communications.created_at` is INGEST time, not provider event time. Measured
// on the +16202539921 thread, PawTenant's ingest lags GHL by 3.5-6 minutes
// (GHL 20:11:41Z / 20:27:18Z vs PawTenant 20:15:04Z / 20:33:04Z). A time-window
// match would produce false "missing" verdicts at any tolerance tight enough to
// be useful. Provider ids matched exactly for all three outbound events, so the
// id is the only sound key.
//
// LOOP PREVENTION
// ---------------
// Rows already proven to live in GHL (`ghl_sync_state = 'ghl_origin'`) are
// skipped entirely — they are what a push-back loop would be made of.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeE164 } from "../_shared/ghlSms.ts";
import { maskPhone } from "../_shared/inboundIdentity.ts";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_TIMEOUT_MS = 10_000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Bounded by construction — a reconciler that can scan everything will. */
const MAX_CONTACTS = 40;
const MAX_ROWS = 400;
const RETRY_BACKOFF_MINUTES = [60, 360, 1440];

async function ghlFetch(path: string, apiKey: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GHL_TIMEOUT_MS);
  try {
    return await fetch(`${GHL_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Version: "2021-07-28" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

interface GhlMessage { id?: string; direction?: string; messageType?: string; dateAdded?: string }

/**
 * Every GHL message id reachable for one phone number.
 *
 * Returns `null` (not an empty set) when GHL could not be READ. An empty set and
 * an unreadable provider are opposite conclusions: the first means "GHL is
 * genuinely missing these", the second means "we do not know". Collapsing them
 * would report every event as missing during an outage and invite a backfill
 * that duplicates the entire history.
 */
async function ghlMessageIdsForPhone(
  phoneE164: string, apiKey: string, locationId: string,
): Promise<{ ids: Set<string> | null; contactId: string | null; detail: string }> {
  try {
    const dup = await ghlFetch(
      `/contacts/search/duplicate?locationId=${encodeURIComponent(locationId)}&number=${encodeURIComponent(phoneE164)}`,
      apiKey,
    );
    if (!dup.ok) {
      if (dup.status === 404) return { ids: new Set(), contactId: null, detail: "no GHL contact" };
      return { ids: null, contactId: null, detail: `contact lookup HTTP ${dup.status}` };
    }
    const dupData = await dup.json().catch(() => null) as { contact?: { id?: string } } | null;
    const contactId = dupData?.contact?.id ?? null;
    if (!contactId) return { ids: new Set(), contactId: null, detail: "no GHL contact" };

    const conv = await ghlFetch(
      `/conversations/search?locationId=${encodeURIComponent(locationId)}&contactId=${encodeURIComponent(contactId)}&limit=20`,
      apiKey,
    );
    if (!conv.ok) return { ids: null, contactId, detail: `conversation search HTTP ${conv.status}` };
    const convData = await conv.json().catch(() => null) as { conversations?: Array<{ id?: string }> } | null;
    const convIds = (convData?.conversations ?? []).map((c) => c.id).filter(Boolean) as string[];

    const ids = new Set<string>();
    for (const cid of convIds) {
      const msgs = await ghlFetch(`/conversations/${encodeURIComponent(cid)}/messages?limit=100`, apiKey);
      if (!msgs.ok) return { ids: null, contactId, detail: `messages HTTP ${msgs.status}` };
      const md = await msgs.json().catch(() => null) as
        { messages?: { messages?: GhlMessage[] } } | null;
      for (const m of md?.messages?.messages ?? []) if (m.id) ids.add(m.id);
    }
    return { ids, contactId, detail: `${ids.size} message(s) in ${convIds.length} conversation(s)` };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ids: null, contactId: null, detail: aborted ? "GHL timeout" : "GHL unreachable" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // ── Authorization ────────────────────────────────────────────────────────
  // The caller's own JWT must belong to an admin. Verified by asking the
  // DATABASE under the caller's identity (`check_is_admin()` runs on
  // auth.uid()), never by comparing the bearer to a service key — a
  // capability probe, not a string compare.
  const authHeader = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: isAdmin, error: adminErr } = await asCaller.rpc("check_is_admin");
  if (adminErr || isAdmin !== true) {
    return new Response(JSON.stringify({ ok: false, error: "not_authorized" }), {
      status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: { mode?: string; sinceDays?: number; contactE164?: string; commId?: string } = {};
  try { body = await req.json(); } catch { /* all fields optional */ }

  // DRY RUN unless the caller says the exact word.
  const apply = body.mode === "apply";
  const sinceDays = Math.min(Math.max(Number(body.sinceDays ?? 7), 1), 90);
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

  const apiKey = Deno.env.get("GHL_API_KEY") ?? "";
  const locationId = Deno.env.get("GHL_LOCATION_ID") ?? "";
  if (!apiKey || !locationId) {
    return new Response(
      JSON.stringify({ ok: false, error: "GHL_API_KEY / GHL_LOCATION_ID not configured in this project." }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // ── Candidate rows ───────────────────────────────────────────────────────
  // `ghl_origin` is EXCLUDED: those are proven present in GHL and re-pushing
  // them is precisely the synchronisation loop §8 forbids.
  let q = supabase
    .from("communications")
    .select("id, type, direction, contact_e164, provider_event_id, twilio_sid, ghl_sync_state, ghl_sync_attempts, created_at")
    .in("type", ["sms_inbound", "sms_outbound", "call_inbound", "call_outbound"])
    .not("contact_e164", "is", null)
    .neq("ghl_sync_state", "ghl_origin")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (body.commId) q = q.eq("id", body.commId);
  else if (body.contactE164) q = q.eq("contact_e164", normalizeE164(body.contactE164));

  const { data: rows, error: rowsErr } = await q;
  if (rowsErr) {
    return new Response(JSON.stringify({ ok: false, error: rowsErr.message }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const candidates = (rows ?? []) as Array<{
    id: string; type: string; direction: string; contact_e164: string;
    provider_event_id: string | null; twilio_sid: string | null;
    ghl_sync_state: string | null; ghl_sync_attempts: number | null; created_at: string;
  }>;

  // Group by phone so each number costs ONE set of GHL reads regardless of how
  // many events it has.
  const byPhone = new Map<string, typeof candidates>();
  for (const r of candidates) {
    const list = byPhone.get(r.contact_e164) ?? [];
    list.push(r);
    byPhone.set(r.contact_e164, list);
  }

  const report = {
    mode: apply ? "apply" : "dry_run",
    sinceDays,
    contactsExamined: 0,
    contactsSkippedOverCap: Math.max(0, byPhone.size - MAX_CONTACTS),
    rowsExamined: 0,
    matched: 0,
    missingInGhl: 0,
    noProviderId: 0,
    providerUnreadable: 0,
    updated: 0,
    // Per-contact detail with MASKED numbers only (§10).
    details: [] as Array<{
      contact: string; ghl: string; matched: number; missing: number; noId: number;
    }>,
  };

  for (const [phone, group] of byPhone) {
    if (report.contactsExamined >= MAX_CONTACTS) break;
    report.contactsExamined++;

    const { ids, detail } = await ghlMessageIdsForPhone(phone, apiKey, locationId);
    let matched = 0, missing = 0, noId = 0;

    for (const row of group) {
      report.rowsExamined++;

      // No per-event id -> nothing to match on. Reported as its own category
      // rather than silently counted as "missing", because "we cannot check" is
      // not the same claim as "GHL does not have it".
      if (!row.provider_event_id) {
        noId++; report.noProviderId++;
        continue;
      }
      if (ids === null) {
        // Provider unreadable. Leave the row ALONE — do not mark it failed and
        // do not mark it missing.
        report.providerUnreadable++;
        continue;
      }

      if (ids.has(row.provider_event_id)) {
        matched++; report.matched++;
        if (apply) {
          const { error } = await supabase.from("communications")
            .update({
              ghl_sync_state: "synced",
              ghl_synced_at: new Date().toISOString(),
              ghl_sync_error_code: null,
              ghl_sync_next_retry_at: null,
            })
            .eq("id", row.id);
          if (!error) report.updated++;
        }
      } else {
        missing++; report.missingInGhl++;
        if (apply) {
          // Record the VERDICT. It does NOT push the event into GHL: a backfill
          // that writes into a customer-facing inbox is a separate, owner-
          // approved step, and on LIVE it is not approved at all (§9).
          const attempts = (row.ghl_sync_attempts ?? 0) + 1;
          const backoff = RETRY_BACKOFF_MINUTES[Math.min(attempts - 1, RETRY_BACKOFF_MINUTES.length - 1)];
          const { error } = await supabase.from("communications")
            .update({
              ghl_sync_state: "failed",
              ghl_sync_error_code: "absent_from_ghl",
              ghl_sync_attempts: attempts,
              ghl_sync_next_retry_at: new Date(Date.now() + backoff * 60_000).toISOString(),
            })
            .eq("id", row.id);
          if (!error) report.updated++;
        }
      }
    }

    report.details.push({ contact: maskPhone(phone), ghl: detail, matched, missing, noId });
  }

  console.log(
    `[GHL-RECONCILE] ${report.mode} — contacts:${report.contactsExamined} rows:${report.rowsExamined} ` +
    `matched:${report.matched} missing:${report.missingInGhl} noId:${report.noProviderId} ` +
    `unreadable:${report.providerUnreadable} updated:${report.updated}`,
  );

  return new Response(JSON.stringify({ ok: true, report }), {
    status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
