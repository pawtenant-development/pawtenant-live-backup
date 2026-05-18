# SYSTEMS.md — PawTenant Platform Governance & Ownership Map

> **Status:** Canonical operating document.
> **Created:** 2026-05-18 (end of P3 / SYSTEMS-MD-OWNERSHIP-MAP phase).
> **Owner:** Hamza Farid (Founder / CEO).
> **Scope:** Cross-repo governance for `pawtenant-test` and `pawtenant-live-backup`.
> **Authority:** This file overrides ad-hoc decisions. If a workflow disagrees with this doc, this doc wins until formally amended here.

This is **not** a README. This is the governance + architecture operating document for the PawTenant platform.

---

## 0. How To Read This Document

- Section 1–2 = what the platform is and which environment owns what.
- Section 3 = single-source-of-truth ownership map per system.
- Section 4–6 = process: how code, migrations, and deploys move.
- Section 7–9 = governance for areas with known divergence (analytics, Company OS, assets).
- Section 10–11 = forward roadmap and operational lessons.
- Mirror this file into `pawtenant-live-backup/SYSTEMS.md` after each amendment. **Both repos must hold identical copies.**

---

## 1. Platform Overview

PawTenant runs as a **two-repo, two-Supabase-project platform**, intentionally split so production stability is never coupled to roadmap velocity.

| Layer | TEST | LIVE |
|---|---|---|
| Repo | `pawtenant-test` | `pawtenant-live-backup` (mirror of `pawtenant-production`) |
| Vercel project | `pawtenant-test.vercel.app` | `pawtenant.com` (apex) |
| Supabase ref | `opudhofjbydrljgleofq` | `cvwbozlbbmrjxznknouq` |
| Role | Roadmap, experiments, Company OS, consultation funnel staging | Revenue, customer-facing checkout, paid orders, provider workflow |

### Operational philosophy

1. **LIVE earns revenue. TEST earns features.** Anything touching money runs on LIVE first only when triaged as a critical hotfix.
2. **Forward direction:** TEST → LIVE for features; LIVE → TEST for operational hotfixes only.
3. **Stability > velocity.** A working flow is more valuable than a clever refactor.
4. **Divergence is a fact, not a defect.** Some divergences are intentional (roadmap staging). Audit before mirroring.

### Parity philosophy

- Parity is **never** assumed from byte-count diffs.
- Parity is asserted only after CRLF/LF normalization + semantic review.
- Parity holds for **operational primitives** (checkout, Stripe, attribution, comms log). Parity is **not required** for roadmap surfaces (Company OS, consultation funnel, analytics).

---

## 2. Environment Definitions

### 2.1 TEST — `pawtenant-test`

**Purpose:**
- Active development surface.
- Hosts all roadmap features pre-LIVE.
- Hosts Company OS, attendance schema, permission bundles, consultation funnel V1.
- Hosts experimental analytics + Phase-2 attribution work.
- All migration files are authored here first.

**What belongs in TEST:**
- New features still being shaped.
- Roadmap UI (Company OS, employee portal, attendance shell).
- TEST-only Phase-2 analytics surfaces.
- Schema additions (additive only) being staged for LIVE.
- Consultation funnel scaffolding before LIVE rollout.

**What should NOT exist in TEST:**
- LIVE-only operational hotfixes that have not yet been mirrored back (these are tracked as drift).
- Stripe test keys pretending to be live.
- Hardcoded references to LIVE Supabase refs.

### 2.2 LIVE — `pawtenant-live-backup` (canonical: `pawtenant-production`)

**Purpose:**
- Revenue surface.
- Stable platform for paid customers and providers.
- Locked feature set, surgical updates only.

**What belongs in LIVE:**
- Stabilized checkout, Stripe PaymentIntent, webhook reconciliation.
- Communications Hub (DB-driven), live email templates.
- Live attribution + Meta CAPI + Google Ads conversion sync.
- Operational hotfixes (e.g. email normalization, try/finally loaders).
- Provider portal in production form.
- Customer my-orders portal in production form.

**What should NOT exist in LIVE:**
- Company OS UI (employee portal, attendance, time-clock).
- Permission-bundle enforcement.
- Phase-2 experimental analytics surfaces.
- Consultation funnel V1 admin tooling (until rollout approved).
- Anything still touching Readdy CDN assets (cleanup in progress).

### 2.3 Allowed divergence categories

