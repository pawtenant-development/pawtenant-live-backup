# MISSED-CALL-DESKTOP-NOTIFICATION-LIVE-PORT-001

| Field | Value |
|---|---|
| **Task ID** | MISSED-CALL-DESKTOP-NOTIFICATION-LIVE-PORT-001 |
| **Session/owner** | Claude session (2026-07-16) — **LIVE, owner-authorized** narrow frontend port. |
| **Status** | Implemented — pending supervised LIVE verification. |
| **Started from commit** | LIVE `d3460e0` (main, synced 0/0 after owner-approved reset of a stale staged index) |
| **Scope** | **Exactly one source file**: `src/pages/admin-orders/components/AdminProfileMenu.tsx` (+ this task card). |
| **Locked files** | `src/pages/admin-orders/components/AdminProfileMenu.tsx` |
| **Lock/conflict check** | No conflict. No LIVE doc references `AdminProfileMenu`; the TEST active-tasks registry has no in_progress lock on it (active locks cover `my-orders/**`, assessment, home, provider-portal). |

## Problem

LIVE notifiers read `soundPrefs.desktopNotificationsEnabled`, but **no mounted LIVE UI could write it**:

- `AdminSoundControls.tsx` (the historical writer) is **not mounted** — `AdminChrome.tsx:32` records its removal; it is tree-shaken out of the production bundle.
- The mounted `AdminProfileMenu` exposed **Sound Alerts only** (`muted` + per-channel), never `desktopNotificationsEnabled`.

Result: the flag was permanently `false` in production, `notify()` always no-opped, and missed-call / AI-support / new-visitor OS toasts were **inert for every admin** — even though the LIVE Realtime backend and notifier subscription were verified healthy.

## Fix — surgical port from TEST `c826dc9` (origin commit `79d04df`)

Four hunks ported into the mounted LIVE `AdminProfileMenu.tsx`. **Purely additive: 73 insertions, 0 deletions.** The full TEST file was **not** copied.

1. `desktopNotify` imports (`getNotificationPermission`, `requestNotificationPermission`, `notify`, `NotifPermission`).
2. `notifPerm` state.
3. `toggleBrowserNotifications` handler — permission requested **only** from the direct click when `perm === "default"`; persists `true` **only** when granted; disable persists `false` and never touches browser permission; no re-prompt after denial.
4. `BROWSER NOTIFICATIONS` JSX block — toggle (existing admin blue `#3b6ea5`), explanatory text, denied/unsupported inline states, and the self-contained "Send test browser notification" control.

**Deliberate deviation (1 line):** the description text is LIVE-accurate. TEST's copy advertises "new paid orders" + "new chats", which LIVE **does not** notify (TEST-only `page.tsx notifyOrderPaid`). LIVE's real `notify()` sites are missed calls, new emails, AI Support events, and new visitors — so the copy names those. Porting TEST's sentence verbatim would over-promise, violating the `desktopNotify` consent contract.

## Preserved

`muted`, `volume`, and all four channel prefs (`setSoundPrefs` is a patch-merge); all LIVE-specific profile-menu behavior (presence, photo, Runbook/Providers, Change Password, Sign Out). Default remains **OFF** when no preference exists; never silently enabled.

## Explicitly NOT touched

No migration. No Edge Function. No RLS/policy/grant. No Realtime publication or subscription change. No notifier dedupe change. No AI Support setting. No communication-sending code. No frozen mega-file. No other worktree. `AdminSoundControls` left in place (unused) — removal is out of scope.

## Validation

- `git diff --check` clean.
- `type-check`: 9 pre-existing baseline errors (`AIAssistantTrustCard`, `AnalyticsTab`, `EmployeeHrDirectory` ×5, `ProviderInternalRecords`) — **0 in the changed file, 0 new**.
- `build`: ✓ 42.76s, prerender 242 files / 0 errors, attribution parity OK, hygiene 29/0.
- Markers confirmed in the built bundle (`page-Boxx3VFu.js`); TEST-only "new paid orders" copy confirmed absent.

## Rollback

`git revert <commit>` — frontend-only, no data or schema impact.
