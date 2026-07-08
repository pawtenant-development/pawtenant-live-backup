# AI-SUPPORT-LIVE-ADMIN-UI-AND-OPENAI-SECRET-001 — LIVE OpenAI verify + admin AI Support Center UI

**Owner:** Claude session (2026-07-08) — owner-approved LIVE · **Repo:** LIVE `pawtenant-live-backup` (`cvwbozlbbmrjxznknouq`)
**Builds on:** LIVE foundation `539c877` (AI-SUPPORT-LIVE-FOUNDATION-001). TEST source of truth for UI: `d1ee8c8`.

## Owner-approved scope
1. Verify LIVE `OPENAI_API_KEY` works by producing an AI-quality **draft** in draft-only mode (no secret exposure).
2. Port the admin **AI Support Center** UI to LIVE so staff can review/manage drafts in-app.
3. Keep all AI behavior **draft-only**.

## Hard exclusions (NOT approved by this task)
- No `ai_chat_reply_mode=auto`. No customer-visible AI chat reply. No SMS send / SMS auto-send / SMS function redeploy.
- No email/call. No removing/loosening Nataisa blacklist or human-takeover protections.
- No ads / checkout / payment / order / provider / refund / GHL-workflow / cron changes.
- No secret printing, copying, committing, or rotation.

## Preflight (2026-07-08)
- **LIVE:** branch `main`, HEAD `539c877` (foundation commit present ✓), synced with origin (0/0). Dirty (preserved, unrelated): `docs/PAWTENANT_CLAUDE_OPERATING_RULES.md`, 3 google-ads tracker docs.
- **TEST:** branch `main`, HEAD `c37b39e`, synced. Dirty (preserved, unrelated): `send-meta-capi-event/index.ts`, several docs, 1 RA-email migration.

## Phase 2 — OpenAI verification (DONE ✓)
Synthetic draft-only test via LIVE `capture-chat` (anon JWT; fake session `50023ba2…`, provider `synthetic-openai-verify`, **no email/phone** → GHL sync skipped; message = ESA letter-timing question).
Result (ai_support_ai_events, conversation `27a84546…`):
- `action=drafted`, `intent=letter_timing`, `model=gpt-4o-mini`, `guardrail_code=null` (**NOT** `openai_unconfigured`), `confidence=0.9`, tokens 2669/80, `cost_usd=0.000448`.
- `chat_reply_mode=draft`, `reply_sent_to_chat=false`, `no_reply_reason=draft_only_mode`.
- Draft = genuine AI answer (portal delivery + 24h timing), not the fixed clarifying template.
- Zero-send confirmed: `ai_support_messages` 1 inbound / **0 outbound**; `chats` 1 visitor / **0 agent-AI**; `ai_usage_log` 1 `chat_shadow` row.
- **No function redeploy needed** — deployed `ai-handle-inbound-chat` picked up the new secret at runtime. Secret never printed.

## Phase 3-6 — Admin UI port
(See OUTCOME below.)

## Verification plan
- Frontend typecheck + build in LIVE; deploy via normal LIVE path; Vercel READY; admin route loads.
- Re-confirm settings draft/off + Nataisa blacklisted; re-confirm zero AI send in task window; SMS functions untouched.

---

## OUTCOME (2026-07-08) — OpenAI verified + admin UI ported LIVE (draft-only)

### OpenAI secret (verified by behavior; not exposed)
Deployed `ai-handle-inbound-chat` picked up the new LIVE `OPENAI_API_KEY` at runtime — **no redeploy needed**, no SMS function touched. Synthetic draft = real gpt-4o-mini answer (`guardrail_code=null`, not `openai_unconfigured`), zero customer-visible send (see Phase 2 above).

