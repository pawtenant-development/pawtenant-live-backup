# PawTenant Email System Audit

> Last updated: 2026-05-05
> Source of truth for what each email-related Edge Function does and where its content comes from. Keep `src/pages/admin-orders/components/SettingsTab.tsx` constants `DB_MANAGED_EMAIL_SLUGS` / `DB_MANAGED_SMS_SLUGS` in sync with this doc.

## Legend

- **Template source**
  - `db` — body/subject loaded from `email_templates` row at send time. Admin edits in Settings hub take effect immediately.
  - `partial` — DB body is loaded but the function still injects required variable blocks or fixed scaffolding before sending. Admin can edit content; system controls structure.
  - `hardcoded` — full HTML/text lives inside the Edge Function. Admin cannot edit without code change.
  - `unknown` — needs verification.
- **BCC** — `trustpilot` means Trustpilot AFS BCC is attached. `none` means no BCC.
- **Migration risk** — Low / Medium / High based on impact if the migration regresses (financial / legal / time-critical = High).

## Status of the manual review email — DONE

`send-review-request` is **fixed in TEST and LIVE**. Manual review email now renders from `email_templates` (slug `review_request`, channel `email`) using the same paragraph + CTA + master-layout pipeline as the Settings hub preview. Trustpilot BCC is preserved through `TRUSTPILOT_BCC_EMAIL`. No automatic post-payment Trustpilot triggers — review requests are manual-only, gated on `doctor_status = 'patient_notified'`.

---

## Email-related Edge Functions

