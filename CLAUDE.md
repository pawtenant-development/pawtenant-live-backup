## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for node structure
- Prefer graph traversal over scanning raw files
- After modifying code, run: graphify update .

---

## PawTenant Development Rules (MANDATORY)

You are working on a production system (PawTenant). Follow these strictly.

### Core behavior
- Be compact
- Use simple English
- Use caveman language
- No long essays
- No unnecessary theory
- Focus on fix first

### Response format
Always return:
1. What is happening
2. Exact fix
3. Full updated file(s)
4. Commands to run if needed

### File editing rules
- NEVER give partial code edits
- ALWAYS return FULL updated file
- Assume user will replace entire file
- Do not say "add this line" unless explicitly asked
- Prefer safest minimal change

### Working style
User is not a programmer.
So:
- be direct
- be practical
- avoid jargon
- explain like operator, not engineer
- save tokens

### Safety rules
- Do not refactor unrelated code
- Do not break working flows
- Only modify what is required
- Preserve Stripe flows
- Preserve Supabase structure
- Preserve order lifecycle
- Preserve live email templates unless explicitly asked

### DB rules
- SQL must be idempotent
- SQL must be non-destructive unless explicitly asked
- Prefer IF NOT EXISTS
- Do not overwrite existing template content unless explicitly asked

### Comms system rules
- email_templates = single source of truth for templates
- communications = primary log
- orders.email_log = legacy backup
- Prefer DB-driven templates over hardcoded templates when extending flows

### UI rules
When doing UI work:
- aim for premium modern SaaS quality
- clean spacing
- strong hierarchy
- polished but practical
- do not create messy fancy UI
- prefer simple, expensive-looking design
- preserve working business logic
- do not redesign unrelated screens
- if improving UI, keep changes scoped

### UI goal
For customer-facing pages, optimize for trust, legitimacy, and conversion.
Design should feel:
- professional
- calm
- medically credible
- landlord / documentation friendly
- premium but simple

Avoid:
- gimmicky startup visuals
- noisy layouts
- excessive animation
- style choices that reduce trust

### Codebase workflow
- Use graph first
- Understand data flow before suggesting fix
- Avoid guessing
- If a fix touches multiple systems, say so clearly
- Surface dependencies, edge cases, and risks

### Goal
Keep system:
- stable
- production-safe
- easy to maintain
- scalable for ZeeK Engines


## AI SYSTEM (MANDATORY USAGE)

This repo contains an AI system in /AI folder.

### Before any task:
- Read AI/MASTER_SYSTEM_PROMPT.md
- If task provided → follow AI/PROMPTS templates
- Use AI/SKILLS for structured execution

### Skill usage rules:
- DO NOT answer directly for complex issues
- Route through correct SKILL:
  - checkout → checkout-debug.SKILL.md
  - payment → stripe-reconciliation.SKILL.md
  - comms → comms-diagnostics.SKILL.md
  - lifecycle → order-lifecycle.SKILL.md
  - unknown → observability.SKILL.md

### Always follow:
- structured outputs from SKILLS
- safety constraints from MASTER_SYSTEM_PROMPT
- deployment rules from DEPLOY_CHECKLIST

### Priority:
1. Graphify understanding
2. AI/SKILLS structured execution
3. Minimal safe fix


## MERGE-FREEZE POLICY — MEGA-FILES (MANDATORY)

Two files in this repo are formally **MERGE-FROZEN**.
This means: extra rules apply on top of normal Safety rules.

Authority: this section + `SYSTEMS.md` §4.4–§4.5 + tracker row 210.
If this section conflicts with anything else, this section wins for these two files.

### Frozen files (current scope)

1. `src/pages/admin-orders/components/OrderDetailModal.tsx`
   (~315KB / ~5617 lines, multi-system operational hub: orders, comms, payments, provider, attribution, consultation, audit)

2. `src/pages/admin-orders/components/AnalyticsTab.tsx`
   (~112KB, multi-panel analytics hub; TEST and LIVE intentionally diverge — see SYSTEMS.md §7)

Both files exist in `pawtenant-test` and `pawtenant-production`.
Both are high-risk to merge.
Both have intentional cross-repo divergence.

### Hard rules for frozen files

- NEVER blanket-copy these files between TEST and LIVE.
- NEVER replace the whole file from the other repo.
- NEVER bundle changes to these files into an unrelated PR/commit.
- NEVER edit these files without identifying a tracker row.
- NEVER assume byte-diff size means anything — normalize CRLF/LF first.
- NEVER refactor / modularize / restructure these files in this phase (see "Future modularization" below).

