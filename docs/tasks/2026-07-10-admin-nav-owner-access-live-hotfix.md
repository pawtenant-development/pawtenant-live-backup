# ADMIN-NAV-OWNER-ACCESS-LIVE-HOTFIX-001 — restore owner admin nav + role-based access (LIVE)

**Owner:** Claude session (2026-07-10) — owner-approved LIVE hotfix · **Repo:** LIVE `pawtenant-live-backup` (`cvwbozlbbmrjxznknouq`)
**Builds on / preserves:** `5855742` (Command Center + AI Support registered in Team access modal).

## Reported LIVE regression
1. **Dashboard** no longer visible in the left navigation.
2. Owners (Hamza Farid, Omer) shown with editable custom-tab access controls, even though owners have full access by role.
3. Owner/admin access should not depend on `custom_tab_access`.
4. Keep the `5855742` Command Center (`communications_inbox`) + AI Support (`communications_ai`) registration intact.
5. Staff/support custom tab restrictions must still work.

## Root cause (confirmed against LIVE data)
`doctor_profiles.custom_tab_access` for **all three full-access accounts** stores an explicit
top-level tab list that **omits `"dashboard"`**:
- Hamza Farid (owner), Omer (owner), Asim Iqbal (admin_manager) each have 13 top-level keys
  (`orders…health`) **without `dashboard`**, plus `communications_*` child grants.

`page.tsx getVisibleTabs()` treats ANY saved top-level key as an **override** and returns
`ALL_TABS.filter(t => overrides.includes(t))`. Because `"dashboard"` is never stored in
`custom_tab_access` (TeamTab's editor `ALL_TABS` excludes it), override mode **drops Dashboard**.
`AdminSidebar` renders the Dashboard nav item only when `visibleTabs.includes("dashboard")`, so
Dashboard disappeared. This is a latent bug that surfaced once owners/admins had any override saved.

Secondary: `CommunicationsHub.getVisibleSubKeys()` restricts to ONLY the `communications_<sub>`
child grants when any exist — including for owners. Owners currently list all subs so nothing is
hidden today, but it is fragile (a single stray child grant would restrict an owner).

## Fix (narrowest safe)
1. **`page.tsx getVisibleTabs()`**
   - Owner is a full-access role → hard bypass: always return `ALL_TABS` (ignores `custom_tab_access`).
   - Override branch: always include `"dashboard"` so Dashboard nav can never be dropped for any
     role/override (admin + staff protected too). Dashboard is the landing view, already treated as
     always-visible by `isTabVisible`; this does not loosen any real access.
   - `admin_manager` role switch unchanged → existing intended behavior preserved.
2. **`CommunicationsHub.getVisibleSubKeys()`**
   - Owner hard bypass → always all sub-tabs, even if stray `communications_*` grants exist.
3. **`TeamTab.tsx`** (owner rows only)
   - Replace the Tab Access edit button with a disabled "Full access" indicator (title
     "Owner has full access"), desktop + mobile. Suppress the misleading "N custom tabs" caption
     for owner rows. Owners can no longer be accidentally restricted via the modal.

No DB write, no migration. Stale `custom_tab_access` on owner/admin rows is now inert for nav.

## Safety
No Stripe/payment/order/provider/refund change. No SMS/email/call. No GHL workflow change.
No Supabase migration or function deploy. No TEST repo change (LIVE-only; TEST read for nothing).
`5855742` Command Center / AI Support registration untouched. Staff/support restrictions preserved.

## Verification
- `npm run type-check`, `npm run build` — see OUTCOME.
- LIVE admin is OTP-gated; owner confirms Dashboard + owner rows in-browser.

## OUTCOME (2026-07-10) — DONE
- **Files changed (3 code + 1 doc):**
  - `src/pages/admin-orders/page.tsx` — `getVisibleTabs()`: owner hard-bypass → `ALL_TABS`; override branch always keeps `"dashboard"`.
  - `src/pages/admin-orders/components/CommunicationsHub.tsx` — `getVisibleSubKeys()`: owner hard-bypass → all sub-tabs.
  - `src/pages/admin-orders/components/TeamTab.tsx` — owner rows: editable Tab Access button replaced with disabled "Full access" pill (desktop + mobile, title "Owner has full access"); "N custom tabs" caption → "Full access" for owners.
  - `docs/tasks/2026-07-10-admin-nav-owner-access-live-hotfix.md` — this card.
- **Root cause confirmed in LIVE DB:** Hamza (owner), Omer (owner), Asim (admin_manager) all had `custom_tab_access` lists omitting `"dashboard"` → override mode dropped Dashboard from the sidebar. No DB write made; fix makes stale overrides inert for nav.
- **Deterministic proof** (replicated `getVisibleTabs` on real arrays): Dashboard=YES for owner, admin, support, read_only. Owners → full ALL_TABS. Ayeshaa (support) stays restricted to `orders/analytics/communications/customers`; Syed (read_only) to `orders/analytics`. Staff restrictions preserved.
- **Command Center / AI Support intact:** `5855742` `COMMS_SUB_KEYS` (`inbox`+`ai`) in TeamTab untouched; `CommunicationsHub.SUB_KEYS` includes `inbox`/`ai`. A staff user granted `communications_inbox` → `getVisibleSubKeys` returns `[inbox]` → sees Command Center.
- **Build:** `npm run type-check` — 0 new errors (only pre-existing unrelated: AIAssistantTrustCard/AnalyticsTab/EmployeeHrDirectory/ProviderInternalRecords). `npm run build` ✓ 39.44s, prerender 242/0, attribution parity OK.
- **Safety:** No migration, no function deploy, no SMS/email/call, no GHL/ads/Stripe/payment/order/provider/refund change, no TEST change. LIVE-only.
- **Browser:** LIVE admin OTP-gated + prod outside MCP token scope → not driven in-browser. Hamza to confirm: (1) Dashboard link visible in left nav; (2) Team → Roles & Access shows Hamza/Omer as "Full access" (no editable tab control); (3) support/staff still show tab count + edit control.
- **Commit:** LIVE `aa4e3d9` (pushed to `main`; `5855742..aa4e3d9`).
