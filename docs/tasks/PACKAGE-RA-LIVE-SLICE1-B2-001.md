# PACKAGE-RA-LIVE-SLICE1-B2-001 — LIVE Slice 1 Batch B2: Provider / Admin / AI-Support Housing UI (+ frozen OrderDetailModal)

**Owner:** Claude session (2026-07-13), session `173fd9e7-333b-40eb-82f5-58add9a068af` — owner-approved LIVE prep only · **Repo:** LIVE `pawtenant-live-backup` (`cvwbozlbbmrjxznknouq`)
**Status:** `in_progress`
**Starting LIVE commit:** `c50f393` (HEAD, unchanged; nothing committed/pushed/deployed)
**Authorization:** code preparation + surgical merges + staging + local typecheck/build/static checks + safe browser rendering ONLY. **NO** commit / push / migration apply / Edge Function deploy / Vercel deploy / storage change / Stripe action / customer-order mutation / email / SMS / chat / call / GHL action.
**Frozen-file tracker note:** external `PawTenant_Tracker_with_CompanyOS.xlsx` (CLAUDE.md §frozen, row ~210) is NOT present in this repo. This task card is the in-repo coordination record; a paste-ready workbook row is included in the B2 session report. No spreadsheet fabricated.

## Prior state (already staged in index, unchanged by B2)
- **Batch A** (16): 8 edge fns + 2 `_shared` + 6 migrations `20260713010000..010500`. GOTCHA: migration `010000` must apply before `provider-submit-letter` v98 deploy.
- **Batch B1** (41): 28 new + 13 merged customer package/assessment/portal files.
- Both remain exactly staged; B2 must not alter them unless a proven dependency requires a correction (reported first).

## B2 locked file set (8)
**New (4):**
- `src/lib/aiSupportSuggestions.ts` (draft-only suggestion logic)
- `src/pages/admin-orders/components/AISupportAssistant.tsx` (admin AI Support panel, draft-only)
- `src/pages/admin-orders/components/OrderRaOverviewStatus.tsx` (Admin Housing overview card)
- `src/pages/admin-orders/components/OrderRaDocPanel.tsx` (Admin Housing documents)

**Surgically merged (3, non-frozen):**
- `src/pages/provider-portal/components/ProviderOrderDetail.tsx` (three-way: add Housing/RA only; preserve all LIVE-only provider behavior)
- `src/pages/provider-portal/page.tsx` (additive select/type fields only: package/billing/RA/preferred-contact/Housing status)
- `src/pages/admin-orders/components/CommunicationTab.tsx` (AI Support mount + draft handling ONLY; preserve LIVE unified timeline)

**Frozen (1, LAST):**
- `src/pages/admin-orders/components/OrderDetailModal.tsx` — seven approved localized hunks only.

## Seven approved frozen-file hunks (OrderDetailModal.tsx)
1. **Imports** — add `OrderRaOverviewStatus`, `OrderRaDocPanel`, + strictly required type/const for the doc-type guard.
2. **Unpaid assignment** — remove `skipPaymentCheck: true` from both assign-doctor calls (no other payload fields changed).
3. **Housing overview mount** — mount `<OrderRaOverviewStatus>` in Order Overview, required props only.
4. **Housing documents mount** — mount `<OrderRaDocPanel>` in Documents using the existing secure file-opening callback (wrap only to match signature).
5. **Requested-provider removal** — remove only the approved requested-provider UI; do NOT touch assigned-provider info or normal reassignment for paid orders.
6. **Document stamping guard** — allow Generate-ID/Stamp/Inject-Footer only for explicit final-letter types (`esa_letter`/`psd_letter`/`signed_letter`/`letter`); deny `customer_upload`/`housing_completed`; unknown types fail closed.
7. **Base-payment-only assignment-control guard** (added 2026-07-13, authenticated-E2E-uncovered defect) — the Provider Assignment panel's unpaid gate used a status escape-hatch (`!payment_intent_id && status ∉ {processing,under-review,completed}`), so a quarantined fixture with an **unpaid base order** whose status was advanced to `under-review` by a **paid $70 Housing add-on** exposed active Assign/Reassign/Nudge/Remove. Fix: one canonical `const isBaseOrderPaid = !!(order.payment_intent_id || order.paid_at)` (co-located with the assignment computeds) and gate the arm on `!isBaseOrderPaid`. Keys ONLY on authoritative base-payment fields — never `order.status`, never the add-on. Frontend now mirrors the already-correct `assign-doctor` backend gate (`orderIsPaid = !!payment_intent_id || !!paid_at` → `rejected_unpaid_order`). Two localized diff hunks (const + condition); no other change.

