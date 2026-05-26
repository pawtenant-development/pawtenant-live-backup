/**
 * AdminChrome — the global admin operational shell.
 *
 * Bundles:
 *   - AdminChatProvider (cross-admin shared chat state + polling)
 *   - AdminChatNotifier (toast + sound + desktop notif on new chats)
 *   - MiniChatDock (bottom-right docked mini chat window)
 *   - AdminSoundControls (mute / volume / preview)
 *   - VisitorSoundMonitor (live-visitor sound channel)
 *
 * Why a separate file:
 *   These five modules (~3,680 lines + their supabase channels + audio
 *   buffers + the 973-line useAdminChatNotifier hook) are admin-only —
 *   no public route consumes useAdminChat. Statically importing them at
 *   the App.tsx level meant every public-page visitor downloaded and
 *   parsed all of it on first load. Folding the chrome into this single
 *   default export lets App.tsx React.lazy() the whole bundle and only
 *   fetch it when the user is actually on an `/admin*` route (or on the
 *   admin subdomain).
 *
 * Render contract — unchanged from the prior inline form:
 *   provider mounted with `enabled` so polling fires on admin routes,
 *   followed by the four floating chrome components inside the provider.
 */
import type { ReactNode } from "react";
import { AdminChatProvider } from "../../context/AdminChatContext";
import AdminChatNotifier from "./AdminChatNotifier";
import MiniChatDock from "./MiniChatDock";
import AdminSoundControls from "./AdminSoundControls";
import VisitorSoundMonitor from "./VisitorSoundMonitor";

export default function AdminChrome({ children }: { children: ReactNode }) {
  return (
    <AdminChatProvider enabled>
      {children}
      <AdminChatNotifier />
      <MiniChatDock />
      <AdminSoundControls />
      <VisitorSoundMonitor />
    </AdminChatProvider>
  );
}
