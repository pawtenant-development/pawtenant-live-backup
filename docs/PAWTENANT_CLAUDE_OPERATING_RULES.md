# PawTenant Claude Operating Rules

> Persistent operating rules for any Claude / AI agent working on PawTenant.
> Docs-only reference. Read this before starting a PawTenant task.
> Last updated: 2026-07-06.

## Core execution rule
- **API/MCP/connectors first** for structured data (Supabase MCP, Google Ads API/MCP, GHL MCP, Stripe, etc.).
- **Browser/Chrome fallback is mandatory** when an API/MCP is blocked, expired, incomplete, missing fields, or unavailable.
- **Never stop a task only because one connector failed** if a browser can complete it. "Connector unavailable" is not a stopping point — switch to Chrome/UI and finish.
- Exhaust every avenue an AI can drive — MCP, browser, CLI, SQL, repo inspection — **before** asking Hamza for anything.
- **Ask Hamza only for human-only actions**, e.g.:
  - Logging into a session / passing an auth wall.
  - Receiving an OTP or 2FA code.
  - Sending a real SMS from a real phone.
  - A UI action that no available tool can reach.

## TEST/LIVE rule
- **TEST first** unless Hamza explicitly approves LIVE.
- **LIVE mirror/deploy only after explicit approval.**
- **Preserve unrelated changes** — never revert or bundle someone else's work.
- **Stage only the task's files** for commits; never `git add -A` broadly.
- **Never patch broadly** — surgical, scoped edits only. Respect FROZEN mega-files (surgical edits + tracker row only).
- Repos:
  - TEST: `C:\Users\Hamza\Documents\PawTenant Website Repos\pawtenant-test`
  - LIVE: `C:\Users\Hamza\Documents\PawTenant Website Repos\pawtenant-live-backup`
- Supabase projects:
  - TEST: `opudhofjbydrljgleofq`
  - LIVE: `cvwbozlbbmrjxznknouq`
- Canonical domain: `https://pawtenant.com` (non-www; Vercel 308 www→non-www).

## Google Ads rule
- Use API/MCP if available (Supermetrics `AW`, Google Ads MCP).
- **If unavailable or incomplete, open Chrome and audit the Google Ads UI directly** — do not stop at connector failure.
- Always inspect: **campaigns, goals/conversions, diagnostics, recommendations, insights, search terms, keywords, audiences, demographics, landing pages, ads/assets, and conversion-action breakdowns.**
- Use date-range comparison (yesterday / last 3 / 7 / 30 days / MTD). Remember Google Ads attributes conversions to **click date**, and offline imports can lag up to ~3 days.
- **Never apply recommendations or make changes without approval.** Read-only by default.
- Account context: Account `248-085-3323`, MCC `762-950-8384`. Backend Purchase API conversion action `7567366496` should be **Primary**; ESA Purchase Dynamic + PSD Purchase Dynamic should be **Secondary**. Do not change account-default goals. Do not pause PSD traffic.

## GHL rule
- Use the **GHL MCP for all possible reads/writes**.
- **Exception:** do **not** create/edit workflows through MCP unless the action internals, headers, and custom data can be fully inspected and safely written.
- If workflow internals are not accessible via MCP, **provide exact UI steps** for Hamza instead of a blind write.
- Do everything possible via tools before asking Hamza. Note: the GHL MCP token is read-only for some scopes — verify write capability before relying on it.

## AI Support rule
- **SMS TEST secret rotation is deferred** until moving toward LIVE.
- **SMS auto-reply is TEST-only and whitelist-restricted** unless explicitly expanded (current whitelist: a single number).
- **Live chat testing must use browser testing** wherever possible.
- **Voice AI future persona: Ashley Hall, PawTenant Support.**
- **DND / STOP must fail closed for SMS** — if opt-out state is unknown or the check fails, do not send.
- Crisis / legal / fraud messages are never auto-sent.

## PawTenant compliance copy
- Avoid **"guaranteed approval."**
- Avoid **"government-approved."**
- Avoid **"official registry."**
- Avoid **"guaranteed landlord acceptance."**
- **No legal/medical final authority** language — PawTenant does not issue final legal or medical determinations.
- **PSD copy must not imply that a letter creates service-dog status.**
- **PSD requires a disability-related need and a task-trained psychiatric service dog** — copy must reflect this, not sell a "registration."
- ESA copy must not imply guaranteed approval or acceptance.

## Reporting rule
Every task report must include:
- **Status** (Completed / Partial / Blocked)
- **Files changed** (exact paths)
- **Exact commands** run
- **Browser checks** performed (if a UI/browser task)
- **Screenshots/exports** (paths) if useful
- **Exclusions confirmed** (what was explicitly not touched)
- **Blockers** (honest)
- **Next single action** (the one thing to do or approve next)