| Category | Example | Resolution |
|---|---|---|
| **TEST-first** | Consultation funnel, Company OS | Promote to LIVE when scope frozen |
| **LIVE operational hotfix** | Email normalization, try/finally loaders | Mirror to TEST as soon as observed |
| **TEST-only roadmap** | Attendance schema, permission bundles | Stays TEST until rollout decision |
| **Intentional LIVE-only** | Pre-Readdy-cleanup CDN URLs (legacy) | Tracked, scheduled for removal |
| **Vocabulary drift** | `ownerChannel` vs canonical attribution names | Formal naming alignment before unification |

---

## 3. System Ownership Map

Per-system ownership, parity rules, and deployment direction. Format:

- **Canonical owner** = which environment holds the source-of-truth implementation.
- **Parity expectation** = strict (byte-identical post-normalization) / functional (semantic equivalent) / divergent (intentional).
- **Deployment direction** = TEST→LIVE / LIVE→TEST / bidirectional / frozen.
- **Status** = current state as of 2026-05-18.

### 3.1 Checkout (Step 1 → Step 2 → Step 3 → Payment → Thank You)

- **Canonical owner:** LIVE.
- **Parity expectation:** Strict functional parity. Stripe PaymentIntent flow identical.
- **Deployment direction:** LIVE → TEST for hotfixes. TEST → LIVE only after explicit owner approval.
- **Merge rule:** Never blanket-copy. Always surgical. Stripe + Supabase order creation are protected.
- **Status:** Parity confirmed. Email-normalization hotfix mirrored 2026-05-17 (commit `5182f51`).

### 3.2 Assessment / Qualification (Step 1 + Step 2)

- **Canonical owner:** LIVE (production form).
- **Parity expectation:** Functional parity.
- **Deployment direction:** TEST → LIVE for UI improvements after preview verification.
- **Status:** Stable. Trust/conversion-oriented copy on LIVE.

### 3.3 Analytics

- **Canonical owner:** **Divergent.** TEST holds Phase-2 experimental analytics; LIVE holds operational analytics only.
- **Parity expectation:** Divergent — formally documented.
- **Deployment direction:** Frozen until vocabulary reconciliation (see §7).
- **Merge rule:** **AnalyticsTab.tsx is merge-frozen.** Do not blanket-copy in either direction.
- **Status:** Divergence is intentional. Phase-2 analytics stays TEST-only until ownerChannel vocabulary is unified.

### 3.4 Attribution (gclid, fbclid, UTM, session, visitor)

- **Canonical owner:** LIVE.
- **Parity expectation:** Strict functional parity for the capture/store path.
- **Deployment direction:** TEST → LIVE only with regression audit.
- **Merge rule:** No vocabulary changes (`ownerChannel`, `channel`, `source`) without a coordinated cross-repo update.
- **Status:** Capture logic in parity. Surfacing logic diverges (analytics-side).

### 3.5 Visitor tracking / heartbeat / live visitors

- **Canonical owner:** LIVE.
- **Parity expectation:** Functional parity.
- **Deployment direction:** LIVE → TEST for hotfixes.
- **Status:** Preserved in TEST as of last mirror.

### 3.6 Communications Hub

- **Canonical owner:** LIVE.
- **Parity expectation:** Strict functional parity for `communications` table + edge function logging (`logEmailComm`).
- **Deployment direction:** Bidirectional. Schema is additive only.
- **Source of truth:** `email_templates` (DB), `communications` (log). `orders.email_log` is legacy backup only.
- **Status:** Phase-2 complete on both sides. DB-driven templates are the canonical source.

### 3.7 Consultation funnel (V1)

- **Canonical owner:** LIVE (recently shipped).
- **Parity expectation:** Functional parity on customer-facing path. Admin tooling slightly ahead on TEST.
- **Deployment direction:** TEST → LIVE for admin tooling enhancements.
- **Recent work:** Lead recovery funnel V1 (`b68aadf`), manual consultation invite (`03842cd`), prefill UX (`a1ec73c`), row-level copy actions (`26f728b`).
- **Status:** LIVE. Phase-2 follow-ups tracked.

### 3.8 Customer portal (my-orders)

- **Canonical owner:** LIVE.
- **Parity expectation:** Strict functional parity.
- **Deployment direction:** LIVE → TEST for hotfixes.
- **Recent hotfix mirror:** Email-comparison normalization + try/finally setLoading guard (2026-05-17, commit `5182f51`).
- **Status:** TEST and LIVE in parity. No known divergence.

