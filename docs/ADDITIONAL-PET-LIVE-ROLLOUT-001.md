# ADDITIONAL-PET-LIVE-ROLLOUT-001 — $30 pricing, grandfathering, eligibility + gating

**Status:** ✅ LIVE COMPLETE (2026-07-29)
**Source of truth (TEST):** `ea21e57` — TEST verified end-to-end including two real card payments.

## ⭐ CANONICAL STATE RECORD (supersedes every SHA quoted elsewhere in this file)

Earlier reports quoted `b595501`, `0293bbe`, `9559f4a` and `dpl_HdCxCZ…` inconsistently. This block
is the single authoritative record, reconciled 2026-07-29 under
`ADDITIONAL-PET-POST-LIVE-RECONCILIATION-001`.

| | |
|---|---|
| **Repository HEAD** | `cc853d9` (== `origin/main`, clean) |
| Last **code** commit of the rollout | `b595501` (02:45 UTC+5) |
| Docs-only commits after it | `0293bbe` (03:22), `9559f4a` (03:53) |
| Post-rollout fix commit | `cc853d9` — refund from immutable quote |
| **Production deployment** | `dpl_HFQ1KLWH5avzetasQAB6fpe45g9o` (alias `htrwoiuhs`), built from `9559f4a` |
| Rollback deployments | `21tuhkcyn` (`0293bbe`) → `5yiual7hg` / `dpl_HdCxCZrL74TbzuSgaGdSsd4Vm2Ha` (`b595501`) |
| LIVE Supabase | `cvwbozlbbmrjxznknouq` |
| Functions | `stripe-webhook` **v153** `verify_jwt=false` · `create-additional-pet-request` **v2** `true` · `provider-additional-pet-decision` **v3** `true` |
| Migrations | `20260728120000`, `20260728140000`, `20260728160000` applied; 12/12 functions byte-match the repo |

🔑 **Why the SHAs looked inconsistent:** this project's git integration deploys **every** push to
`main` to Production — including docs-only pushes. So `0293bbe` and `9559f4a` each triggered a full
production rebuild. The deployed **code** is identical across all three (the deltas are markdown
only), but the deployment ID and the asset hashes change each time, which is why a previously
recorded deployment ID goes stale. Never assume a recorded deployment is still the live one —
re-read it. No code deployment was created merely to make a documentation SHA match production.

**Production deployment:** see canonical record above.
**Rollback deployment:** see canonical record above.

> Phase note: the *base* Additional Pet feature already shipped to LIVE on 2026-07-27 (`c91edf2`).
> This rollout ports the three later TEST workstreams that had never reached LIVE:
> completed-order gating, automatic eligibility + admin resolution, and $30 pricing with
> per-request grandfathering.

---

## 1. The decisive LIVE fact

**LIVE had ZERO Additional Pet requests** (`order_additional_pet_requests` = 0 rows, 0 events)
at rollout time. The feature had been live since 2026-07-27 but no customer had ever created a
request.

Consequences, all verified:
- there was **no $20 population to protect** — grandfathering is structurally inert on LIVE today;
- the migration's `pricing_version` backfill matched **0 rows**;
- a *future-dated* cutover would have been actively harmful: it would have opened a $20 window
  and **manufactured** the grandfathering liability the owner does not want. So the cutover was
  applied as written (`v2_3000` effective `2026-07-28T12:30:00Z`, already in the past), making
  **$30 effective immediately** on application. This is a deliberate, documented deviation from
  the "pick a timestamp several minutes in the future" instruction.

There was also **no stale-price window**: the already-deployed LIVE frontend renders
`dollars(pricing.amount_cents)` straight from the server (the `$20` occurrences in that file were
comments only), so the moment the migration landed the existing UI displayed $30 correctly.

---

## 2. Reconciliation — what was and was NOT ported

TEST and LIVE have **divergent histories** (LIVE commits do not exist in TEST at all), so git
ancestry could not validate the port. Every file was reconciled by content.

