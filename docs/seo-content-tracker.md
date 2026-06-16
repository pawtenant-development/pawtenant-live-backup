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

| Content Type | Route / URL | Title / Topic | Primary Intent | Status | TEST Commit | LIVE Commit | Sitemap Updated | llms.txt Updated | Internal Links Added | GSC Submitted | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SEO Page | `/esa-letter-for-apartments` | ESA Letter for Apartments | Apartment-renter ESA housing accommodation | LIVE complete | `3570e64` | `51a47a5` | TEST yes / LIVE yes | TEST yes / LIVE yes | TEST yes / LIVE yes | Yes — 2026-06-17 | Apartment renter ESA housing intent. GSC: sitemap.xml resubmitted (Success, 181 pages); URL inspection was "Discovered – currently not indexed", indexing requested → added to priority crawl queue. |
| SEO Page | `/esa-accommodation-request-letter` | ESA Accommodation Request Letter | Tenant's reasonable-accommodation request letter | LIVE complete | `3570e64` | `51a47a5` | TEST yes / LIVE yes | TEST yes / LIVE yes | TEST yes / LIVE yes | Yes — 2026-06-17 | Tenant reasonable accommodation request letter / sample template intent. GSC: sitemap.xml resubmitted; URL inspection was "Discovered – currently not indexed", indexing requested → added to priority crawl queue. |
| SEO Page | `/landlord-esa-documentation-checklist` | Landlord ESA Documentation Checklist | Landlord / property-manager documentation review | LIVE complete | `3570e64` | `51a47a5` | TEST yes / LIVE yes | TEST yes / LIVE yes | TEST yes / LIVE yes | Yes — 2026-06-17 | Landlord/property-manager ESA documentation checklist intent. GSC: sitemap.xml resubmitted; URL inspection was "URL is unknown to Google", indexing requested → added to priority crawl queue. |

---

## How to add a row

1. Add one row per new route/content asset to the **Content Log** table above.
2. Fill **TEST Commit** with the short hash once pushed to `pawtenant-test` main.
3. Leave **LIVE Commit** as `—` until an approved LIVE mirror; then fill it and set Status to `LIVE complete`.
4. Keep **GSC Submitted** as `No` until indexing work is explicitly approved and actually done.
5. Use **Notes** for primary intent, compliance flags, or mirror caveats.
