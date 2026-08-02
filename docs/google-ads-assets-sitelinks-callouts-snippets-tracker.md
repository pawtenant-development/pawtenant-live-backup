# Google Ads — Sitelinks / Callouts / Structured Snippets tracker

**Status:** ✅ CLEAN ADDITIONS APPLIED 2026-06-23 via Google Ads browser UI (info@pawtenant.com). 6 sitelinks + 6 callouts added at CAMPAIGN level. Verified. Structured snippet + flagged callouts SKIPPED per owner. No existing assets touched.
**Account:** 2480853323 · **Campaign:** Search – ESA High Intent (`22472726576`)
**Method:** Google Ads browser UI (read-only Phase-1 reads + read-only Ads API for image list; write = browser UI only).

## APPLIED 2026-06-23 (browser UI, campaign level, added by "Advertiser" = manual)
### Sitelinks added (6) — saved ~9:49 AM, status Pending/Eligible(Limited: Health in personalized advertising = normal non-blocking label)
| Link text | Final URL | Desc 1 | Desc 2 |
|-----------|-----------|--------|--------|
| ESA Letter Online | https://pawtenant.com/how-to-get-esa-letter | Online evaluation by a | licensed provider, if qualified |
| ESA Letter for Apartments | https://pawtenant.com/esa-letter-for-apartments | Housing documentation | for renters and tenants |
| PSD Letter Online | https://pawtenant.com/how-to-get-psd-letter | Psychiatric service dog | letter, licensed review |
| ESA Letter Cost | https://pawtenant.com/esa-letter-cost | Transparent pricing | refund if not qualified |
| Landlord Denied ESA | https://pawtenant.com/landlord-denied-esa-letter | Know your housing rights | verification support |
| Verify ESA Letter | https://pawtenant.com/esa-letter-verification-id | Verifiable letter with ID | landlord check support |
Sitelink count went 11 → 17 (+6), verified on associations page.

### Callouts added (6) — saved ~10:06 AM, status Pending/Under review
Online Evaluation · Verifiable Letters · Housing Support · Secure Checkout · Refund If Not Qualified · Landlord Verification
Callout count went 26 → 32 (+6), verified on associations page.

### Skipped per owner instruction (NOT applied)
- Callout "Licensed Providers" (dup of existing "Licensed Professionals").
- Callout "24-Hour Review" (speed claim).
- Structured snippet (existing Service catalog snippets need cleanup first).
- All existing-asset cleanup/edits/removals; images.

### Confirmation
No structured snippets touched. No existing assets removed/edited. No keywords/ads/RSAs/final-URL/budget/bid/tCPA/ECL/conversion-action/negative/recommendation changes. No paused/other campaigns. No code/Supabase/Vercel/Stripe/Meta/Microsoft/GSC/GA4.

---
(Original read-back retained below for history.)

## Phase 1 — Existing assets found (browser, Assets → Associations, all levels)

### Existing SITELINKS (≥7; mostly auto-created "Added by Adwords", Enabled)
| Link text | Desc 1 | Desc 2 | Note |
|-----------|--------|--------|------|
| Landlord Verification | Instant ESA verification system | Verify from anywhere | ⚠️ "Instant" speed-claim (owner bans this) |
| PSD Assessment Form | Apply For your PSD Letter | Secure PSD Letter Process | ok |
| ESA Housing Rights | How ESA letters protect tenants | Understand your housing protections | DUPLICATE text (see below) |
| How ESA Letters Work | Learn simple ESA approval process | Step-by-step guide for pet owners | ok |
| ESA Assessment Form | Start your evaluation today | Takes 2–3 minutes. Start Now | ok |
| ESA Housing Rights | Know your legal rights | Avoid pet restrictions | DUPLICATE link text w/ row 3 |
| ESA Letter California | Get ESA in California | Licensed providers California | ok |
(find may cap at ~7; a couple more may exist.)

### Existing CALLOUTS (≥9, Enabled)
24/7 Customer Support · Covering all states · Licensed Professionals · Fast Online Process · Secure & Confidential · ESA Letters For Housing · Friendly Support Team · Easy Online Application · Trusted By Pet Owners

### Existing STRUCTURED SNIPPETS (5)
1. **Service catalog**: Licensed ESA Evaluations · Upto 2 Pets $115 · Upto 3 Pets $135 · 100% Money Back Guarantee — ⚠️ guarantee + price claims
2. **Types**: Housing ESA Letters · Multi-Pet ESA Letters · Apartment ESA Letters · Renewal ESA Letters
3. **Featured hotels**: Licensed Professionals · FHA Housing Compliance · Secure Online Process · Fast ESA App… — ⚠️ WRONG header ("Featured hotels") + FHA-compliance claim
4. **Service catalog**: ESA Letter Evaluation · Online ESA Assessment · Licensed Therapist Review · Housing ESA…
5. **Service catalog**: ESA Letter PDF · Licensed Evaluation · Housing Protection · Fast Delivery
(→ THREE "Service catalog" snippets already exist = redundant.)

### Existing IMAGE assets
~120 image assets at account level (Pexels stock + PawTenant brand/PMax/Demand-Gen creatives). Not the focus of this task; no action.

