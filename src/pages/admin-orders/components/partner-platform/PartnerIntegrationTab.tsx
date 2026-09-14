// PartnerIntegrationTab — PARTNER-PLATFORM-ADMIN-WORKSPACE-001.
//
// The Integration sub-tab: everything an operator needs to see and explain
// the partner API integration. This is the Slice 8 integration surface
// (formerly the PartnerIntegrationPanel accordion) reorganized into a
// first-class screen, plus:
//   * the sandbox API base URL / version / endpoints / scopes reference;
//   * the recent partner API request ledger (via the admin-gated safe
//     projection partner_admin_list_api_requests — outcome and reference
//     codes only, never payloads);
//   * copyable integration examples built EXCLUSIVELY from fake placeholder
//     credentials (pk_sandbox_EXAMPLE… / sk_sandbox_EXAMPLE…) — no real
//     credential, signing secret, customer identity or PHI can appear here.
//
// Existing operational actions are unchanged: Retry re-drives an existing
// delivery (the RPC is structurally unable to create a second logical event)
// and Dispatch-now pumps the queue through the dispatcher edge function.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import {
  type PartnerOrg, partnerApiBaseUrl, PARTNER_API_VERSION, PARTNER_API_SCOPES,
  Badge, CopyButton, EmptyState, Notice, Section,
} from "./shared";

interface PartnerOrderRow {
  id: string;
  confirmation_id: string;
  partner_id: string | null;
  partner_order_id: string | null;
  letter_type: string | null;
}

interface ApprovedDocRow { id: string; order_id: string }

interface ReleaseRow {
  id: string;
  order_id: string;
  source_document_id: string;
  file_sha256: string;
  created_at: string;
}

interface SnapshotRow {
  id: string;
  order_id: string;
  revision: number;
  revision_reason: string | null;
  prior_snapshot_id: string | null;
  accepted_at: string;
}

interface EndpointRow {
  id: string;
  partner_id: string;
  environment: string;
  url: string;
  description: string | null;
  active: boolean;
  event_types: string[];
}

interface EventRow {
  id: string;
  partner_id: string;
  event_type: string;
  partner_order_id: string | null;
  occurred_at: string;
}

interface DeliveryRow {
  id: string;
  event_id: string;
  endpoint_id: string;
  status: string;
  attempt_count: number;
  next_attempt_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  succeeded_at: string | null;
}

interface AttemptRow {
  id: string;
  delivery_id: string;
  attempt_number: number;
  requested_at: string;
  ok: boolean;
  status_code: number | null;
  error: string | null;
}

interface ApiRequestRow {
  created_at: string;
  outcome: string;
  response_code: string | null;
  http_status: number | null;
  partner_order_id: string | null;
  key_id: string | null;
}

const DELIVERY_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  delivering: "bg-blue-50 text-blue-700 ring-blue-200",
  succeeded: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed_terminal: "bg-red-50 text-red-700 ring-red-200",
};

const SUPPORTED_ENDPOINTS = [
  { method: "POST", path: "/orders", scope: "orders:create", what: "Submit a paid ESA or PSD order" },
  { method: "GET", path: "/orders/{partner_order_id}", scope: "orders:read", what: "Retrieve order status" },
  { method: "GET", path: "/orders/{partner_order_id}/document", scope: "documents:read", what: "Retrieve the approved document (short-lived signed URL)" },
  { method: "POST", path: "/orders/{partner_order_id}/revisions", scope: "orders:create", what: "Submit a complete assessment revision (PSD, pre-assignment)" },
];

/** Copyable example block. Placeholders only — never a real value. */
function CodeExample({ title, code }: { title: string; code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold text-gray-800">{title}</span>
        <span className="text-gray-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 p-3">
          <div className="mb-2 flex justify-end"><CopyButton value={code} /></div>
          <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-[11px] leading-relaxed text-gray-100">{code}</pre>
        </div>
      )}
    </div>
  );
}