### Approved edit types (ALLOWED)

Inside a frozen file, the following edits are allowed (still require tracker row):

- Scoped bugfix (single function, single bug, narrow scope).
- Additive tab registration (mount a new tab without changing other tabs).
- Isolated component mount (new panel/card inserted in one place).
- Surgical operational fix (e.g. add `try/finally`, normalize an email compare).
- Analytics panel registration (add one panel mount, no other changes — and only when SYSTEMS.md §7 allows it).
- Localized UI correction (typo, spacing, single-element style fix).
- Copy/text edits within a single block.

Every approved edit must:
- be the smallest change that fixes the problem.
- not touch unrelated tabs / panels / sub-components.
- preserve all existing functionality.

### Forbidden edit types (NOT ALLOWED)

Inside a frozen file, the following are forbidden without a separate planning task:

- Repo-overwrite (drop the other repo's version on top).
- Random parity copy (mirroring blocks because "the other side has them").
- Uncontrolled redesign of any tab / panel.
- Large structural rewrites (function extraction, layout reorg).
- Unrelated merge bundles (mixing analytics + comms + payments in one edit).
- Vocabulary renames (`ownerChannel`, `channel`, `source`) without a cross-repo plan.
- Removing existing panels / tabs / mounts.
- Changing prop shapes of shared sub-components.

If a needed change does not fit the "approved" list, STOP and ask the owner.

### Required merge workflow (frozen files)

Every edit that touches a frozen file MUST follow these 7 steps in order:

1. **Identify tracker row** — find or create the row in `PawTenant_Tracker_with_CompanyOS.xlsx`.
2. **Classify divergence** — use the categories under "Drift classification" below.
3. **Audit TEST/LIVE ownership** — confirm which side is canonical per `SYSTEMS.md` §3.
4. **Surgical diff only** — produce a per-hunk diff. No blanket copy. Normalize CRLF/LF before comparing.
5. **Verify operational surfaces** — confirm checkout, Stripe, comms log, attribution capture, consultation funnel still work.
6. **Smoke test** — run the dev server, exercise the affected tab/panel in browser preview.
7. **Update tracker** — write evidence (commit SHA, files touched, hunks count) into the tracker row.

Skipping any step = the edit is not approved.

### Drift classification (MANDATORY before any cross-repo touch)

Before merging anything that touches a frozen file, classify the divergence:

- **Intentional divergence** — documented in SYSTEMS.md. Leave alone. Do NOT merge.
- **TEST-only roadmap divergence** — TEST is ahead by design (e.g. Phase-2 analytics). Do NOT promote without owner approval.
- **LIVE operational hotfix divergence** — LIVE has a fix TEST is missing. Mirror surgically into TEST.
- **Temporary rollout divergence** — feature is mid-rollout (e.g. consultation funnel). Wait for rollout decision.
- **Stale drift** — unintentional, no owner. Must be classified before any action.

Default: if you cannot classify, STOP and ask. Do not merge unclassified deltas.

### Future modularization policy

These two files are eventually intended for modularization:

- `OrderDetailModal.tsx` → thin shell + per-tab sub-components (Overview, Notes, Comms, Payments, Provider, Attribution, Consultation, Audit).
- `AnalyticsTab.tsx` → per-group sub-components matching the 7-group IA in TEST (once vocabulary is unified — see SYSTEMS.md §7).

Modularization is **deferred** until ALL of the following hold:

- Parity audits between TEST and LIVE are stable (no surprise drift for one full sprint).
- Governance is stable (no in-flight changes to SYSTEMS.md / tracker / merge rules).
- Roadmap sequencing allows it (no concurrent mega-merge — e.g. consultation funnel rollout is complete).
- Owner explicitly approves the modularization sprint.

Until then: **no extraction, no thin-shell refactor, no domain segmentation** inside these two files.

### Cross-repo consistency

This freeze policy must exist in BOTH repos:

- `pawtenant-test/CLAUDE.md` (this file).
- `pawtenant-live-backup/CLAUDE.md` (mirror after each amendment).

If the two copies disagree, TEST is the staging canonical. Sync immediately.

### When in doubt

If unsure whether an edit qualifies as approved:
1. Stop.
2. Cite the tracker row + the divergence classification.
3. Ask the owner before changing the file.

A blocked edit is recoverable. A blanket-merged mega-file is not.