/**
 * Admin Live Visitors — standalone page wrapper.
 *
 * Mounted at /admin-orders/live. Owns the admin auth gate (session +
 * check-admin-status edge function + is_admin verification) and renders
 * the shared LiveVisitorsPanel for the body.
 *
 * The same panel is now also mounted inside the Communications Hub at
 * /admin-orders?tab=communications&sub=live. Keeping this standalone
 * page alive so existing bookmarks and the Phase-1 entry point continue
 * to work without redirects.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import LiveVisitorsPanel from "../admin-orders/components/LiveVisitorsPanel";

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

export default function AdminLiveVisitorsPage() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState<"loading" | "ok">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sessionRes = await supabase.auth.getSession().catch(() => null);
        if (!sessionRes || sessionRes.error || !sessionRes.data.session) {
          if (!cancelled) navigate("/admin-login?reason=session_expired");
          return;
        }
        const token = sessionRes.data.session.access_token;
        const res = await fetch(`${supabaseUrl}/functions/v1/check-admin-status`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const adminCheck = (await res.json()) as { ok: boolean; is_admin: boolean };
        if (!adminCheck.ok || !adminCheck.is_admin) {
          if (!cancelled) navigate("/admin-login?reason=unauthorized");
          return;
        }
        if (!cancelled) setAuthorized("ok");
      } catch {
        if (!cancelled) navigate("/admin-login?reason=session_expired");
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  if (authorized === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafaf9]">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafaf9]">
      <div className="px-4 sm:px-6 py-8">
        <LiveVisitorsPanel showBackToOrders />
      </div>
    </div>
  );
}