### 3.9 Provider portal (`provider-portal/page.tsx`)

- **Canonical owner:** LIVE.
- **Parity expectation:** Strict functional parity.
- **Deployment direction:** LIVE → TEST for hotfixes.
- **Constraint:** Queries `doctor_profiles` directly. **Do not bridge to `team_members` without a planning task.**
- **Status:** Stable.

### 3.10 Homepage + Landing Pages

- **Canonical owner:** LIVE.
- **Parity expectation:** Functional parity. Trust + conversion is the priority on LIVE.
- **Deployment direction:** TEST → LIVE after browser preview verification.
- **Status:** Stable. Minor copy/UI divergence allowed during experiments.

### 3.11 Assets (images, CDN, content)

- **Canonical owner:** TEST (canonical post-Readdy cleanup).
- **Parity expectation:** Functional parity. Local assets preferred over CDN-served Readdy URLs.
- **Deployment direction:** TEST → LIVE for asset hygiene sweeps.
- **Status:** TEST has already removed several Readdy CDN URLs that LIVE still references. See §9.

### 3.12 Company OS (employee portal, attendance, permission bundles)

- **Canonical owner:** TEST.
- **Parity expectation:** **Divergent (intentional).** TEST-only until LIVE rollout decision.
- **Deployment direction:** Frozen until owner approval.
- **Includes:** `team_members`, `shift_templates`, `employee_shift_assignments`, `time_clock_entries`, `attendance_daily_summary`, `holidays`, `clock_in_for_current_user()` / `clock_out_for_current_user()` RPCs, `src/lib/permissions.ts`, `src/lib/timezones.ts`.
- **Status:** Schema + RPCs in TEST. **No UI yet.** Operational RBAC still lives on `doctor_profiles.role` + `is_admin` and **must not** be changed without explicit instruction.
- **Admin sidebar divergence:** TEST has Company OS entries LIVE does not. Intentional. Not a parity defect.

### 3.13 Notifications roadmap

- **Canonical owner:** None yet.
- **Status:** Not started. Tracked as roadmap.
- **Deployment direction:** N/A.

### 3.14 PWA / mobile ops roadmap

- **Canonical owner:** None yet.
- **Status:** Not started. Tracked as roadmap.
- **Deployment direction:** N/A.

### 3.15 Email system

- **Canonical owner:** LIVE for templates in `email_templates`; both for code paths.
- **Parity expectation:** Strict functional parity for `logEmailComm` and edge function wiring.
- **Deployment direction:** Bidirectional. Template content edits go to LIVE first by default.
- **Constraint:** **Do not overwrite live template content unless explicitly asked.**
- **Status:** DB-driven templates are canonical. Hardcoded templates are deprecated.

### 3.16 Migrations (SQL)

- **Canonical owner:** TEST (authored here first).
- **Parity expectation:** **Additive only.** Idempotent. `IF NOT EXISTS` preferred.
- **Deployment direction:** TEST → LIVE after manual review.
- **Apply mechanism:** **MCP `apply_migration` only.** `supabase db push` is **forbidden** (migration drift blocks it; do not run `migration repair` / `db pull`).
- **Status:** All migration files are version-controlled. SQL is applied manually in the appropriate Supabase SQL Editor.

### 3.17 Edge Functions

- **Canonical owner:** LIVE for revenue-critical paths (Stripe webhook, comms logging).
- **Parity expectation:** Strict functional parity.
- **Deployment direction:** Bidirectional, surgical.
- **Status:** `logEmailComm` parity confirmed. `twilio-recording-callback` and other voice/comms paths exist on both sides.

### 3.18 Admin systems

- **Canonical owner:** Split.
  - Core admin (orders, lifecycle, assignment): LIVE canonical.
  - Company OS admin (employee, attendance): TEST canonical, frozen.
- **Parity expectation:** Functional parity on core admin. Divergent on Company OS admin.
- **Deployment direction:** TEST → LIVE for core admin enhancements after approval.
- **Notable hardening (TEST):** `ORDERS_INITIAL_LIMIT = 100` cap, unified Orders search bar, performance indexes (`orders.created_at DESC`, `orders.email LOWER`, partial `orders.payment_intent_id`, `orders.status`, `audit_logs.created_at DESC`, `order_status_logs.changed_at DESC`).

