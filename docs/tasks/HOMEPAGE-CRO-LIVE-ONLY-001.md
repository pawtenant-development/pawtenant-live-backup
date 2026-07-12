# HOMEPAGE-CRO-LIVE-ONLY-001

**Owner/session:** Claude session (2026-07-12) — LIVE production release (owner-approved, homepage-only).
**Started from commit:** LIVE `9f013f4` (pre-release HEAD — rollback point).
**Release commit:** LIVE `a29f04a` — `release: ship homepage CRO redesign`.
**TEST source (committed + pushed):** `e9752af` (feat: implement homepage CRO redesign) + `ebda847`
(fix: polish homepage CRO responsive design and public heroes). TEST origin/main tip `1d5cb3a`.
Both confirmed ancestors of TEST `origin/main` (fully pushed). TEST working tree treated read-only
(RA/provider-document workflow task active there — not touched, not fetched, not switched).

## Goal
Surgically mirror **only** the approved new homepage (`/`) CRO redesign from TEST into LIVE
production. No other public page, no backend, no Supabase, no functions, no migrations.

## Preflight
- LIVE branch `main`, HEAD `9f013f4`, `origin/main...HEAD = 0 0`, upstream `origin/main`.
- No merge/rebase/cherry-pick in progress; **zero UU/unmerged paths**; no `index.lock`.
- LIVE dirty (untracked, PRESERVED, NOT staged): `docs/PAWTENANT_CLAUDE_OPERATING_RULES.md`,
  `docs/google-ads-assets-sitelinks-callouts-snippets-tracker.md`,
  `docs/google-ads-housing-keywords-tracker.md`, `docs/google-ads-psd-rsa-tracker.md`.
- Frozen mega-files (`OrderDetailModal.tsx`, `AnalyticsTab.tsx`) NOT in scope, NOT touched.
- Homepage source line-endings: TEST commits are CRLF, LIVE is LF (no `.gitattributes`) →
  all mirrored text files normalized to **LF** so LIVE stays consistent (clean content diffs).

## The mixed commit (why this was surgical, not a cherry-pick)
`ebda847` is a **mixed** commit: homepage files **+** a shared-hero rollout to ~74 other public
pages (state/PSD/blog/service/guide) **+** new `HeroPriceLine.tsx` + `BlogProse.tsx` + a shared
`.pt-hero-display` CSS class. Only the homepage-specific hunks/files were mirrored; the ~74-page
rollout and its helpers were **excluded**. LIVE/TEST home dirs also diverge structurally (LIVE had
the old 25-file 30-block homepage), so this was a per-file mirror, not `git checkout`.

## Files mirrored (22) — homepage release only
**Homepage components (adopted from TEST `ebda847`, LF-normalized):**
- `src/pages/home/page.tsx` (13-block composition; ORGANIZATION_SCHEMA + WebSite JSON-LD; canonical
  `https://pawtenant.com/`; title/meta/keywords **identical** to LIVE's prior homepage — no SEO
  regression; org-schema offer prices 99.00/149.00 → 129.00/129.00 per approved redesign).
  LIVE-specific: added `variant="bold"` to the `MobileStickyApplyCTA` call (isolation — see below).
- Modified: `HeroSection`, `StepsSection`, `CTASection`, `DoctorsSection`, `FAQSection`,
  `TestimonialsSection`, `TopStatesSection`.
- New: `GuaranteeSection`, `LetterProofSection`, `PsdSection`, `QualifySection`, `ResourcesSection`.
- Drift check (LIVE vs TEST baseline `5f1787d`, whitespace-insensitive): `StepsSection`,
  `CTASection`, `DoctorsSection`, `FAQSection`, `TestimonialsSection` were byte-identical; `page.tsx`,
  `HeroSection`, `TopStatesSection` diverged only in the old-vs-new body (SEO block already aligned;
  `TopStatesSection` new compact grid preserves every `/esa-letter/:slug` `/psd-letter/:slug` + hub link).

**New local assets (5, all served 200, optimized 19–94 KB):**
- `public/assets/lifestyle/esa-cat-relaxing-home{.jpg,.webp,-sm.webp,-tall.webp}` (licensed Freepik cat).
- `public/assets/veterans/man-on-porch-with-dog.webp` (PSD section).

**Shared infra files — surgical hunks only (LIVE content preserved):**
- `index.html`: homepage Service-schema price `99`→`129`; add **Source Serif 4** to the 3 Google-Fonts
  links (every home component uses it inline). Hero LCP preloads already matched — untouched.
- `src/index.css`: **only** the `.hero-img-position` desktop framing (`40% center`→`50% 30%`, used
  solely by the homepage hero, both repos). `.pt-hero-display` addition (other-page rollout) **excluded**.
- `scripts/prerender-seo.mjs`: **only** the homepage `HOME_HERO_SKELETON` + `pt-h-*` CSS (LIVE region
  confirmed == baseline before splice; diff == intended homepage hunk exactly). No other route touched.
- `src/components/feature/MobileStickyApplyCTA.tsx`: **additive opt-in** `variant?: "default" | "bold"`.
  Default branch renders the exact existing amber-orange (`orange-400`) string → **all ~37 other pages
  that use this shared bar are visually unchanged**. Homepage passes `variant="bold"` (Apply-Now
  `orange-500`). This is the isolation the brief requires instead of bumping the shared default.

## Explicitly EXCLUDED (documented, not shipped)
- The ~74 non-home `src/pages/*/page.tsx` hero rollout (state-esa, state-psd, esa-letter-cost,
  psd-letter-*, all blogs, service pages, guides, etc.).
