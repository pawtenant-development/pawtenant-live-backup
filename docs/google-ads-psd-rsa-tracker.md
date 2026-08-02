# Google Ads — PSD Services RSA Tracker

**Status:** 📋 EDIT-IN-PLACE CLEANUP PLAN read back — awaiting owner approval. NOTHING applied. Keep existing approved RSA live; swap 5 risky headlines + 1 risky description.
**Last updated:** 2026-06-23

## Edit-in-place compliance cleanup plan (proposed 2026-06-23, NOT applied)
Target ad: `813007414516` in ad group `198437547798` (campaign `22472726576`). Final URL unchanged: `https://pawtenant.com/how-to-get-psd-letter` (correct — leave as-is).
Performance metrics: UNAVAILABLE here (Supermetrics free trial expired 2026-05-10) — pull impressions/clicks/CTR/cost/conv/CPA from Google Ads UI before deciding.

### Headlines — replace 5 of 15 (rest KEEP)
| # | Existing | Risk | Action | Replacement | Chars |
|---|----------|------|--------|-------------|-------|
| 5 | Verifiable PSD Letter | MED (verification/registry-adjacent) | REPLACE | Licensed PSD Evaluation | 23 |
| 7 | PSD Letters Starting $25.25 | HIGH (price claim, likely inaccurate vs ~$120 PSD) | REPLACE | PSD Letter, If Qualified | 24 |
| 8 | PSD Letter in 24 Hours | HIGH (speed/turnaround guarantee) | REPLACE | Telehealth PSD Evaluation | 25 |
| 10 | Turn Your Dog Into a PSD | HIGH (implies anyone can convert pet → qualification guarantee) | REPLACE | Licensed Clinician Review | 25 |
| 14 | HUD and HIPAA Compliant | HIGH (unverified legal/compliance certainty) | REPLACE | PSD Letter Evaluation | 21 |
KEEP (compliant): Psychiatric Service Dog Letter · PSD Housing Letter · Online PSD Evaluation · Service Dog Housing Help · Start PSD Review Today · PawTenant PSD Support · PSD Letter For Housing · Licensed LMHP Review · Secure Online PSD Process · How to Get PSD Letter
Alternates (unused pool): PSD Housing Documentation (25) · Start Online Today (18) · Secure Online Process (21)

### Descriptions — replace 1 of 4 (rest KEEP)
| # | Existing | Risk | Action | Replacement | Chars |
|---|----------|------|--------|-------------|-------|
| 3 | Clear steps, secure online intake, and verifiable documentation for housing requests. | LOW-MED ("verifiable documentation") | REPLACE | PSD documentation after a licensed clinical evaluation. Secure online process. | 78 |
KEEP: "Start a PSD evaluation with a licensed provider for housing-focused documentation." (82) · "Get landlord-ready PSD support after provider review. Refund if you do not qualify." (83) · "Need PSD housing paperwork? Begin your review and get support with next steps." (~78)

### Review/learning impact
Editing a live RSA sends it back to "Under review" and can temporarily reset ad-strength/performance signals until re-approved; ad ID is normally preserved but serving may dip briefly. Confirm acceptable before applying.

## ⚠️ Discovery on apply attempt (2026-06-22)
The premise "PSD Services has no active RSA/ad" is **FALSE**. The ad group already contains a live ad:
- **Campaign:** Search – ESA High Intent = `22472726576` (ENABLED, MAXIMIZE_CONVERSIONS, tCPA $252.00)
- **Ad group:** Ad group 5 - PSD Services = `198437547798` (ENABLED)
- **Existing ad:** `813007414516` — RESPONSIVE_SEARCH_AD, **status=ENABLED, review=APPROVED**
  - Final URL: `https://pawtenant.com/how-to-get-psd-letter` (same as proposed)
  - 15 headlines, 4 descriptions already present (see existing-copy snapshot below)
- **Action taken:** NONE. Did not create a second RSA. No keywords/settings touched. Awaiting owner decision (do nothing / replace existing / add second).