### Existing-asset cleanup flags
- Sitelink "Landlord Verification" → desc "Instant ESA verification system" uses banned "Instant". HOLD→recommend replace later.
- Duplicate sitelink "ESA Housing Rights" (×2). Recommend consolidate later.
- Structured snippet #1 "100% Money Back Guarantee" + prices; #3 wrong "Featured hotels" header + "FHA Housing Compliance". HIGH-risk, recommend remove/replace later (separate task).

## Validation of PROPOSED assets
All 6 sitelink URLs return HTTP 200 (verified 2026-06-23).

### Sitelink limits (link text ≤25, desc ≤35)
| # | Link text | Chars | Desc1 (≤35) | Desc2 (≤35) | Limit OK? |
|---|-----------|-------|-------------|-------------|-----------|
| 1 | ESA Letter Online | 17 | Online evaluation by a (22) | licensed provider, if qualified (31) | ✅ |
| 2 | ESA Letter for Apartments | 25 | Housing documentation (21) | for renters and tenants (23) | ✅ (text exactly 25) |
| 3 | PSD Letter Online | 17 | Psychiatric service dog (23) | letter, licensed review (23) | ✅ |
| 4 | ESA Letter Cost | 15 | Transparent pricing (19) | refund if not qualified (23) | ✅ |
| 5 | Landlord Denied ESA Letter | **26** | Know your housing rights (24) | verification support (20) | ❌ text 26>25 → shorten |
| 6 | Verify ESA Letter | 17 | Verifiable letter with ID (25) | landlord check support (22) | ✅ |
Suggested fix #5: "Landlord Denied ESA" (19) or "ESA Denied by Landlord" (22).

### Callout limits (≤25)
Licensed Providers 18 ✅ · 24-Hour Review 14 ✅ · Online Evaluation 17 ✅ · Verifiable Letters 18 ✅ · Housing Support 15 ✅ · Secure Checkout 15 ✅ · Refund If Not Qualified 23 ✅ · **Landlord Verification Support 29 ❌** → shorten to "Landlord Verification" (21).

### Structured snippet
Header "Service catalog" = valid Google header ✅ but **DUPLICATE** (3 already exist). Values all ≤25: ESA Letter 10 · PSD Letter 10 · Housing Documentation 21 · Verification Support 20 ✅.

## Recommendation summary (NOT applied)
- Sitelinks: ADD #1–4,6 (fix #5 length first). Note overlaps with existing PSD Assessment Form / ESA Assessment Form / ESA Housing Rights / Landlord Verification.
- Callouts: ADD 24-Hour Review (verify accuracy — tension w/ earlier "no 24-hour" decision), Online Evaluation, Verifiable Letters, Housing Support, Secure Checkout, Refund If Not Qualified; SKIP "Licensed Providers" (dup of existing "Licensed Professionals"); fix "Landlord Verification Support" length.
- Structured snippet: SKIP adding 4th "Service catalog" (duplicate header) — better to clean up risky existing snippets in a separate step.

## ✅ CLEANUP APPLIED 2026-06-23 — 2 high-risk account-level structured snippets REMOVED (browser UI)
Removed via Assets → Associations (Structured snippet view) → select 2 rows → Remove → Confirm ("Remove 2 assets"). Account-level removal = account-wide (owner accepted). Structured snippet count went **6 → 4**.
1. **REMOVED** — Service catalog (Account): Licensed ESA Evaluations · Upto 2 Pets $115 · Upto 3 Pets $135 · 100% Money Back Guarantee (guarantee + price claims).
2. **REMOVED** — "Featured hotels" (Account): Licensed Professionals · FHA Housing Compliance · Secure Online Process · Fast ESA App… (wrong header + FHA compliance claim).
   - Note: when the list reloaded just before removal, this asset's header label showed as "Service catalog" / "Pending–Under review" (a stray Edit page had opened during navigation). It was identified by its unique FHA-compliance VALUES and removed regardless, so any label change is gone with the asset. No lasting unintended edit.

Remaining 4 structured snippets (UNTOUCHED, all Eligible): Types (Account) · Service catalog: ESA Letter Evaluation/Online ESA Assessment/Licensed Therapist Review (Account) · Service catalog: ESA Letter PDF/Licensed Evaluation/Housing Protection/Fast Delivery (Campaign) · Service catalog: ESA Letter Evaluation/Housing ESA Letters/ESA Letter Renewal/ESA Consultation (Ad group).

Held (NOT touched): Landlord Verification sitelink · duplicate ESA Housing Rights sitelinks · duplicate Easy Online Application callout · campaign + ad-group Service catalog snippets · all 12 clean assets added today (6 sitelinks + 6 callouts). No sitelinks/callouts touched. No excluded changes.

---
## Earlier cleanup PLAN (read-back, now partly actioned) — original below

