# AI-SUPPORT-LIVE-FOUNDATION-001 — LIVE AI-support foundation (draft-only chat)

**Owner:** Claude session (2026-07-08) — owner-approved LIVE · **Repo:** LIVE `pawtenant-live-backup` (`cvwbozlbbmrjxznknouq`)
**Started from:** LIVE `f22983a` (prior BLOCKED audit) · TEST source of truth: `d1ee8c8`.
**Scope:** Build the missing LIVE AI-support foundation and run it in **draft-only chat mode**. NOT auto mode, NOT SMS auto-send, NOT customer-visible AI.

## Approved scope / hard exclusions
- Draft-only chat only. `ai_chat_reply_mode=auto` FORBIDDEN. No customer-visible AI reply. No SMS/email/call. No SMS function deploy. No ads/checkout/payment/order/provider/refund/GHL-workflow/cron change. Nataisa stays blacklisted/human_only. No secret rotation. No secrets in commits/report.

## Audit result (TEST→LIVE gap)
- **LIVE admin-gate functions match TEST verbatim:** `is_admin_staff()` (doctor_profiles is_admin+is_active) and `is_chat_admin()` (+role in owner/admin_manager) — so TEST RLS ports **unchanged**.
- LIVE HAS: `chats`/`chat_sessions`, RPCs `match_or_create_chat_session`/`record_chat_message`/`post_agent_chat_message`, `doctor_profiles.role`, admin infra (`useCurrentAdminRole`, `adminPermissions`, `CommunicationsHub`).
- LIVE MISSING: all `ai_support_*` tables, `ai_usage_log`, pause/resume RPCs, AI panel UI, `capture-chat`→handler wiring.
- `communications` not in LIVE realtime (leave alone; only add `ai_support_notifications`).

