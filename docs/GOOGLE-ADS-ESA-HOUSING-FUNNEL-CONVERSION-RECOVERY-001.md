# GOOGLE-ADS-ESA-HOUSING-FUNNEL-CONVERSION-RECOVERY-001

**Status: PARTIAL** — website repair COMPLETE and LIVE-verified; Google Ads mutations NOT performed (UI could not be driven safely).

Date: 2026-08-03/04 (America/New_York). Canonical clock: NY. "Today" in NY at task start was **2026-08-03 20:23**, so the last complete NY day was **Aug 2**.

---

## 1. Headline finding

The August collapse is **not** a traffic-quality problem, not a mobile problem, and not a checkout problem.
It is a **single landing-page regression** introduced by the ESA Housing page rewrite.

Holding the **same seven ESA keywords** constant across the same window:

| Landing page | before 2026-07-25 | from 2026-07-25 |
|---|---|---|
| **/esa-letter-housing** | 30/124 = **24.2%** | 11/113 = **9.7%** |
| Non-Housing (same keywords) | 13/40 = 32.5% | 5/19 = 26.3% |

Same keywords, same period — only the landing page differs.

By page group (all traffic):

| Page group | 7/12–7/24 | 7/25+ |
|---|---|---|
| **ESA Housing** | 37/133 = **27.8%** | 13/135 = **9.6%** |
| Homepage | 18/61 = 29.5% | 7/15 = 46.7% |
| PSD pages | 20/40 = 50.0% | 15/31 = 48.4% |
| Other | 11/40 = 27.5% | 9/31 = 29.0% |

Every group held or improved except Housing. Traffic quality, seasonality, Stripe, and attribution would all have hit every group.

**Conversion lag rules out immaturity:** 84% of July paid orders paid within 1 hour, 92.6% within 24h. Aug 1–2 leads were fully mature when measured.

**Mix shift is not the cause.** Renormalised over the keyword set common to both periods (264 vs 182 leads): actual 34.09% → 18.68%, but applying period-A per-keyword rates to period-B's mix gives **33.21%** — mix explains only ~0.9pp of a 15.4pp drop.

### Root cause

`3913bc3` (2026-07-23, "roll out approved ESA Housing conversion parity to LIVE") fully replaced `src/pages/lp-esa-housing/page.tsx`. It anchored the hero on the **Klarna installment figure `$32.25`** against a real price of **$129**:

- **mobile** (`md:hidden`): "Start for as low as **$32.25**" — *no Klarna qualifier at all*
- **desktop** (`hidden md:inline-flex`): "Start for as low as $32.25 with Klarna"

Both breakpoints carried it, which is why **both devices fell** (desktop 51.4%→10.5%, mobile 25.0%→9.6%). Visitors arriving on price intent met a 4× higher number at checkout.

Consistent with the mechanism:

| Keyword | before 7/25 | from 7/25 |
|---|---|---|
| cheapest esa letter | 8/32 = 25% | 2/56 = **3.6%** |
| where to get an esa letter | 4/17 = 23.5% | 1/22 = **4.5%** |
| legitimate esa letter (intent-led) | 4/10 = 40% | 7/28 = **25%** (held) |

Price-shoppers collapsed; legitimacy-seekers held.

**Cost:** ~24 lost orders / ~$2,900 in 10 days, ongoing at ~2.4 orders/day.

---

## 2. Website repair (COMPLETE, LIVE-verified)

Restored the pre-2026-07-23 page structure (LIVE `3913bc3^`) that converted at 24–28% under real paid traffic. **Not a blind revert** — three things were carried forward:

1. **Attribution-safe CTAs.** The pre-07-23 page used bare `"/assessment"` string constants. A straight revert would have dropped gclid/gbraid/wbraid/UTM from *every* CTA. `ASSESSMENT_HREF`, `PSD_ASSESSMENT_HREF`, `SUBSCRIPTION_HREF` are now built with `withAttribution()` inside the component.
2. **Double-query fix.** The old subscription link did `` `${ASSESSMENT_HREF}?plan=subscription` ``, which against an already-attributed href yields `/assessment?gclid=…&utm=…?plan=subscription` (invalid). Now `withAttribution("/assessment?plan=subscription")`.
3. **Verification-ID format.** The old page still showed the stale `PT-YYYY-XXXXXX`; corrected to the real `ESA-XX-XXXXXXX`.

Price presentation now satisfies the requirement: hero-adjacent pricing card leads with **$129** ("for 1 pet · valid 1 year"), **$149** fixed total for 2–3 pets, annual $115/$135; Klarna is a small **"Available at checkout"** chip carrying **no dollar figure**. `$32.25` appears **nowhere**.