### Ported (TEST is a strictly newer generation of the same feature)
| File | Note |
|---|---|
| `supabase/functions/_shared/completeAdditionalPetPayment.ts` | quote-based fulfilment + race idempotency |
| `supabase/functions/create-additional-pet-request/index.ts` | resume/replacement, server-authoritative pricing |
| `src/pages/my-orders/components/AdditionalPetRequest.tsx` | customer card state machine |
| `src/pages/admin-orders/components/OrderAdditionalPetMenuAction.tsx` | **new** isolated Admin component |
| `scripts/check-additional-pet-{upgrade,completed-order-gating,automatic-eligibility}.mjs` | guards |
| `scripts/check-edge-function-modules.mjs` | **new** module-graph guard |
| 3 migrations (`20260728120000`, `20260728140000`, `20260728160000`) | see §3 |

### Deliberately NOT ported
- **`supabase/functions/stripe-webhook/index.ts`** — LIVE's copy is **newer** in one respect
  (brand logo URL) and TEST's carries an entire *unrelated, unshipped* feature
  (`PACKAGE-RA-LETTER-BUNDLE-001`, +187 lines). Copying it would have regressed LIVE **and**
  shipped an unreviewed feature. It was **redeployed only**, so it picks up the changed
  `_shared` module while keeping LIVE's own handler.
- **`provider-additional-pet-decision/index.ts`** — byte-identical in both repos; redeployed only.
- **`OrderAdditionalPetPanel.tsx`** — byte-identical in both repos; untouched.

### Frozen file (CLAUDE.md merge-freeze policy)
`OrderDetailModal.tsx` is MERGE-FROZEN. It diverges by **43 hunks** of unrelated work, so it was
**not** copied. Applied change = an approved *"isolated component mount"*: **12 inserted lines,
0 deletions** (one import + one mount), CRLF preserved. Guard `G13b` pins that no gating logic
entered the frozen file.

---

## 3. Migrations (applied in strict order via MCP SQL — never `db push`)

The three migrations are **hard-chained**: `resolve_additional_pet_pricing` is redefined by all
three, and `160000` references `order_additional_pet_eligibility_overrides` created by `140000`.
They cannot be applied selectively or out of order.

1. `additional_pet_completed_order_gating` — `additional_pet_order_locked()` predicate + engine gate.
2. `additional_pet_automatic_eligibility_and_admin_resolution` — classifier fixes, override tables,
   admin review/resolution RPCs, `repair_order_entitlement_snapshots()` (**defined, not invoked**).
3. `additional_pet_price_v2_30_and_grandfathering` — `additional_pet_price_versions`,
   version/amount trigger, immutability extended to `pricing_version`, resume-at-row-price.

**Byte-fidelity proof:** all **12** functions created across the three migrations were verified by
comparing `md5(comment-stripped, whitespace-normalised prosrc)` against the committed repo files —
**all 12 match exactly**.

> ⚠️ **TEST database drift discovered.** The same comparison shows TEST's *database* differs from
> TEST's *repo* for 4 functions (`get_additional_pet_eligibility_review` has 140 extra logic chars
> in TEST's DB). LIVE matches the committed files; TEST does not. Worth a separate TEST hygiene pass.

**Security posture after migration:** `anon` EXECUTE = false on every new function;
`authenticated` EXECUTE granted only to the two admin RPCs, which authorise internally on
`is_admin_staff()`. New tables have RLS enabled + forced with admin-only SELECT policies.
Advisors show **3** Additional Pet entries, all the expected `authenticated_security_definer`
design warnings, **0** anon-executable findings.

---

## 4. Edge functions

| Function | Version | verify_jwt | Boot proof (application-level, not a gateway 401) |
|---|---|---|---|
| `stripe-webhook` | 152 → **153** | **false (preserved)** | `400 {"error":"Webhook signature required"}` |
| `create-additional-pet-request` | 1 → **2** | true | `401 {"ok":false,"error":"Invalid token"}` |
| `provider-additional-pet-decision` | 1 → **2** | true | `400 {"ok":false,"error":"Unknown action: quote"}` |

`stripe-webhook` was deployed with `--no-verify-jwt` and the mode was **re-read and proven**, not
assumed.

🔑 **`provider-additional-pet-decision` had to be redeployed even though its source is unchanged** —
it imports `ADDITIONAL_PET_UPGRADE_CENTS` from the shared module, which moved 2000 → 3000. Without
the redeploy every provider-rejection refund would have refunded $20 against a $30 charge.