export default function PartnerIntegrationTab({
  partners, selected,
}: {
  partners: PartnerOrg[];
  selected: PartnerOrg | null;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [orders, setOrders] = useState<PartnerOrderRow[]>([]);
  const [approvedDocs, setApprovedDocs] = useState<ApprovedDocRow[]>([]);
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [apiRequests, setApiRequests] = useState<ApiRequestRow[]>([]);
  const [expandedDelivery, setExpandedDelivery] = useState<string | null>(null);

  const load = useCallback(async (partnerId: string | null) => {
    setLoading(true);
    setError("");
    try {
      const ordersRes = await supabase
        .from("orders")
        .select("id, confirmation_id, partner_id, partner_order_id, letter_type")
        .eq("order_origin", "partner")
        .order("created_at", { ascending: false })
        .limit(300);
      if (ordersRes.error) throw ordersRes.error;
      const orderRows = (ordersRes.data as PartnerOrderRow[]) ?? [];
      const orderIds = orderRows.map((o) => o.id);

      const [docsRes, relRes, snapRes, epRes, evRes, delRes, attRes, reqRes] = await Promise.all([
        orderIds.length
          ? supabase.from("order_documents")
              .select("id, order_id")
              .in("order_id", orderIds)
              .in("doc_type", ["esa_letter", "psd_letter"])
              .eq("review_status", "approved")
              .eq("customer_visible", true)
              .is("superseded_by_document_id", null)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("partner_document_releases")
          .select("id, order_id, source_document_id, file_sha256, created_at")
          .order("created_at", { ascending: false }).limit(500),
        supabase.from("partner_assessment_snapshots")
          .select("id, order_id, revision, revision_reason, prior_snapshot_id, accepted_at")
          .order("accepted_at", { ascending: false }).limit(1000),
        supabase.from("partner_webhook_endpoints")
          .select("id, partner_id, environment, url, description, active, event_types")
          .order("created_at", { ascending: false }).limit(200),
        supabase.from("partner_webhook_events")
          .select("id, partner_id, event_type, partner_order_id, occurred_at")
          .order("occurred_at", { ascending: false }).limit(300),
        supabase.from("partner_webhook_deliveries")
          .select("id, event_id, endpoint_id, status, attempt_count, next_attempt_at, last_status_code, last_error, succeeded_at")
          .order("created_at", { ascending: false }).limit(500),
        supabase.from("partner_webhook_delivery_attempts")
          .select("id, delivery_id, attempt_number, requested_at, ok, status_code, error")
          .order("requested_at", { ascending: false }).limit(1000),
        partnerId
          ? supabase.rpc("partner_admin_list_api_requests", { p_partner_id: partnerId, p_limit: 50 })
          : Promise.resolve({ data: [], error: null }),
      ]);
      const firstErr = [docsRes, relRes, snapRes, epRes, evRes, delRes, attRes, reqRes].find((r) => r.error)?.error;
      if (firstErr) throw firstErr;

      setOrders(orderRows);
      setApprovedDocs((docsRes.data as ApprovedDocRow[]) ?? []);
      setReleases((relRes.data as ReleaseRow[]) ?? []);
      setSnapshots((snapRes.data as SnapshotRow[]) ?? []);
      setEndpoints((epRes.data as EndpointRow[]) ?? []);
      setEvents((evRes.data as EventRow[]) ?? []);
      setDeliveries((delRes.data as DeliveryRow[]) ?? []);
      setAttempts((attRes.data as AttemptRow[]) ?? []);
      setApiRequests((reqRes.data as ApiRequestRow[]) ?? []);
    } catch (err) {
      console.error("[partner-integration] load failed:", err);
      setError("Could not load partner integration data (admin access required).");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(selected?.id ?? null); }, [selected, load]);

  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const approvedByOrder = useMemo(() => {
    const m = new Map<string, ApprovedDocRow>();
    approvedDocs.forEach((d) => { if (!m.has(d.order_id)) m.set(d.order_id, d); });
    return m;
  }, [approvedDocs]);
  const releaseBySourceDoc = useMemo(
    () => new Map(releases.map((r) => [r.source_document_id, r])),
    [releases],
  );
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const endpointById = useMemo(() => new Map(endpoints.map((e) => [e.id, e])), [endpoints]);
  const attemptsByDelivery = useMemo(() => {
    const m = new Map<string, AttemptRow[]>();
    attempts.forEach((a) => {
      const list = m.get(a.delivery_id) ?? [];
      list.push(a);
      m.set(a.delivery_id, list);
    });
    m.forEach((list) => list.sort((a, b) => a.attempt_number - b.attempt_number));
    return m;
  }, [attempts]);
  const snapshotsByOrder = useMemo(() => {
    const m = new Map<string, SnapshotRow[]>();
    snapshots.forEach((s) => {
      const list = m.get(s.order_id) ?? [];
      list.push(s);
      m.set(s.order_id, list);
    });
    m.forEach((list) => list.sort((a, b) => b.revision - a.revision));
    return m;
  }, [snapshots]);
  const partnerName = useCallback(
    (id: string | null) => partners.find((p) => p.id === id)?.display_name ?? "Partner",
    [partners],
  );

  /** Truthful per-order document state. */
  const documentState = useCallback((o: PartnerOrderRow): { label: string; tone: string } => {
    const doc = approvedByOrder.get(o.id);
    if (!doc) return { label: "Not ready — no approved letter", tone: "text-gray-500" };
    const release = releaseBySourceDoc.get(doc.id);
    if (release) return { label: `Released · sha ${release.file_sha256.slice(0, 10)}…`, tone: "text-emerald-700" };
    return { label: "Ready — release mints on first partner fetch", tone: "text-blue-700" };
  }, [approvedByOrder, releaseBySourceDoc]);

  const retryDelivery = async (d: DeliveryRow) => {
    setBusy(d.id);
    setNotice("");
    setError("");
    try {
      const { error: err } = await supabase.rpc("partner_webhook_retry_delivery", { p_delivery_id: d.id });
      if (err) setError(`Retry failed: ${err.message}`);
      else { setNotice("Delivery re-queued (same event — no duplicate is possible)."); await load(selected?.id ?? null); }
    } finally {
      setBusy(null);
    }
  };

  const dispatchNow = async () => {
    setBusy("dispatch");
    setNotice("");
    setError("");
    try {
      const { data, error: err } = await supabase.functions.invoke("partner-webhook-dispatch", { body: {} });
      if (err) setError(`Dispatch failed: ${err.message}`);
      else {
        const d = data as { claimed?: number; delivered?: number; failed?: number; refused?: number };
        setNotice(`Dispatch run: ${d.claimed ?? 0} claimed, ${d.delivered ?? 0} delivered, ${d.failed ?? 0} failed, ${d.refused ?? 0} refused.`);
        await load(selected?.id ?? null);
      }
    } finally {
      setBusy(null);
    }
  };

  const baseUrl = partnerApiBaseUrl();

  // ── Copyable examples. FAKE placeholders only. ─────────────────────────────
  const authExample = `# Authentication — every request carries the key pair
curl -s "${baseUrl}/orders/EX-1001" \\
  -H "x-partner-key-id: pk_sandbox_EXAMPLEKEYID0000" \\
  -H "x-partner-secret: sk_sandbox_EXAMPLESECRETxxxxxxxxxxxxxxxxxxxxEXAMPLE"`;

  const createEsaExample = `# Create an ESA order (scope: orders:create)
curl -s -X POST "${baseUrl}/orders" \\
  -H "x-partner-key-id: pk_sandbox_EXAMPLEKEYID0000" \\
  -H "x-partner-secret: sk_sandbox_EXAMPLESECRETxxxxxxxxxxxxxxxxxxxxEXAMPLE" \\
  -H "content-type: application/json" \\
  -d '{
    "schema_version": "partner.order.v1",
    "partner_order_id": "EX-1001",
    "service": "esa",
    "customer": { "first_name": "Jane", "last_name": "Placeholder",
                  "email": "customer@example.com", "state": "TX" },
    "pets": [{ "name": "Buddy", "type": "dog" }],
    "assessment": { "...": "see the integration guide for the full contract" },
    "consent": { "telehealth": true, "collected_at": "2026-01-01T00:00:00Z" }
  }'`;

  const createPsdExample = `# Create a PSD order (scope: orders:create)
# PSD uses the canonical partner.assessment.psd.v1 contract:
# 16 required + 5 optional question ids, catalog values only.
curl -s -X POST "${baseUrl}/orders" \\
  -H "x-partner-key-id: pk_sandbox_EXAMPLEKEYID0000" \\
  -H "x-partner-secret: sk_sandbox_EXAMPLESECRETxxxxxxxxxxxxxxxxxxxxEXAMPLE" \\
  -H "content-type: application/json" \\
  -d '{
    "schema_version": "partner.order.v1",
    "partner_order_id": "EX-2001",
    "service": "psd",
    "assessment_version": "partner.assessment.psd.v1",
    "customer": { "...": "as above" },
    "assessment": { "...": "the 16 required psd ids — see docs/partner-api" }
  }'`;

  const statusExample = `# Retrieve order status (scope: orders:read)
curl -s "${baseUrl}/orders/EX-1001" \\
  -H "x-partner-key-id: pk_sandbox_EXAMPLEKEYID0000" \\
  -H "x-partner-secret: sk_sandbox_EXAMPLESECRETxxxxxxxxxxxxxxxxxxxxEXAMPLE"`;

  const documentExample = `# Retrieve the approved document (scope: documents:read)
# Responds with a short-lived signed URL for the partner-safe release.
curl -s "${baseUrl}/orders/EX-1001/document" \\
  -H "x-partner-key-id: pk_sandbox_EXAMPLEKEYID0000" \\
  -H "x-partner-secret: sk_sandbox_EXAMPLESECRETxxxxxxxxxxxxxxxxxxxxEXAMPLE"`;

  const revisionExample = `# Submit an assessment revision (PSD, before provider assignment)
curl -s -X POST "${baseUrl}/orders/EX-2001/revisions" \\
  -H "x-partner-key-id: pk_sandbox_EXAMPLEKEYID0000" \\
  -H "x-partner-secret: sk_sandbox_EXAMPLESECRETxxxxxxxxxxxxxxxxxxxxEXAMPLE" \\
  -H "content-type: application/json" \\
  -d '{ "schema_version": "partner.assessment.psd.v1",
        "reason": "customer corrected an answer",
        "assessment": { "...": "the COMPLETE canonical payload, re-stated" } }'`;

  const signatureExample = `// Verify a webhook signature (Node.js)
// Header: x-pawtenant-signature: v1=<hex>
// Scheme: hex(HMAC_SHA256(signing_secret, timestamp + "." + rawBody))
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody, headers, signingSecret) {
  const ts = headers["x-pawtenant-timestamp"];
  const sig = (headers["x-pawtenant-signature"] || "").replace(/^v1=/, "");
  // Reject stale timestamps (replay window, e.g. 5 minutes)
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = createHmac("sha256", signingSecret)
    .update(ts + "." + rawBody).digest("hex");
  return sig.length === expected.length &&
    timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
// signingSecret is the whsec_… value shown ONCE when the endpoint was
// registered (or last rotated). Store it server-side only.`;

  return (
    <div className="space-y-4">
      <Notice notice={notice} error={error} />
      {loading && <p className="text-sm text-gray-500">Loading integration data…</p>}

      {/* ── API reference cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 lg:col-span-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Sandbox API base URL</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-800">{baseUrl}</code>
            <CopyButton value={baseUrl} />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            API version <strong>{PARTNER_API_VERSION}</strong> · environment <strong>Sandbox</strong> ·
            authentication via <code className="font-mono">x-partner-key-id</code> + <code className="font-mono">x-partner-secret</code> headers.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Supported scopes</p>
          <ul className="mt-1 space-y-1">
            {PARTNER_API_SCOPES.map((s) => (
              <li key={s.value} className="text-xs text-gray-600">
                <code className="font-mono text-[11px] text-gray-800">{s.value}</code>
                <span className="ml-1">{s.label.split("— ")[1]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Section title="Supported endpoints" subtitle="The complete partner API surface — anything else responds 404.">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3">Method</th>
                <th className="py-2 pr-3">Path</th>
                <th className="py-2 pr-3">Scope</th>
                <th className="py-2 pr-3">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {SUPPORTED_ENDPOINTS.map((e) => (
                <tr key={e.method + e.path} className="border-b border-gray-100">
                  <td className="py-2 pr-3"><span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold">{e.method}</span></td>
                  <td className="py-2 pr-3 font-mono text-xs">{e.path}</td>
                  <td className="py-2 pr-3 font-mono text-[11px] text-gray-600">{e.scope}</td>
                  <td className="py-2 pr-3 text-xs text-gray-600">{e.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Recent API requests (safe projection) ─────────────────────────── */}
      <Section
        title={`Recent API requests — ${selected?.display_name ?? "no partner selected"}`}
        subtitle="Outcome ledger from the private request log. Reference codes only — request bodies are never stored here."
      >
        {apiRequests.length === 0 ? (
          <EmptyState title="No API requests yet" hint="Rows appear when the partner calls the sandbox API." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Outcome</th>
                  <th className="py-2 pr-3">Response code</th>
                  <th className="py-2 pr-3">HTTP</th>
                  <th className="py-2 pr-3">Partner ref</th>
                  <th className="py-2 pr-3">Key</th>
                </tr>
              </thead>
              <tbody>
                {apiRequests.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 pr-3 text-xs">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-3">
                      <Badge
                        label={r.outcome}
                        tone={r.outcome.includes("accepted")
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-amber-50 text-amber-800 ring-amber-200"}
                      />
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.response_code ?? "—"}</td>
                    <td className="py-2 pr-3 tabular-nums text-xs">{r.http_status ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.partner_order_id ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-[11px] text-gray-500">{r.key_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Document retrieval state ──────────────────────────────────────── */}
      <Section
        title="Partner document retrieval state"
        subtitle="Not ready → ready (release mints on first partner fetch) → released."
      >
        {orders.length === 0 ? (
          <EmptyState title="No partner orders" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 pr-3">Partner ref</th>
                  <th className="py-2 pr-3">Service</th>
                  <th className="py-2 pr-3">Document state</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const st = documentState(o);
                  return (
                    <tr key={o.id} className="border-b border-gray-100">
                      <td className="py-2 pr-3 font-mono text-xs">{o.confirmation_id}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{o.partner_order_id ?? "—"}</td>
                      <td className="py-2 pr-3 uppercase">{o.letter_type ?? "—"}</td>
                      <td className={`py-2 pr-3 ${st.tone}`}>{st.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Webhooks ──────────────────────────────────────────────────────── */}
      <Section
        title="Webhook endpoints, events & deliveries"
        subtitle="Immutable outbox → signed delivery → append-only attempt history. Manage endpoints under Settings → Webhooks."
        actions={
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void dispatchNow()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Dispatch queued deliveries now
          </button>
        }
      >
        {endpoints.length === 0 ? (
          <p className="mb-3 text-sm text-gray-500">No webhook endpoints registered.</p>
        ) : (
          <ul className="mb-3 space-y-1">
            {endpoints.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
                <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${e.active ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-gray-100 text-gray-500 ring-gray-300"}`}>
                  {e.active ? "active" : "disabled"}
                </span>
                <span className="font-medium">{partnerName(e.partner_id)}</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 uppercase">{e.environment}</span>
                {e.description && <span className="text-gray-500">{e.description}</span>}
                <span className="break-all font-mono text-[11px] text-gray-500">{e.url}</span>
                <span className="text-gray-400">
                  {e.event_types.length === 0 ? "all events" : e.event_types.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3">Event</th>
                <th className="py-2 pr-3">Partner ref</th>
                <th className="py-2 pr-3">Occurred</th>
                <th className="py-2 pr-3">Delivery</th>
                <th className="py-2 pr-3">Attempts</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.length === 0 && (
                <tr><td colSpan={6} className="py-3 text-gray-500">No webhook deliveries yet.</td></tr>
              )}
              {deliveries.map((d) => {
                const ev = eventById.get(d.event_id);
                const ep = endpointById.get(d.endpoint_id);
                const history = attemptsByDelivery.get(d.id) ?? [];
                const expanded = expandedDelivery === d.id;
                return (
                  <Fragment key={d.id}>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 pr-3">
                        <span className="font-mono text-xs">{ev?.event_type ?? "…"}</span>
                        {ep && !ep.active && (
                          <span className="ml-1 text-[10px] text-gray-400">(endpoint disabled)</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{ev?.partner_order_id ?? "—"}</td>
                      <td className="py-2 pr-3 text-xs">
                        {ev ? new Date(ev.occurred_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${DELIVERY_TONE[d.status] ?? ""}`}>
                          {d.status}
                        </span>
                        {d.last_status_code !== null && (
                          <span className="ml-1 text-[10px] tabular-nums text-gray-400">HTTP {d.last_status_code}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          onClick={() => setExpandedDelivery(expanded ? null : d.id)}
                          className="text-xs text-indigo-600 underline-offset-2 hover:underline"
                        >
                          {d.attempt_count} attempt{d.attempt_count === 1 ? "" : "s"} {expanded ? "▾" : "▸"}
                        </button>
                      </td>
                      <td className="py-2 pr-3">
                        {(d.status === "failed_terminal" || d.status === "pending") && (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void retryDelivery(d)}
                            className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 disabled:opacity-40"
                          >
                            Retry
                          </button>
                        )}
                        {d.status === "succeeded" && (
                          <span className="text-[11px] text-gray-400">
                            delivered {d.succeeded_at ? new Date(d.succeeded_at).toLocaleTimeString() : ""}
                          </span>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        <td colSpan={6} className="px-3 py-2">
                          {history.length === 0 ? (
                            <p className="text-xs text-gray-500">No attempts yet.</p>
                          ) : (
                            <ul className="space-y-0.5">
                              {history.map((a) => (
                                <li key={a.id} className="font-mono text-[11px] text-gray-600">
                                  #{a.attempt_number} · {new Date(a.requested_at).toLocaleString()} ·{" "}
                                  {a.ok ? "OK" : "FAIL"}
                                  {a.status_code !== null ? ` · HTTP ${a.status_code}` : ""}
                                  {a.error ? ` · ${a.error}` : ""}
                                </li>
                              ))}
                            </ul>
                          )}
                          {d.status === "pending" && d.next_attempt_at && (
                            <p className="mt-1 text-[11px] text-gray-400">
                              Next automatic attempt: {new Date(d.next_attempt_at).toLocaleString()}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Revision chains ───────────────────────────────────────────────── */}
      <Section title="Assessment revisions" subtitle="Immutable snapshot chain — every revision links to the version it superseded.">
        {snapshots.length === 0 ? (
          <EmptyState title="No canonical snapshots" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 pr-3">Partner ref</th>
                  <th className="py-2 pr-3">Revision</th>
                  <th className="py-2 pr-3">Reason</th>
                  <th className="py-2 pr-3">Accepted</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(snapshotsByOrder.entries()).map(([orderId, chain]) => {
                  const o = orderById.get(orderId);
                  return chain.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100">
                      <td className="py-2 pr-3 font-mono text-xs">{o?.confirmation_id ?? "…"}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{o?.partner_order_id ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.revision === chain[0].revision ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-gray-100 text-gray-500 ring-gray-300"}`}>
                          rev {s.revision}{s.revision === chain[0].revision ? " · current" : " · superseded"}
                        </span>
                        {s.prior_snapshot_id && (
                          <span className="ml-1 text-[10px] text-gray-400">← rev {s.revision - 1}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-600">{s.revision_reason ?? "original acceptance"}</td>
                      <td className="py-2 pr-3 text-xs">{new Date(s.accepted_at).toLocaleString()}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Integration examples (placeholders only) ──────────────────────── */}
      <Section
        title="Integration examples"
        subtitle="Copy-paste starting points with FAKE placeholder credentials — replace them with the values from a one-time key reveal."
      >
        <div className="space-y-2">
          <CodeExample title="Authorization headers" code={authExample} />
          <CodeExample title="Create an ESA order" code={createEsaExample} />
          <CodeExample title="Create a PSD order (canonical contract)" code={createPsdExample} />
          <CodeExample title="Retrieve order status" code={statusExample} />
          <CodeExample title="Retrieve the approved document" code={documentExample} />
          <CodeExample title="Submit an assessment revision" code={revisionExample} />
          <CodeExample title="Verify webhook signatures" code={signatureExample} />
        </div>
      </Section>
    </div>
  );
}