### Existing RSA copy snapshot (ad 813007414516)
Headlines: Psychiatric Service Dog Letter · PSD Housing Letter · Online PSD Evaluation · Service Dog Housing Help · Verifiable PSD Letter · Start PSD Review Today · PSD Letters Starting $25.25 · PSD Letter in 24 Hours · PawTenant PSD Support · Turn Your Dog Into a PSD · PSD Letter For Housing · Licensed LMHP Review · Secure Online PSD Process · HUD and HIPAA Compliant · How to Get PSD Letter
Descriptions: "Start a PSD evaluation with a licensed provider for housing-focused documentation." · "Get landlord-ready PSD support after provider review. Refund if you do not qualify." · "Clear steps, secure online intake, and verifiable documentation for housing requests." · "Need PSD housing paperwork? Begin your review and get support with next steps."

## Scope (locked)
- **Account:** 2480853323
- **Campaign:** Search – ESA High Intent
- **Ad group:** PSD Services (already has PSD keywords; currently has NO active RSA/ad)
- **Action:** Create ONE Responsive Search Ad in this ad group only.

### Hard exclusions (must hold)
- No new keywords. No Housing keywords. No ESA RSA refresh.
- No final URL changes outside this PSD RSA. No sitelinks/callouts/snippets. No images.
- No ECL enablement. No budget/bid/tCPA/campaign-setting changes. No conversion-action changes.
- No Google Ads recommendations auto-apply.
- No code / Supabase / Vercel / Stripe / Meta / Microsoft / GSC / GA4 changes.
- Do not touch any other ad group or campaign.

## Final RSA copy (read-back)

**Final URL:** https://pawtenant.com/how-to-get-psd-letter

### Headlines (limit: 30 chars each) — all PASS
| # | Headline | Chars |
|---|----------|-------|
| 1 | PSD Letter Evaluation | 21 |
| 2 | Psychiatric Service Dog Letter | 30 |
| 3 | Licensed PSD Evaluation | 23 |
| 4 | PSD Letter, If Qualified | 24 |
| 5 | Online PSD Evaluation | 21 |
| 6 | PSD Housing Documentation | 25 |
| 7 | Licensed Clinician Review | 25 |
| 8 | Start Online Today | 18 |
| 9 | Telehealth PSD Evaluation | 25 |
| 10 | Secure Online Process | 21 |

### Descriptions (limit: 90 chars each) — all PASS
| # | Description | Chars |
|---|-------------|-------|
| 1 | Online psychiatric service dog letter evaluation by a licensed provider, if qualified. | 86 |
| 2 | PSD documentation after a licensed clinical evaluation. Secure online process. | 78 |
| 3 | Speak with a licensed provider about a PSD letter. Refund if you don't qualify. | 79 |
| 4 | Psychiatric service dog letter review online. Licensed clinicians. Secure checkout. | 83 |

### Limit check
- 10 headlines (Google requires 3–15) ✓
- 4 descriptions (Google requires 2–4) ✓
- No headline > 30 chars; #2 is exactly 30 (allowed) ✓
- No description > 90 chars ✓

### Compliance notes
- PSD kept separate from ESA (no cross-claims).
- No registration/certification implied.
- No guaranteed approval; "if qualified" used (HL #4, DESC #1).
- Licensed evaluation/review language throughout; no medical-diagnosis claims.
- No "instant," "guaranteed," "100% approved," or similar banned phrasing.
- DESC #3 "Refund if you don't qualify" describes the existing refund policy, not an approval guarantee — keep only if the site refund policy actually backs it.

## Apply checklist (do AFTER owner says "confirm/apply")
- [ ] Create RSA in PSD Services ad group only
- [ ] Paste 10 headlines + 4 descriptions above, Final URL above
- [ ] Pin nothing (let Google optimize) unless owner requests
- [ ] Confirm no other settings changed; record RSA ad ID + date below

## Apply log
- _(empty — nothing applied yet)_