---

## 5. Verification

### Engine (real LIVE data, 400 paid orders)
| outcome | code | amount | version | n |
|---|---|---|---|---|
| paid_upgrade | tier_upgrade_required | **3000** | **v2_3000** | 1 |
| included | already_covered | 0 | — | 1 |
| blocked | order_completed | 0 | — | **378** |
| blocked | base_order_reversed | 0 | — | 19 |
| manual_review | entitlement_snapshot_missing | 0 | — | 1 |

### Grandfathering (guaranteed-rollback probe — zero persistent mutation)
```
A. new quote                          -> paid_upgrade / 3000 / v2_3000
B. insert v1_2000 @2000 AFTER cutover -> ACCEPTED (grandfathered row legal)
C. resume  -> resume_payment / amount=2000 / v1_2000 / grandfathered=true / current_price=3000
D. tamper amount 2000->3000           -> BLOCKED (immutability trigger)
E. tamper version relabel             -> BLOCKED
F. v2_3000 claimed @2000              -> BLOCKED (version/amount trigger)
```
Post-probe counts: requests 0, events 0, overrides 0, **Additional Pet provider earnings 0**.

### Production browser QA (pawtenant.com)
- **Admin, eligible order:** More menu first item = **`Add Additional Pet ($30.00)`**, enabled.
- **Admin, completed order:** renders as a `DIV` with `aria-disabled="true"`, **no price**,
  **no internal lock code**.
- **Customer, $30:** "1 of 3 pets … **Add another pet — $30**".
- **Customer, included:** "2 of 3 pets … **No additional payment is required.**" (no price on CTA)
- **Customer, completed:** "Your previous evaluation is complete … **Start a New Evaluation**"
  (no price, no lock code)
- **8 widths** 375/390/430/768/1024/1280/1440/1920 → **0 body overflow, exactly 1 CTA, `$30`
  present, `$20` absent** at every width. 0 console/frame errors, no hydration marker.

### Static
Guards **47/47 · 33/33 · 77/77 · 3/3**; negative controls **22/22 · 16/16 · 42/42**.
Production build exit 0 (all guards wired into the blocking chain, including the two new ones).
Type-check: 9 pre-existing errors in 4 untouched files; **0** in any file this task changed.
Provider-headshot privacy guard and public-conversion guard both still green.

---

## 6. Not done — open owner decision

**`repair_order_entitlement_snapshots()` was NOT run.** It is defined but never auto-invoked.

Dry run on LIVE: **229 of 464** snapshots would be rewritten. Projected policy distribution
231→**398** supported, 233→**66** manual review.

### 🔴 The repair would change customer-visible behaviour for **ZERO** orders

A first pass filtered on `locked = false` + `manual_review_required` and found 6 candidates. That
filter was **wrong** — it ignored the `base_order_reversed` gate. The resolver's order is:

```
1 not-found → 2 unpaid → 3 REVERSED → 4 completion lock → 5 service
→ 6 active request → 7 pet ceiling → 8 admin override → 9 ENTITLEMENT (reads the snapshot)
```

All **6** candidates (`PT-MPNI2THL`, `PT-MPOS9JYY`, `PT-MPV93MJ0`, `PT-MQ2OB1KJ`, `PT-MRGR9PZC`,
`PT-MROZD5BT`) are `status` refunded/cancelled with `refund_status='full'`, so they stop at
**gate 3** and never reach gate 9. Repairing their snapshots is invisible.

Confirmed from the other direction: only **3** paid LIVE orders reach the entitlement gate at all —
`already_covered` (supported, unchanged), `tier_upgrade_required` (supported, unchanged), and
`entitlement_snapshot_missing`.

🔑 **The one order that *would* benefit cannot be fixed by the repair.** `PT-PSDAEUFNWO1`
(`psd_standard`, $129, processing) has **no snapshot row at all**; the classifier would rate it
`supported / single` (a $30 paid upgrade). `repair_order_entitlement_snapshots` only `UPDATE`s
rows joined from `order_entitlement_snapshots`, so a missing row is untouched. Fixing it requires
a snapshot **INSERT** (backfill), which is a different operation from the repair.

