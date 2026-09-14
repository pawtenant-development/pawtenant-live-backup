// PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 — partner-portal document retrieval.
//
// A signed-in PARTNER USER fetches the approved clinical document for one of
// ITS OWN orders. The organisation is derived from the caller's session
// (partner_portal_context → current_partner_id()), never from the request
// body, and the order must belong to that organisation.
//
// The document itself is served the same way the partner API serves it:
// through handleDocumentRetrieval(), which mints (or reuses) an immutable
// partner_document_releases copy in the private `partner-documents` bucket and
// returns a SHORT-LIVED signed URL. No PawTenant customer-portal dependency, no
// verification artefacts, no provider identity, no economics.
//
// Auth: verify_jwt = true (the gateway requires a project JWT); the function
// then requires a REAL user session (the anon key and the service key are both
// refused) whose partner membership is active.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleDocumentRetrieval } from "../partner-orders-v1/document.ts";
import type { PartnerIdentity } from "../_shared/partnerApi.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) return json(500, { ok: false, error: "not_configured" });

  const requestId = crypto.randomUUID();

  // 1. A real user session — never the anon key, never the service key.
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer || bearer === SERVICE_ROLE_KEY || bearer === ANON_KEY) {
    return json(401, { ok: false, error: "partner_sign_in_required" });
  }

  // 2. The partner is whatever the SESSION says it is (current_partner_id()).
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: ctx, error: ctxErr } = await asCaller.rpc("partner_portal_context");
  const partnerId = (ctx as { partner_id?: string } | null)?.partner_id ?? null;
  if (ctxErr || !partnerId) return json(403, { ok: false, error: "no_partner_access" });

  let body: { order_id?: string };
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "bad_request" }); }
  const orderId = (body.order_id ?? "").trim();
  if (!UUID_RE.test(orderId)) return json(400, { ok: false, error: "order_id_required" });

  // 3. The order must belong to THIS partner. Any other order — direct, or
  //    another partner's — is "not found", never "forbidden" (no enumeration).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: order } = await admin
    .from("orders")
    .select("id, partner_id, partner_order_id, order_origin")
    .eq("id", orderId)
    .eq("order_origin", "partner")
    .eq("partner_id", partnerId)
    .maybeSingle();
  const partnerOrderId = (order as { partner_order_id?: string | null } | null)?.partner_order_id ?? null;
  if (!order || !partnerOrderId) return json(404, { ok: false, error: "order_not_found" });

  const { data: org } = await admin
    .from("partner_organizations")
    .select("slug, status, production_enabled")
    .eq("id", partnerId)
    .maybeSingle();
  const identity: PartnerIdentity = {
    partnerId,
    partnerSlug: (org as { slug?: string } | null)?.slug ?? "partner",
    partnerStatus: (org as { status?: string } | null)?.status ?? "sandbox",
    productionEnabled: Boolean((org as { production_enabled?: boolean } | null)?.production_enabled),
    scopes: ["documents:read"],
    rateLimitPerMinute: 0,
    maxPayloadBytes: 0,
    credentialId: "partner-portal-session",
    environment: (org as { production_enabled?: boolean } | null)?.production_enabled ? "production" : "sandbox",
  };

  // 4. Audit rows carry ids and outcomes only.
  const audit = async (opts: {
    partnerId?: string | null; partnerSlug?: string | null; partnerOrderId?: string | null;
    orderId?: string | null; action: string; outcome: string; requestId: string;
    metadata?: Record<string, unknown>;
  }) => {
    await admin.from("audit_logs").insert({
      actor_type: "partner_user", actor_name: "partner-portal", actor_role: "partner",
      object_type: "partner_platform", object_id: opts.orderId ?? opts.partnerOrderId ?? null,
      action: `partner_portal_${opts.action}`, entity_type: "order", entity_id: opts.orderId ?? null,
      order_id: opts.orderId ?? null, category: "partner_platform", source: "partner-portal-document",
      metadata: { partner_id: opts.partnerId ?? null, outcome: opts.outcome, request_id: opts.requestId, ...(opts.metadata ?? {}) },
    }).then(() => {}, () => {});
  };

  const res = await handleDocumentRetrieval(admin, identity, partnerOrderId, requestId, audit);
  // handleDocumentRetrieval answers in the partner API's envelope; forward it
  // with the portal's CORS headers.
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});
