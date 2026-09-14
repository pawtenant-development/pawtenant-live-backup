// PartnerSettingsTab — PARTNER-PLATFORM-ADMIN-WORKSPACE-001.
//
// The Stripe-like management surface: partner organizations, environments,
// API keys, webhook endpoints and the sandbox handoff package.
//
// EVERY action here calls a SECURITY DEFINER management RPC that re-checks
// is_chat_admin() server-side — the buttons are convenience, not the gate.
// Highlights of the server contract this UI relies on:
//   * partner_admin_create_api_key / rotate return the full secret EXACTLY
//     ONCE; the database keeps only sha256 verification material + last4.
//   * A forged environment (anything but 'sandbox'/'production') fails with
//     22023; 'production' fails with 42501 until production_enabled — which
//     stays FALSE on TEST. The Live column here is presentation; the refusal
//     is server-side.
//   * Rotation mints the replacement FIRST and leaves the old key active for
//     a controlled overlap; revoking the old key is a separate explicit step.
//   * Webhook signing secrets reveal once at registration/rotation. Secret
//     rotation is an IMMEDIATE cutover (documented in the confirm dialog).
//   * Endpoint removal is refused server-side once delivery history exists.
//
// SECRET DISCIPLINE: reveal values live only in component state while the
// reveal dialog is open (see shared.tsx). The sandbox handoff can embed a
// secret ONLY while such a reveal is open — once closed, a new handoff needs
// new or rotated credentials.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import {
  type PartnerOrg, partnerApiBaseUrl, PARTNER_API_VERSION, PARTNER_API_SCOPES,
  WEBHOOK_EVENT_TYPES, orgStatusView, Badge, ConfirmDialog, CopyButton,
  EmptyState, Notice, SecretRevealModal, Section,
} from "./shared";
// PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001 — profile + rates.
import PartnerProfilePanel from "./PartnerProfilePanel";
import PartnerUsersPanel from "./PartnerUsersPanel";
// PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 — technical and onboarding
// material moved here from Overview / Orders, behind collapsible sections.
import { CollapsibleSection } from "./shared";
import PartnerOnboardingChecklist from "./PartnerOnboardingChecklist";
import PartnerLegacyIntakeHistory from "./PartnerLegacyIntakeHistory";
import PartnerCompletionContact from "./PartnerCompletionContact";
// PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002 — one action creates the
// partner, records its charges and invites its first Partner user.
import PartnerCreateForm from "./PartnerCreateForm";

interface ApiKeyRow {
  id: string;
  key_id: string;
  label: string | null;
  environment: string;
  scopes: string[];
  status: string;
  secret_last4: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  rotated_from_key_id: string | null;
}

interface EndpointRow {
  id: string;
  partner_id: string;
  environment: string;
  url: string;
  description: string | null;
  active: boolean;
  event_types: string[];
  created_at: string;
  disabled_at: string | null;
  disabled_reason: string | null;
}

interface Reveal {
  kind: "api_key" | "webhook_secret";
  title: string;
  secret: string;
  keyId?: string;
  endpointUrl?: string;
  label?: string;
}

/**
 * Handoff staging — the narrow bridge between two one-time reveals and ONE
 * downloadable handoff. Each fresh reveal also stages its value here (React
 * state only — never storage, never a URL, never analytics), so a handoff can
 * carry BOTH the API secret and the webhook signing secret without requiring
 * two dialogs to be open at once. Staging holds only values minted in THIS
 * page session; it is cleared on partner switch, on unmount, and by the
 * explicit Clear button. Old secrets remain unrecoverable — regenerating a
 * secret-bearing handoff still requires creating or rotating credentials.
 */
interface HandoffStage {
  apiKey?: { keyId: string; secret: string };
  webhook?: { url: string; secret: string };
}

/** Display mask for a staged secret: prefix + last 4 only. */
function maskSecret(s: string): string {
  const cut = s.indexOf("_") >= 0 ? s.indexOf("_", s.indexOf("_") + 1) : -1;
  const prefix = cut > 0 ? s.slice(0, cut + 1) : s.slice(0, 6);
  return `${prefix}••••…${s.slice(-4)}`;
}