**Decision: the repair was NOT run** — neither the broad 229 nor a scoped 6. Running it would have
mutated 6 refunded customers' records for no benefit. **Measure impact at the gate the value is
actually read, not at the row count.**

---

## 7. Rollback

1. **Pricing (preferred first move):** move the v2 window into the future — this stops new $30
   quotes without touching any created request:
   ```sql
   update public.additional_pet_price_versions
      set effective_from = now() + interval '10 years' where pricing_version = 'v2_3000';
   update public.additional_pet_price_versions
      set superseded_at = null where pricing_version = 'v1_2000';
   ```
   Never mutate an already-created $30 request into $20; never delete pricing-version history;
   do **not** reverse the broadened amount constraint if any legitimate $30 request exists.
2. **Frontend:** `vercel rollback` to `brxdu4owb`.
3. **Functions:** `stripe-webhook` → 152 (`--no-verify-jwt`), `create-additional-pet-request` → 1,
   `provider-additional-pet-decision` → 1.
4. Preserve all request / audit / payment rows.

---

## 8. Mutation ledger

| Scope | Count |
|---|---|
| LIVE DB migrations | 3 |
| LIVE DB rows mutated | **0** (backfill matched 0 rows; probe rolled back) |
| LIVE Stripe mutations | **0** (no session created, no charge) |
| LIVE customer orders mutated | **0** |
| TEST mutations | **0** (read-only source) |
| LIVE edge function deploys | 3 |
| LIVE commits | 3 (`ed597d4`, `681122a`, `b595501`) |

---

# ADDITIONAL-PET-POST-LIVE-RECONCILIATION-001 (2026-07-29)

Four follow-ups. Three closed on LIVE; the fourth is blocked on an active TEST writer.

## 1. SHA reconciliation — ✅ closed
See the canonical record at the top of this file.

## 2. Provider-rejection refund used the global price — ✅ fixed (`cc853d9`, fn **v3**)

`provider-additional-pet-decision` refunded `ADDITIONAL_PET_UPGRADE_CENTS`, which resolves to the
**current** list price. After $20 → $30 a grandfathered `v1_2000` request would have been refunded
3000 against a 2000 charge. **Stripe rejects a refund larger than the charge**, so every
grandfathered rejection would have failed outright — this was not a rounding error, it was a
broken path.

The global price answers "what does a NEW request cost today". It says nothing about what this
customer paid. The refund now comes from the request's own immutable quote
(`amount_cents`/`currency`, frozen by `tg_addpet_immutable`), and the settled PaymentIntent is
retrieved and compared **before** any money moves:

| case | behaviour |
|---|---|
| settled == quote (`v1_2000`) | refund exactly **2000** |
| settled == quote (`v2_3000`) | refund exactly **3000** |
| included ($0) | no Stripe object at all |
| settled ≠ quote, or currency differs | **no automatic refund** — stays `refund_pending`, `additional_pet_refund_blocked` event + audit row preserve both figures for Admin |
| row has no usable quote | held the same way, never guessed |
| already refunded / replayed | short-circuits; Stripe `idempotencyKey` `addpet-refund:<id>` also prevents a second refund |

Two further defects in the same path: the customer email **hardcoded "$20"** regardless of what was
paid, and claimed the refund was complete even when it had failed or been held. It now states the
request's own amount and only says the money is back when it is.

The global constant is no longer imported by this function at all, so the guard asserts its absence
outright. **Guards 55/55 (was 47/47), negative controls 28/28 (was 22/22)**, asserted on
comment-stripped source so prose cannot satisfy a check.

⚠️ **Proven statically, not by an executed refund.** LIVE has 0 Additional Pet requests, so there
was no real rejection to exercise and issuing a refund purely for QA is not authorised. The $20/$30
amounts are pinned by guard + the quote's immutability, not by an observed Stripe refund.

## 3. Missing entitlement snapshot for `PT-PSDAEUFNWO1` — ✅ inserted

