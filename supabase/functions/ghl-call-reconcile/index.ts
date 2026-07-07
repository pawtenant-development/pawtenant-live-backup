// ghl-call-reconcile — capture GHL OUTBOUND calls into LIVE communications.
//
// GHL-CALL-CAPTURE-AND-RECONCILE-CADENCE-001 (2026-07-08): staff calls placed
// from the GHL app never appeared in PawTenant admin communications — only
// inbound calls were logged (by the ghl-call-inbound workflow, sparse + keyed
// weakly by contactId). This scheduled reconciler pulls recent OUTBOUND calls
// from the GHL Conversations export API (channel=Call) and inserts any not
// already logged. CAPTURE ONLY — it never places or sends anything.
//
// Scope = OUTBOUND calls only. Inbound calls are already captured by
// ghl-call-inbound; capturing them here (keyed by call id) would duplicate
// those existing unkeyed rows. Outbound is a clean gap (0 call_outbound rows
// exist today), so there is zero duplication risk.
//
// Dedupe (no duplicate rows):
//   * twilio_sid = "ghl:<callMessageId>" pre-check (same id the export returns),
//   * dedupe_key = "ghl-call:<callMessageId>" under the partial UNIQUE index
//     communications_dedupe_key_uniq → idempotent across overlapping runs.
//   * Freshness floor on dateUpdated (call settled) so an in-progress call is
//     only captured once it has ended and its final duration is known.
//
// Auth: service-role JWT only (pg_cron passes it). verify_jwt=true at the gate;
// re-checks the role claim so a plain anon JWT cannot invoke it.
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

