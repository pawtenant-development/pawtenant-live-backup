// AdminProviderPreview — Admin "Preview as Provider" (ADMIN-PROVIDER-PORTAL-PREVIEW-001)
//
// Renders the REAL provider portal, scoped read-only to a TARGET provider, so
// authorized admins can verify exactly what that provider sees for a given order
// ("Can this provider see the correct details for this order?"). This wrapper
// owns the admin concerns; the portal itself is reused unchanged via a single
// optional previewContext prop, so it can never drift from the live provider UI.
//
// Security model (mirrors the customer "Preview as Customer" pattern, hardened):
//   • Authorization = admin session verified SERVER-SIDE (check-admin-status)
//     PLUS Supabase RLS on every read — the admin's own session legitimately
//     reads the target provider's rows. The ?provider= id is only a SELECTOR,
//     never the authorization. Owner/Admin only in V1.
//   • No provider session is created; the admin stays the admin. No service-role
//     key in the browser. No RLS bypass via URL params.
//   • Every preview open is audit-logged, idempotently (StrictMode / remount safe).
//   • FAIL CLOSED: an invalid/unresolved provider id renders an error — it never
//     falls back to the viewing admin's own provider context.
//
// Deep link: /admin/provider-preview?provider=<doctor_profiles.user_id>&order=<PT-…?>
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { getAdminIdentity } from "../../../lib/adminIdentity";
import { logAudit } from "../../../lib/auditLogger";
import ProviderPortalPage, { type ProviderPreviewContext } from "../../provider-portal/page";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

interface ResolvedProvider {
  user_id: string;
  full_name: string;
  email: string | null;
}

type Phase = "checking" | "denied" | "not_found" | "ready";

