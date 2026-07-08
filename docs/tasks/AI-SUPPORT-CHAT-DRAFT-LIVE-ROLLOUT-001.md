# AI-SUPPORT-CHAT-DRAFT-LIVE-ROLLOUT-001 — LIVE draft-only chat rollout

**Owner:** Claude session (2026-07-08) · **Repo:** LIVE `pawtenant-live-backup` (`cvwbozlbbmrjxznknouq`)
**Status:** ⛔ **BLOCKED — the narrow rollout is not possible; LIVE lacks the entire AI-support foundation.** No LIVE change made (read-only audit only).

---

## Why blocked
The task scoped a **narrow port of the TEST draft-mode delta** (commit `d1ee8c8`: `ai_chat_reply_mode` in `policy.ts`, mode routing in `ai-handle-inbound-chat`, the "Live Chat AI Mode" card in `AiSupportCenterPanel.tsx`) and instructed: *"If LIVE lacks required support files or function wiring, audit and report before large changes."* The audit shows LIVE is missing **the whole AI-support system**, not just the delta — so the draft-mode pieces have nothing to attach to.

### LIVE audit (read-only SQL + repo)
| Requirement (needed for draft-only chat) | LIVE status |
|---|---|
| `ai_support_settings` | **MISSING** |
| `ai_support_conversations` | **MISSING** |
| `ai_support_messages` | **MISSING** |
| `ai_support_ai_events` | **MISSING** |
| `ai_support_notifications` | **MISSING** |
| `ai_usage_log` (OpenAI budget + logging) | **MISSING** |
| RPCs `ai_support_pause_conversation` / `ai_support_resume_conversation` / `ai_support_touch_updated_at` | **MISSING** |
| Admin AI Support Center UI (`AiSupportCenterPanel` / `BlacklistManager` / `CommandCenterPanel`) | **NONE in LIVE `src`** |
| `capture-chat` → `ai-handle-inbound-chat` wiring | **NONE** (no invoke, no ai_support refs) |
| `ai-handle-inbound-chat` + `_shared/aiSupport/*` | **NOT deployed** |
| `chats`, `chat_sessions`, `post_agent_chat_message` RPC, admin helpers (`check_is_admin`, `is_admin_staff`, `is_chat_admin`) | present ✅ |

`ai-handle-inbound-chat` reads/writes the `ai_support_*` tables + `ai_usage_log` on nearly every operation (loadSettings, getOrCreateChatConversation, insertMessage, insertEvent, insertNotification, dedup, usage logging). With those tables absent it would error immediately; and with no `capture-chat` wiring nothing would invoke it. Deploying it now = broken + inert.

## What a real LIVE draft-only rollout requires (owner-gated; NOT done here)
This is a **large, multi-system change to production** — must be a separately-approved task with security review:
1. **Schema migrations** — create `ai_support_settings`, `ai_support_conversations`, `ai_support_messages`, `ai_support_ai_events`, `ai_support_notifications`, `ai_usage_log` (chat draft mode does not need `ai_support_pending_replies` — that's SMS) with indexes + the `ai_support_touch_updated_at` trigger.
2. **RLS policies** — LIVE gate is `check_is_admin()` (TEST uses `is_chat_admin()`); customer chat data → policies must be written and **security-reviewed**, not copied blindly.
3. **RPCs** — `ai_support_pause_conversation`, `ai_support_resume_conversation`.
4. **Settings seed** — `ai_chat_reply_mode='draft'`, `ai_chat_auto_reply_enabled=false`, `ai_sms_auto_send_enabled=false`, `ai_global_kill_switch=false`, category modes (risky→escalate/block), confidence/caps, empty blacklists.
5. **Secrets** — confirm/set LIVE function `OPENAI_API_KEY` (+ GHL secrets for fail-soft sync); optionally `AI_SUPPORT_WEBHOOK_SECRET`.
6. **Functions** — deploy `_shared/aiSupport/*` + `ai-handle-inbound-chat` (`verify_jwt=true`); **no SMS functions**.
7. **capture-chat wiring** — modify + deploy LIVE `capture-chat` to fire-and-forget invoke the handler (customer-facing function change — needs care).
8. **Admin UI port** — port `AiSupportCenterPanel` (+ `BlacklistManager` + supporting hooks/queries) into the LIVE admin app + deploy the LIVE frontend, or staff have no way to see/review/send drafts and no "mode = Draft" status.

## Safety confirmations (this audit)
- **Zero LIVE writes.** Read-only SQL + repo reads only. No migration, no function deploy, no settings change, no frontend deploy.
- No SMS/email/call. No customer-visible AI reply (LIVE has no AI reply capability at all). No ads/payment/order/provider/refund/checkout/GHL/cron change. SMS functions untouched.
- Nataisa: LIVE has no AI-reply pipeline and no `ai_support_*` blacklist mechanism, so no LIVE AI can contact her. Her TEST blacklist/human_only hold is unchanged. (When LIVE rolls out, seed her into the LIVE blacklist as step 4.)

## Recommended next action
Owner decides whether to authorize a **larger, separately-scoped LIVE task** to build the AI-support foundation above (schema + RLS security review + admin UI port + capture-chat wiring), staged draft-only. TEST draft-only chat is live and can soak in the meantime. Keep SMS off.
