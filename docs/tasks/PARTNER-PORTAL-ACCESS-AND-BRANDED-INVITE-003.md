# PARTNER-PORTAL-ACCESS-AND-BRANDED-INVITE-003 — task record (TEST)

**Status: PARTIAL — code and function are complete on TEST; LIVE and custom-domain infrastructure are untouched.**
Date: 2026-09-14. Rollback point: `e83ef0af7c34c3b8551497261e39a1ee727710b1`.

## Reported symptoms and proven causes

| Symptom | Proven cause |
|---|---|
| Partner invitation was a plain email | `partner-user-invite` called `inviteUserByEmail`, which sent the default Supabase Auth template. Its two `generateLink` fallback branches discarded the generated link and sent no email. |
| Password setup ended at customer login | `reset-password/page.tsx` checked only `doctor_profiles`. A partner has a `partner_users` membership instead, so the page signed the valid session out and fell through to `/customer-login`. |
| Partner membership looked uncreated | The TEST memberships and Auth users existed, but `partner_users.user_id` remained null because `partner_portal_accept_invitation()` was never reached after the wrong redirect. |
| Dedicated portal hostnames did not work | Only an inactive admin hostname flag existed. There were no customer or partner hostname routes, and neither TEST nor LIVE Vercel had those domains attached. |

## Implemented on TEST

- `partner-user-invite` now uses `generateLink` for both new invitations and existing-account recovery, wraps the single-use Auth action in the PawTenant scanner-safe human-click interstitial, and sends a branded PawTenant email through the existing Resend configuration.
- The branded email includes the PawTenant logo, partner organization, login email, portal link, a clear **Set My Password** CTA, and a short Orders / Accounts / Profile orientation.
- A send failure returns 502 and is never reported as success. Reserved `.test` / `.invalid` fixtures retain the existing honest suppression path.
- TEST-generated invitation links are pinned to `https://pawtenant-test.vercel.app/reset-password`; LIVE can use `PARTNER_PORTAL_URL=https://partner.pawtenant.com`.
- After password update, the reset page calls the session-bound `partner_portal_accept_invitation()` before provider/admin/customer routing. Success keeps the session and redirects directly to `/partner-portal`.
- The invalid/expired-link screen now offers Partner Sign In.
- Exact-host shells now exist for:
  - `admin.pawtenant.com` → admin routes;
  - `customer.pawtenant.com` → customer login, orders, account checkout, stable checkout and reset routes;
  - `partner.pawtenant.com` → partner portal and reset routes.
- The exact-host checks are inert until DNS and Vercel domains exist. Existing path-based URLs remain available.

## Files

Changed:
- `supabase/functions/partner-user-invite/index.ts`
- `src/pages/reset-password/page.tsx`
- `src/lib/subdomainConfig.ts`
- `src/App.tsx`
- `package.json`

New:
- `src/router/portalRoutes.tsx`
- `scripts/check-partner-portal-access.mjs`

## Verification

- Pull request: #10, squash commit `9de60d658282c31514dc45c419683c533764022c`.
- TEST destination hardening: `f33ce8b774adc1a73d585de049629992ba1e6487`; guard update `c61240188faed6102ec3af118a6f542b8da74b5b`.
- Build guard: **17/17 checks** and **11/11 planted regressions detected**.
- Full Vercel build completed successfully; existing middleware import-extension diagnostics remain and are not in task files.
- TEST web deployment: `dpl_8R6gAKoKGcB2bYjeCyf9qtoq3fDd`, READY at `https://pawtenant-test.vercel.app`.
- `partner-user-invite`: v1 → **v3**, `verify_jwt=true → true`. Deployed entrypoint is byte-identical to commit `c612401`.
- Browser QA at 1363×936: partner sign-in renders at `/partner-portal`; customer dashboard login renders at `/customer-login`; password form renders; invalid-link state exposes Customer, Partner, Provider and Admin recovery paths; no application console errors.
- Database: no migration and no row mutation. The two existing TEST memberships were read only.
- External communications: none sent during QA; a real invitation was deliberately not resent.

## LIVE activation still requiring owner approval

1. Roll these commits and edge-function change to LIVE.
2. Add `admin.pawtenant.com`, `customer.pawtenant.com`, and `partner.pawtenant.com` to the LIVE Vercel project.
3. Add the required DNS records.
4. Add the three reset URLs to Supabase Auth's allowed redirect URLs.
5. Set LIVE `PARTNER_PORTAL_URL=https://partner.pawtenant.com`.
6. Resend one real partner invitation and verify email rendering, password setup, membership binding, direct portal entry, and subsequent sign-in.

Until those steps are approved and completed, the TEST repair is available through the existing `pawtenant-test.vercel.app` path-based URLs and LIVE remains unchanged.