### Admin UI ported (4 files copied verbatim TEST→LIVE + 1 additive mount)
- NEW `src/lib/aiSupportPresentation.ts`
- NEW `src/hooks/useAiSupportPendingCount.ts`
- NEW `src/pages/admin-orders/components/AiSupportCenterPanel.tsx` (1586 lines)
- NEW `src/pages/admin-orders/components/commandCenter/BlacklistManager.tsx`
- EDIT `src/pages/admin-orders/components/CommunicationsHub.tsx` — additive only: new `"ai"` sub-key + `SUB_KEYS`/`BASIC_SUBS` entry + `SUB_CONFIG` row ("AI Support", `ri-robot-2-line`) + `{localActive==="ai" && <AiSupportCenterPanel/>}` mount + red draft-pending badge via `useAiSupportPendingCount`. (Not a MERGE-FROZEN file.)
- No import rewrites needed (all upstream deps — `supabaseClient`/`getAdminUserToken`, `adminPermissions`/`isAdminLevel`, `useCurrentAdminRole` — already exist in LIVE at identical paths). No react-query/toast.
- **Backend parity verified before porting:** all 5 `ai_support_*` tables have every column the panel reads/writes; RPCs `ai_support_pause_conversation`/`ai_support_resume_conversation`/`post_agent_chat_message` + helpers `is_chat_admin`/`is_admin_staff` all present.

### Draft-only safety of the ported UI
- Chat AI Mode card shows **Draft**; **Auto is confirmation-gated** (modal "Yes, send to visitors" required). SMS auto-send toggle is **off** + confirm-gated; not enabled.
- Role gating: tab visible to admin staff (basic set); every write control gated by `isAdminLevel(role)` client-side + `is_chat_admin()`/`is_admin_staff()` RLS server-side.
- Only functional send path in LIVE = human "Approve & send to chat" (`post_agent_chat_message`, the existing agent path). SMS/`ai-send-support-reply`/`ai-handle-inbound-sms`/`ai-handle-missed-call` paths target functions **not deployed in LIVE** → degrade to harmless banner errors; cannot send.

### Build
- `npm run type-check`: my 5 task files = **0 errors** (only pre-existing unrelated errors in AIAssistantTrustCard/AnalyticsTab/EmployeeHrDirectory/ProviderInternalRecords). `npm run build` (`vite build`, what Vercel runs): **✓ built in ~25s**, prerender 242 files 0 errors, attribution parity OK.

### Zero-send sweep (task window)
0 outbound AI messages, 0 agent/system chat rows, 0 events sent-to-chat, 0 SMS usage, 0 SMS messages. Settings unchanged (draft / auto off / sms-auto off / kill off), Nataisa `+17138780013` still blacklisted. SMS functions not deployed.

### Retained synthetic evidence draft (safe to delete)
One AI draft kept for in-app UI verification: `ai_support_conversations.id = 27a84546-7d82-4c33-8062-45d124fddeb3` (labeled `customer_name = '[SYNTHETIC — OpenAI verify 2026-07-08, safe to delete]'`), draft text = ESA letter-timing answer, `action=drafted`, never sent. Its public `chat_sessions`/`chats` rows were deleted (Chats tab stays clean).
Cleanup when done:
```sql
delete from ai_support_notifications where conversation_id='27a84546-7d82-4c33-8062-45d124fddeb3';
delete from ai_support_ai_events    where conversation_id='27a84546-7d82-4c33-8062-45d124fddeb3';
delete from ai_support_messages     where conversation_id='27a84546-7d82-4c33-8062-45d124fddeb3';
delete from ai_support_conversations where id='27a84546-7d82-4c33-8062-45d124fddeb3';
```

### Follow-ups / not in scope
- Keep `ai_chat_reply_mode=draft`; do NOT flip to `auto` without separate explicit approval. Instant off = set mode `off` or `ai_global_kill_switch=true`.
- SMS pipeline still not deployed in LIVE (intentional). The panel's SMS controls are vestigial until an SMS rollout task.
- Browser admin render not done here (LIVE admin OTP is owner-only) — verified via build + SQL + function behavior instead.