| # | Function | Purpose | Recipient | Template source | Uses `logEmailComm`? | BCC | Migration risk | Recommended order |
|---|---|---|---|---|---|---|---|---|
| 1 | `send-review-request` (email) | Manual Trustpilot review request | Customer | **db** (slug `review_request`) | ✅ | trustpilot | — | **DONE** |
| 2 | `send-review-request` (sms) | Manual Trustpilot review SMS | Customer | **db** (slug `review_request_sms`) | ⚠️ writes to `communications` directly (not via helper) but logged | n/a | — | DONE |
| 3 | `send-templated-email` | Generic admin Send Email panel sender | Customer | **db** (slug from caller) | ✅ | none | Low | DONE (Phase 3) |
| 4 | `send-checkout-recovery` | Admin recovery email (pre-paid leads) | Customer | **db** (slug `checkout_recovery` / `checkout_recovery_discount`) | ✅ | none | Low | DONE (Phase 3) |
| 5 | `lead-followup-sequence` | Cron 5-stage automated recovery emails | Customer | **partial** (DB body + per-stage hardcoded fallback) | ✅ via `reserveEmailSend`/`finalizeEmailSend` | none | Medium | Already DB-first w/ hardcoded fallback — next: backfill missing slug content |
| 6 | `broadcast-email` | Admin BroadcastModal bulk send | Customer cohort | hardcoded compose UI; admin types subject/body | ✅ writes `broadcast_logs` | none | Low | (already migrated to shared helper; content is admin-typed, not slug-driven) |
| 7 | `contact-reply` | Admin reply to contact_submission | Customer | hardcoded HTML wrap of admin-typed body | ✅ writes `contact_submission_replies` | none | Low | (migrated to shared helper) |
| 8 | `send-template-test` | Admin "send test" from hub | Tester | **db** (slug from caller) | ✅ | none | Low | n/a — test-only path |
| 9 | `resend-confirmation-email` | Order Confirmed customer email | Customer | **hardcoded** | ✅ via `reserveEmailSend`/`finalizeEmailSend` | **none** (per business rule) | High | Future phase — content-only DB migration with locked variables (`{confirmationId}`, `{amount}`, etc.) |
| 10 | `stripe-webhook` (payment_receipt) | Payment Receipt customer email | Customer | hardcoded inline HTML in `buildPaymentReceiptHtml` | ✅ via `reserveEmailSend` | **none** (per business rule) | **High** — keep hardcoded |
| 11 | `stripe-webhook` (internal_notification) | Admin "NEW PAID ORDER" alert | Admin | hardcoded inline HTML | ✅ | **none** | High — keep hardcoded |
| 12 | `notify-order-status` | Customer + admin status change emails | Customer + Admin | hardcoded per-status branches | ✅ partial | none | High — order lifecycle critical |
| 13 | `notify-customer-refund` | Refund confirmation + admin notice | Customer + Admin | hardcoded | ✅ | none | High — financial |
| 14 | `notify-patient-letter` | Letter-ready notice to provider/admin | Provider/Admin | hardcoded | partial | none | Medium |
| 15 | `notify-thirty-day-reissue` | 30-day reissue prompt | Customer | hardcoded | partial | none | Medium |
| 16 | `notify-license-change` | License change alert | Provider | hardcoded | partial | none | Low |
| 17 | `notify-provider-application` | Provider application receipt + admin notice | Provider/Admin | hardcoded | partial | none | Medium |
| 18 | `notify-approval-request` | Admin approval workflow emails | Admin | hardcoded | partial | none | Medium |
| 19 | `assign-doctor` | Provider-assigned customer + provider notices | Customer + Provider | hardcoded | partial | none | High — affects provider workflow |
| 20 | `provider-submit-letter` | Letter-ready customer email | Customer | hardcoded | partial | none | High — document delivery |
| 21 | `create-provider` | Provider portal invite (auth link) | Provider | hardcoded | partial | none | High — auth-link sensitive |
| 22 | `create-customer-account` | Customer account auth invite | Customer | hardcoded | partial | none | High — auth-link sensitive |
| 23 | `create-team-member` | Team invite | Admin | hardcoded | partial | none | Medium |
| 24 | `send-followup-email` | Provider application followup | Applicant | hardcoded | partial | none | Medium |
| 25 | `send-renewal-reminders` | Cron renewal reminders | Customer | hardcoded | ✅ | none | Medium |
| 26 | `send-payout-reminder` | Provider payout reminder | Provider | hardcoded | partial | none | Low |
| 27 | `send-admin-otp` | Admin OTP email | Admin | hardcoded | partial | **none** | High — auth-critical |
| 28 | `admin-send-password-reset` | Password reset (provider/admin) | Provider/Admin | hardcoded | partial | none | High — auth-critical |
| 29 | `send-customer-password-reset` / `request-customer-password-reset` | Customer password reset | Customer | hardcoded | partial | none | High — auth-critical |
| 30 | `provider-reset-password` | Provider password reset | Provider | hardcoded | partial | none | High — auth-critical |
| 31 | `admin-update-auth-email` | Admin email-change confirmation | Admin | hardcoded | partial | none | High |
| 32 | `resend-confirmation-email` (force re-send) | Manual admin re-send of order confirmation | Customer | hardcoded | ✅ | **none** | High |
| 33 | `fix-order-payment` | Manual payment-rescue receipt | Customer | hardcoded | ✅ | none | High — financial |
| 34 | `get-resume-order` | Resume-link email | Customer | hardcoded | partial | none | Medium |
| 35 | `lead-followup-sequence` (footer unsubscribe) | Unsubscribe page | n/a | hardcoded | n/a | n/a | Low |
| 36 | `contact-submit` (admin notification) | Inbound contact form admin notice | Admin | hardcoded | n/a | none | Low |
| 37 | `approve-provider-application` | Provider approval email | Provider | hardcoded; helper lookup of `email_templates` exists but not yet wired by slug | partial | none | Medium |

---

## Categorization

### A — Already DB-driven (admin edits in Settings take effect)
- `review_request` (email) — manual review request
- `review_request_sms` (sms) — manual review request SMS
- `checkout_recovery`, `checkout_recovery_discount` — admin recovery
- `seq_30min`, `seq_24h`, `seq_48h`, `seq_3day`, `seq_5day` — automated lead follow-up sequence (DB-first, hardcoded fallback)
- `seq_sms_stage1`, `seq_sms_stage2`, `seq_sms_final` — SMS recovery sequence (rows exist; consumed when `recovery_sms_enabled = true` and SMS sender is wired)
- Any slug picked from the admin **Send Email** panel (routed through `send-templated-email`)

