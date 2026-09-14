# Partner Platform — Admin Workspace

Task: **PARTNER-PLATFORM-ADMIN-WORKSPACE-001** · TEST only · 2026-08-21

## What this is

The dedicated Partner Platform workspace inside the TEST Admin Portal: one
left-navigation item ("Partner Platform") with five URL-addressable sub-tabs —
**Overview · Orders · Finance · Integration · Settings** — replacing the two
large accordions (Partner Finance, Partner Integration) that previously sat
under the Partner Orders list.

## Routing decision (documented per task)

The Admin Portal is a single-page shell: every workspace is a `?tab=` value on
`/admin-orders` (this is how Dashboard/Orders/Analytics/… all work, and how
`/admin-chats` was folded in when Chats moved into the shell). The Partner
Platform therefore lives at:

```
/admin-orders?tab=partners&ptab=overview|orders|finance|integration|settings
```

The recommended memorable route **`/admin-partners` exists as a redirect** into
that canonical URL, mapping its own `?tab=` onto `?ptab=`:

```
/admin-partners               → /admin-orders?tab=partners
/admin-partners?tab=finance   → /admin-orders?tab=partners&ptab=finance
```

Legacy Partner Orders deep links (`/admin-orders?sub=partner`) redirect to
`?tab=partners&ptab=orders` — no bookmark breaks.

Sub-tab navigation uses PUSH navigation, so refresh, Back/forward and saved
links all work.

## What moved (no logic rebuilt)

| Surface | Was | Now |
|---|---|---|
| Partner Orders list (Slice 3) | `/admin-orders?sub=partner` | Orders sub-tab (same `PartnerOrdersTab`, panels removed) |
| Partner Finance (Slice 7) | `PartnerFinancePanel` accordion | Finance sub-tab (`partner-platform/PartnerFinanceTab`) + partner/status/date filters, invoice search, confirm dialogs |
| Partner Integration (Slice 8) | `PartnerIntegrationPanel` accordion | Integration sub-tab (`partner-platform/PartnerIntegrationTab`) + API reference, request ledger, code examples |
| — | (did not exist) | Overview sub-tab: status cards + evidence-based onboarding checklist |
| — | (did not exist) | Settings sub-tab: organizations, environments, API keys, webhooks, sandbox handoff |

All financial logic, webhook mechanics, document releases, revisions and
policy gates are the unchanged Slice 1–8 implementations.

## New server-side management layer

Migration `20260821190000_partner_platform_admin_management.sql`:

* `private.partner_api_credentials` gains `label` + `secret_last4`
  (display metadata only; existing rows keep NULL last4 → rendered ••••).
* `partner_webhook_events` event-type CHECK gains `test.ping`.
* 14 new SECURITY DEFINER functions + 1 hardened replacement, all pinned
  `search_path`, all fronted by the canonical `is_chat_admin()` gate, all
  auditing through `private.partner_admin_audit` (never a secret/hash):
  * Organizations: `partner_admin_create_organization`, `…_update_organization`,
    `…_set_sandbox_access` (sandbox ⇄ paused), `…_archive_organization`
    (fails closed on orders/invoices/events/active keys/active webhooks).
  * API keys: `…_list_api_keys` (prefix + last4, never hash),
    `…_create_api_key` (secret revealed exactly once; sha256 at rest;
    forged environment → 22023; production → 42501 until `production_enabled`),
    `…_revoke_api_key`, `…_rotate_api_key` (replacement first, old key stays
    active — overlap window; revoke is explicit).
  * Readers: `…_list_api_requests`, `…_onboarding_state` (safe projections of
    the private ledgers).
  * Webhooks: `…_enable_webhook_endpoint`, `…_rotate_webhook_secret`
    (**immediate cutover** — documented transition policy),
    `…_delete_webhook_endpoint` (unused endpoints only),
    `…_send_test_webhook` (single-endpoint `test.ping`, fixed notice payload,
    no PHI/no internal ids).
  * `partner_register_webhook_endpoint` hardened: refuses loopback/private
    hosts, embedded credentials and IPv6 literals at registration (the
    dispatcher's send-time enforcement is unchanged and remains the boundary).

ACLs: every function `revoke … from public, anon` + `grant execute … to
authenticated` (gate inside); the audit helper is not executable by any
client role. Proven with `has_function_privilege` + RLS-enforced role probes.

## Secret policy (unchanged in spirit, now uniform)

* API secrets and webhook signing secrets appear **exactly once**, in the
  reveal dialog at mint/rotate time, with Copy + Download.
* The client keeps reveal values only in React state; nothing enters
  localStorage/sessionStorage/URLs/logs/analytics (guard-enforced).
* At rest: sha256 hash + last4 for API keys; webhook signing secrets live in
  the deny-all `private` schema (needed for HMAC signing).
* A sandbox handoff with secrets can only be produced while a reveal is open —
  regenerating one later requires new or rotated credentials.

## Guard

`scripts/check-partner-platform-workspace.mjs` (build slot after the Slice 8
guard): 32 checks, 18 planted negative controls (`--self-test`), covering the
task's full guard + planted-control lists. npm aliases:
`check:partner-platform` / `test:partner-platform`.

## Migration ledger alignment (closure, 2026-08-21)

The migration was applied via MCP before the file was named, so the TEST
ledger initially recorded it as version `20260821142711` while the repository
file is `20260821190000_partner_platform_admin_management.sql`. Renaming the
file to `142711` was evaluated and REJECTED: it would sort before
`20260821150000_partner_status_webhooks.sql`, whose tables this migration
alters, breaking any filename-ordered application. Correction applied instead:
the TEST ledger row for this one migration was updated to version
`20260821190000`, and its recorded statement was aligned byte-for-byte with
this repository file (including the contact `{}` coalesce fix that is live in
`partner_admin_create_organization`). Verified: exactly one ledger row for the
name, none at the old version, ledger-statement md5 == repo-file content md5.
The version being present in the ledger means TEST can never reapply it; a
LIVE rollout applies this file exactly once, after its dependencies.

## Deliberately NOT in this task

* No LIVE change, no production activation, no production credentials.
* No rate-card or commercial-rule change (rates rediscovered from TEST:
  Rapid sandbox ESA $55 v2 · PSD $45 v1).
* No edge-function change or redeploy (the management plane is RPC-only).
* Nothing sent to Rapid ESA Letter.