Hardcoded prices in the restored page ($129/$149/$115/$135) were audited against `src/config/pricing.ts` and match exactly — no pricing drift.

### Guard

`scripts/check-esa-housing-redesign.mjs` rewritten to pin the **restored** contract instead of the disproven Revision-3 hero. Negative assertions run against **comment-stripped** source so a mention can never satisfy or break them.

Self-tested with 6 planted mutations — all caught, file restored byte-identical:

| Mutation | Result |
|---|---|
| reintroduce `$32.25` anchor | FAIL (caught) |
| strip `withAttribution` from ASSESSMENT_HREF | FAIL (caught) |
| reintroduce the double-query concat | FAIL (caught) |
| restore stale `PT-YYYY-XXXXXX` | FAIL (caught) |
| remove `$129` | FAIL (caught) |
| break an asset path | FAIL (caught) |

### Verification

**TEST (local dev, real browser)** — widths 390 / 430 / 768 / 1024 / 1280 / 1440: no horizontal overflow, no `$32.25`, **`$129` is the first price at every width**, all 15 CTAs attributed, zero console errors.

Full funnel: housing page → CTA (attribution preserved incl. gbraid) → assessment (13 questions) → info step → OTP (`417012`, email correctly masked) → **checkout showing $129.00, matching the landing page**. Plan options and Klarna present. Checkout validation correctly blocked submission with missing card fields. **1 lead row, 1 confirmation id (`PT-MSDYIAP4`) — no duplicate order** across repeated submits.

Clean-session attribution capture: `gclid` + `gbraid` + `wbraid` + all UTMs incl. `utm_content`, correct `landing_url`, 15/15 CTAs carrying gbraid.

**LIVE (pawtenant.com)** — serves the restored page; `robots noindex,nofollow` preserved; host `pawtenant.com` (no www hop); prices $129/$149/$115/$135 with **$129 first**; `$32.25` absent; 15 CTAs all carrying gclid **and** gbraid; zero double-query links; no overflow; zero console errors. Mobile 390px: Klarna line reads "Klarna available at checkout". `/how-to-get-psd-letter` unaffected.

### Commits / deployment

| | |
|---|---|
| TEST start → final | `7f5ef90` → **`6790792`** |
| LIVE start → final | `74b1a31` → **`f0953f3`** |
| Files (both) | `src/pages/lp-esa-housing/page.tsx`, `scripts/check-esa-housing-redesign.mjs` |
| Migrations / functions | **none** |
| TEST typecheck / build | clean / exit 0 |
| LIVE typecheck / build | clean / exit 0 |
| Vercel deployment | `dpl_6LYWBHXve4YSW8mvS2H5YzgjNgyK` (`htdkkb48n`), Ready, Production |
| Aliases | `https://pawtenant.com`, `https://www.pawtenant.com` |

Pre-existing warn-only baseline (unrelated, not introduced here): `src/pages/admin-orders/components/OrderAdditionalPetPanel.tsx:152 — reads refunded_at as a boolean [!!refunded_at]`.

---

## 3. Google Ads — preflight verified, mutations NOT performed

**Preflight (read-only, confirmed):**