- `src/components/feature/HeroPriceLine.tsx` (not imported by any home component — "$32.25" is inline
  in the home `HeroSection`), `src/components/feature/BlogProse.tsx`, the shared `.pt-hero-display` class.
- ESA/PSD state pages, package selector/pricing/entitlement, checkout, assessment flow, customer
  portal, RA/Housing-Accommodation/Additional-Documentation, provider & admin portals, AI Support,
  HR/Team Ops, Investor Dashboard. **No** Supabase, functions, migrations, secrets, cron, SMS, email,
  ads (Google/Meta/Microsoft), GHL. `public/assets/ASSET_MANIFEST.md` left as-is (non-functional doc).

## SEO / conversion verification (prerendered `out/index.html` + browser)
- Exactly **one** `<h1>`: "Get an ESA Letter Online — Your Landlord Can Verify".
- Canonical `https://pawtenant.com/` (non-www; `vercel.json` www→non-www 308 untouched).
- Title/meta/keywords unchanged from prior homepage; Source Serif font link ×3 present; Service
  price `129`; JSON-LD (Organization/WebSite/Service/BreadcrumbList/WebPage) intact.
- Attribution: `withAttribution` on **every** CTA — all 9 homepage CTAs preserved
  `gclid`+`utm_*` to `/assessment` and `/psd-assessment` (verified in browser with test params).
  No `gtag`/`fbq`/`dataLayer` hooks removed (those load globally in `index.html`, untouched).
- No "As Featured In"/press strip. No "legit/legitimate" in headings.

## Build / type-check (LIVE)
- `npm run build` **PASS**: `vite build` ✓, prerender **242 files, 0 errors**,
  `check-attribution-parity` **OK** (7 hierarchy cases). (Pre-existing 1.96 MB admin/blog chunk
  warning only — unrelated.)
- `npm run type-check`: **0 errors in any homepage/edited file**. 8 pre-existing, unrelated errors
  remain (`AIAssistantTrustCard`, frozen `AnalyticsTab`, `EmployeeHrDirectory`, `ProviderInternalRecords`
  — same set noted in the 2026-07-10 live-mirror card). The deploy `build` script runs no `tsc`, so
  these do not block the Vercel build.

## Preview QA (local `vite preview` of the production `out/` build)
- Desktop 1280: hero content **centered** (`text-align:center` + auto margins), CTA
  `rgb(249,115,22)`=orange-500 → `/assessment`, one H1, Source Serif H1, **overflow 0**.
- Mobile 360/375: **overflow 0** (no page-level offenders; provider carousel is intended `overflow-x`),
  sticky CTA = "Check If You Qualify", orange-500, attribution-preserving href, reveal logic responds
  to scroll; scroll-top/live-chat fixed controls don't overlap the sticky.
- 5 new assets HTTP **200** (correct types/sizes). No console errors. (Screenshots blocked by a
  renderer-busy state from the DoctorsSection Supabase fetch in preview → verified via computed styles
  instead, which is more precise.)

## Deployment
- Committed `a29f04a`; pushed `9f013f4..a29f04a main -> main` → Vercel Git-integration production build.
- (pawtenant.com Vercel project is under the `pawtenant-development` account — not reachable via the
  session's Vercel MCP token, which only sees an unrelated `zeek-engines` Next.js project; deploy READY
  confirmed by loading the live site in-browser.)

## Production QA (pawtenant.com) — deploy READY, promoted 2026-07-12
- **New homepage live:** H1 "Get an ESA Letter Online — Your Landlord Can Verify" (exactly 1),
  "$32.25", "Check If You Qualify". Old hero ("Fast, Simple & Stress Free") gone.
- **Desktop (1351px):** hero centered, CTA `rgb(249,115,22)` orange-500, overflow **0**, 0 offenders.
- **Mobile (390px):** overflow **0**, 0 offenders, CTA orange-500, one H1.
- **SEO:** canonical `https://pawtenant.com/` (non-www); title correct; JSON-LD types
  Organization/WebSite/WebPage/Service/FAQPage present; no "As Featured In".
- **Tracking loads:** `gtag` fn, `dataLayer` (7), `fbq` fn (Meta), `uetq` (Microsoft UET).
- **Attribution:** all homepage CTAs preserve `gclid`+`utm_*` →
  `/assessment?gclid=PRODTEST99&utm_source=google&utm_medium=cpc` (and `/psd-assessment`).
- **Assets:** 5 new images serve **200** on prod (webp/jpg, exact sizes 19.3/40.9/49.9/74.7/94.4 KB).
- **Network:** all homepage chunks + hero image 200; **no 404s / no failed requests**. **No console errors.**
- **www alias:** `https://www.pawtenant.com/` **308 → `https://pawtenant.com/`** (non-www canonical) serving new homepage.
- **Excluded routes NOT redesigned (own content, no overflow, no `.pt-hero-display`, render OK):**
  `/esa-letter/florida` (H1 "Get an ESA Letter in Florida"), `/psd-letter/texas` (H1 "PSD Letter in Texas"),
  `/assessment` (flow intact), `/customer-login`, `/admin-login`. No auth performed; no checkout; no customer data exposed.

## Result — COMPLETED (2026-07-12)
Homepage CRO redesign shipped to LIVE production and verified. Backend/Supabase/functions/migrations
untouched; no SMS/email/call; no financial action. Rollback point `9f013f4` recorded above.

## Rollback
- Prior good LIVE commit: `9f013f4`. Rollback = `git revert a29f04a` (or reset to `9f013f4`) + push,
  which triggers a fresh Vercel production build of the prior homepage. Only the 22 listed files change.
