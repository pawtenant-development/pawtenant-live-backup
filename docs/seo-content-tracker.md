# SEO / Blog / Content Tracker

Single source of truth for tracking every blog post, SEO page, guide, or content
asset published (or in progress) on PawTenant. TEST is the staging canonical;
LIVE is mirrored only after explicit owner approval.

## Tracker Rules

- **Update this file whenever a new blog, SEO page, guide, or content asset is created.**
- Update the **TEST Commit** column after TEST completion.
- Update the **LIVE Commit** column **only after an approved LIVE mirror**.
- Keep **GSC Submitted** as `No` until the user **explicitly** approves GSC / indexing work.
- **Do not list fake published status before a LIVE mirror** — a TEST-only page is `TEST complete / LIVE pending`, never "live".
- **Do not mark GSC Submitted unless it was actually submitted.**
- Every future Claude prompt related to blog posting, SEO pages, or content publishing should include an instruction to update this tracker.

### Status values

- `TEST complete / LIVE pending` — shipped to TEST, awaiting approved LIVE mirror
- `LIVE complete` — mirrored to LIVE and verified
- `In progress` — being built, not yet committed
- `Planned` — scoped but not started

---

## Content Log

**Index status audit:** `Index Status` column reflects a Google Search Console URL Inspection
pass on **2026-06-17**, property `https://pawtenant.com/` (URL-prefix, non-www). Statuses are
point-in-time; recent pages still settling. No indexing was requested during the 2026-06-17 audit
(audit-only). The only explicit indexing request to date was the 3 apartment pages on 2026-06-17.

Sitemap/llms/Internal columns: `LIVE yes/no` = present on production; `TEST yes` = present in TEST repo.