### B — Keep hardcoded for now (high-risk to migrate)
- Stripe webhook receipts (`payment_receipt`, `internal_notification`)
- Order confirmation (`resend-confirmation-email`)
- Refund notifications (`notify-customer-refund`)
- Order-status change emails (`notify-order-status`)
- Customer/provider/admin auth flows (OTP, password reset, account invite, portal invite, email-change)
- Document delivery (`provider-submit-letter`, `notify-patient-letter`)
- Manual rescue (`fix-order-payment`)

### C — Hybrid candidates (next-phase migration, content-only)
- `send-followup-email` (provider application followup) — content-only flow
- `send-renewal-reminders` — cron-driven content-only flow
- `notify-thirty-day-reissue` — content-only customer notice
- `assign-doctor` (customer notice path only) — DB body + locked variable block

### D — Future cleanup
- Replace inline `sendViaResend` helpers in 22+ Edge Functions with the shared `_shared/resendClient.ts`
- Add `tags: [{name:"email_type"}]` to all sends for Resend dashboard filterability
- Backfill `communications` log calls in the 12 functions currently logging only partially
- Standardize FROM addresses (`hello@`, `support@`, `noreply@`) by purpose

---

## Trustpilot BCC scope (final)

Manual-only. Attached **only** in `send-review-request` (email channel). Reads `TRUSTPILOT_BCC_EMAIL` Supabase secret with hardcoded fallback constant `pawtenant.com+ddb0d00de5@invite.trustpilot.com`. NOT attached anywhere else — order confirmation, payment receipt, status emails, recovery emails, lead-followup, broadcasts, admin notifications, and all auth flows are BCC-free.

---

## Recommended next migrations (in safe order)

1. **Backfill `seq_48h` and `seq_5day` template content** in TEST + LIVE Settings hub. Both rows exist (seeded via migration) but contain placeholder copy. Admin should write final copy and save. No code change needed.
2. **`send-followup-email` → DB template** with hardcoded fallback. New slug `provider_application_followup`. Cron-driven; ramp slowly.
3. **`send-renewal-reminders` → DB template** with hardcoded fallback. Slug `renewal_reminder`. Same pattern.
4. **`notify-thirty-day-reissue` → DB template**. Slug `thirty_day_reissue`. Customer-facing content-only.
5. **`assign-doctor` customer notice** → hybrid DB body + locked variable block. Slug `provider_assignment_customer_notice`.

After (1)–(5), the high-risk auth + financial + document-delivery paths still remain hardcoded by design. They are **not** migration targets without an explicit later phase.

---

## Verification & rollback notes

- All currently-DB-driven Edge Functions retain a hardcoded fallback path for the case where the DB row is missing or `comms_settings.email_layout_html` is empty. Editing or deleting a slug in the Settings hub never breaks an outgoing send — worst case is a clean default email.
- Reverting any single migration is a one-file copy from the prior git commit; no DB rollback needed because migrations are additive and `ON CONFLICT DO NOTHING`.
- Trustpilot BCC reverts have been exercised already (see `EMAIL-TRUSTPILOT-BCC-ORDER-CONFIRM` task — reverted on 2026-05-03).

## Cross-references

- Settings UI grouping (5 categories): `SETTINGS-IA-CLEANUP-GROUPED-SECTIONS` (tracker row 100).
- Recovery sequence settings panel: `EMAIL-RECOVERY-SETTINGS-UI` (tracker row 99).
- DB-managed slug constants: `src/pages/admin-orders/components/SettingsTab.tsx` (`DB_MANAGED_EMAIL_SLUGS`, `DB_MANAGED_SMS_SLUGS`).
- Migrations seeding the new slugs: `supabase/migrations/20260502150000_recovery_sequence_control.sql`, `supabase/migrations/20260502160000_recovery_sms_sequence.sql`.
- Combined SQL bundle for manual paste: `outputs/email-system-test-migrations-combined.sql`.