### Structured snippets (6 total, all Eligible)
| # | Header / Values | Level | Issue | Action | Replacement | Risk |
|---|-----------------|-------|-------|--------|-------------|------|
| 1 | Service catalog: Licensed ESA Evaluations · Upto 2 Pets $115 · Upto 3 Pets $135 · 100% Money Back Guarantee | Account | "100% Money Back Guarantee" absolute-guarantee claim + hard price claims ($115/$135) likely outdated | **REMOVE** | (or rebuild values w/o guarantee/prices) | HIGH |
| 2 | Types: Housing ESA Letters · Multi-Pet ESA Letters · Apartment ESA Letters · Renewal ESA Letters | Account | none significant | **KEEP** | — | Low |
| 3 | Featured hotels: Licensed Professionals · FHA Housing Compliance · Secure Online Process · Fast ESA App… | Account | WRONG header ("Featured hotels" — hotel category misused) + "FHA Housing Compliance" compliance claim | **REMOVE** | (rebuild under "Service catalog"/"Types", drop FHA-compliance) | HIGH |
| 4 | Service catalog: ESA Letter Evaluation · Online ESA Assessment · Licensed Therapist Review · Housing ESA… | Account | redundant (1 of 4 Service catalog) but cleanest/most compliant | **KEEP** (the one to keep) | — | Low-Med |
| 5 | Service catalog: ESA Letter PDF · Licensed Evaluation · Housing Protection · Fast Delivery | Campaign | redundant Service catalog | **HOLD** (consider remove to dedupe) | — | Low-Med |
| 6 | Service catalog: ESA Letter Evaluation · Housing ESA Letters · ESA Letter Renewal · ESA Consultation | Ad group | redundant Service catalog | **HOLD** (consider remove to dedupe) | — | Low-Med |
Note: FOUR "Service catalog" snippets (#1,#4,#5,#6) across Account/Campaign/Ad group = heavy redundancy → recommend consolidating to ONE (keep #4).

### Sitelinks
| Asset | Current text | Level | Status | Issue | Action | Replacement | Risk |
|-------|--------------|-------|--------|-------|--------|-------------|------|
| Landlord Verification | "Instant ESA verification system" / "Verify from anywhere" | Account | Eligible | "Instant" speed claim (owner-banned) + "verification system" registry-ish; now also overlaps NEW "Verify ESA Letter" | **EDIT or REMOVE** | If edit: keep "Landlord Verification" / "Verifiable letter with ID" / "Landlord check support". If remove: new "Verify ESA Letter" already covers it | MED-HIGH |
| ESA Housing Rights (#1) | "How ESA letters protect tenants" / "Understand your housing protections" | Campaign | Eligible | DUPLICATE link text with #2 | **KEEP** (keep this one) | — | MED |
| ESA Housing Rights (#2) | "Know your legal rights" / "Avoid pet restrictions" | Campaign | Eligible | DUPLICATE link text with #1 | **REMOVE or RENAME** | rename text e.g. "Know Your ESA Rights" if keeping | MED |

### Callouts
| Asset | Level | Status | Issue | Action | Risk |
|-------|-------|--------|-------|--------|------|
| Easy Online Application (×2) | Account | Eligible | DUPLICATE callout (appears twice) | **REMOVE one** | Low |
| 24/7 Customer Support | Account | Eligible | "24/7" support-hours claim — verify accurate | **KEEP** (confirm truthful) | Low |
| Others (Covering all states, Licensed Professionals, Fast Online Process, Secure & Confidential, ESA Letters For Housing, Friendly Support Team, Trusted By Pet Owners) | Account | Eligible | none significant | **KEEP** | Low |

### Disapproved/limited
None disapproved. All existing assets = Eligible. (The 12 NEW assets I added today show Eligible / "Eligible (Limited): Health in personalized advertising" = standard non-blocking vertical label.)

### ⚠️ Serving / scope caveat (important)
- Items 1, 3 (snippets) + "Landlord Verification" sitelink + "Easy Online Application" callout are **ACCOUNT-LEVEL**. Removing/editing them affects the asset **account-wide (all campaigns)**, not just Search – ESA High Intent. Since the brief says don't touch other campaigns, account-level removals are a deliberate account-wide decision — flag before applying.
- Snippet #5 (Campaign) and #6 (Ad group) are scoped to this campaign/ad group — safe to remove without affecting other campaigns.
- All targets are Eligible/serving; removing redundant/duplicate ones has minimal coverage impact (others remain). Removing the guarantee/Featured-hotels snippets reduces risk.
- Do NOT touch the 12 clean assets added today.

## Apply log
- 2026-06-23 — APPLIED via browser UI: 6 campaign-level sitelinks (~9:49 AM) + 6 campaign-level callouts (~10:06 AM) on Search – ESA High Intent (22472726576). Counts: sitelinks 11→17, callouts 26→32. Status Pending/Under review (new). Skipped: Licensed Providers callout, 24-Hour Review callout, structured snippet, all existing-asset cleanup, images. No excluded changes.
- 2026-06-23 — CLEANUP APPLIED via browser UI: removed 2 high-risk ACCOUNT-LEVEL structured snippets (guarantee/prices "Service catalog" + "Featured hotels"/FHA). Structured snippet count 6→4. Account-wide removal (owner accepted). No other snippets/sitelinks/callouts touched; 12 clean assets from today untouched; no excluded changes.
