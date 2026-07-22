# LIVE rollout — Admin "Preview as Provider" (ADMIN-PROVIDER-PORTAL-PREVIEW-LIVE-001)

**Status:** ✅ LIVE. Surgical rollout of verified TEST commit `ab853dc`.
**Source:** TEST `ab853dc` "feat: add admin \"Preview as Provider\" portal mode" (NOT TEST HEAD). Full feature record: TEST `docs/admin-provider-portal-preview.md`.
**No mutations:** code-only. No DB migration, no edge function, no RLS change. No order / earning / payout / refund / document / notification / portal-state mutation possible (read-only, enforced in every handler).
**Rollback:** `git reset --hard 6a5c9b4` (previous LIVE main = provider-financial CSV export) or `git revert <this commit>`.

## What shipped
The provider mirror of "Preview as Customer": an authorized admin opens the **real** Provider Portal viewed **read-only** as a selected provider, with the relevant order pre-selected, to QA "can this provider see the correct details for this order?". Reuses the real portal (no drift-prone recreation).

Deep link: `/admin/provider-preview?provider=<doctor_profiles.user_id>&order=<confirmation_id?>` (stable internal id — never email).

Entry points:
- **"Provider View"** button beside "Customer View" in the Order Details header (frozen `OrderDetailModal`, surgical) — shown when a provider is assigned, else disabled "No Provider".
- Repointed the pre-existing broken More-menu "Open Provider View" link (was `/provider-portal?order=` which loaded the admin's *own* portal) → `/admin/provider-preview?provider=…&order=…`.
- Providers list (`DoctorsTab`) "Preview Portal" row action.

## Security / read-only
- Authorization = admin session verified **server-side** (`check-admin-status`) + RLS on every read (admin session legitimately reads the target's rows). The URL param is a SELECTOR, never authz. No provider session, no service-role in browser, no RLS bypass. Fail-closed on invalid provider / non-admin.
- Read-only enforced **inside every provider-portal write handler** (`if (readOnly) return;`): status, reject, submit-letter, housing-upload, shared-notes send/delete, NPI/license/state, bio, mark-notifications-read, sign-out; plus load-time RPCs skipped. UI also disabled.
- Every preview open is audit-logged idempotently (`object_type='provider'`, `action='provider_portal_preview_accessed'`, metadata provider/order/timestamp).
- No banking / payout-account / tax / password / OTP / auth exposure (the real portal never shows these).

## Files (surgical port of `ab853dc^..ab853dc`)
- **6 files applied byte-identical** to TEST `ab853dc` (LIVE base matched TEST base): `SharedNotesPanel.tsx`, `AdminProviderPreview.tsx` (rebuilt wrapper), `DoctorsTab.tsx`, `ProviderEarnings.tsx`, `ProviderLicensePanel.tsx`, `ProviderProfilePanel.tsx`.
- **2 files patched cleanly around LIVE divergence**: `provider-portal/page.tsx`, `ProviderOrderDetail.tsx`. LIVE diverges here only by the TEST-only `PARTIAL-REFUND-TERMINAL-STATE-CONSUMER-FIX-001` (partial-refund accounting) — which was **deliberately NOT ported** (verified: `isWorkStopped`/`isPartialRefund` absent in LIVE). The preview hunks (previewContext seam, read-only guards) are in different, identical regions and applied without touching LIVE's refund logic.
- **FROZEN `OrderDetailModal.tsx`** — hand-ported the 2 surgical hunks into LIVE's own (divergent) header (+31/−3, one region): Provider View button + More-menu repoint. **No blanket copy.** Divergence class: *temporary rollout divergence, now resolved by owner approval*. Edit type: *localized UI correction / isolated component mount*. Preserves all other OrderDetailModal functionality.
- **New** `scripts/check-provider-portal-preview.mjs` (27 invariants + 2 counts + 3 negative controls, `--self-test` 8/8) wired into LIVE `npm run build` + `check:/test:provider-preview`.

## Preserved LIVE-only state (explicitly untouched)
- LIVE Admin Orders loader + its known flicker behavior (the TEST dataset-stability guard/fix was rolled back on LIVE and is **not** re-introduced — LIVE build script still lacks `check-admin-orders-dataset-stability`).
- Already-LIVE provider-financial CSV export (`ADMIN-ORDER-EXPORT-PROVIDER-NET-LIVE-001`, `6a5c9b4`) — its guard remains green.
- LIVE partial-refund behavior (LIVE never had the TEST partial-refund work; still doesn't).

## Verification
- `npm run build` exit 0 — vite build + all LIVE guards, incl. the already-LIVE `check-admin-order-export-provider-net` (still green), plus new `check-provider-portal-preview` (27 inv / 2 counts / 3 neg). This is the LIVE deploy gate (Vercel runs `npm run build`).
- `npm run type-check`: my 9 ported files are **type-clean** (0 errors in them). LIVE's standalone `tsc` reports 8 **pre-existing** errors in unrelated, untouched files (`AIAssistantTrustCard.tsx`, frozen `AnalyticsTab.tsx`, `EmployeeHrDirectory.tsx`, `ProviderInternalRecords.tsx`) that predate this rollout and are outside the deploy gate — not a regression from this change, and intentionally not fixed here (out of scope; do not touch frozen/unrelated code).
- **RLS visibility on LIVE DB `cvwbozlbbmrjxznknouq`** (impersonated JWT claims, RLS enforced — not service-role), provider Robert Staaf (`3d452d99…`):
  | Scenario | check_is_admin | orders | earnings | notifs |
  |---|---|---|---|---|
  | Admin previewing (`0a79d74e…` Omer) | true | 130 | 137 | 233 |
  | Provider self (ground truth) | false | 130 | 137 | 233 |
  | Non-admin forging the URL | false | 0 | 0 | 0 |
  Preview shows exactly what the provider sees; non-admin fully fail-closed. LIVE portal-table RLS (orders/notifications/docs/addon-docs/earnings/profiles) has admin-read paths identical to TEST.

## Not done (owner)
- Authenticated admin click-through of the LIVE preview UI (banner, read-only controls, order highlight, provider switch) — needs an admin password the agent cannot enter. Recommend an owner smoke-test on `https://pawtenant.com` after deploy: open an order with an assigned provider → **Provider View** → confirm the orange banner, correct orders/assessment/RA chip/docs, and that all action buttons are disabled. **Roll back immediately** if normal provider-portal behavior or Admin Orders regresses.
