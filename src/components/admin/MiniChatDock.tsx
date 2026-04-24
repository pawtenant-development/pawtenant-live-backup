/**
 * MiniChatDock — single-slot mini chat dock for admin portal.
 *
 * Lives next to AdminChatNotifier and reads dockedSessionId from
 * AdminChatContext. When set, renders a fixed bottom-right MiniChatPanel
 * so the admin can stay on Orders/Dashboard/Providers while handling
 * support.
 *
 * Hides itself while the user is on /admin-orders?tab=chats — the full
 * Chats tab already covers that surface and we do not want duplicate
 * thread polling.
 */

import { useLocation } from "react-router-dom";
import { useAdminChat } from "../../context/AdminChatContext";
import MiniChatPanel from "./MiniChatPanel";

const HIDDEN_ROUTE_PREFIXES = [
  "/admin-login",
  "/reset-password",
  "/provider-login",
];

export default function MiniChatDock() {
  const location = useLocation();
  const { available, dockedSessionId, closeDock } = useAdminChat();

  if (!available) return null;
  if (!dockedSessionId) return null;
  if (HIDDEN_ROUTE_PREFIXES.some((r) => location.pathname.startsWith(r))) {
    return null;
  }

  // Chats tab already shows the full thread UI — no point running a
  // second poll loop in the dock at the same time.
  const params = new URLSearchParams(location.search);
  const onChatsTab =
    location.pathname.startsWith("/admin-orders") &&
    params.get("tab") === "chats";
  if (onChatsTab) return null;

  return <MiniChatPanel sessionId={dockedSessionId} onClose={closeDock} />;
}
