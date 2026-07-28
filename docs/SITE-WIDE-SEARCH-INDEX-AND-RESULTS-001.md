# SITE-WIDE-SEARCH-INDEX-AND-RESULTS-001 — queued, not implemented

**Status:** DEFERRED — docs only. **No runtime code and no navigation UI exists for this.**

Raised during `LIVE-PUBLIC-PAGES-CONVERSION-PRICING-VERIFICATION-HERO-PROVIDER-FIX-001`
(2026-07-28). The owner explicitly deferred implementation and directed that it be
built later in **TEST**, not LIVE.

A blocking guard (`scripts/check-public-conversion-pages.mjs`) asserts that no
site-search runtime has been introduced into the public navbar or the homepage.
Implementing this task means updating that guard deliberately — it should not be
edited around.

---

## Scope when it is picked up

### Entry point
- Search icon / button in the **desktop** header and the **mobile** menu.
- Accessible search dialog or a dedicated results page:
  - focus trapped while open, focus restored on close
  - `Escape` closes
  - full keyboard operation (arrow keys through results, `Enter` to open)
  - correct roles / `aria-expanded` / `aria-controls`
  - screen-reader announcement of result counts

### Index
- Public website pages only.
- Keyword relevance ranking.
- Typo tolerance where practical (cheap edit-distance or trigram matching is enough;
  a heavyweight search dependency is not justified at this site's size).
- Result rows show: **title, short summary, breadcrumbs, route**.

### Hard exclusions
Nothing in these groups may ever enter the index:
- Admin (`/admin-*`), Customer Portal, Provider Portal
- Authentication and checkout routes
- `/verify` and `/verify/:id` — verification is not a browsable surface
- Any `noindex` route. **Specifically `/esa-letter-housing`**, which is a paid-search
  landing page that is `noindex, nofollow` by owner policy, absent from the sitemap,
  and protected by `scripts/check-esa-housing-redesign.mjs`. It must never be indexed
  by site search either.
- Unpublished provider profiles — the public provider gate is
  `public.get_public_provider_directory()`; site search must consume the same
  published set (`PUBLISHED_PROVIDER_SLUGS`) and never the full curated eight.
- **No external customer data of any kind.**

### Analytics
- Capture search terms for content planning.
- Do **not** store anything that could identify a person, and do not log a term
  together with an account, order, email or IP.

---

## Delivery rules

1. **TEST first.** Build and verify in `pawtenant-test`.
2. Browser and mobile QA across the standard viewport set (375, 390, 430, 768,
   1024, 1280, 1440, 1920).
3. Extend the guard suite: index-exclusion checks (portals, checkout, auth,
   `noindex` routes, unpublished providers) with planted negative controls.
4. **Explicit owner approval required before any LIVE promotion.**

---

## Related

- `LIVE-PUBLIC-PAGES-CONVERSION-PRICING-VERIFICATION-HERO-PROVIDER-FIX-001` — the task
  that queued this.
- `ORDER-NOTARY-SERVICE-WORKFLOW-001` — separately queued; the public notarization
  section shipped as informational copy only, with no checkout, database request,
  portal workflow, provider notification or vendor booking behind it.
- `PROVIDER-HEADSHOT-OBJECT-KEY-DEIDENTIFICATION-001` — separately queued; provider
  headshot filenames in the public storage bucket encode provider email addresses
  (a normalised email address, e.g. `<local-part>_<domain>_com.jpg`), so those URLs appear in public page
  markup. Object keys should be re-keyed to opaque identifiers.