---

## 4. Merge / Mirror Rules

### 4.1 TEST → LIVE (feature promotion)

**Allowed when:**
- Feature is scope-frozen.
- Browser preview verified on TEST.
- Owner has explicitly approved promotion.
- All schema changes are additive + idempotent.
- No vocabulary drift introduced (no rename of `ownerChannel`, `channel`, `source` without coordinated update).

**Required steps:**
1. List exact files changed.
2. List exact migrations to apply.
3. List risks + rollback path.
4. Mirror surgically — file by file. **No blanket copy.**
5. Apply migrations via MCP `apply_migration` only.

### 4.2 LIVE → TEST (operational hotfix mirroring)

**Allowed when:**
- A LIVE-only operational fix has been confirmed stable.
- TEST is missing the fix and the underlying flow exists in TEST.

**Required steps:**
1. Identify the hotfix commit on LIVE.
2. Identify the corresponding TEST file (it may already differ for roadmap reasons).
3. Apply the hotfix **surgically**, preserving TEST-only roadmap divergences.
4. **Never replace the whole file.** Cherry-pick the operational change only.

### 4.3 When surgical merge is required

Always — unless the file is genuinely identical and unchanged on the receiving side. Default to surgical.

### 4.4 When blanket copy is forbidden

- Any file with documented divergence (see §3.3, §3.12, §3.16).
- Any mega-file currently under modularization review.
- Specifically:
  - **`OrderDetailModal.tsx`** — merge-frozen. Pending modularization decision. Surgical-only.
  - **`AnalyticsTab.tsx`** — merge-frozen. Pending ownerChannel vocabulary reconciliation. Surgical-only.

### 4.5 Merge-freeze policies

A file enters **merge-freeze** when:
- It is on the modularization roadmap AND
- It has divergent functional logic in TEST vs LIVE.

Merge-frozen files require an owner-approved migration plan before any cross-repo movement.

**Currently merge-frozen:** `OrderDetailModal.tsx`, `AnalyticsTab.tsx`.

---

## 5. Drift Governance

### 5.1 Intentional divergence handling

Every divergence must be classified into one of:
- **TEST-first (roadmap staging)** — promoted on owner approval.
- **LIVE operational hotfix (not yet mirrored)** — mirror within the next audit cycle.
- **Intentional LIVE-only (legacy)** — scheduled for removal.
- **Intentional TEST-only (roadmap)** — stays until rollout decision.
- **Vocabulary drift** — frozen until naming alignment.

Unclassified divergence is a defect.

### 5.2 Tracker truth rules

- The tracker (`PawTenant_Tracker_with_CompanyOS.xlsx`) is the **canonical task ledger**.
- Every divergence has a tracker row.
- Every mirror operation references the tracker row that authorized it.
- Tracker rows quote evidence (commit SHA, file path, audit date).
- **Never trust raw byte deltas.** Always normalize line endings before asserting drift.

### 5.3 Parity audit expectations

- Manual audit cadence: end of each phase (P0, P1, P2, P3 …).
- Audit output: a delta classification per file (parity / hotfix-missing / roadmap-divergence / legacy-only).
- Audit must precede any blanket promotion or rollback decision.

### 5.4 Nightly parity CI (planned, not built)

- Future goal: automated diff job that produces a classified divergence report per night.
- Required pre-work: line-ending normalization, divergence allow-list, vocabulary alignment.
- **Not implemented yet.** This phase does not build CI.

### 5.5 Line-ending normalization

- **Mandatory before any parity diff.** CRLF vs LF noise has historically masked real divergence.
- Use a normalized diff workflow (e.g. `git diff --ignore-cr-at-eol`, or repo-level `.gitattributes` enforcing LF).
- A pure CRLF/LF delta is **not** a divergence and **must not** be merged blindly.

### 5.6 Audit methodology

1. List candidate files (e.g. `my-orders/page.tsx`, `AnalyticsTab.tsx`).
2. Normalize line endings.
3. Produce semantic diff.
4. Classify each delta into §5.1 categories.
5. Record in tracker with evidence.
6. Resolve only the categories that require resolution (hotfix-missing).

---

## 6. Deployment Governance

### 6.1 Frontend deployment