const DEFAULT_LOOKBACK_MINUTES = 45;
const DEFAULT_FRESHNESS_FLOOR_SECONDS = 120; // let a call settle → final duration
const DEFAULT_MAX_PAGES = 6;
const PAGE_SIZE = 100;
const GHL_TIMEOUT_MS = 12000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function isServiceRole(authHeader: string): boolean {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (token === SUPABASE_SERVICE_ROLE_KEY) return true;
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    return JSON.parse(atob(b64 + pad))?.role === "service_role";
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
function fmtDuration(sec: number | null): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
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

interface GhlCall {
  id?: string;
  direction?: string;
  status?: string;
  messageType?: string;
  type?: number;
  from?: string;
  to?: string;
  dateAdded?: string;
  dateUpdated?: string;
  attachments?: string[];
  meta?: { call?: { duration?: number | null; status?: string | null } };
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
    const dryRun = body?.dryRun === true;
    const lookbackMinutes = Number(body?.lookbackMinutes) > 0 ? Number(body.lookbackMinutes) : DEFAULT_LOOKBACK_MINUTES;
    const freshnessFloorSeconds = Number.isFinite(Number(body?.freshnessFloorSeconds))
      ? Number(body.freshnessFloorSeconds) : DEFAULT_FRESHNESS_FLOOR_SECONDS;
    const maxPages = Number(body?.maxPages) > 0 ? Math.min(Number(body.maxPages), 20) : DEFAULT_MAX_PAGES;

    const now = Date.now();
    const windowFloorMs = now - lookbackMinutes * 60_000;
    const freshnessCeilMs = now - freshnessFloorSeconds * 1000;

    // ── 1. Page GHL call export (newest first), collect OUTBOUND, in window ──
    const candidates: GhlCall[] = [];
    let cursor: string | null = null;
    let pages = 0;
    let reachedOlderThanWindow = false;
    let ghlError: string | null = null;

    while (pages < maxPages && !reachedOlderThanWindow) {
      const params = new URLSearchParams({
        locationId: GHL_LOCATION_ID,
        channel: "Call",
        sortBy: "createdAt",
        sortOrder: "desc",
        limit: String(PAGE_SIZE),
      });
      if (cursor) params.set("cursor", cursor);
      const res = await ghlGet(`/conversations/messages/export?${params.toString()}`);
      if (!res.ok) {
        ghlError = `GHL call export HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
        break;
      }
      const data = await res.json().catch(() => null) as
        | { messages?: GhlCall[]; nextCursor?: string | null } | null;
      const msgs = Array.isArray(data?.messages) ? data!.messages! : [];
      pages++;
      for (const m of msgs) {
        const addedMs = m.dateAdded ? Date.parse(m.dateAdded) : NaN;
        if (Number.isFinite(addedMs) && addedMs < windowFloorMs) { reachedOlderThanWindow = true; break; }
        const isCall = m.messageType === "TYPE_CALL" || m.type === 1;
        if (!isCall) continue;
        if ((m.direction ?? "").toLowerCase() !== "outbound") continue;
        // Freshness: gate on the call's last update (when it settled/ended).
        const updatedMs = m.dateUpdated ? Date.parse(m.dateUpdated) : addedMs;
        if (Number.isFinite(updatedMs) && updatedMs > freshnessCeilMs) continue;
        if (!m.id || !m.to) continue;
        candidates.push(m);
      }
      cursor = data?.nextCursor ?? null;
      if (!cursor || msgs.length === 0) break;
    }

    // ── 2. Dedupe against already-logged rows (twilio_sid = ghl:<id>) ────────
    const ids = [...new Set(candidates.map((m) => m.id!))];
    const alreadyLogged = new Set<string>();
    if (ids.length > 0) {
      const { data: existing } = await admin
        .from("communications")
        .select("twilio_sid")
        .in("twilio_sid", ids.map((id) => `ghl:${id}`));
      for (const r of existing ?? []) {
        const sid = String((r as { twilio_sid: string }).twilio_sid ?? "");
        if (sid.startsWith("ghl:")) alreadyLogged.add(sid.slice(4));
      }
    }
    const toInsert = candidates.filter((m) => !alreadyLogged.has(m.id!));

    // ── 3. Order-link (by last-10 customer phone = the call's `to`) + insert ─
    let inserted = 0;
    let duplicates = 0;
    const sample: Array<Record<string, unknown>> = [];

    for (const m of toInsert) {
      const customerPhone = normalizePhone(m.to);   // outbound → customer is `to`
      const fromPhone = normalizePhone(m.from);
      const last10 = digits10(customerPhone);
      const durationSec = m.meta?.call?.duration ?? null;
      const status = String(m.meta?.call?.status ?? m.status ?? "completed");
      const recording = Array.isArray(m.attachments)
        ? (m.attachments.find((a) => typeof a === "string" && a.startsWith("http")) ?? null)
        : null;
      const durTxt = fmtDuration(typeof durationSec === "number" ? durationSec : null);
      const callBody = `Outbound call${durTxt ? ` — ${durTxt}` : ""} · ${status}`;

      let orderId: string | null = null;
      let confirmationId: string | null = null;
      if (last10) {
        const { data: orders } = await admin
          .from("orders").select("id, confirmation_id").ilike("phone", `%${last10}`).limit(1);
        if (orders?.length) { orderId = orders[0].id; confirmationId = orders[0].confirmation_id; }
      }

      if (sample.length < 8) {
        sample.push({ id: m.id, to: customerPhone, duration: durationSec, status, order: confirmationId ?? orderId ?? null });
      }
      if (dryRun) { inserted++; continue; }

      const { error } = await admin.from("communications").insert({
        order_id: orderId,
        confirmation_id: confirmationId,
        type: "call_outbound",
        direction: "outbound",
        body: callBody,
        phone_from: fromPhone || null,
        phone_to: customerPhone,
        duration_seconds: typeof durationSec === "number" && durationSec > 0 ? durationSec : null,
        status,
        recording_url: recording,
        sent_by: "GHL",
        twilio_sid: `ghl:${m.id}`,
        dedupe_key: `ghl-call:${m.id}`,
      });
      if (error) {
        if (String((error as { code?: string }).code) === "23505") { duplicates++; continue; }
        console.error("[ghl-call-reconcile] insert failed:", error.message);
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
      outbound_call_candidates: candidates.length,
      already_logged: candidates.length - toInsert.length,
      inserted: dryRun ? 0 : inserted,
      would_insert: dryRun ? inserted : undefined,
      duplicates_skipped: duplicates,
      sample,
    });
  } catch (e) {
    console.error("[ghl-call-reconcile] unhandled error:", e instanceof Error ? e.message : "unknown");
    return json({ ok: false, error: "Internal error" }, 500);
  }
});