/** Effective display status for a key — 'expired' is derived, not stored. */
function keyStatus(k: ApiKeyRow): { label: string; tone: string } {
  if (k.status === "revoked") return { label: "Revoked", tone: "bg-gray-100 text-gray-500 ring-gray-300" };
  if (k.expires_at && new Date(k.expires_at).getTime() <= Date.now())
    return { label: "Expired", tone: "bg-amber-50 text-amber-800 ring-amber-200" };
  return { label: "Active", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
}

export default function PartnerSettingsTab({
  orgs, selected, onSelect, onOrgsChanged, onOpenOrderId,
}: {
  orgs: PartnerOrg[];
  selected: PartnerOrg | null;
  onSelect: (id: string) => void;
  onOrgsChanged: () => void;
  /** Opens a partner order (by id) in the canonical order detail modal. */
  onOpenOrderId?: (orderId: string) => void;
}) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; confirmLabel: string; tone?: "danger" | "primary"; run: () => void } | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [staged, setStaged] = useState<HandoffStage>({});

  // Staged handoff secrets belong to ONE partner's session — switching the
  // selected partner drops them immediately.
  useEffect(() => { setStaged({}); }, [selected?.id]);

  // ── Organization forms ────────────────────────────────────────────────────
  const [editingOrg, setEditingOrg] = useState<PartnerOrg | null>(null);
  const [editForm, setEditForm] = useState({ display: "", legal: "", billingName: "", billingEmail: "", techName: "", techEmail: "", notes: "" });

  // ── Keys & webhooks for the selected org ─────────────────────────────────
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointRow[]>([]);
  const [subReload, setSubReload] = useState(0);
  const reloadSub = useCallback(() => setSubReload((n) => n + 1), []);

  const [showCreateKey, setShowCreateKey] = useState(false);
  const [keyForm, setKeyForm] = useState({ label: "", scopes: new Set(["orders:create", "orders:read", "documents:read"]), expires: "" });

  const [showCreateHook, setShowCreateHook] = useState(false);
  const [hookForm, setHookForm] = useState({ url: "", description: "", events: new Set<string>() });

  useEffect(() => {
    let cancelled = false;
    if (!selected) { setKeys([]); setEndpoints([]); return; }
    void (async () => {
      const [k, e] = await Promise.all([
        supabase.rpc("partner_admin_list_api_keys", { p_partner_id: selected.id }),
        supabase.from("partner_webhook_endpoints")
          .select("id, partner_id, environment, url, description, active, event_types, created_at, disabled_at, disabled_reason")
          .eq("partner_id", selected.id)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      if (k.error || e.error) {
        setError("Could not load credentials/webhooks (admin access required).");
        return;
      }
      setKeys((k.data as ApiKeyRow[]) ?? []);
      setEndpoints((e.data as EndpointRow[]) ?? []);
    })();
    return () => { cancelled = true; };
  }, [selected, subReload]);

  const run = async (label: string, fn: () => PromiseLike<{ data?: unknown; error: { message: string } | null }>, after?: (data: unknown) => void) => {
    setBusy(label);
    setNotice("");
    setError("");
    try {
      const { data, error: err } = await fn();
      if (err) { setError(`${label} failed: ${err.message}`); return; }
      setNotice(`${label} done.`);
      after?.(data);
      reloadSub();
      onOrgsChanged();
    } finally {
      setBusy(null);
    }
  };

  // ── Organization actions ─────────────────────────────────────────────────
  const saveOrgEdit = () => {
    if (!editingOrg) return;
    const f = editForm;
    void run("Update organization", () =>
      supabase.rpc("partner_admin_update_organization", {
        p_partner_id: editingOrg.id,
        p_display_name: f.display.trim() || null,
        p_legal_name: f.legal.trim() || null,
        p_billing_contact: f.billingEmail ? { name: f.billingName || null, email: f.billingEmail } : null,
        p_technical_contact: f.techEmail ? { name: f.techName || null, email: f.techEmail } : null,
        p_notes: f.notes.trim() || null,
      }), () => setEditingOrg(null));
  };

  const toggleSandbox = (o: PartnerOrg, enable: boolean) => setConfirm({
    title: enable ? `Enable Sandbox for ${o.display_name}` : `Disable Sandbox for ${o.display_name}`,
    body: enable
      ? "Sandbox access lets this partner's sandbox API keys authenticate and submit test orders."
      : "Disabling Sandbox immediately stops every sandbox API key from authenticating. Existing data is untouched.",
    confirmLabel: enable ? "Enable Sandbox" : "Disable Sandbox",
    tone: enable ? "primary" : "danger",
    run: () => void run(enable ? "Enable Sandbox" : "Disable Sandbox", () =>
      supabase.rpc("partner_admin_set_sandbox_access", { p_partner_id: o.id, p_enabled: enable })),
  });

  const archiveOrg = (o: PartnerOrg) => setConfirm({
    title: `Archive ${o.display_name}`,
    body: "Archiving is refused by the server if the organization has orders, invoices, billable events, active API keys or active webhooks. Nothing is deleted — the organization is marked archived.",
    confirmLabel: "Archive organization",
    run: () => void run("Archive organization", () =>
      supabase.rpc("partner_admin_archive_organization", { p_partner_id: o.id })),
  });

  // ── API key actions ──────────────────────────────────────────────────────
  const createKey = () => {
    if (!selected) return;
    const f = keyForm;
    void run("Create API key", () =>
      supabase.rpc("partner_admin_create_api_key", {
        p_partner_id: selected.id,
        p_label: f.label.trim() || null,
        p_scopes: Array.from(f.scopes),
        p_environment: "sandbox",
        p_expires_at: f.expires ? new Date(`${f.expires}T23:59:59`).toISOString() : null,
      }), (data) => {
        const row = Array.isArray(data) ? data[0] as { credential_id: string; key_id: string; secret: string } : null;
        if (row) {
          setReveal({
            kind: "api_key",
            title: "Sandbox API key created",
            secret: row.secret,
            keyId: row.key_id,
            label: f.label.trim() || undefined,
          });
          setStaged((s) => ({ ...s, apiKey: { keyId: row.key_id, secret: row.secret } }));
        }
        setShowCreateKey(false);
        setKeyForm({ label: "", scopes: new Set(["orders:create", "orders:read", "documents:read"]), expires: "" });
      });
  };

  const revokeKey = (k: ApiKeyRow) => {
    const reason = window.prompt(`Revoke ${k.key_id} — reason (optional):`) ?? "";
    setConfirm({
      title: `Revoke ${k.key_id}`,
      body: "The key stops authenticating immediately and cannot be un-revoked. Any integration still using it will start failing.",
      confirmLabel: "Revoke key",
      run: () => void run("Revoke API key", () =>
        supabase.rpc("partner_admin_revoke_api_key", { p_credential_id: k.id, p_reason: reason.trim() || null })),
    });
  };

  const rotateKey = (k: ApiKeyRow) => setConfirm({
    title: `Rotate ${k.key_id}`,
    body: "Rotation creates a NEW key with the same scopes and shows its secret once. The old key STAYS ACTIVE so the running integration keeps working — revoke it explicitly after the partner has switched over.",
    confirmLabel: "Create replacement key",
    tone: "primary",
    run: () => void run("Rotate API key", () =>
      supabase.rpc("partner_admin_rotate_api_key", { p_credential_id: k.id, p_label: null }),
      (data) => {
        const row = Array.isArray(data) ? data[0] as { credential_id: string; key_id: string; secret: string } : null;
        if (row) {
          setReveal({
            kind: "api_key",
            title: "Replacement key created — old key still active",
            secret: row.secret,
            keyId: row.key_id,
            label: k.label ?? undefined,
          });
          setStaged((s) => ({ ...s, apiKey: { keyId: row.key_id, secret: row.secret } }));
        }
      }),
  });

  // ── Webhook actions ──────────────────────────────────────────────────────
  const createHook = () => {
    if (!selected) return;
    const f = hookForm;
    void run("Register webhook", () =>
      supabase.rpc("partner_register_webhook_endpoint", {
        p_partner_id: selected.id,
        p_environment: "sandbox",
        p_url: f.url.trim(),
        p_description: f.description.trim() || null,
        p_event_types: Array.from(f.events),
      }), (data) => {
        const row = Array.isArray(data) ? data[0] as { endpoint_id: string; secret: string } : null;
        if (row) {
          setReveal({
            kind: "webhook_secret",
            title: "Webhook endpoint registered",
            secret: row.secret,
            endpointUrl: f.url.trim(),
          });
          setStaged((s) => ({ ...s, webhook: { url: f.url.trim(), secret: row.secret } }));
        }
        setShowCreateHook(false);
        setHookForm({ url: "", description: "", events: new Set() });
      });
  };

  const rotateHookSecret = (e: EndpointRow) => setConfirm({
    title: "Rotate signing secret",
    body: "Rotation is an IMMEDIATE cutover: the next delivery is signed with the new secret and the old secret stops working the moment you confirm. Install the new secret on the partner side right away.",
    confirmLabel: "Rotate secret",
    run: () => void run("Rotate signing secret", () =>
      supabase.rpc("partner_admin_rotate_webhook_secret", { p_endpoint_id: e.id }),
      (data) => {
        if (typeof data === "string") {
          setReveal({ kind: "webhook_secret", title: "Signing secret rotated", secret: data, endpointUrl: e.url });
          setStaged((s) => ({ ...s, webhook: { url: e.url, secret: data } }));
        }
      }),
  });

  const sendTestHook = (e: EndpointRow) =>
    void run("Send test event", () =>
      supabase.rpc("partner_admin_send_test_webhook", { p_endpoint_id: e.id }),
      () => setNotice("Test event queued — use “Dispatch queued deliveries now” on the Integration tab to send it."));

  const disableHook = (e: EndpointRow) => setConfirm({
    title: "Disable endpoint",
    body: "New events will stop creating deliveries for this endpoint until it is re-enabled.",
    confirmLabel: "Disable",
    run: () => void run("Disable endpoint", () =>
      supabase.rpc("partner_disable_webhook_endpoint", { p_endpoint_id: e.id, p_reason: "disabled from Partner Platform settings" })),
  });

  const enableHook = (e: EndpointRow) =>
    void run("Enable endpoint", () =>
      supabase.rpc("partner_admin_enable_webhook_endpoint", { p_endpoint_id: e.id }));

  const removeHook = (e: EndpointRow) => setConfirm({
    title: "Remove endpoint",
    body: "Removal is only possible for endpoints with no delivery history (the server refuses otherwise — disable instead). The signing secret is deleted with it.",
    confirmLabel: "Remove endpoint",
    run: () => void run("Remove endpoint", () =>
      supabase.rpc("partner_admin_delete_webhook_endpoint", { p_endpoint_id: e.id })),
  });

  // ── Sandbox handoff ──────────────────────────────────────────────────────
  // Built from the STAGED secrets (fresh reveals from this page session), so
  // one download can carry both the API key and the webhook signing secret.
  // The on-screen preview is ALWAYS masked; full values exist only in the
  // downloaded file. Without staged values it is a reusable, secret-free
  // integration guide.
  const buildHandoff = useCallback((masked: boolean) => {
    const base = partnerApiBaseUrl();
    const activeKeys = keys.filter((k) => keyStatus(k).label === "Active");
    const secretSection = staged.apiKey
      ? `Key id:      ${staged.apiKey.keyId}\nAPI secret:  ${masked ? maskSecret(staged.apiKey.secret) : staged.apiKey.secret}   (fresh one-time reveal — store securely)`
      : `Key id:      ${activeKeys[0]?.key_id ?? "<create a key under Settings → API keys>"}\nAPI secret:  <shown once at key creation — create or rotate a key to issue a fresh secret>`;
    const hookSection = staged.webhook
      ? `Signing secret: ${masked ? maskSecret(staged.webhook.secret) : staged.webhook.secret}   (fresh one-time reveal — store securely)`
      : `Signing secret: <shown once at webhook registration/rotation>`;
    return `SANDBOX — NOT FOR PRODUCTION
PawTenant Partner API · Sandbox handoff for ${selected?.display_name ?? "<partner>"}
Generated from the PawTenant TEST admin portal.

1) SANDBOX API
Base URL:    ${base}
API version: ${PARTNER_API_VERSION}
Environment: sandbox
Auth:        x-partner-key-id + x-partner-secret request headers
${secretSection}
Scopes:      ${PARTNER_API_SCOPES.map((s) => s.value).join(", ")}

2) ENDPOINTS
POST ${base}/orders                                   — submit a paid ESA/PSD order
GET  ${base}/orders/{partner_order_id}                — order status
GET  ${base}/orders/{partner_order_id}/document       — approved document (signed URL)
POST ${base}/orders/{partner_order_id}/revisions      — complete assessment revision

3) WEBHOOKS
Endpoint(s): ${endpoints.filter((e) => e.active).map((e) => e.url).join(", ") || "<register one under Settings → Webhooks>"}
${hookSection}
Headers:     X-PawTenant-Event-Id / X-PawTenant-Event-Type /
             X-PawTenant-Timestamp / X-PawTenant-Signature (v1=<hex>)
Scheme:      hex(HMAC_SHA256(signing_secret, timestamp + "." + raw_body))
Replay:      reject timestamps older than 5 minutes; event ids are unique.

4) REQUIRED SANDBOX TEST CASES
  1. Submit an ESA order and receive order.accepted.
  2. Submit a PSD order using the partner.assessment.psd.v1 contract.
  3. Replay the same submission (idempotency) — no duplicate order.
  4. Poll order status until completion.
  5. Retrieve the approved document via the document endpoint.
  6. Receive and signature-verify the order.completed webhook.
  7. Submit a supported assessment revision before provider assignment.
  8. Confirm a revoked/expired key is refused.

5) SUPPORT
Integration support: <support contact placeholder — to be confirmed>
Reference docs: docs/partner-api/rapid-esa-letter-integration.md + openapi.yaml

SANDBOX — NOT FOR PRODUCTION. Production activation requires owner approval
and a separate LIVE rollout with new production credentials.
`;
  }, [selected, keys, endpoints, staged]);

  const handoffPreview = useMemo(() => buildHandoff(true), [buildHandoff]);

  const downloadHandoff = () => {
    const blob = new Blob([buildHandoff(false)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pawtenant-sandbox-handoff-${selected?.slug ?? "partner"}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Notice notice={notice} error={error} />

      {/* ── 1. Partner organizations ──────────────────────────────────────── */}
      <PartnerCreateForm orgs={orgs} onCreated={(id) => { onOrgsChanged(); onSelect(id); }} />

      <Section
        title="Partner organizations"
        subtitle="Manage existing partners. Archiving is refused while operational history exists."
      >
        {orgs.length === 0 ? (
          <EmptyState title="No partner organizations" hint="Create the first sandbox partner above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Partner</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Contacts</th>
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2 pr-3">Last activity</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => {
                  const st = orgStatusView(o);
                  const isSel = selected?.id === o.id;
                  return (
                    <tr key={o.id} className={`border-b border-gray-100 ${isSel ? "bg-indigo-50/40" : ""}`}>
                      <td className="py-2 pr-3">
                        <button type="button" onClick={() => onSelect(o.id)} className="text-left">
                          <span className="font-medium text-gray-900">{o.display_name}</span>
                          {isSel && <span className="ml-1 text-[10px] font-semibold text-indigo-600">selected</span>}
                          <span className="block font-mono text-[11px] text-gray-500">{o.slug}</span>
                        </button>
                      </td>
                      <td className="py-2 pr-3"><Badge label={st.label} tone={st.tone} /></td>
                      <td className="py-2 pr-3 text-xs text-gray-600">
                        {o.technical_contact?.email ?? o.billing_contact?.email ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-600">{new Date(o.created_at).toLocaleDateString()}</td>
                      <td className="py-2 pr-3 text-xs text-gray-600">
                        {o.updated_at ? new Date(o.updated_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={busy !== null}
                            onClick={() => {
                              setEditingOrg(o);
                              setEditForm({
                                display: o.display_name, legal: o.legal_name ?? "",
                                billingName: o.billing_contact?.name ?? "", billingEmail: o.billing_contact?.email ?? "",
                                techName: o.technical_contact?.name ?? "", techEmail: o.technical_contact?.email ?? "",
                                notes: o.notes ?? "",
                              });
                            }}
                            className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 disabled:opacity-40">
                            Edit
                          </button>
                          {(o.status === "draft" || o.status === "paused") && (
                            <button type="button" disabled={busy !== null} onClick={() => toggleSandbox(o, true)}
                              className="rounded border border-emerald-300 px-2 py-0.5 text-xs text-emerald-700 disabled:opacity-40">
                              Enable Sandbox
                            </button>
                          )}
                          {o.status === "sandbox" && (
                            <button type="button" disabled={busy !== null} onClick={() => toggleSandbox(o, false)}
                              className="rounded border border-amber-300 px-2 py-0.5 text-xs text-amber-700 disabled:opacity-40">
                              Disable Sandbox
                            </button>
                          )}
                          {o.status !== "terminated" && !o.production_enabled && (
                            <button type="button" disabled={busy !== null} onClick={() => archiveOrg(o)}
                              className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-500 disabled:opacity-40">
                              Archive
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {editingOrg && (
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2">
            <p className="sm:col-span-2 text-xs font-semibold text-gray-700">Editing {editingOrg.display_name}</p>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Display name</span>
              <input value={editForm.display} onChange={(e) => setEditForm((f) => ({ ...f, display: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Legal name</span>
              <input value={editForm.legal} onChange={(e) => setEditForm((f) => ({ ...f, legal: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Billing contact name</span>
              <input value={editForm.billingName} onChange={(e) => setEditForm((f) => ({ ...f, billingName: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Billing contact email</span>
              <input type="email" value={editForm.billingEmail} onChange={(e) => setEditForm((f) => ({ ...f, billingEmail: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Technical contact name</span>
              <input value={editForm.techName} onChange={(e) => setEditForm((f) => ({ ...f, techName: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Technical contact email</span>
              <input type="email" value={editForm.techEmail} onChange={(e) => setEditForm((f) => ({ ...f, techEmail: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-gray-600">Notes</span>
              <input value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button type="button" disabled={busy !== null} onClick={saveOrgEdit}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                Save changes
              </button>
              <button type="button" onClick={() => setEditingOrg(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* ── 1b. Partner profile + agreed per-order charge (isolated panel) ── */}
      <PartnerProfilePanel partner={selected} onChanged={onOrgsChanged} />

      {/* ── 1c. Notifications & contacts ─────────────────────────────────── */}
      <CollapsibleSection
        title="Notifications & contacts"
        subtitle="Who is told when clinical work is completed. The customer is never emailed by PawTenant for a partner order."
        defaultOpen
      >
        <PartnerCompletionContact partner={selected} />
      </CollapsibleSection>

      {/* ── 2. Environments ───────────────────────────────────────────────── */}
      {/* PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 —
          invite-only partner portal accounts. */}
      <PartnerUsersPanel selected={selected} />

      {/* ── Technical & onboarding (collapsed by default) ─────────────────── */}
      <CollapsibleSection
        title="Sandbox onboarding checklist"
        subtitle="Evidence-based readiness for an API-integrated partner."
        tone="technical"
      >
        <PartnerOnboardingChecklist partner={selected} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Environments & production activation"
        subtitle="Sandbox is usable now; Live activation requires owner approval and a separate LIVE rollout."
        tone="technical"
      >
      <Section title="Environments" subtitle="Where this partner may operate. The lock is enforced server-side — a forged live request fails.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-blue-800"><i className="ri-flask-line mr-1"></i>Sandbox</p>
              <Badge
                label={selected && (selected.status === "sandbox" || selected.status === "active") ? "Usable" : "Not enabled"}
                tone={selected && (selected.status === "sandbox" || selected.status === "active")
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-amber-50 text-amber-800 ring-amber-200"}
              />
            </div>
            <p className="mt-2 text-xs text-blue-900/80">
              Test credentials, test orders, test webhooks. Nothing here touches production
              systems, and sandbox webhook traffic is pinned to PawTenant's controlled receiver.
            </p>
          </div>
          <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-500"><i className="ri-lock-2-line mr-1"></i>Live</p>
              <Badge label="Locked" tone="bg-gray-200 text-gray-600 ring-gray-300" />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Production activation requires owner approval and a separate LIVE rollout.
              On this TEST environment, Live cannot generate credentials, register webhooks
              or submit orders — the server refuses production requests while
              production access is not enabled, and refuses forged environment values outright.
            </p>
          </div>
        </div>
      </Section>
      </CollapsibleSection>

      <CollapsibleSection
        title="API keys"
        subtitle="Sandbox credentials for an API-integrated partner. Secrets are shown once."
        tone="technical"
      >
      {/* ── 3. API keys ───────────────────────────────────────────────────── */}
      <Section
        title={`API keys — ${selected?.display_name ?? "no partner selected"}`}
        subtitle="Secrets are shown once at creation and stored only as verification hashes. Rotation keeps the old key active until you revoke it."
        actions={
          <button
            type="button"
            disabled={!selected || busy !== null}
            onClick={() => setShowCreateKey((v) => !v)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {showCreateKey ? "Close" : "Create sandbox key"}
          </button>
        }
      >
        {showCreateKey && selected && (
          <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Key name</span>
              <input value={keyForm.label} onChange={(e) => setKeyForm((f) => ({ ...f, label: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Rapid sandbox integration" />
            </label>
            <div className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Scopes</span>
              <div className="space-y-1">
                {PARTNER_API_SCOPES.map((s) => (
                  <label key={s.value} className="flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={keyForm.scopes.has(s.value)}
                      onChange={(e) => setKeyForm((f) => {
                        const next = new Set(f.scopes);
                        if (e.target.checked) next.add(s.value); else next.delete(s.value);
                        return { ...f, scopes: next };
                      })}
                    />
                    <code className="font-mono text-[11px]">{s.value}</code>
                  </label>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Expiration (optional)</span>
              <input type="date" value={keyForm.expires} onChange={(e) => setKeyForm((f) => ({ ...f, expires: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <div className="sm:col-span-3">
              <button
                type="button"
                disabled={keyForm.scopes.size === 0 || busy !== null}
                onClick={createKey}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Create key — the secret is shown exactly once
              </button>
            </div>
          </div>
        )}

        {keys.length === 0 ? (
          <EmptyState title="No API keys" hint="Create a sandbox key to let this partner call the API." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Key</th>
                  <th className="py-2 pr-3">Env</th>
                  <th className="py-2 pr-3">Scopes</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2 pr-3">Last used</th>
                  <th className="py-2 pr-3">Expires</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const st = keyStatus(k);
                  return (
                    <tr key={k.id} className="border-b border-gray-100">
                      <td className="py-2 pr-3 text-xs">{k.label ?? <span className="text-gray-400">unnamed</span>}
                        {k.rotated_from_key_id && (
                          <span className="block text-[10px] text-gray-400">rotated from {k.rotated_from_key_id}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <code className="font-mono text-[11px] text-gray-800">{k.key_id}</code>
                        <span className="block font-mono text-[10px] text-gray-400">
                          secret …{k.secret_last4 ?? "••••"}
                        </span>
                      </td>
                      <td className="py-2 pr-3"><span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] uppercase">{k.environment}</span></td>
                      <td className="py-2 pr-3 font-mono text-[10px] text-gray-600">{k.scopes.join(", ")}</td>
                      <td className="py-2 pr-3">
                        <Badge label={st.label} tone={st.tone} />
                        {k.revoked_reason && <span className="block text-[10px] text-gray-400">{k.revoked_reason}</span>}
                      </td>
                      <td className="py-2 pr-3 text-xs">{new Date(k.created_at).toLocaleDateString()}</td>
                      <td className="py-2 pr-3 text-xs">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}</td>
                      <td className="py-2 pr-3 text-xs">{k.expires_at ? new Date(k.expires_at).toLocaleDateString() : "—"}</td>
                      <td className="py-2 pr-3">
                        {st.label !== "Revoked" && (
                          <div className="flex gap-2">
                            <button type="button" disabled={busy !== null} onClick={() => rotateKey(k)}
                              className="rounded border border-blue-300 px-2 py-0.5 text-xs text-blue-700 disabled:opacity-40">
                              Rotate
                            </button>
                            <button type="button" disabled={busy !== null} onClick={() => revokeKey(k)}
                              className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 disabled:opacity-40">
                              Revoke
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      </CollapsibleSection>

      <CollapsibleSection
        title="Webhooks"
        subtitle="Signed status webhooks for an API-integrated partner."
        tone="technical"
      >
      {/* ── 4. Webhooks ───────────────────────────────────────────────────── */}
      <Section
        title={`Webhooks — ${selected?.display_name ?? "no partner selected"}`}
        subtitle="HTTPS only, no private networks, signed payloads, replay-protected. Signing secrets reveal once."
        actions={
          <button
            type="button"
            disabled={!selected || busy !== null}
            onClick={() => setShowCreateHook((v) => !v)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {showCreateHook ? "Close" : "Add sandbox endpoint"}
          </button>
        }
      >
        {showCreateHook && selected && (
          <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">HTTPS endpoint URL</span>
              <input value={hookForm.url} onChange={(e) => setHookForm((f) => ({ ...f, url: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs" placeholder="https://…" />
              <span className="mt-1 block text-[10px] text-gray-500">
                On TEST, sandbox deliveries only reach PawTenant's controlled sandbox receiver.
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Description</span>
              <input value={hookForm.description} onChange={(e) => setHookForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Rapid sandbox receiver" />
            </label>
            <div className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-gray-600">Subscribed events (none = all)</span>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {WEBHOOK_EVENT_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-1.5 text-[11px] text-gray-700">
                    <input
                      type="checkbox"
                      checked={hookForm.events.has(t)}
                      onChange={(e) => setHookForm((f) => {
                        const next = new Set(f.events);
                        if (e.target.checked) next.add(t); else next.delete(t);
                        return { ...f, events: next };
                      })}
                    />
                    <code className="font-mono">{t}</code>
                  </label>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <button
                type="button"
                disabled={!hookForm.url.trim().startsWith("https://") || busy !== null}
                onClick={createHook}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Register endpoint — the signing secret is shown exactly once
              </button>
            </div>
          </div>
        )}

        {endpoints.length === 0 ? (
          <EmptyState title="No webhook endpoints" hint="Register an endpoint to receive signed status events." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Endpoint</th>
                  <th className="py-2 pr-3">Env</th>
                  <th className="py-2 pr-3">Events</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((e) => (
                  <tr key={e.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3">
                      {e.description && <span className="block text-xs font-medium text-gray-800">{e.description}</span>}
                      <span className="break-all font-mono text-[11px] text-gray-500">{e.url}</span>
                    </td>
                    <td className="py-2 pr-3"><span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] uppercase">{e.environment}</span></td>
                    <td className="py-2 pr-3 text-[10px] text-gray-600">
                      {e.event_types.length === 0 ? "all events" : e.event_types.join(", ")}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge
                        label={e.active ? "Active" : "Disabled"}
                        tone={e.active ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-gray-100 text-gray-500 ring-gray-300"}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-2">
                        {e.active && (
                          <button type="button" disabled={busy !== null} onClick={() => sendTestHook(e)}
                            className="rounded border border-indigo-300 px-2 py-0.5 text-xs text-indigo-700 disabled:opacity-40">
                            Send test event
                          </button>
                        )}
                        <button type="button" disabled={busy !== null} onClick={() => rotateHookSecret(e)}
                          className="rounded border border-blue-300 px-2 py-0.5 text-xs text-blue-700 disabled:opacity-40">
                          Rotate secret
                        </button>
                        {e.active ? (
                          <button type="button" disabled={busy !== null} onClick={() => disableHook(e)}
                            className="rounded border border-amber-300 px-2 py-0.5 text-xs text-amber-700 disabled:opacity-40">
                            Disable
                          </button>
                        ) : (
                          <button type="button" disabled={busy !== null} onClick={() => enableHook(e)}
                            className="rounded border border-emerald-300 px-2 py-0.5 text-xs text-emerald-700 disabled:opacity-40">
                            Enable
                          </button>
                        )}
                        <button type="button" disabled={busy !== null} onClick={() => removeHook(e)}
                          className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-500 disabled:opacity-40">
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      </CollapsibleSection>

      <CollapsibleSection
        title="Integration readiness & sandbox handoff"
        subtitle="The package an API-integrated partner needs to start sandbox testing."
        tone="technical"
      >
      {/* ── 5. Sandbox handoff ────────────────────────────────────────────── */}
      <Section
        title="Sandbox handoff"
        subtitle="The exact package Rapid ESA Letter needs to start sandbox testing. Secrets are embedded ONLY while their one-time reveal is open."
        actions={
          <button
            type="button"
            disabled={!selected}
            onClick={downloadHandoff}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            <i className="ri-download-2-line mr-1"></i>Download handoff
          </button>
        }
      >
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <strong>SANDBOX — NOT FOR PRODUCTION.</strong> Old secrets can never be
          retrieved: to hand over fresh secrets, create or rotate the API key and the
          webhook signing secret in this session — each reveal stages its value below
          (memory only) so ONE download carries both. The preview is always masked;
          full values exist only in the downloaded file.
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge
            label={staged.apiKey ? `API key staged (${staged.apiKey.keyId})` : "API key: not staged"}
            tone={staged.apiKey ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-gray-100 text-gray-500 ring-gray-300"}
          />
          <Badge
            label={staged.webhook ? "Webhook secret staged" : "Webhook secret: not staged"}
            tone={staged.webhook ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-gray-100 text-gray-500 ring-gray-300"}
          />
          {(staged.apiKey || staged.webhook) && (
            <button
              type="button"
              onClick={() => setStaged({})}
              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Clear staged secrets
            </button>
          )}
        </div>
        <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-gray-900 p-3 text-[11px] leading-relaxed text-gray-100">{handoffPreview}</pre>
      </Section>
      </CollapsibleSection>

      {/* ── Retired legacy PDF intake — read-only history ─────────────────── */}
      <CollapsibleSection
        title="Legacy PDF intake history"
        subtitle="Retired path. Records and source files are preserved for audit; nothing here can upload, extract, retry or create an order."
        tone="history"
      >
        <PartnerLegacyIntakeHistory partner={selected} onOpenOrder={onOpenOrderId} />
      </CollapsibleSection>

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          tone={confirm.tone ?? "danger"}
          onConfirm={() => { const r = confirm.run; setConfirm(null); r(); }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {reveal && (
        <SecretRevealModal
          title={reveal.title}
          secretLabel={reveal.kind === "api_key" ? "API secret" : "signing secret"}
          secret={reveal.secret}
          extraRows={[
            ...(reveal.keyId ? [{ label: "Key id", value: reveal.keyId }] : []),
            ...(reveal.endpointUrl ? [{ label: "Endpoint", value: reveal.endpointUrl }] : []),
            { label: "Base URL", value: partnerApiBaseUrl() },
          ]}
          downloadName={reveal.kind === "api_key"
            ? `pawtenant-sandbox-api-key-${selected?.slug ?? "partner"}.txt`
            : `pawtenant-sandbox-webhook-secret-${selected?.slug ?? "partner"}.txt`}
          downloadBody={reveal.kind === "api_key"
            ? `SANDBOX — NOT FOR PRODUCTION\nPawTenant Partner API credentials (${selected?.display_name ?? "partner"})\n\nBase URL:   ${partnerApiBaseUrl()}\nKey id:     ${reveal.keyId}\nAPI secret: ${reveal.secret}\n${reveal.label ? `Name:       ${reveal.label}\n` : ""}\nThis secret is shown once and stored only as a hash. Keep it server-side.\n`
            : `SANDBOX — NOT FOR PRODUCTION\nPawTenant webhook signing secret (${selected?.display_name ?? "partner"})\n\nEndpoint:       ${reveal.endpointUrl}\nSigning secret: ${reveal.secret}\n\nScheme: hex(HMAC_SHA256(secret, timestamp + "." + raw_body))\nHeader: X-PawTenant-Signature: v1=<hex>\nThis secret is shown once. Keep it server-side.\n`}
          onClose={() => setReveal(null)}
        />
      )}
    </div>
  );
}
