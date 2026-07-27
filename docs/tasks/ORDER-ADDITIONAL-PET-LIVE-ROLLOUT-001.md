# ORDER-ADDITIONAL-PET-LIVE-ROLLOUT-001

**Type:** Surgical LIVE rollout · **Date:** 2026-07-27
**Status:** ✅ LIVE COMPLETE — ADDITIONAL PET FEATURE VERIFIED

| | |
|---|---|
| TEST source SHA | `a611eba` (feature) / `5dbe7ce` (audit doc) |
| LIVE start SHA | `c905aa0` |
| LIVE final SHA | `2d9efa6` |
| LIVE deployment | `pawtenant-production-gjrb95mdc` (`dpl_Gf46pTPttdbQDu3NTJRfjvf39djv`) |
| Rollback deployment | `pawtenant-production-fqe41tdx5` |
| Existing-order mutations by this rollout | **0** |

---

## 1. Preflight

Both repos on `main`, clean, level with `origin/main`, no merge/rebase/cherry-pick/bisect/revert/index.lock state. No `in_progress` task owned checkout, Stripe webhook, portals, Admin Orders, Accounts, document versioning, entitlement schema or `package.json`. **No concurrent LIVE writer.** No deployment building.

**LIVE migration ledger does not align with repo filenames** (repo `20260727100000_admin_orders_monthly_kpis.sql` ↔ ledger `20260726164800`). Every migration was therefore applied through explicit MCP SQL. **`supabase db push` was never run.**

### Pre-rollout fingerprints

| Metric | Value |
|---|---|
| orders / paid | 1,647 / 464 |
| orders price sum | 155,146 |
| orders fingerprint | `c54738f6afd2a28dd033e23fe19c21c8` |
| letter_verifications (383) fp | `0b3361cc0241540dbfbc6557379bf7dc` |
| doctor_earnings (473) fp | `cb3129f171e7bf3209f8af85b6d14530` |
| Google Ads adjustments (21) fp | `9d575009486d17874fc49b6bcf6a0f64` |
| Ads uploads / uploaded orders / Meta sent | 5 / 402 / 373 |
| auth users / doctor_profiles / audit rows | 663 / 23 / 9,373 |

---

## 2. Classification stop gate — PASSED

Re-run immediately before any write, over all **1,647** orders:

| Classification | Audit | Re-run | Δ |
|---|---:|---:|---|
| Automated `$20` | 157 | **157** | 0 |
| Automated `$0` | 57 | **57** | 0 |
| Manual review | 218 | **218** | 0 |
| Blocked/ineligible | 1,214 | **1,215** | +1 (one new unpaid lead) |

Snapshot plan unchanged: 464 candidates / 231 supported / 233 manual review.

Safety counters all **0**: no annual priced, no ambiguous priced, no unpaid-or-reversed priced, no maxed-out priced.

---

## 3. Migrations — 6 of 6 applied

Applied one at a time via MCP `apply_migration`, each verified against TEST before proceeding.

| # | Migration | Result |
|---|---|---|
| 1 | `20260727120000_order_entitlement_snapshots` | ✅ |
| 2 | `20260727130000_order_document_versions` | ✅ |
| 3 | `20260727140000_ensure_revision_verification_id` | ✅ |
| 4 | `20260727150000_additional_pet_requests` | ✅ |
| 5 | `20260727160000_accounts_additional_pet_addon` | ✅ |
| 6 | `20260727170000_additional_pet_events_allow_cascade_delete` | ✅ |

Runtime <1 s each; lock risk limited to brief FK locks on `orders` (1,647 rows) and one `ADD COLUMN … DEFAULT` on `letter_verifications` (383 rows, no table rewrite on PG11+). **No migration contains any INSERT/UPDATE/DELETE against `public.orders`** (verified by grep).

### Function parity — all 20 byte-match TEST

Every new/replaced function was compared to TEST with comments stripped and whitespace removed. **All 20 identical**, same `prosecdef`, same pinned `search_path`.

