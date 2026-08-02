# Google Ads — Housing Intent keyword additions tracker

**Status:** ✅ APPLIED 2026-06-23 via Google Ads browser UI (info@pawtenant.com / authuser=1). All 4 keywords added with keyword-level Final URLs and verified.
**Last updated:** 2026-06-23

## APPLIED 2026-06-23 (Google Ads browser UI)
Added the 4 keywords manually in the UI (Chrome) — NOT via MCP/API. Each has its keyword-level Final URL set and verified after save. Ad group keyword count went 32 → 36 (exactly +4, no duplicates, existing keywords untouched).

| Keyword | Match | Final URL (keyword-level, verified) | Serving status |
|---------|-------|-------------------------------------|----------------|
| esa letter for renting | PHRASE | https://pawtenant.com/esa-letter-for-apartments | Under review (new) |
| esa letter for renters | EXACT | https://pawtenant.com/esa-letter-for-apartments | Not eligible: Low search volume / Under review |
| esa reasonable accommodation letter | PHRASE | https://pawtenant.com/esa-accommodation-request-letter | Under review (new) |
| esa letter for apartment approval | PHRASE | https://pawtenant.com/esa-letter-for-apartments | Not eligible: Low search volume / Under review |

Notes:
- "Under review" / "Not eligible: Low search volume" are normal serving states for brand-new / low-volume keywords; all are ENABLED and will serve once reviewed / volume materializes.
- Verified via the keyword table's per-row Final URL cells + accessibility labels after save (each shows "currently [URL]").
- Account context in UI: campaign Search – ESA High Intent, ad group "Ad Group 2 — Housing Intent" (179910239433) — confirmed by filter chips.

### Why earlier MCP path was abandoned (kept for history)
Supermetrics Ads MCP could not do this safely: `campaign_update` keyword schema is `{text, match_type}` only (no per-keyword `final_urls`), and ad-group `targeting` is replace-not-append (would risk wiping the 78 existing keywords). So the work was done in the browser UI per owner instruction.

## Scope (locked)
- **Account:** 2480853323
- **Campaign:** Search – ESA High Intent = `22472726576` (ENABLED)
- **Ad group:** Housing Intent = `179910239433` (ENABLED; display name "Ad Group 2 — Housing Intent")
- **Action:** Add 4 keywords with keyword-level Final URLs. Nothing else.

## Keywords to add (read-back)
| # | Keyword | Match | Final URL | Duplicate? |
|---|---------|-------|-----------|------------|
| 1 | esa letter for renting | PHRASE | https://pawtenant.com/esa-letter-for-apartments | None in campaign |
| 2 | esa letter for renters | EXACT | https://pawtenant.com/esa-letter-for-apartments | None in campaign |
| 3 | esa reasonable accommodation letter | PHRASE | https://pawtenant.com/esa-accommodation-request-letter | None in campaign |
| 4 | esa letter for apartment approval | PHRASE | https://pawtenant.com/esa-letter-for-apartments | None in campaign |

### Verification done
- Duplicate scan across ALL 5 ad groups of campaign 22472726576: 0 exact-text matches for any of the 4. ✓
- Existing near-matches in Housing Intent (NOT duplicates, leave as-is): `esa letter for apartment` (PHRASE+EXACT), `esa letter for landlord approval` (EXACT), `ESA housing accommodation` (PHRASE).
- Final URLs return HTTP 200 (verified 2026-06-23): /esa-letter-for-apartments, /esa-accommodation-request-letter. ✓
- Ad group confirmed = Housing Intent (179910239433). ✓
- No broad match, no pet-rent keywords, no competitor keywords. ✓

## Hard exclusions honored
PSD RSA 813007414516 untouched; no 2nd PSD RSA; no ESA RSA edits; no existing-ad Final URL changes; no sitelinks/callouts/snippets/images/ECL; no budget/bid/tCPA/campaign-setting/conversion-action/negative/recommendation changes; no paused campaigns touched; no code/Supabase/Vercel/Stripe/Meta/Microsoft/GSC/GA4.

## Apply log
- 2026-06-23 — APPLIED via Google Ads browser UI. 4 keywords added to ad group 179910239433 with keyword-level Final URLs (see table above). Keyword count 32 → 36. No existing keywords/settings touched. Verified post-save.