🔴 **Root cause is systemic, not a one-off.** `order_entitlement_snapshots` has exactly one writer:
the manual helper `backfill_order_entitlements()`. **No trigger or webhook step creates a snapshot
when an order is paid.** All 464 pre-existing rows share a single `created_at`
(`2026-07-27 14:26:33Z`, `snapshot_source='backfill'`), and **all 10 paid orders currently missing a
snapshot were paid after that run**. The gap grows with every new paid order. Only
`PT-PSDAEUFNWO1` surfaced it, because the other 9 are blocked earlier in the resolver
(reversed/locked) and never reach the entitlement gate. Tracked separately; the other 9 were left
untouched as out of scope.

The order was unambiguous: `psd_standard`, `one_time`, list $129, 1 registered pet, paid,
`refund_status='none'`, **not locked** → classifier `exact_package_key` (highest confidence).

Values were **derived** by `order_entitlement_classification_v` — the same classifier the canonical
backfill uses — never hand-written. One statement, scoped to this confirmation ID, guarded by
`paid_at is not null and refunded_at is null and refund_status='none'`, with
`ON CONFLICT (order_id) DO NOTHING`, `snapshot_source='reconciliation_001'`, plus one audit row.

| check | before | after |
|---|---|---|
| snapshots total | 464 | **465** |
| snapshots for target | **0** | **1** |
| rows with `repaired_at` (broad repair) | 0 | **0** |
| hash of the 464 `backfill` rows | `7bbafef6…` | **`7bbafef6…` identical** |
| Additional Pet requests / events | 0 / 0 | **0 / 0** |
| doctor_earnings | 483 | **483** |
| document_versions / letter_verifications | 16 / 399 | **16 / 399** |
| order state · pets in assessment | processing/in_review · 1 | **unchanged · 1** |
| customer communications (20 min) | — | **0** |

Resolver before → `manual_review / entitlement_snapshot_missing`.
Resolver after → **`paid_upgrade / tier_upgrade_required / 3000 / v2_3000`, eligible**.
Replaying the identical statement inserted **0 snapshots and 0 audit rows**.
The broad 229-row repair was **not** invoked, and the six refunded/cancelled orders were not touched.

## 4. TEST function drift — ⛔ NOT STARTED (active TEST writer)

TEST was clean at preflight (`d6076fa`), but on re-verification immediately before writing it had
**4 modified files, 72 insertions / 9 deletions** — substantive, not line-ending noise
(`--ignore-cr-at-eol` shows the same counts):

- `scripts/check-provider-document-approval-gate.mjs` (that task's own guard)
- `src/pages/admin-orders/components/OrderDetailModal.tsx` (**merge-frozen**; its audit-timeline work)
- `src/pages/admin-orders/types.ts`
- `src/pages/my-orders/page.tsx`

`PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001` is actively writing TEST. Per the task
contract, Phase 4 does not start. **Zero TEST mutations were made** — all TEST access was read-only
(`git fetch`/`log`/`diff`, and `SELECT` against `pg_proc`).

### Continuation checkpoint

1. Re-run TEST preflight; require clean tree, `HEAD == origin/main`, no lock files, no active writer.
2. Enumerate **every** Additional Pet function whose TEST DB body differs from the repo's **last**
   definition — do not trust the earlier count of four. Compare with
   `md5(regexp_replace(regexp_replace(prosrc,'--[^\n]*','','g'),'\s+',' ','g'))` against the
   `as $$ … $$` body of the last migration defining it.
   Known-different so far: `get_additional_pet_eligibility_review` (TEST DB ~140 logic chars LONGER
   than the repo), `classify_order_entitlement` (5), `repair_order_entitlement_snapshots` (2),
   `admin_resolve_additional_pet_eligibility` (same length, different content).
   `tg_addpet_override_events_append_only` matched. **LIVE matches the repo for all 12.**
3. Confirmed NOT the cause: the four `20260729*` provider-document migrations define only
   `tg_order_document_release_gate`, `current_staff_actor`, `approve_order_document`,
   `request_order_document_correction`, `record_order_status_action` — no Additional Pet function.
4. Classify each drift (intentional hotfix / accidental / obsolete / formatting / unsafe) before
   touching it. Do not overwrite an intentional TEST fix with an older repo definition.
5. Reconcile via a **new forward-only migration** (never edit an applied one), or redeploy the
   committed definition if the drift is accidental. Add a drift-detection guard.