- **Workflow:** GitHub Desktop is the canonical Git client. Commits flow `pawtenant-test` → manual mirror → `pawtenant-production`.
- **Hosting:** Vercel auto-deploys both repos.
- **Pre-deploy checklist (TEST):** build passes, exact files changed listed, risks listed.
- **Pre-deploy checklist (LIVE):** tested in TEST, owner approval, exact mirror confirmed, Supabase function dependencies identified, checkout/payment safety re-verified.

### 6.2 Supabase migration policy

- **Authored** in `supabase/migrations/` (version-controlled).
- **Applied** via MCP `apply_migration` to the target Supabase project.
- **Forbidden:** `supabase db push`, `supabase migration repair`, `supabase db pull`. These break the current drift posture.
- **Idempotent + additive** only. Use `IF NOT EXISTS`. Never destructive without explicit owner instruction.

### 6.3 Deployment sequencing

Order of operations for a TEST → LIVE promotion involving schema + code:
1. Apply migration on LIVE Supabase (via MCP `apply_migration`).
2. Verify schema present in LIVE Supabase.
3. Mirror code surgically to `pawtenant-production`.
4. Vercel auto-deploys.
5. Smoke-test checkout, Stripe webhook, comms log, attribution capture on LIVE.

### 6.4 LIVE safety expectations

- **Never** break Stripe PaymentIntent / webhook.
- **Never** break Supabase order creation.
- **Never** expose PHI or sensitive user data.
- **Never** reset payment fields unnecessarily.
- Always preserve entered data through Step 1 → Step 2 → Step 3.
- Always verify mobile-first UX after a LIVE change.

---

## 7. Analytics Governance

### 7.1 Current state

- TEST holds Phase-2 analytics surfaces with experimental segmentation.
- LIVE holds operational analytics only (no Phase-2 surface).
- `AnalyticsTab.tsx` is **merge-frozen** in both directions.

### 7.2 The `ownerChannel` vocabulary issue

- TEST analytics uses `ownerChannel` as a vocabulary that does not align cleanly with the canonical attribution fields stored on LIVE (`channel`, `source`, `utm_*`, `gclid`, `fbclid`).
- This is a **naming layer divergence**, not a data divergence. The underlying attribution capture is in parity (§3.4).
- Until vocabulary is aligned, any blanket merge of analytics code corrupts the LIVE surface.

### 7.3 TEST analytics philosophy

- Exploratory.
- Free to introduce new dimensions, breakdowns, ownerChannel groupings.
- Not subject to LIVE stability constraints.

### 7.4 LIVE analytics philosophy

- Operational.
- Stable surface for revenue + funnel monitoring.
- No experimental segmentation.

### 7.5 Future reconciliation prerequisites

Before TEST analytics can be promoted to LIVE:
1. Canonical attribution vocabulary documented (single naming table).
2. `ownerChannel` either retired or formally adopted across both repos.
3. Migration path for any analytics-only schema additions.
4. Backfill plan for historical orders if dimensions change.
5. Browser preview verification on TEST with LIVE-like data shape.

---

## 8. Company OS Governance

### 8.1 Current status

- **TEST-only.** Schema, RPCs, and library code exist. **No UI surface yet.**
- Operational RBAC still lives on `doctor_profiles.role` + `is_admin`. Permission bundles exist but are **not enforced**.

### 8.2 Pending scope decision

The owner has not yet decided:
- Whether Company OS rolls out to LIVE in current form.
- Whether attendance/time-clock features become customer-visible.
- Whether providers (`doctor_profiles`) and employees (`team_members`) ever bridge.

This decision blocks promotion to LIVE.

### 8.3 LIVE rollout dependencies

Before any Company OS promotion to LIVE:
1. Scope freeze (which surfaces ship).
2. UI built and verified on TEST.
3. Permission-bundle enforcement either wired or formally deferred.
4. `doctor_profiles` ↔ `team_members` policy decided.
5. Admin sidebar entries reviewed for LIVE inclusion.

### 8.4 Admin sidebar divergence

- TEST sidebar has Company OS entries LIVE does not (intentional).
- Do **not** mirror sidebar entries during routine merge operations.
- This divergence is **classified as roadmap-staging**, not drift.

### 8.5 Operational separation philosophy

- Employees and providers are deliberately distinct identity hierarchies.
- `team_members.id` / `user_id` / `employee_code` = internal staff identity.
- `doctor_profiles` = provider identity.
- Bridging the two requires a planning task, not an inline change.

---

## 9. Asset / Content Governance

### 9.1 Readdy cleanup strategy