- Account: **Paw Tenant**, ocid `1628176789`
- **Search – ESA High Intent — PKR85,000/day** (owner's reduction confirmed live)
- Search – Pawtenant Brand — PKR1,000/day
- Search – ESA Competitors — PKR15,000/day (0 impressions)
- Search – ESA Housing Issues — PKR9,302/day (0 impressions)
- Account total PKR86,000/day; timezone Eastern

**Blocker:** the Google Ads web UI renders navigation chrome, buttons and counts, but **data grids do not render** in this session — the negative-keyword table, the change-history rows (49 entries reported, none readable), and the "Add negative keywords" dialog would not open. Screenshots return the loading splash (page not compositing frames).

Mutations were **not attempted blind**. The task requires every affordability negative to land at **ad-group level and never campaign level**; that distinction is controlled entirely by the dialog I could not read. A negative placed at the wrong level would block profitable traffic on a campaign spending PKR 85,000/day.

**No Google Ads change was made. Change History is unmodified by this task.**

### Backend evidence prepared for the Ads decisions (L30/L90, refund-aware)

Affordability cluster — **all three convert; the cross-negatives are about routing to AG6, not suppression**:

| Keyword | match | L30 leads | L30 paid | L90 % | L90 revenue |
|---|---|---|---|---|---|
| cheapest esa letter | e | 88 | 10 | 11.4% | $1,150 |
| most affordable esa letter | e | 29 | 6 | 20.7% | $694 |
| affordable esa letter | e/p | 7 | 3 | 42.9% | $387 |

PSD cluster (preserve): `psd letter` 77.8%, `psd letter online` 100% (5/5), `psychiatric service dog letter online` 66.7%, `how to get a service dog letter` 100% (4/4), `service dog letter` 45.2% ($1,756).

Evidence-backed new-keyword candidates (≥2 backend paid orders):

| Candidate | match seen | L90 leads/paid | rate | revenue |
|---|---|---|---|---|
| how to make a pet a service animal | p | 11/7 | 63.6% | $869 |
| get esa letter | e/p | 16/7 | 43.8% | $743 |
| how to get a service dog letter | p | 4/4 | 100% | $379 |
| psychiatric service dog housing letter | e | 5/3 | 60% | $338 |
| psychiatric service dog documentation | p | 5/2 | 40% | $308 |
| service dog registration | e | 3/2 | 66.7% | $278 |
| how to verify esa letter | e | 3/2 | 66.7% | $238 |
| esa letter same day / same day esa letter | e | 4/2, 3/2 | 50% / 66.7% | $288 / $215 |
| real esa letter | e | 6/2 | 33.3% | $258 |

Zero-order keywords worth scrutiny (L90 leads, 0 paid): `esa letter for cat` (5), `esa letter for dog` (5), `psychiatric service animal letter` (4), `real esa letter online` (3), `emotional support animal letter` (3).

**`psd letter for dog` (unauthorized Broad): zero leads and zero paid orders in 90 days** — no backend value; nothing is lost by pausing it.

**`registration` conflicting-negative recommendation — do NOT auto-keep or auto-remove.** Backend shows `service dog registration` [exact] converting **2/3 (66.7%, $278)** in L30. That is real revenue behind the blocked intent, so this specific recommendation deserves a genuine decision rather than the default "keep the negative" rule. Sample is small (n=3).

### Also found (pre-existing, not caused by this task)

**`orders.checkout_started_at` has had no writer since 2026-07-18.** It was populated 7/15–7/18 (near 100% of leads), then zero from 7/19 onward; the column survives only in a migration, with no application code writing it (removed during the 7/18 phased-subscription pricing cutover, `265bf37`). Reproduced in TEST: reaching the checkout step left the column NULL. **Consequence: checkout-start rate — which the monitoring plan requires — cannot currently be measured.** Not fixed here (out of scope of the approved change).

---

## 4. Monitoring baseline

Baseline timestamp: **2026-08-03 ~20:30 America/New_York** (LIVE deploy `htdkkb48n` Ready).

Pre-fix reference to beat, Housing page: **9.6%** (13/135 from 7/25). Target: return toward **24–28%**.

Check at +1, +3, +7, +14 complete NY days: spend; backend paid orders; backend CPA; revenue; refund-adjusted ROAS; leads; lead-to-paid; mobile vs desktop; Housing page conversion; Affordability group; PSD group; `where to get an esa letter`; `cheapest esa letter`; `legitimate esa letter`; payment failures; Klarna cancellations; search-term leakage. (Checkout-start rate is unavailable until the writer above is restored.)

Escalate if: another full day of significant spend with zero backend orders; Housing conversion still materially below baseline after 3 complete days; backend CPA above break-even after 3 complete days; attribution breaks; checkout errors rise.

**Note on budget pacing:** Aug 2 and Aug 3 spent **PKR 109,097** and **PKR 99,854** against an 85,000/day budget — Google's permitted up-to-2× daily overdelivery. Not a defect; monthly spend is what is capped.

---

## 5. Rollback

- Website: revert `f0953f3` on LIVE (previous good `74b1a31`); TEST revert `6790792` (previous `7f5ef90`). Two files only, no migrations, no functions.
- Google Ads: nothing to roll back — no change was made.

---

## 6. Remaining authorized work (not done)

1. Add the three affordability Exact cross-negatives — Verification: `[cheapest esa letter]`, `[most affordable esa letter]`; Core Intent: `[affordable esa letter]` — **ad-group level only**, then verify all nine are ad-group-level, none campaign-level, none in shared lists, and AG6 has no affordability negatives with all three positives still Eligible.
2. Audit/pause the unauthorized Broad `psd letter for dog` (backend: zero value).
3. Review redundant-keyword, conflicting-negative and add-keyword recommendations individually against the evidence in §3. Do not Apply All; do not enable auto-apply.
4. Preserve PKR 85,000/day, PSD/Brand/STATE landing URLs, ad copy, AI Max off, Final URL expansion off, Search Partners/Display off.