One verification catch worth recording: `classify_order_entitlement` initially differed by **one space** inside a `format(` call (TEST's deployed copy had been whitespace-normalised at deploy time). The whitespace-insensitive comparison proved semantic identity — the literal string, arguments and all branch logic matched exactly.

### The two `create or replace` collisions

**`get_accounts_reconciliation`** — proven a clean superset *before* applying:
- pre-add-on migration bodies byte-identical TEST↔LIVE;
- the migration file's normalised body md5 (`bd2a4bc2f9ceb3216dafdde087743ab7`) equals TEST's verified deployed function;
- LIVE's tuned join shape (materialized `paid`/`prov`, hash LEFT JOINs, no correlated per-row subqueries) preserved verbatim; only the add-on `union all` projection and the add-on refund term added.
- Bonus: the migration also added the missing `anon` revoke on this function.

**`verify_letter_id`** — all 12 pre-existing keys, the not-found shape and the status precedence preserved; 4 additive version fields plus a pinned `search_path`. `status` deliberately does **not** flip on supersede.

### Post-migration security

`get_advisors(security)`: **387 findings before, 387 after.** Delta is exactly:
- `−1` `anon_security_definer_function_executable` (`get_accounts_reconciliation` hardened)
- `+1` `authenticated_security_definer_function_executable` (`get_additional_pet_request_for_provider`, the one intended grant)

No new `function_search_path_mutable` findings.

Grants verified fail-closed: of 16 relevant functions, only `verify_letter_id` is anon-executable (public verification) and only `get_accounts_reconciliation` + `get_additional_pet_request_for_provider` are authenticated-executable. The other 13 are revoked from both roles.

---

## 4. Entitlement snapshot backfill

| Run | inserted | already_present |
|---|---:|---:|
| dry run | 0 | 0 |
| run 1 | **464** | 464 |
| run 2 | **0** | 464 |

**Idempotency proven.** Result: 231 `supported` / 233 `manual_review_required`.

Integrity assertions, all **0**: ambiguous-but-supported, annual-but-supported, guessed limit with unknown tier, revision ≠ 1, snapshot_source ≠ backfill.

Confidence mix: `deterministic_historical_price` 199 · `ambiguous_manual_review` 179 · `exact_package_key` 72 · `inferred_existing_package` 14 — identical to the independent read-only replication.

Verified through the **deployed** `resolve_additional_pet_pricing` across all 1,647 orders: 157 × `paid_upgrade` @2000, 57 × `included` @0, 218 × `manual_review` @0, 1,215 × `blocked` @0. **Zero amounts outside {0, 2000}; zero manual/blocked orders carry a price.**

---

## 5. Edge functions

| Function | Before | After | verify_jwt | Result |
|---|---:|---:|---|---|
| `create-additional-pet-request` | — | **v1** | `true` | new |
| `provider-additional-pet-decision` | — | **v1** | `true` | new |
| `stripe-webhook` | v151 | **v152** | `false` (preserved) | surgical +62/−0 |
| `provider-submit-letter` | v103 | **v104** | `false` (preserved) | TEST version + LIVE logo URL |
| `verify-letter` | v59 | **v60** | `false` (preserved) | +13 allowlist |

All JWT modes landed exactly as approved. Rollback versions: **v151 / v103 / v59**.

Divergence handling:
- `verify-letter`: LIVE was byte-identical to TEST's pre-feature baseline → safe wholesale copy.
- `provider-submit-letter`: differed by exactly **1 line** (the readdy.ai email logo URL) → TEST version copied, LIVE logo restored.
- `stripe-webhook`: **215 divergent lines** → surgical only. Five hunks: one import, one handler, and `additional_pet` routing on all three payment events (`payment_intent.succeeded`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`).

Authorization probes: both new functions return **401** unauthenticated; `stripe-webhook` returns **400** on an unsigned body (reaches the function, signature auth rejects). `verify-letter` returns the correct not-found shape anonymously (HTTP 200).

---

## 6. Stripe safety

- `ADDITIONAL_PET_UPGRADE_CENTS = 2000`, `ADDITIONAL_PET_CURRENCY = "usd"` — single source of truth.
- `adaptive_pricing: { enabled: false }` on **both** session-create paths.
- Amount **and** currency verified before the row is marked paid; a mismatch is recorded as `payment_amount_mismatch` + audit row and held.
- `$0` path creates no Stripe object; no order row is ever created; refunds affect the add-on only (`create-refund` untouched).

**No LIVE charge, no LIVE refund and no Stripe object were created by this rollout.**

---

## 7. Frontend — 14 files, every diff matching TEST exactly

| File | Delta | Method |
|---|---:|---|
| `admin-orders/page.tsx` | +30/−0 | surgical (1,104 divergent lines) |
| `OrderDetailModal.tsx` **FROZEN** | **+26/−0** | 2 imports + 4 isolated mounts, zero deletions |
| `OrderCard.tsx` | +8/−1 | surgical |
| `my-orders/page.tsx` | +21/−0 | surgical |
| `ProviderOrderDetail.tsx` | +7/−0 | surgical |
| `verify-result/page.tsx` | +23/−0 | surgical |
| `MyDocumentsCard.tsx`, `Step2PersonalInfo.tsx` | — | identical base → copied |
| 5 new components + 2 guards | new | copied |
| `package.json` | +1/−1 | one guard inserted; LIVE's own guard list preserved |

LIVE-only work preserved throughout: Admin performance/dataset-stability, monthly KPI, Accounts responsive, lifecycle, Google Ads refund guard, provider preview, CSV export.

---

## 8. Validation

- `check-additional-pet-upgrade.mjs`: **44/44 pass** on LIVE.
- `npm run build`: **exit 0** (vite built in 34.77 s; 306 SEO files; 18/18 prerender routes; all LIVE guards green, incl. `check-google-ads-refund-adjustment` 153 checks).
- `git diff --check` clean; no literal secrets (all env-var references); no PII.

**Known pre-existing failure:** `check-entitlement-document-versioning.mjs` fails one assertion ("revision idempotency key must be (order, doc_type, target version)") because `b33304c` deliberately re-keyed revision idempotency to the **source file** — keying on `v{nextVersion}` converges concurrent calls but not sequential retries. **This fails identically on TEST at `a611eba`.** It is not wired into either build chain and was left unmodified.

---

## 9. Deployment and QA

`pawtenant.com` aliases `gjrb95mdc`; site 200; `www` → non-www **308** intact.

**Public verification (real legacy ID, masked `ESA-GA-…`):** renders "Letter Verified", status Valid, all legacy fields present (type, state, issue/expiry, provider, NPI, state license); no supersede banner (correct — no legacy row is superseded); no PHI. Not-found shape unchanged. Zero console errors, zero failed RPCs.

**Responsive — all 8 widths PASS** (1440/1280/1024/768/440/390/375/360): no horizontal overflow, **zero clipped or off-viewport elements** (checked per-element bounding rects, not just `scrollWidth`), all actions reachable.

**Portal routes:** `/my-orders` → `/customer-login`, `/admin-orders` and `/provider-portal` → `/admin-login`, all rendering cleanly.

> **Limitation — authenticated click-through NOT performed.** The agent cannot enter passwords, so the Customer Portal Additional Pet CTA, the Admin chip/panels and the Provider review UI were not exercised against a logged-in session on LIVE. All three were fully verified on TEST at `a611eba`, are guarded by 44/44 static invariants, and their server contracts were verified directly against the LIVE database. **Owner smoke-test recommended.**
>
> The `[adminOrdersMonthlyKpis] rpc failed` console error on `/admin-orders` is a by-design authorization rejection for an unauthenticated visitor (`get_admin_orders_monthly_kpis` is not anon-executable and has an internal admin gate). It is untouched by this rollout. The new Additional Pet effect is `adminProfile`-guarded and never fires unauthenticated — no `additional_pet` error appeared.

---

## 10. Post-rollout invariants

| Invariant | Result |
|---|---|
| paid-order count | **464 — unchanged** |
| price sum over the same 1,647 pre-existing rows | **155,146 — unchanged** |
| `letter_verifications` fingerprint | **identical** |
| `doctor_earnings` fingerprint | **identical** |
| Additional Pet provider earnings | **0** |
| Google Ads adjustment-ledger fingerprint | **identical** |
| Ads uploads / uploaded orders / Meta sent | **5 / 402 / 373 — unchanged** |
| entitlement snapshots | 464 (approved) |
| Additional Pet requests / events / document versions | **0 / 0 / 0** |

The composite `orders` fingerprint moved, and is **fully accounted for by concurrent live business activity, not by this rollout**:
1. **+1 new customer order** (organic, unpaid, $129) created 14:44 UTC;
2. **1 `refund_issued` at 14:42 UTC by `actor_role='owner'`** through the admin UI — no `additional_pet` involvement;
3. 2 pre-existing rows touched by live traffic.

Structural proof the rollout could not have written `orders`: no migration contains a write to `public.orders`; the backfill's only write is `INSERT … ON CONFLICT DO NOTHING` into `order_entitlement_snapshots`; and zero Additional Pet requests exist, so no add-on code path ever executed.

---

## 11. Deliberate omissions

- **`register_legacy_document_versions` was NOT run.** It would UPDATE pre-existing `letter_verifications` rows (setting `document_version_id`/`version`), which is outside the approved change set. Consequence: document-version history is empty for legacy orders until a separately approved registration run. New revisions create their own versions and are unaffected.
- `TEST_SUPPRESS_EXTERNAL_NOTIFICATIONS` was **not** set on LIVE (suppression is fail-closed and requires the secret to equal `"true"`; unset ⇒ normal sending).

## 12. Follow-ups for the owner

1. Authenticated smoke test of the Customer / Admin / Provider Additional Pet surfaces on `pawtenant.com`.
2. Decide whether to run legacy document-version registration on LIVE.
3. Update or retire the stale assertion in `check-entitlement-document-versioning.mjs` (fails identically on TEST).
4. Observation: the Google Ads adjustment ledger did not move despite the 14:42 owner refund — consistent with the classifier-driven shadow-ledger design, but worth confirming against `GOOGLE-ADS-REFUND-ADJUSTMENT` expectations.

## 13. Rollback

- Vercel: promote `pawtenant-production-fqe41tdx5`.
- Edge functions: redeploy `stripe-webhook` v151, `provider-submit-letter` v103, `verify-letter` v59 (all `--no-verify-jwt`).
- Code: `git revert` the six commits (`4f2bd88`, `97b9463`, `699f9f3`, `be3959e`, `108b938`, `2d9efa6`). No history rewriting.
- Snapshots: `delete from public.order_entitlement_snapshots where snapshot_source = 'backfill';` — removes only backfilled rows.
- Schema: drop the new tables/functions per the migration list; restore the prior `get_accounts_reconciliation` from `20260725190000_optimize_get_accounts_reconciliation.sql`.