- Several legacy CDN URLs (Readdy-hosted) still appear on LIVE. TEST has progressed further on local-asset adoption.
- Strategy: TEST is canonical for asset hygiene; LIVE catches up via a scheduled sweep (not a blanket merge).

### 9.2 Local asset preference

- Default to repo-hosted assets (`public/`, `src/`).
- Avoid third-party CDNs unless there is a documented operational reason.
- New assets must not introduce Readdy URLs.

### 9.3 Asset hygiene expectations

- Asset filenames are stable (no hashed cache-buster renames mid-flight).
- Image dimensions are explicit (avoid CLS).
- All customer-facing imagery must support trust/medical-credibility positioning.

### 9.4 Future sweep process

A future asset-sweep task will:
1. Enumerate every LIVE-side Readdy URL still in use.
2. Mirror the corresponding local asset from TEST.
3. Patch LIVE references in a single surgical PR.
4. Verify no visual regression via browser preview.

### 9.5 Content-image review

- New customer-facing imagery must be reviewed against the UI goal: professional, calm, medically credible, landlord/documentation friendly, premium but simple.
- Avoid: gimmicky startup visuals, noisy layouts, excessive animation.

---

## 10. Future Roadmap Phases

| Phase | Title | Status |
|---|---|---|
| P2A-2 | Continued cross-repo operational hotfix audit (post-2026-05-17 baseline) | Open |
| P3 follow-ups | Outstanding consultation funnel Phase-2 admin tooling | Open |
| Company OS decision | Scope freeze + LIVE rollout call | **Blocking** Company OS promotion |
| OrderDetailModal modularization | Break mega-file into composable units | Open, blocks merge-freeze release |
| AnalyticsTab modularization | Same, dependent on §7 vocabulary alignment | Open |
| Drift prevention CI | Nightly classified divergence report | Open, requires §5.5 normalization first |
| Notification systems | Customer + admin notification roadmap | Not started |
| PWA / mobile ops | Customer + provider PWA shell | Not started |
| UI revamp phase | Cross-repo polish, trust-focused | Not started |

---

## 11. Recommended Team Rules (Operational Lessons)

Lessons earned during P0–P3. These are non-negotiable defaults for future work:

1. **Never trust raw byte deltas.** A "diff" is meaningless until line endings are normalized.
2. **Normalize CRLF / LF before any parity diff.** No exceptions.
3. **Never blindly mirror a file.** Always classify the delta first.
4. **Classify divergence before merging.** Intentional vs hotfix-missing vs legacy is a required label.
5. **Preserve operational stability over feature velocity.** A working LIVE flow outranks a clever TEST refactor.
6. **Additive migrations only.** No destructive SQL without an explicit owner instruction in writing.
7. **Tracker truth enforcement.** Every divergence + every mirror references a tracker row.
8. **Surgical, file-by-file merges.** Blanket copy is the most common source of regression.
9. **MCP `apply_migration` only.** Never `supabase db push` while drift persists.
10. **Verify in browser preview before claiming a UI fix.** Type-check + tests verify correctness, not feature behavior.
11. **Live template content is sacred.** Do not overwrite without explicit owner instruction.
12. **Vocabulary drift is the silent killer.** Naming layer divergence corrupts analytics; freeze before merging.

---

## 12. Amendment Policy

This document is the canonical operating map. To amend:

1. Propose change with rationale.
2. Owner approves.
3. Update both `pawtenant-test/SYSTEMS.md` and `pawtenant-live-backup/SYSTEMS.md` in the same session.
4. Log amendment in the tracker.
5. Bump the **"Status / Created"** header date at the top.

If TEST and LIVE copies of this file disagree, treat TEST as the staging canonical and synchronize.

---

## 13. Quick Reference Index

| Need | Section |
|---|---|
| Which repo owns Stripe / checkout? | §3.1 |
| Can I merge `AnalyticsTab.tsx`? | §4.4, §7 |
| Can I merge `OrderDetailModal.tsx`? | §4.4 |
| How do I apply a migration? | §6.2 |
| Is Company OS going to LIVE? | §8 |
| What's the parity rule for attribution? | §3.4 |
| What's blocked on vocabulary alignment? | §7 |
| What's the future CI plan? | §5.4, §10 |
| Where do hotfixes go first? | §4.2 |
| Why is byte-diff banned for parity? | §5.5, §11.1 |

---

**End of SYSTEMS.md.**