| Content Type | Route / URL | Title / Topic | Primary Intent | Status | TEST Commit | LIVE Commit | Sitemap | llms.txt | Internal Links | GSC Submitted | Index Status (GSC 2026-06-17) | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SEO Page | `/esa-laws` | ESA Laws & Requirements | What a valid ESA letter requires | LIVE complete | `fb556a7` | `8be3946` | LIVE yes | LIVE yes | LIVE yes | No | **Indexed** | Live 200, canonical self non-www, no noindex. |
| SEO Page | `/are-online-esa-letters-legit` | Are Online ESA Letters Legit? | Legitimacy / verify online provider | LIVE complete | `fb556a7` | `8be3946` | LIVE yes | LIVE yes | LIVE yes | No | Discovered / not indexed | In sitemap; awaiting crawl/index. |
| SEO Page | `/california-esa-letter-30-day-rule` | California ESA 30-Day Rule (AB 468) | CA AB 468 compliance | LIVE complete | `fb556a7` | `8be3946` | LIVE yes | LIVE yes | LIVE yes | No | Crawled / not indexed | Crawled ~Jun 2; not selected for index yet. |
| SEO Page | `/iowa-esa-letter-housing-rules` | Iowa ESA Housing Rules (§216.8B) | IA housing-law compliance | LIVE complete | `fb556a7` | `8be3946` | LIVE yes | LIVE yes | LIVE yes | No | Crawled / not indexed | Crawled; not selected for index yet. |
| SEO Page | `/florida-esa-letter-housing-rules` | Florida ESA Housing Rules (§760.27) | FL housing-law compliance | LIVE complete | `fb556a7` | `8be3946` | LIVE yes | LIVE yes | LIVE yes | No | **Indexed** | Live 200, breadcrumbs valid. |
| SEO Page | `/landlord-denied-esa-letter` | Landlord Denied Your ESA? | Denial support / housing rights | LIVE complete | `a224304` | `7210e7b` | LIVE yes | LIVE yes | LIVE yes | No | **Indexed** | Live 200, breadcrumbs valid. |
| AI-SEO Page | `/best-online-esa-letter-service` | Best Online ESA Letter Service | How to choose a real service | LIVE complete | `049eb31` | `1f19396` | LIVE yes | LIVE yes | LIVE yes | No | Discovered / not indexed | Discovered via sitemap.xml; awaiting index. |
| AI-SEO Page | `/how-to-get-esa-letter-online` | How to Get an ESA Letter Online | Online process intent | LIVE complete | `049eb31` | `1f19396` | LIVE yes | LIVE yes | LIVE yes | No | **Indexed** | Live 200, breadcrumbs valid. |
| AI-SEO Page | `/esa-letter-for-landlord` | ESA Letter for Landlords | Housing request guide | LIVE complete | `049eb31` | `1f19396` | LIVE yes | LIVE yes | LIVE yes | No | Crawled / not indexed | Crawled ~Jun 15; not indexed yet. |
| AI-SEO Page | `/is-pawtenant-legit` | Is PawTenant Legit? | Brand legitimacy | LIVE complete | `049eb31` | `1f19396` | LIVE yes | LIVE yes | LIVE yes | No | **Indexed** | Live 200, breadcrumbs valid. |
| SEO Page | `/are-esa-letters-still-valid-after-hud-change` | ESA Valid After 2026 HUD Change? | HUD 2026 enforcement pivot | LIVE complete | `fcca75a` | `8518894` | LIVE yes | LIVE yes | LIVE yes | No | Discovered / not indexed | In sitemap + llms.txt (llms added 2026-06-17); awaiting index. |
| Blog | `/blog/2026-hud-esa-guidelines` | 2026 HUD ESA Guidelines | HUD memo explainer | LIVE complete | `f3e09a9` | `dbb145c` | LIVE yes | LIVE yes | LIVE yes | No | **Indexed** | Live 200, breadcrumbs valid. |
| SEO Hub | `/travel-anxiety-esa-letter` | ESA Letters for Travel Anxiety | Travel-anxiety / temp-housing hub | LIVE complete | `9f47aff` | `76c2381` | LIVE yes | LIVE yes | LIVE yes | No | **Indexed** | Live 200, breadcrumbs valid. |
| Blog | `/blog/emotional-support-animal-travel-anxiety` | ESA & Travel Anxiety | Travel-anxiety comfort | LIVE complete | `9f47aff` | `76c2381` | LIVE yes | LIVE yes | LIVE yes | No | URL unknown to Google | In sitemap but not yet known to Google. |
| Blog | `/blog/temporary-housing-emotional-support-animal` | ESA in Temporary Housing | Temp/extended-stay housing | LIVE complete | `9f47aff` | `76c2381` | LIVE yes | LIVE yes | LIVE yes | No | URL unknown to Google | In sitemap but not yet known to Google. |
| Blog | `/blog/crowds-travel-stress-emotional-support-animal` | Crowds, Travel Stress & ESAs | Crowds / sensory overload | LIVE complete | `9f47aff` | `76c2381` | LIVE yes | LIVE yes | LIVE yes | No | Discovered / not indexed | Discovered via sitemap.xml; awaiting index. |
| SEO Page | `/esa-pet-rent-deposit` | ESA Pet Rent & Deposit Guide | Pet fees/deposits | LIVE complete | `a36492e` | `8bf41d2` | LIVE yes | LIVE yes | LIVE yes | No | URL unknown to Google | In sitemap + llms.txt (llms added 2026-06-17); not yet known to Google. |
| SEO Page | `/how-to-verify-esa-letter` | How to Verify an ESA Letter | Verification center | LIVE complete | `7c28290` | `f30f1e4` | LIVE yes | LIVE yes | LIVE yes | No | **Indexed** | Live 200; in sitemap + llms.txt (llms added 2026-06-17); indexed. |
| SEO Page | `/esa-letter-for-apartments` | ESA Letter for Apartments | Apartment-renter ESA housing | LIVE complete | `3570e64` | `51a47a5` | LIVE yes | LIVE yes | LIVE yes | Yes — 2026-06-17 | **Indexed** | Indexing requested 2026-06-17 → now indexed. |
| SEO Page | `/esa-accommodation-request-letter` | ESA Accommodation Request Letter | Reasonable-accommodation request letter | LIVE complete | `3570e64` | `51a47a5` | LIVE yes | LIVE yes | LIVE yes | Yes — 2026-06-17 | Crawled / not indexed | Indexing requested 2026-06-17; crawled, not indexed yet. |
| SEO Page | `/landlord-esa-documentation-checklist` | Landlord ESA Documentation Checklist | Landlord documentation review | LIVE complete | `3570e64` | `51a47a5` | LIVE yes | LIVE yes | LIVE yes | Yes — 2026-06-17 | Crawled / not indexed | Indexing requested 2026-06-17; crawled, not indexed yet. |
| SEO Page (state) | `/california-esa-letter-for-apartments` | California ESA Letter for Apartments | CA apartment-renter ESA housing | LIVE complete | `3f6b419` | `a2f73cc` | LIVE yes | LIVE yes | LIVE yes | Yes — 2026-06-17 | Discovered / not indexed (req. queued 2026-06-17) | LIVE mirror byte-identical to TEST. AB 468 30-day rule + high-rent no-pet metros. GSC 2026-06-17: sitemap.xml resubmitted (Success, 185 pages); URL Inspection before = "URL is not on Google: Discovered – currently not indexed"; indexing requested → "added to a priority crawl queue". |
| SEO Page (state) | `/texas-esa-letter-for-apartments` | Texas ESA Letter for Apartments | TX apartment-renter ESA housing | LIVE complete | `3f6b419` | `a2f73cc` | LIVE yes | LIVE yes | LIVE yes | Yes — 2026-06-17 | Discovered / not indexed (req. queued 2026-06-17) | LIVE mirror byte-identical to TEST. No state wait + corporate property managers + verification. GSC 2026-06-17: sitemap.xml resubmitted (Success, 185 pages); URL Inspection before = "URL is not on Google: Discovered – currently not indexed"; indexing requested → "added to a priority crawl queue". |
| SEO Page (state) | `/florida-esa-letter-for-apartments` | Florida ESA Letter for Apartments | FL apartment/condo ESA housing | LIVE complete | `3f6b419` | `a2f73cc` | LIVE yes | LIVE yes | LIVE yes | Yes — 2026-06-17 | URL unknown to Google (req. queued 2026-06-17) | LIVE mirror byte-identical to TEST. Statute 760.27 + condo/HOA boards. GSC 2026-06-17: sitemap.xml resubmitted (Success, 185 pages); URL Inspection before = "URL is not on Google: URL is unknown to Google" (sitemap re-read not yet propagated to this URL record); indexing requested → "added to a priority crawl queue". |
| SEO Page (state) | `/new-york-esa-letter-for-apartments` | New York ESA Letter for Apartments | NY apartment/co-op ESA housing | LIVE complete | `3f6b419` | `a2f73cc` | LIVE yes | LIVE yes | LIVE yes | Yes — 2026-06-17 | Discovered / not indexed (req. queued 2026-06-17) | LIVE mirror byte-identical to TEST. FHA + NYS/NYC human-rights laws + co-op/board review. GSC 2026-06-17: sitemap.xml resubmitted (Success, 185 pages); URL Inspection before = "URL is not on Google: Discovered – currently not indexed"; indexing requested → "added to a priority crawl queue". |
| PSD State Page | `/psd-letter/california` | PSD Letter in California | CA Psychiatric Service Dog evaluation | LIVE complete | `a8dae2e` | `8f6be79` | LIVE yes (existing) | LIVE yes | LIVE yes | No | Not requested | LIVE mirror of TEST PSD compliance rebuild + polish. Root cause of prior broken images: page used readdy.ai hotlinked image URLs → replaced with local `/assets/...`. Hero/law/advantages/why images now load. CA hook: Unruh Act + FEHA + AB 468. CTAs → /psd-assessment. |
| PSD State Page | `/psd-letter/texas` | PSD Letter in Texas | TX Psychiatric Service Dog evaluation | LIVE complete | `a8dae2e` | `8f6be79` | LIVE yes (existing) | LIVE yes | LIVE yes | No | Not requested | LIVE mirror. TX hook: Hum. Res. Code Ch. 121 + § 121.006 (penalizes service-animal misrepresentation). |
| PSD State Page | `/psd-letter/florida` | PSD Letter in Florida | FL Psychiatric Service Dog evaluation | LIVE complete | `a8dae2e` | `8f6be79` | LIVE yes (existing) | LIVE yes | LIVE yes | No | Not requested | LIVE mirror. FL hook: Statute 413.08 (misrepresentation a misdemeanor) + 760.27 (practitioner personal knowledge); condo/HOA. |
| PSD State Page | `/psd-letter/new-york` | PSD Letter in New York | NY Psychiatric Service Dog evaluation | LIVE complete | `a8dae2e` | `8f6be79` | LIVE yes (existing) | LIVE yes | LIVE yes | No | Not requested | LIVE mirror. NY hook: NYS + NYC Human Rights Law + Civil Rights Law § 47; co-op/condo board. |
| PSD State Page | `/psd-letter/north-carolina` | PSD Letter in North Carolina | NC Psychiatric Service Dog evaluation | LIVE complete | `a8dae2e` | `8f6be79` | LIVE yes (existing) | LIVE yes | LIVE yes | No | Not requested | LIVE mirror. NC hook: N.C.G.S. § 168-4.2 + penalty for misrepresenting a pet as a service animal. |
| PSD State Page | `/psd-letter/pennsylvania` | PSD Letter in Pennsylvania | PA Psychiatric Service Dog evaluation | LIVE complete | `a8dae2e` | `8f6be79` | LIVE yes (existing) | LIVE yes | LIVE yes | No | Not requested | LIVE mirror. PA hook: Pennsylvania Human Relations Act + Philadelphia Fair Practices Ordinance. |
| PSD State Page | `/psd-letter/ohio` | PSD Letter in Ohio | OH Psychiatric Service Dog evaluation | LIVE complete | `a8dae2e` | `8f6be79` | LIVE yes (existing) | LIVE yes | LIVE yes | No | Not requested | LIVE mirror. OH hook: Ohio Civil Rights Act (O.R.C. 4112) + § 955.43 misrepresentation. |
| PSD State Page | `/psd-letter/georgia` | PSD Letter in Georgia | GA Psychiatric Service Dog evaluation | LIVE complete | `a8dae2e` | `8f6be79` | LIVE yes (existing) | LIVE yes | LIVE yes | No | Not requested | LIVE mirror. GA hook: O.C.G.A. § 30-4-2 service-animal access. |
| PSD State Page | `/psd-letter/illinois` | PSD Letter in Illinois | IL Psychiatric Service Dog evaluation | LIVE complete | `a8dae2e` | `8f6be79` | LIVE yes (existing) | LIVE yes | LIVE yes | No | Not requested | LIVE mirror. IL hook: Illinois Human Rights Act + Service Animal Access Act (720 ILCS 630) + misrepresentation penalty. |
| PSD State Page | `/psd-letter/arizona` | PSD Letter in Arizona | AZ Psychiatric Service Dog evaluation | LIVE complete | `a8dae2e` | `8f6be79` | LIVE yes (existing) | LIVE yes | LIVE yes | No | Not requested | LIVE mirror. AZ hook: A.R.S. § 11-1024 + penalty for misrepresenting a pet as a service animal. |
| PSD polish (all 10 PSD state pages) | `/psd-letter/*` | PSD state visual/nav polish | Hero/pills/pricing/nav polish + image fix | LIVE complete | `0d97e29` | `8f6be79` | LIVE yes | LIVE yes | LIVE yes | No | Not requested | Short mobile-safe hero, orange ribbon → soft pills, fixed law-image crop, pricing cards match /how-to-get-psd-letter, Service Dogs nav 2-col mega-menu w/ CA/TX/FL/NY/NC PSD links, softened a navbar "full ADA access" label. ESA state-page fixes also mirrored same commit (TEST 6b47cc2/4e6477a): Why-PawTenant landscape image + premium EsaPricingMini cards. |

