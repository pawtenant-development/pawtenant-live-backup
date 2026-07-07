// ghl-message-reconcile — capture GHL-app OUTBOUND SMS into LIVE communications.
//
// LIVE-GHL-OUTBOUND-CAPTURE-001 (2026-07-08): messages sent manually from the
// GHL app (and GHL-workflow auto-texts like the missed-call reply) never
// reached the admin comms history, because only PawTenant's own send path
// (ghl-send-sms) logs outbound rows. This scheduled reconciler pulls recent
// OUTBOUND SMS from the GHL Conversations export API and inserts any that are
// not already logged. CAPTURE ONLY — it never sends a message.
//
// Dedupe (no duplicate rows):
//   * ghl-send-sms already logs outbound as twilio_sid = "ghl:<messageId>",
//     and the GHL export returns that same <messageId> as `id` — verified —
//     so a pre-check on twilio_sid skips every already-logged send.
//   * Inserted rows carry dedupe_key = "ghl-out:<messageId>" under the partial
//     UNIQUE index communications_dedupe_key_uniq, so repeated runs are
//     idempotent even under concurrency (23505 is swallowed).
//   * A freshness floor (default 180s) skips brand-new messages so the
//     synchronous ghl-send-sms logging always wins the race for its own sends.
//
// Auth: service-role JWT only (pg_cron passes it). verify_jwt=true at the gate;
// this also re-checks the role claim so a mere anon JWT cannot invoke it.
//
// Scope: OUTBOUND SMS only. Inbound is already captured by ghl-sms-inbound;
// touching it here would risk duplicating that flow.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_LOCATION_ID = Deno.env.get("GHL_LOCATION_ID") ?? "";
const GHL_API_BASE = "https://services.leadconnectorhq.com";

// Defaults tuned for a 15-minute cron; overridable in the request body.
const DEFAULT_LOOKBACK_MINUTES = 30;
const DEFAULT_FRESHNESS_FLOOR_SECONDS = 180;
const DEFAULT_MAX_PAGES = 6;   // 6 × 100 = 600 messages/run ceiling
const PAGE_SIZE = 100;
const GHL_TIMEOUT_MS = 10000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Accept only a service_role JWT (cron / internal). Base64url-decode the
 *  payload and check the role claim; also accept an exact service-key match. */
function isServiceRole(authHeader: string): boolean {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (token === SUPABASE_SERVICE_ROLE_KEY) return true;
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const decoded = JSON.parse(atob(b64 + pad));
    return decoded?.role === "service_role";
  } catch {
    return false;
  }
}

function digits10(raw: string | null | undefined): string {
  return (raw || "").replace(/\D/g, "").slice(-10);
}

function normalizePhone(raw: string | null | undefined): string {
  let p = (raw || "").replace(/\D/g, "");
  if (p.length === 10) p = "1" + p;
  return p ? "+" + p : "";
}