export default function AdminProviderPreview() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const providerUserId = searchParams.get("provider");
  const orderConfirmationId = searchParams.get("order");

  const [phase, setPhase] = useState<Phase>("checking");
  const [provider, setProvider] = useState<ResolvedProvider | null>(null);
  const [switchProviders, setSwitchProviders] = useState<{ user_id: string; full_name: string }[]>([]);
  const [orderMismatch, setOrderMismatch] = useState<{ confirmationId: string } | null>(null);

  // Idempotent audit guard — survives React StrictMode's double-invoke of the
  // effect (the ref instance persists), so a single preview open logs once.
  const auditedKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setPhase("checking");
      setProvider(null);
      setOrderMismatch(null);

      // 1. Must be signed in.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/admin-login"); return; }

      // 2. Server-side admin authorization (never a client-only check).
      let isAdmin = false;
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/check-admin-status`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const j = (await res.json()) as { ok?: boolean; is_admin?: boolean };
        isAdmin = !!(j.ok && j.is_admin);
      } catch {
        isAdmin = false;
      }
      if (cancelled) return;
      if (!isAdmin) { setPhase("denied"); return; }

      // 3. Provider id is required.
      if (!providerUserId) { setPhase("not_found"); return; }

      // 4. Resolve the TARGET provider. FAIL CLOSED — never fall back to admin.
      const { data: prof } = await supabase
        .from("doctor_profiles")
        .select("user_id, full_name, email")
        .eq("user_id", providerUserId)
        .maybeSingle();
      if (cancelled) return;
      if (!prof) { setPhase("not_found"); return; }
      const p = prof as { user_id: string; full_name: string | null; email: string | null };
      const resolved: ResolvedProvider = {
        user_id: p.user_id,
        full_name: p.full_name ?? "Provider",
        email: p.email ?? null,
      };
      setProvider(resolved);

      // 5. Validate the optional order actually belongs to this provider before
      //    the portal opens it (order-specific QA). A mismatch is surfaced, not
      //    auto-opened — exactly what the provider would (not) see.
      if (orderConfirmationId) {
        const { data: ord } = await supabase
          .from("orders")
          .select("confirmation_id, doctor_user_id")
          .eq("confirmation_id", orderConfirmationId)
          .maybeSingle();
        if (cancelled) return;
        const o = ord as { confirmation_id: string; doctor_user_id: string | null } | null;
        const belongs = !!o && o.doctor_user_id === resolved.user_id;
        setOrderMismatch(belongs ? null : { confirmationId: orderConfirmationId });
      }

      // 6. Audit the preview open — idempotent per (provider, order).
      const auditKey = `${resolved.user_id}:${orderConfirmationId ?? ""}`;
      if (!auditedKeys.current.has(auditKey)) {
        auditedKeys.current.add(auditKey);
        const admin = await getAdminIdentity();
        void logAudit({
          actor_id: admin.id,
          actor_name: admin.name ?? admin.email ?? "admin",
          object_type: "provider",
          object_id: resolved.user_id,
          action: "provider_portal_preview_accessed",
          description: `Admin previewed the provider portal as ${resolved.full_name}${orderConfirmationId ? ` (order ${orderConfirmationId})` : ""}`,
          metadata: {
            provider_id: resolved.user_id,
            order_confirmation_id: orderConfirmationId ?? null,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // 7. Provider switcher list — active real providers only (admin RLS read).
      const { data: list } = await supabase
        .from("doctor_profiles")
        .select("user_id, full_name")
        .eq("is_admin", false)
        .eq("role", "provider")
        .eq("is_active", true)
        .order("full_name", { ascending: true });
      if (!cancelled) {
        setSwitchProviders(
          ((list as { user_id: string; full_name: string }[]) ?? []).filter((x) => x.user_id),
        );
      }

      if (!cancelled) setPhase("ready");
    };
    run();
    return () => { cancelled = true; };
  }, [providerUserId, orderConfirmationId, navigate]);

  const onExitToAdmin = useCallback(() => { navigate("/admin-orders"); }, [navigate]);

  // Switching provider clears the order context (a different provider's cases)
  // and, via key={provider.user_id} below, fully remounts the portal so NO
  // stale provider/order/profile/earnings/document/notification state carries over.
  const onSwitchProvider = useCallback((uid: string) => {
    setSearchParams({ provider: uid });
  }, [setSearchParams]);

  if (phase === "checking") {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <div className="text-center">
          <i className="ri-loader-4-line animate-spin text-3xl text-[#2c5282] block mb-3"></i>
          <p className="text-sm text-gray-500">Loading provider preview…</p>
        </div>
      </div>
    );
  }

  if (phase === "denied" || phase === "not_found" || !provider) {
    const denied = phase === "denied";
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 flex items-center justify-center bg-red-100 rounded-full mx-auto mb-4">
            <i className={`${denied ? "ri-shield-cross-line" : "ri-user-unfollow-line"} text-red-600 text-2xl`}></i>
          </div>
          <h2 className="text-lg font-extrabold text-gray-900 mb-2">
            {denied ? "Access Denied" : "Provider Not Found"}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {denied
              ? "This preview is available to admins only."
              : providerUserId
                ? "No provider matches this preview link. It may have been removed."
                : "No provider was specified for this preview."}
          </p>
          <button
            type="button"
            onClick={() => navigate("/admin-orders")}
            className="whitespace-nowrap px-6 py-2.5 bg-[#2c5282] text-white text-sm font-bold rounded-xl hover:bg-[#1e3a5f] cursor-pointer transition-colors"
          >
            Back to Admin Portal
          </button>
        </div>
      </div>
    );
  }

  const previewContext: ProviderPreviewContext = {
    providerUserId: provider.user_id,
    providerName: provider.full_name,
    providerEmail: provider.email,
    readOnly: true,
    onExitToAdmin,
    switchProviders,
    onSwitchProvider,
    orderMismatch,
  };

  // key on the provider id → a provider switch fully remounts the portal,
  // clearing ALL of its internal state (requirement: no stale state on switch).
  return <ProviderPortalPage key={provider.user_id} previewContext={previewContext} />;
}