### Index status snapshot (2026-06-17, 21 LIVE routes)

- **Indexed (9):** /esa-laws, /florida-esa-letter-housing-rules, /landlord-denied-esa-letter, /how-to-get-esa-letter-online, /is-pawtenant-legit, /blog/2026-hud-esa-guidelines, /travel-anxiety-esa-letter, /how-to-verify-esa-letter, /esa-letter-for-apartments
- **Crawled / not indexed (5):** /california-esa-letter-30-day-rule, /iowa-esa-letter-housing-rules, /esa-letter-for-landlord, /esa-accommodation-request-letter, /landlord-esa-documentation-checklist
- **Discovered / not indexed (4):** /are-online-esa-letters-legit, /best-online-esa-letter-service, /are-esa-letters-still-valid-after-hud-change, /blog/crowds-travel-stress-emotional-support-animal
- **URL unknown to Google (3):** /blog/emotional-support-animal-travel-anxiety, /blog/temporary-housing-emotional-support-animal, /esa-pet-rent-deposit
- Newly mirrored to LIVE 2026-06-17 (after the GSC audit above): 4 state apartment pages (`/california-`, `/texas-`, `/florida-`, `/new-york-esa-letter-for-apartments`) — LIVE 200, in sitemap + llms.txt. GSC 2026-06-17: sitemap.xml resubmitted (Success, 185 discovered pages) and indexing requested for all 4 (each "added to a priority crawl queue"); pre-request states CA/TX/NY = Discovered–not indexed, FL = URL unknown to Google.

---

## How to add a row

1. Add one row per new route/content asset to the **Content Log** table above.
2. Fill **TEST Commit** with the short hash once pushed to `pawtenant-test` main.
3. Leave **LIVE Commit** as `—` until an approved LIVE mirror; then fill it and set Status to `LIVE complete`.
4. Keep **GSC Submitted** as `No` until indexing work is explicitly approved and actually done.
5. Record **Index Status** from a GSC URL Inspection (Indexed / Crawled – not indexed / Discovered – not indexed / URL unknown to Google), with the check date noted above the table.
6. Use **Notes** for primary intent, compliance flags, or mirror caveats.
