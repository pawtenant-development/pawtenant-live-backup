# PROVIDER-REASSIGNMENT-REJECTION-NOTE-PRIVACY-001

**Type:** Direct LIVE surgical privacy fix
**Date:** 2026-07-28
**Repo:** `pawtenant-live-backup` (canonical LIVE). TEST untouched.
**Supabase:** LIVE `cvwbozlbbmrjxznknouq`
**Starting LIVE SHA:** `c91edf2e43e10550f94b88078056975c282d72d5`

---

## 1. Root cause

`supabase/functions/provider-reject-order/index.ts` records the provider's
rejection reason in **four** places. Three are admin-only and were already safe:

| Sink | Contents | Provider-readable? |
|---|---|---|
| `audit_logs` | reason + provider id/name/email | No — admin-only RLS |
| `doctor_notifications` (`provider_rejected_admin`) | reason in message | No — sent to admin user_ids; providers read own rows only |
| `order_status_logs` | `changed_by` = rejecting provider, `new_doctor_status='provider_rejected'` | **Yes** — see §2b |
| `shared_order_notes` | `⚠️ ORDER REJECTED BY PROVIDER … Provider: <name> … Reason: <text>` | **Yes — the leak** |

**2a — the reported leak.** The rejection is written to `shared_order_notes` as an
`author_role='provider'` note. `SharedNotesPanel.tsx` (mounted in the provider
portal's Notes tab) ran `.from("shared_order_notes").select("*").eq("order_id", …)`.
After reassignment the **new** provider opened Notes and read the previous
provider's reason, comments, name and timestamp verbatim.

**2b — a second, wider hole found during the audit.** The SELECT policy on
`shared_order_notes` was:

```sql
USING (auth.role() = 'authenticated')
```

That is not "the assigned provider" — it is **any signed-in user**. Every
customer and every unrelated provider could read **all 56 notes on all orders**
via a direct PostgREST call. Also, `order_status_logs`' provider policy exposed
the rejecting provider's *name* tied to `provider_rejected`.

**Blast radius at the time of the fix:** 19 rejection notes on LIVE, **13 of them
on orders since reassigned to a different provider**.

---

## 2. Tables / fields involved

- `shared_order_notes` (`author_id`, `author_role`, `author_name`, `note`, `created_at`)
- `orders.doctor_user_id` — the current-assignment gate
- `doctor_profiles.is_admin` — the admin gate
- `order_status_logs` (`changed_by`, `old_doctor_status`, `new_doctor_status`)

**No migration column was added.** Existing fields distinguish the data
deterministically, so per the migration rule the additive column was avoided.

---

## 3. Provider-safe response contract

A provider may receive a note **only if** they are the *currently assigned*
provider on that order **and** the note is either admin-authored or their own:

```
visible(n, viewer) := orders.doctor_user_id = viewer
                      AND (n.author_role = 'admin' OR n.author_id = viewer)
```

Consequences, all required by the brief:
- prior rejection reason / comments / note text — **excluded**
- rejecting provider identity, author metadata, timestamps — **excluded**
- a provider who rejected and was unassigned does **not** regain access by
  having authored the note (assignment gate is evaluated first)
- admin notes (incl. neutral "reassigned for independent review") — retained
- the provider's own notes — retained

---

## 4. Files / functions changed

| File | Change |
|---|---|
| `supabase/migrations/20260728120000_provider_reassignment_rejection_note_privacy.sql` | New. Record of the SQL applied via explicit MCP SQL. |
| `src/components/feature/SharedNotesPanel.tsx` | New `providerSafe` prop (default **false**). When set, loads via the RPC and applies the same predicate to realtime payloads. |
| `src/pages/provider-portal/components/ProviderOrderDetail.tsx` | Mounts the panel with `providerSafe` (1 line). |
| `scripts/check-provider-rejection-note-privacy.mjs` | New blocking guard (23 assertions + 12 negative controls). |
| `package.json` | Guard wired into `build`; `check:`/`test:rejection-note-privacy` scripts. |

**`OrderDetailModal.tsx` was NOT modified** — the frozen mega-file needed no
change; admin keeps the default (`providerSafe` false) and the complete record.

### Database
- **New:** `get_shared_order_notes_for_provider(uuid, uuid)` — `SECURITY DEFINER`,
  `search_path = public, pg_temp`, revoked from `public` and `anon` by name,
  `EXECUTE` granted to `authenticated` only (authorization is enforced inside).
- **Replaced:** `shared_order_notes` SELECT policy → `admins_read_shared_notes`
  + `assigned_provider_reads_safe_shared_notes`.
- **Replaced:** `order_status_logs` → `providers_select_assigned_logs` now
  excludes rows referencing `provider_rejected`.
- INSERT / author-DELETE policies, admin and customer policies: untouched.

---

## 5. Security proof — RLS ENFORCED (impersonated claims, literal UUIDs)

Verification order `757f1a67-…` / **PT-MS2L71J8-RLP** — rejected by Eve Rosno
(`32ade68b…`), reassigned to Robert Staaf (`3d452d99…`), `pending_review`.
Service-role SQL was **not** used for any visibility assertion.

| Actor | Result |
|---|---|
| **New provider (B)** | 1 row · **0 rejection notes** · 0 other-provider notes |
| **Rejecting provider (A), now unassigned** | **0 rows** — no access via authorship |
| **Unrelated provider** | **0 rows** |
| **Customer** | **0 rows** across the entire table (was: all 56) |
| **anon** | **0 rows**; RPC → `42501 permission denied` |
| **Admin** | 2 rows · rejection note present · both author names present |
| RPC as provider B (self) | 1 row, hash `00d4e37a181b642ae592d88a5a047358` |
| RPC as admin previewing B | 1 row, hash `00d4e37a181b642ae592d88a5a047358` — **identical** |
| Provider A → RPC targeting B | `ERROR P0001: Not authorized to view another provider's notes` |
| `order_status_logs` as provider B | 4 rows · 0 rejection rows · `changed_by` = "Hamza Farid \| system" only |

`anon_can_execute = false`, `authenticated_can_execute = true`,
`security_definer = true`, `search_path = public, pg_temp`.

---

## 6. Network-payload proof (real HTTP, not a harness)

**Anon against LIVE PostgREST:**
- `GET /rest/v1/shared_order_notes?order_id=eq.<order>` → `200 []`
- `GET /rest/v1/shared_order_notes` (all) → `200 []`
- `POST /rest/v1/rpc/get_shared_order_notes_for_provider` → `401` permission denied
- `GET /rest/v1/order_status_logs?order_id=eq.<order>` → `200 []`

**Real admin session (owner's browser, live JWT)** — the exact call the new
bundle makes:
- Provider-View RPC → `200`, **1 row**, `leaks_rejection_text: false`,
  `leaks_rejecting_provider_name: false`
- Admin raw read → `200`, **2 rows**, `retains_rejection_text: true`,
  `retains_rejecting_provider_name: true`

The hidden text is absent from the response body itself — not hidden in the UI.

---

## 7. Guard

`scripts/check-provider-rejection-note-privacy.mjs`, wired into `npm run build`
immediately after `check-provider-portal-preview.mjs`.

Fails the build if: `providerSafe` is dropped from the provider mount; the
provider path selects the raw table; realtime bypasses the contract; the
predicate is widened; the admin panel is downgraded to the provider projection;
rejection notes are hidden by render-time string matching; the thread is mounted
on a customer page; or the rejection record stops being written.

`--self-test` plants 12 regressions (raw-table select, missing `providerSafe`,
unguarded realtime append, widened predicate, admin downgrade, UI-only string
hide, permissive predicate leaking the text) and proves each is caught.
**23/23 static+fixture, 12/12 self-test.**

---

## 8. Build / QA

- `npx eslint` on both changed files → **exit 0**
- `npm run build` → **exit 0**, all guards green including the new one
- Pre-existing `npm run type-check` and `npm run lint` failures are in untouched
  files (`EmployeeHrDirectory.tsx`, `ProviderInternalRecords.tsx`,
  `admin-orders/page.tsx`, …) and are unchanged from `c91edf2`. `vite build`
  does not run `tsc`, so the build is unaffected.

---

## 9. Regression posture

Untouched by design: rejection workflow and its audit trail (nothing deleted or
rewritten), `assign-doctor`, provider accept/complete, intake, customer
documents, uploads, earnings, Admin Notes tab, Admin reassignment controls and
assignment history, customer portal and notifications, order/payment status,
verification ID, Provider-View scoping protections, RLS on unrelated tables.

The provider portal never read `order_status_logs` / `audit_logs`, so tightening
those has no UI effect.

---

## 10. Deployment / rollback

- Starting SHA `c91edf2` · production deployment at start
  `dpl_3hA1HYWpbGgLUGzAtQzC6iG9Kd82` (`…-e5mvqstg0`)
- Known-good rollback deployment `dpl_Gf46pTPttdbQDu3NTJRfjvf39djv` (`…-gjrb95mdc`, SHA `2d9efa6`)
- SQL rollback: commented block at the foot of the migration file
- The DB layer alone already closes the leak against the previously deployed
  bundle, so there was no window in which the fix was half-applied

---

## 11. Known limitation

An **admin-authored** note that quotes a prior provider's reasoning in free text
remains visible to the assigned provider by design (admin notes are the
legitimate channel to brief a provider). Automatic redaction of free-form admin
prose was out of scope. The auto-generated rejection note is `author_role='provider'`
and is fully covered.

---

## 12. Final status

**LIVE COMPLETE — PRIOR PROVIDER REJECTION COMMENTS HIDDEN FROM REASSIGNED PROVIDERS**
