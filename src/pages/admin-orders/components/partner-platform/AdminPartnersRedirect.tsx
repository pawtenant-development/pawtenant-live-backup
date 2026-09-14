// AdminPartnersRedirect — PARTNER-PLATFORM-ADMIN-WORKSPACE-001.
//
// /admin-partners is the memorable route for the Partner Platform. The Admin
// Portal is a single-page shell whose workspaces are ?tab= values on
// /admin-orders (the same canonical pattern /admin-chats used when Chats
// moved into the shell), so this route is a pure redirect:
//
//   /admin-partners                → /admin-orders?tab=partners
//   /admin-partners?tab=finance    → /admin-orders?tab=partners&ptab=finance
//
// The ?tab= parameter HERE names the Partner Platform sub-tab; it maps onto
// ?ptab= inside the shell (where ?tab= is already the shell's own selector).

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const SUB_TABS = new Set(["overview", "orders", "finance", "integration", "settings"]);

export default function AdminPartnersRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let sub = "";
    try {
      const requested = new URLSearchParams(location.search).get("tab") ?? "";
      sub = SUB_TABS.has(requested) ? requested : "";
    } catch { /* default to overview */ }
    const qs = sub && sub !== "overview" ? `&ptab=${sub}` : "";
    navigate(`/admin-orders?tab=partners${qs}`, { replace: true });
  }, [navigate, location.search]);

  return null;
}