**Frozen prohibitions:** no full-file copy, no reformat, no unrelated-section changes, no refund/timeline/Accounts/Analytics changes, no absorbing baseline type errors, no cleanup outside the six hunks. Separate frozen diff produced after applying.

## Excluded (NOT B2)
- New admin files: `CallCustomerModal.tsx`, `GlobalDialpad.tsx` (ADMIN-CALLING-MVP), `EmailHubPanel.tsx`, `MarketingROIHealthPanel.tsx`, `MonthlyReportRecipientsPanel.tsx`.
- All OrderDetailModal divergence outside the six hunks.
- **Storage-privacy** flip: deferred (provider-letters stays PUBLIC this slice).
- **Homepage / state ESA / state PSD** pages: excluded.
- HR / Investor / Ads / Accounts / AI runtime activation / GHL / notification-send: excluded.

## Provider financial-protection contract
Provider must NOT see `$70` / order price / coupon / discount / Stripe data / add-on amount / admin finance / payout internals. `amount_cents` internal status-gating only (never rendered). Housing compensation shown as the exact abstraction: "This Housing Accommodation request is compensated at your standard per-case rate." Provider Submitted Letters excludes `customer_upload` + `housing_completed`.

## Outcome (2026-07-13) — B2 STAGED (not committed/deployed)
- **Staged 9 B2 files** (4 merged + 4 new + this card); index now A(16)+B1(41)+B2(9) = 66. HEAD still `c50f393`.
- **ProviderOrderDetail.tsx**: true three-way surgical merge via ~24 individual hunk-edits (never file-replaced). Legacy single-file upload verified DEAD before removal; all LIVE behaviors (assignment/reject/in-review/notes/refund/callbacks) verified retained; result converges to TEST target. Provider financial-protection contract holds (no rendered $, exact compensation wording, Submitted Letters excludes customer_upload+housing_completed, 0 getPublicUrl).
- **CommunicationTab.tsx**: AI Support ONLY (import+mount+state prop+RA-contact listener). LIVE unified timeline 100% preserved (diff is purely additive; call panel/handleCall/labels retained; ADMIN-CALLING-MVP excluded).
- **Frozen OrderDetailModal.tsx**: exactly the 6 approved hunks (35+/10−). Excluded: CallCustomerModal mount, unpaid-gate `paid_at` relabel, placeholder copy — all preserved as LIVE.
- **New**: OrderRaOverviewStatus/OrderRaDocPanel (read-only mounts), AISupportAssistant (draft-only), aiSupportSuggestions (no send).
- **Validation**: prod build exit 0 (prerender 242/0 err, attribution parity OK); type-check 8 errors = same baseline, ZERO in any B2 file; scans clean (no TEST/Stripe/public-URL/auto-send/page-load-mutation/contamination); admin+provider routes mount clean at /admin-login (no console errors, no overflow).
- **Deferred final-release blocker**: authenticated admin/provider Housing + AI-Support UI E2E requires an approved staff session (not fabricated). Also deferred: provider `page.tsx` notification-bell `customer_document_uploaded` hunk (alters a provider query — excluded per B2 rules).
- No commit/push/deploy/migration/Stripe/comms/GHL/mutation performed.