async function ghlGet(path: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GHL_TIMEOUT_MS);
  try {
    return await fetch(`${GHL_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-04-15" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

interface GhlMessage {
  id?: string;
  direction?: string;
  status?: string;
  messageType?: string;
  type?: number;
  body?: string;
  from?: string;
  to?: string;
  dateAdded?: string;
  source?: string;
  contactId?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  if (!isServiceRole(req.headers.get("authorization") ?? "")) {
    return json({ ok: false, error: "Service role required" }, 401);
  }
  if (!GHL_API_KEY || !GHL_LOCATION_ID) {
    return json({ ok: false, error: "GHL_API_KEY / GHL_LOCATION_ID not configured" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true; // default false → cron inserts
    const lookbackMinutes = Number(body?.lookbackMinutes) > 0 ? Number(body.lookbackMinutes) : DEFAULT_LOOKBACK_MINUTES;
    const freshnessFloorSeconds = Number.isFinite(Number(body?.freshnessFloorSeconds))
      ? Number(body.freshnessFloorSeconds) : DEFAULT_FRESHNESS_FLOOR_SECONDS;
    const maxPages = Number(body?.maxPages) > 0 ? Math.min(Number(body.maxPages), 20) : DEFAULT_MAX_PAGES;

    const now = Date.now();
    const windowFloorMs = now - lookbackMinutes * 60_000;
    const freshnessCeilMs = now - freshnessFloorSeconds * 1000;

    // ── 1. Page GHL export (newest first), collecting outbound SMS in window ──
    const candidates: GhlMessage[] = [];
    let cursor: string | null = null;
    let pages = 0;
    let reachedOlderThanWindow = false;
    let ghlError: string | null = null;

    while (pages < maxPages && !reachedOlderThanWindow) {
      const params = new URLSearchParams({
        locationId: GHL_LOCATION_ID,
        channel: "SMS",
        sortBy: "createdAt",
        sortOrder: "desc",
        limit: String(PAGE_SIZE),
      });
      if (cursor) params.set("cursor", cursor);
      const res = await ghlGet(`/conversations/messages/export?${params.toString()}`);
      if (!res.ok) {
        ghlError = `GHL export HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
        break;
      }
      const data = await res.json().catch(() => null) as
        | { messages?: GhlMessage[]; nextCursor?: string | null } | null;
      const msgs = Array.isArray(data?.messages) ? data!.messages! : [];
      pages++;
      for (const m of msgs) {
        const addedMs = m.dateAdded ? Date.parse(m.dateAdded) : NaN;
        if (Number.isFinite(addedMs) && addedMs < windowFloorMs) { reachedOlderThanWindow = true; break; }
        const isSms = m.messageType === "TYPE_SMS" || m.type === 2;
        if (!isSms) continue;
        if ((m.direction ?? "").toLowerCase() !== "outbound") continue;
        if (Number.isFinite(addedMs) && addedMs > freshnessCeilMs) continue; // too fresh — let send-path log it
        if (!m.id || !m.body || !m.to) continue;
        candidates.push(m);
      }
      cursor = data?.nextCursor ?? null;
      if (!cursor || msgs.length === 0) break;
    }

    // ── 2. Dedupe against already-logged rows (twilio_sid = ghl:<id>) ────────
    const ids = [...new Set(candidates.map((m) => m.id!))];
    const alreadyLogged = new Set<string>();
    if (ids.length > 0) {
      const sids = ids.map((id) => `ghl:${id}`);
      const { data: existing } = await admin
        .from("communications")
        .select("twilio_sid")
        .in("twilio_sid", sids);
      for (const r of existing ?? []) {
        const sid = String((r as { twilio_sid: string }).twilio_sid ?? "");
        if (sid.startsWith("ghl:")) alreadyLogged.add(sid.slice(4));
      }
    }

    const toInsert = candidates.filter((m) => !alreadyLogged.has(m.id!));

    // ── 3. Order-link (by last-10 customer phone) + insert ───────────────────
    let inserted = 0;
    let duplicates = 0;
    const sample: Array<Record<string, unknown>> = [];

    for (const m of toInsert) {
      const customerPhone = normalizePhone(m.to);
      const last10 = digits10(customerPhone);
      let orderId: string | null = null;
      let confirmationId: string | null = null;
      if (last10) {
        const { data: orders } = await admin
          .from("orders")
          .select("id, confirmation_id")
          .ilike("phone", `%${last10}`)
          .limit(1);
        if (orders?.length) { orderId = orders[0].id; confirmationId = orders[0].confirmation_id; }
      }

      if (sample.length < 8) {
        sample.push({ id: m.id, to: customerPhone, source: m.source ?? null, order: confirmationId ?? orderId ?? null, body: String(m.body).slice(0, 60) });
      }
      if (dryRun) { inserted++; continue; }

      const { error } = await admin.from("communications").insert({
        order_id: orderId,
        confirmation_id: confirmationId,
        type: "sms_outbound",
        direction: "outbound",
        body: String(m.body).slice(0, 4000),
        phone_from: normalizePhone(m.from) || null,
        phone_to: customerPhone,
        status: (m.status ?? "sent"),
        sent_by: "GHL",
        twilio_sid: `ghl:${m.id}`,
        dedupe_key: `ghl-out:${m.id}`,
      });
      if (error) {
        if (String((error as { code?: string }).code) === "23505") { duplicates++; continue; }
        console.error("[ghl-message-reconcile] insert failed:", error.message);
        continue;
      }
      if (orderId) {
        await admin.from("orders").update({ last_contacted_at: new Date().toISOString() }).eq("id", orderId);
      }
      inserted++;
    }

    return json({
      ok: true,
      dry_run: dryRun,
      ghl_error: ghlError,
      pages_fetched: pages,
      lookback_minutes: lookbackMinutes,
      outbound_candidates: candidates.length,
      already_logged: candidates.length - toInsert.length,
      inserted: dryRun ? 0 : inserted,
      would_insert: dryRun ? inserted : undefined,
      duplicates_skipped: duplicates,
      sample,
    });
  } catch (e) {
    console.error("[ghl-message-reconcile] unhandled error:", e instanceof Error ? e.message : "unknown");
    return json({ ok: false, error: "Internal error" }, 500);
  }
});
