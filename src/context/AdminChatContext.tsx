/**
 * AdminChatContext — cross-admin-page shared state for chat alerts.
 *
 * Mounted once inside AdminApp (App.tsx). Hosts the useAdminChatNotifier
 * hook so polling, sounds, and browser notifications happen globally —
 * not just when the Chats tab is mounted.
 *
 * Contract:
 *   - `sessions` is live (poll-driven). ChatsTab reads it for the list.
 *   - `suppressToast` is set to true by ChatsTab while mounted, so the
 *     global floating toast does not duplicate the in-tab row flash. The
 *     hook still plays sound and fires desktop notifs when suppressed —
 *     those are not visually redundant with the row flash.
 *   - `selectedSessionId` lets the hook know which session the admin is
 *     actively looking at, so focused-and-selected messages don't re-alert.
 *   - `dockedSessionId` drives the mini chat dock (MiniChatDock). Single
 *     slot — opening a new session replaces the current one.
 *   - A safe no-op FALLBACK is used when no provider is mounted (e.g. on
 *     the public site), so any accidental consumer is inert.
 *
 * Provider-agnostic by design — no Tawk-specific code here.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  useAdminChatNotifier,
  type AdminAlert,
  type ChatSession,
  type NotifPermission,
} from "../hooks/useAdminChatNotifier";

export type { ChatSession, NotifPermission, AdminAlert };

export interface AdminChatContextValue {
  sessions: ChatSession[];
  refreshing: boolean;
  error: string | null;
  refreshSessions: () => void;
  mutateSession: (id: string, patch: Partial<ChatSession>) => void;

  flashIds: Set<string>;
  /** Admin acknowledged this session (opened it) — clears flash + resets first-seen gate + closes notif. */
  markSeen: (sessionId: string) => void;

  alerts: AdminAlert[];
  dismissAlert: (id: string) => void;

  suppressToast: boolean;
  setSuppressToast: (v: boolean) => void;

  selectedSessionId: string | null;
  setSelectedSessionId: (id: string | null) => void;

  /** Mini chat dock — single slot. null = no dock. */
  dockedSessionId: string | null;
  openDock: (sessionId: string) => void;
  closeDock: () => void;

  notifPermission: NotifPermission;
  requestDesktopAlerts: () => Promise<void>;

  /** True when a real provider is mounted (i.e. we're inside AdminApp). */
  available: boolean;
}

const FALLBACK: AdminChatContextValue = {
  sessions: [],
  refreshing: false,
  error: null,
  refreshSessions: () => {},
  mutateSession: () => {},
  flashIds: new Set<string>(),
  markSeen: () => {},
  alerts: [],
  dismissAlert: () => {},
  suppressToast: false,
  setSuppressToast: () => {},
  selectedSessionId: null,
  setSelectedSessionId: () => {},
  dockedSessionId: null,
  openDock: () => {},
  closeDock: () => {},
  notifPermission: "unsupported",
  requestDesktopAlerts: async () => {},
  available: false,
};

const AdminChatContext = createContext<AdminChatContextValue>(FALLBACK);

interface ProviderProps {
  /** Set to false to stop polling (e.g. public subdomain). */
  enabled: boolean;
  children: ReactNode;
}

export function AdminChatProvider({ enabled, children }: ProviderProps) {
  const [suppressToast, setSuppressToastState] = useState(false);
  const [selectedSessionId, setSelectedSessionIdState] =
    useState<string | null>(null);
  const [dockedSessionId, setDockedSessionIdState] =
    useState<string | null>(null);

  const setSuppressToast = useCallback((v: boolean) => {
    setSuppressToastState(v);
  }, []);
  const setSelectedSessionId = useCallback((id: string | null) => {
    setSelectedSessionIdState(id);
  }, []);
  const openDock = useCallback((id: string) => {
    setDockedSessionIdState(id);
  }, []);
  const closeDock = useCallback(() => {
    setDockedSessionIdState(null);
  }, []);

  const notifier = useAdminChatNotifier({
    enabled,
    suppressToast,
    selectedSessionId,
  });

  const value = useMemo<AdminChatContextValue>(
    () => ({
      sessions: notifier.sessions,
      refreshing: notifier.refreshing,
      error: notifier.error,
      refreshSessions: notifier.refreshSessions,
      mutateSession: notifier.mutateSession,
      flashIds: notifier.flashIds,
      markSeen: notifier.markSeen,
      alerts: notifier.alerts,
      dismissAlert: notifier.dismissAlert,
      suppressToast,
      setSuppressToast,
      selectedSessionId,
      setSelectedSessionId,
      dockedSessionId,
      openDock,
      closeDock,
      notifPermission: notifier.notifPermission,
      requestDesktopAlerts: notifier.requestDesktopAlerts,
      available: enabled,
    }),
    [
      notifier.sessions,
      notifier.refreshing,
      notifier.error,
      notifier.refreshSessions,
      notifier.mutateSession,
      notifier.flashIds,
      notifier.markSeen,
      notifier.alerts,
      notifier.dismissAlert,
      notifier.notifPermission,
      notifier.requestDesktopAlerts,
      suppressToast,
      setSuppressToast,
      selectedSessionId,
      setSelectedSessionId,
      dockedSessionId,
      openDock,
      closeDock,
      enabled,
    ],
  );

  return (
    <AdminChatContext.Provider value={value}>
      {children}
    </AdminChatContext.Provider>
  );
}

export function useAdminChat(): AdminChatContextValue {
  return useContext(AdminChatContext);
}
