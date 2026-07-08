# COMMAND-CENTER-PERMISSIONS-LIVE-FIX-001 — register Command Center in Team access modal (LIVE)

**Owner:** Claude session (2026-07-08) — owner-approved LIVE · **Repo:** LIVE `pawtenant-live-backup` (`cvwbozlbbmrjxznknouq`)
**Builds on:** `c696319` (Command Center LIVE mirror).

## Problem
Team → Roles & Access modal's "Communications sub-tabs" list did not include **Command Center**, so Hamza could not grant/restrict staff access to it. (Same gap also affected **AI Support**, added to the hub in `71c8205` but never registered in the modal.)

## Root cause
`src/pages/admin-orders/components/TeamTab.tsx` has a hardcoded `COMMS_SUB_KEYS` + `COMMS_SUB_LABELS` (lines 58-77) meant to "mirror CommunicationsHub.SUB_CONFIG". It listed only `live/chats/emails/sms/consultations/templates/settings` — missing `inbox` (Command Center) and `ai` (AI Support). The same array (via `COMMS_SUB_KEY_SET`) also gates which `communications_<sub>` grants the modal honors on load/save, so even a manually-stored `communications_inbox` would have been dropped.

- Sub-tab key = **`inbox`** (URL `tab=communications&sub=inbox`), matching `CommunicationsHub.SUB_KEYS`. Stored as `communications_inbox` in `doctor_profiles.custom_tab_access`.
- `custom_tab_access` is **jsonb, no check constraint** → **no migration needed**; the access checker (`CommunicationsHub.getVisibleSubKeys`) already includes `inbox`/`ai` in `SUB_KEYS`/`BASIC_SUBS` (shipped in `c696319`/`71c8205`).

## Fix
`TeamTab.tsx` only — add `inbox` (first) + `ai` (after `sms`) to `COMMS_SUB_KEYS` and their labels to `COMMS_SUB_LABELS` (Command Center = `ri-layout-grid-line`, AI Support = `ri-robot-2-line`), matching the hub's SUB_CONFIG order. No behavior/default change: `BASIC_SUBS` untouched (role defaults preserved); owner/admin still bypass; users with explicit child grants stay restricted to exactly those.

## Safety
No Command Center send behavior change. No SMS function deploy. No SMS auto-send / chat Auto change. No GHL/ads/payment/order/provider/refund change. No DB migration.

## OUTCOME (2026-07-08) — DONE
- **File changed:** `src/pages/admin-orders/components/TeamTab.tsx` (only) — added `inbox`+`ai` to `COMMS_SUB_KEYS` + `COMMS_SUB_LABELS`. No migration, no other file.
- **Permission key:** `inbox` → stored `communications_inbox`; also `ai` → `communications_ai`.
- **Behavior:** modal now shows "Command Center" + "AI Support" toggles under Communications sub-tabs (both drive the same `COMMS_SUB_KEYS`-based load/save/parse path). Role defaults + owner/admin bypass unchanged (`BASIC_SUBS` untouched); explicitly-restricted users stay restricted.
- **Build:** type-check TeamTab = 0 errors (only pre-existing unrelated errors); `npm run build` ✓ (~59s, prerender 242/0, attribution parity OK).
- **Safety:** LIVE settings unchanged (`ai_chat_reply_mode=draft`, `ai_sms_auto_send_enabled=false`, kill switch false, Nataisa blacklisted); `ai-send-support-reply` still NOT deployed (SMS send inert); GHL TEST workflows remain Draft; LIVE reconcile crons active. No send behavior change, no SMS/email/call, no GHL/ads/payment/order change.
- **Browser verification:** LIVE admin is OTP-gated + Vercel prod project outside MCP token scope → not driven in-browser; verified via build + code path + SQL (jsonb column, no constraint). Owner confirms by opening Team → Roles & Access.
- **Commit:** `<pending push>`.