## Phase 3 — Security design (gate before schema)
**Tables (create if missing):** `ai_support_settings`, `ai_support_conversations` (+`external_session_id`), `ai_support_messages`, `ai_support_ai_events`, `ai_support_notifications`, `ai_usage_log` — exact TEST DDL + indexes + `ai_support_touch_updated_at` trigger. (SMS-only `ai_support_pending_replies` NOT created — chat draft mode doesn't use it.)
**RLS (ported verbatim):**
- `ai_support_settings`: SELECT `is_admin_staff()`, ALL `is_chat_admin()`.
- `ai_support_conversations`/`_messages`/`_ai_events`/`_notifications`: ALL `is_admin_staff()` (admins only; **customers/visitors/providers/anon cannot read** — no public policy).
- `ai_usage_log`: RLS on, **no policies**, `revoke all from anon, authenticated` → service-role only.
**RPCs (SECURITY DEFINER, `is_admin_staff()` guard):** `ai_support_pause_conversation`, `ai_support_resume_conversation`, `ai_support_touch_updated_at`.
**Realtime:** add only `ai_support_notifications` to `supabase_realtime` (idempotent).
**Settings seed (safe/off):** core defaults (kill switch false, sms_auto_send false, category modes with psd/eligibility=draft_only), chat keys, blacklist keys, **`ai_chat_reply_mode=draft`**, `ai_chat_auto_reply_enabled=false`. Plus **Nataisa `+17138780013`** into `ai_sms_auto_reply_blacklisted_numbers` (protection parity).
**Functions:** deploy `_shared/aiSupport/*` + `ai-handle-inbound-chat` (`verify_jwt=true`). NO SMS functions.
**capture-chat:** add the TEST fire-and-forget block (service-role `Bearer`, `EdgeRuntime.waitUntil`, error-swallowed) — no new secret needed.
**Admin UI:** AiSupportCenterPanel + BlacklistManager mount in `CommunicationsHub` — **deferred to a scoped follow-up** (large frontend port; drafts are safely stored + auditable meanwhile).

### Verification queries (Phase 9)
Objects exist; RLS enabled + policies present; settings = draft; Nataisa blacklisted; synthetic invoke → `sent=false`, `no_reply_reason=draft_only_mode`, event `action=drafted`, `reply_sent_to_chat=false`, `draft_pending` notif, 0 customer chat rows, 0 SMS.

### Rollback plan
1. **Instant AI off:** `update ai_support_settings set value='"off"' where key='ai_chat_reply_mode'` (handler skips OpenAI + never sends) — or `ai_global_kill_switch=true`.
2. **Disable capture-chat invocation:** redeploy prior `capture-chat` (git revert the wiring block) — capture keeps working, just stops calling the handler.
3. **Confirm zero sends:** SQL — 0 `sms_outbound`, 0 AI-posted `chats` rows.
4. **Removable:** `ai-handle-inbound-chat` function can be deleted; tables are additive/isolated (admin-only RLS), safe to leave.

---

## OUTCOME (2026-07-08) — backend foundation LIVE + verified; admin UI = next step

### Done (LIVE)
- **Migration `20260708160000_ai_support_foundation_chat_draft`** applied: 6 tables (`ai_support_settings/_conversations/_messages/_ai_events/_notifications`, `ai_usage_log`) + indexes + `ai_support_touch_updated_at` trigger + RLS (verified: 5 admin policies; `ai_usage_log` 0 policies/service-role-only) + `ai_support_pause/resume_conversation` RPCs + `ai_support_notifications` added to realtime + safe seed (draft/off).
- **Security advisor:** only known-safe items — `ai_usage_log` RLS-no-policy (intentional service-role-only) and pause/resume SECURITY DEFINER "executable by anon/authenticated" (functions have an internal `is_admin_staff()` guard that raises for non-admins → no escalation; matches TEST).
- **Functions deployed to LIVE:** `ai-handle-inbound-chat` **v1** (`verify_jwt=true`), ported `_shared/aiSupport/{policy,prompt,knowledgeBase,db,ghl}.ts` (no `testGuard` — not needed by chat). `capture-chat` **v17** wired to fire-and-forget the handler (service-role Bearer, `EdgeRuntime.waitUntil`, error-swallowed; `verify_jwt=true` preserved). **No SMS functions deployed.**
- **Settings (LIVE):** `ai_chat_reply_mode=draft`, `ai_chat_auto_reply_enabled=false`, `ai_sms_auto_send_enabled=false`, kill switch=false, Nataisa `+17138780013` in `ai_sms_auto_reply_blacklisted_numbers`.

### Verified (zero customer-visible send)
Full-path synthetic test via LIVE `capture-chat` (fake session `53fe1cec…`, no email → GHL sync skipped): capture 200 → handler `action=drafted`, `chat_reply_mode=draft`, `reply_sent_to_chat=false`, `no_reply_reason=draft_only_mode`, `draft_pending` notification, **0 AI outbound messages, 0 agent chat rows** (visitor saw only their own message). Synthetic rows then deleted (ai_support tables + chat session/rows all back to 0). Safety sweep: 0 AI chat sends, 0 AI SMS (the 1 `sms_outbound` in-window = pre-existing `auto_sequence:sms_5min` lead-followup, unrelated), Nataisa protected.

### Known gaps / follow-ups (owner)
1. **`OPENAI_API_KEY` not set in LIVE** → handler drafts the fixed *clarifying* template (guardrail `openai_unconfigured`), classifies correctly, sends nothing, spends nothing. Set the secret in LIVE Supabase (owner's key) for AI-quality drafts.
2. **Admin AI Support Center UI NOT ported** (large frontend port: `AiSupportCenterPanel` + `BlacklistManager` + hooks, mount in `CommunicationsHub`). Drafts are safely stored + admin-only-readable meanwhile; staff review via DB until the UI ships. = next scoped task.
3. capture-chat is now wired on real traffic (draft-only): real visitor chats create `draft_pending` rows; handler GHL contact-sync runs fail-soft only when a visitor provides an email. To keep dormant until UI/OpenAI ready: set `ai_chat_reply_mode=off`.
