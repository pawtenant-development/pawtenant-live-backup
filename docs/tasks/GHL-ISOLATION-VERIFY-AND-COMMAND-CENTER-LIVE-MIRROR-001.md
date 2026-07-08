# GHL-ISOLATION-VERIFY-AND-COMMAND-CENTER-LIVE-MIRROR-001

**Owner:** Claude session (2026-07-08) — owner-approved · **Repos:** TEST `pawtenant-test` (`opudhofjbydrljgleofq`) / LIVE `pawtenant-live-backup` (`cvwbozlbbmrjxznknouq`)
**Builds on:** TEST GHL isolation `43b479a`; LIVE AI-support `539c877`/`71c8205`/`2dc4985`.

## Scope
1. Verify the GHL bleed is stopped (2 workflows now Draft + TEST guards fail-closed + no new TEST inbound).
2. If clean, mirror the TEST Communications **Command Center** UI to LIVE — frontend-only, draft-only, human-approved sends only. No SMS/AI auto-send. No SMS-function deploy.

## Phase 2 — GHL isolation verification (DONE ✓)
- **Workflows Draft:** `fb05fbf2…` "Inbound SMS Shadow TEST" = **draft** (v6, updated 2026-07-08T17:25:07Z); `0999e642…` "Log Inbound Call to TEST Admin Portal" = **draft** (v6, 17:25:07Z). Prod workflows (Call/SMS HUB, ESA Order/Contact Status, non-TEST call-log, MultipleMessages, SMS Reply Webhook) remain published — untouched.
- **Guards:** all 7 probed TEST GHL fns return `skipped:test_ghl_isolation`.
- **Bleed stopped:** newest TEST inbound = SMS `2026-07-08 15:39`, call `15:18` (both before the 17:25 draft); **0 inbound after 17:25**.
- **LIVE crons intact:** `ghl-message-reconcile` */3, `ghl-call-reconcile` */3, `lead-followup-sequence-every-15min` */15 — all active.
- **Verdict: CLEAN → proceed to Command Center mirror.**

## Phase 3 — Command Center audit
- **LIVE RPCs present:** `post_agent_chat_message`, `mark_chat_session_read`, `assign_chat_session`, `match_or_create_chat_session`, `record_chat_message`, `ai_support_pause_conversation`, `ai_support_resume_conversation`, `is_chat_admin`, `is_admin_staff` — ALL present.
- **`ai-send-support-reply` (SMS-send edge fn): NOT deployed in LIVE** → CommandCenter SMS-send is inert (errors on click; sends nothing). Chat human-approve = `post_agent_chat_message` (works). **No SMS function will be deployed.**
- (full frontend dependency + send-surface audit below)

## OUTCOME (2026-07-08) — Command Center mirrored to LIVE (draft-only, human-approved)

### Audit verdict
Frontend-only port. **AUTO-SEND VERDICT: NONE** — every customer-facing send is an explicit human button click, role-gated (`isAdminLevel`). All timers are read-only refresh polls. Backend fully present in LIVE (RPCs `post_agent_chat_message`/`assign_chat_session`/`mark_chat_session_read`/pause/resume; tables `ai_support_*`/`chats`/`communications`/`contact_submissions`/`orders`). SMS-send edge fn `ai-send-support-reply` is **NOT deployed in LIVE** → the SMS "Approve & Send"/"Rehearse" surface is **inert** (errors on click, sends nothing); the chat "Send" surface uses `post_agent_chat_message` (works, human-approved). **No SMS function deployed.** Not a frozen file.

### Files (LIVE, commit `<pending>`)
- NEW `src/pages/admin-orders/components/commandCenter/CommandCenterPanel.tsx` (copied verbatim from TEST)
- NEW `src/pages/admin-orders/components/commandCenter/useCommsQueue.ts` (verbatim)
- NEW `src/hooks/useChatAiDecisions.ts` (verbatim)
- EDIT `src/pages/admin-orders/components/CommunicationsHub.tsx` — additive only: new `"inbox"` sub-key + `SUB_KEYS`/`BASIC_SUBS` + `SUB_CONFIG` ("Command Center", `ri-layout-grid-line`) + `{localActive==="inbox" && <CommandCenterPanel/>}`. `DEFAULT_SUB` kept `"live"` (landing unchanged). No import rewrites (all deps present + byte-identical in LIVE).

### Build
type-check: my 4 files = 0 errors (only pre-existing unrelated errors). `npm run build`: ✓ (~55s), prerender 242/0, attribution parity OK.

### Safety
No SMS/email/call sent. No AI chat Auto. No SMS auto-send (still `false`). Chat mode still Draft. Nataisa blacklisted. GHL workflows remain Draft. LIVE GHL reconcile crons active. No ads/payment/order/provider/refund/checkout change. No SMS function deployed.

### Follow-ups
- If an SMS-send surface in LIVE Command Center is ever wanted, `ai-send-support-reply` must be deployed to LIVE first (separate, owner-gated; keep tester-guard/DND). Until then SMS send is safely inert.
- Optionally set `DEFAULT_SUB="inbox"` to make Command Center the landing tab (product choice).
