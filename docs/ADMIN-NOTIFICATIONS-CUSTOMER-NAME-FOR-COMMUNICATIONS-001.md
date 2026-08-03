# ADMIN-NOTIFICATIONS-CUSTOMER-NAME-FOR-COMMUNICATIONS-001

Show the customer's name as the primary identity on incoming SMS and incoming-call
notifications in the Admin notification bell, keeping the order confirmation id as
secondary traceability and falling back safely whenever the contact cannot be
resolved beyond doubt.

Status: **LIVE COMPLETE.**

---

## 1. Owner requirement

The bell headlined the EVENT and buried the person:

```
New SMS
Stop · PT-MSC0EU5Q
```

```
Incoming calls
Call from (817) 240-3794 · PT-MSDGFS5T
```

Required hierarchy:

- **Primary** — customer name.
- **Secondary** — communication type / message preview, masked phone where useful,
  order confirmation id as traceability.

The order id must remain available; it must not be the primary human-readable
identity. A friendlier label must never become the WRONG customer.

---

## 2. Previous UI

`CompanyNotificationsBell.tsx` renders two levels:

| Level | Line 1 | Line 2 | Line 3 |
|---|---|---|---|
| Group summary (collapsed) | `{unread} {group label}` | latest item preview | time · N items |
| Expanded item | `item.title` | `item.preview` | time |

The RPC set `title = 'New SMS'` / `'Incoming call'` for both communication arms, so
BOTH levels showed an event label and never a person. The SMS preview was the raw
message body plus `communications.confirmation_id`; the call preview was
`'Call from ' || phone_from` — the full, unmasked number.

---

## 3. Data flow

```
CompanyNotificationsBell (React)
  └── ONE rpc call: supabase.rpc("get_company_notifications")   [45s poll + on open]
        └── public.get_company_notifications()   SECURITY DEFINER, is_admin gated
              ├── sms  arm   ─┐
              ├── call arm   ─┴─ join lateral public.resolve_communication_contact(...)
              │                    └── public.orders  (explicit id → confirmation id → phone)
              │                  and public.mask_phone_for_display(...)
              ├── email / consultation / order_* / approval arms (unchanged)
              └── read state from public.company_notification_reads
```

Read state, unread counting, grouping, the 45-second poll and
`mark_company_notifications_read()` are untouched.

### Why the order id was the visible label

Nothing resolved a customer. Both arms selected constant strings for `title` and
concatenated `communications.confirmation_id` into `preview`. `communications`
carries `order_id` on LIVE for the majority of inbound rows (152/457 calls,
243/402 SMS at rollout time), so the relationship existed — it was simply never
joined through to `orders`.

---

## 4. Matching hierarchy

`public.resolve_communication_contact(p_order_id uuid, p_confirmation_id text, p_phone text)`
returns `(order_id, confirmation_id, display_name, match_basis)`.

| # | Basis | Rule |
|---|---|---|
| 1 | `order_id` | `communications.order_id` → that exact order. Always wins. |
| 2 | `confirmation_id` | `communications.confirmation_id` → accepted **only** when it matches exactly one order (case-insensitive, trimmed). |
| 3 | `phone` | Digits-only, last 10 (US national). Requires ≥10 digits on BOTH sides. |
| — | `none` / `ambiguous` | Nothing resolved → the row renders "Unknown contact". |

Phone matching is deliberately split:

- a **name** is returned only when every matching order carries the SAME name
  (`count(distinct lower(name)) = 1`);
- an **order id / confirmation id** is returned only when **exactly one** order
  matches.

So one customer with two orders on one phone yields the name and NO order id
(§11 of the spec). Two different customers on one phone yields neither.

Explicitly not used: partial phone matching, last-four matching, loose name
matching, email-prefix guessing, caller-ID names supplied by the telephony
provider (those are not PawTenant customer records).

### Name fallback

`first + last` → `first` (or `last`) alone → `Unknown contact`.
An email address is never substituted for a missing name.

---

## 5. Display rules as shipped

| Case | Primary | Secondary |
|---|---|---|
| Call linked to an order | `Sandra Cardona` | `Incoming call · (817) ***-3794 · PT-MSDGFS5T` |
| SMS linked to an order | `Marcus Webb` | `SMS: "Stop" · PT-NOTIFQA-02` |
| Several SMS, one linked order | customer once, item count preserved | latest preview · confirmation id |
| Contact known, no unambiguous order | customer name | `SMS: "..." · (555) ***-0005` (masked phone, **no** fabricated id) |
| Nothing resolved | `Unknown contact` | `Incoming call · (555) ***-9999` |

Group summary rows:

- **Identity-led** (sms/call whose items all share one identity): line 1 = the
  customer, line 2 = the preview, line 3 = `Incoming calls · 18m ago · 1 item`.
  The group label moves to the meta line, so the panel gains **no height**.
- **Mixed-contact** (sms/call spanning several customers): line 1 stays
  `{unread} New SMS` — there is no single customer to promote and claiming one
  would be a misrepresentation — and the latest contact leads line 2 in emphasis.
- **Every other group** (orders, bookings, approvals, emails): unchanged.

---

## 6. Privacy

- Phone numbers are masked server-side by `public.mask_phone_for_display()`:
  `(817) 240-3794 → (817) ***-3794`. The raw number never reaches the panel.
- The message preview is capped at 80 characters, whitespace-collapsed, and
  rendered as TEXT — no `dangerouslySetInnerHTML` anywhere in the bell.
- No assessment answers, diagnosis, provider notes, medical information, raw
  payloads, tokens or email addresses are added.
- `resolve_communication_contact` and `mask_phone_for_display` are SECURITY
  INVOKER and revoked from `public`, `anon` AND `authenticated` by name — they
  are reachable only from inside the SECURITY DEFINER bell RPC.

---

## 7. Files changed

### TEST — `pawtenant-test`

| File | Change |
|---|---|
| `supabase/migrations/20260803120000_admin_notification_communication_customer_name.sql` | new — masker, resolver, RPC DROP+CREATE, grants |
| `src/pages/admin-orders/components/CompanyNotificationsBell.tsx` | `link_order_id`, identity-led layout, destination resolver, a11y |
| `scripts/check-admin-notification-customer-name.mjs` | new — 15-check regression guard |
| `scripts/check-pending-delivery-admin-orders.mjs` | P25 re-anchored to the new destination resolver (contract unchanged) |
| `package.json` | guard wired into `build` + `check:` / `test:` scripts |

### LIVE — `pawtenant-live-backup`

Same five files. The SQL is a **surgical mirror**: only the `sms` and `call` arms
differ from the previous LIVE definition. LIVE legitimately keeps the legacy
`communications`-backed `email` arm and the `order_completed` arm, and does NOT
have the TEST-only unified-email arms (`email`, `email_reply`, `email_failed` on
`admin_email_threads`). The bell likewise diverges (no `onOpenEmailThread`), so it
was patched hunk-by-hunk, never copied.

---

## 8. Click behaviour

`link_order_id` was appended to the RPC's `RETURNS TABLE`, which forced a
DROP + CREATE; grants were restored explicitly afterwards (`authenticated` +
`service_role`, `public`/`anon` revoked by name), and the final ACL is
byte-identical to the pre-change ACL on both projects.

- Communication row with a linked order → opens THAT order's modal on **Comms**.
- Order row → unchanged (opens its own order on its mapped tab).
- Email row → unchanged (opens the exact thread).
- Group whose items ALL point at the same order → opens that order.
- Anything unresolved → Communications, as before. Never a random order.

The destination is resolved once for both row shapes:

```ts
const orderId = item.link_order_id ?? (item.entity_type === "order" ? item.entity_id : null);
```

so the order that OPENS is always the order whose confirmation id was DISPLAYED.

---

## 9. TEST fixtures

Synthetic only: `PT-NOTIFQA-*` confirmation ids, `@pawtenant.test` emails,
`+1 555 019 xxxx` phones, `sent_by='NOTIFQA'`. No GHL send, no real SMS or call,
no Stripe activity, no real customer touched.

| Case | Fixture | Result |
|---|---|---|
| A call, explicit order | call → `PT-NOTIFQA-01` | `Sandra Cardona` · `Incoming call · (555) ***-0001 · PT-NOTIFQA-01` |
| B SMS, explicit order | sms → `PT-NOTIFQA-02` | `Marcus Webb` · `SMS: "Stop" · PT-NOTIFQA-02` |
| B2 confirmation id only | `confirmation_id='PT-NOTIFQA-02'`, unrelated phone | resolved to Marcus Webb + order |
| C 3 SMS, one order | 3 × `PT-NOTIFQA-08` | one identity, 3 items, preview truncated at 80 chars |
| D customer, 2 orders | phone `+15550190005` | `Priya Raman`, **no** order id, masked phone |
| E unknown caller | `(555) 019-9999` | `Unknown contact` · masked phone |
| F duplicate phone, 2 customers | `+15550190004` | `Unknown contact`, no order — no arbitrary pick |
| G explicit beats ambiguity | call → `PT-NOTIFQA-05A` | `Priya Raman` + `PT-NOTIFQA-05A` |
| H first name only | `PT-NOTIFQA-06` | `Quincy` |
| I no usable name | `PT-NOTIFQA-07` | `Unknown contact`, order id preserved |
| J confirmation id matching no order | `PT-NOTIFQA-GONE` | `Unknown contact`, no order |
| K/L read + unread | clicking a row | group marked read, badge 19 → 11 → 6 |
| M 45s refresh | two polls observed | 13 rows before and after, 13 unique — no duplication |
| N grouped expansion | chevron | all 8 SMS listed, one name per row |
| O click navigation | item + group row | opened the exact order on Comms |

Fixture rows were deleted after verification (§13).

---

## 10. Automated tests

`npm run check:admin-notification-name` — 15 checks, all passing:

R1 explicit-first resolution · R2 complete normalized phone, never partial ·
R3 ambiguity never picks a customer · R4 arms title with the resolved customer ·
R5 confirmation id secondary and never fabricated · R6 raw phone never printed ·
R7 `link_order_id` reaches the client · R8 grants · R9 batched (bounded before the
lateral) · R10 one RPC round-trip, no N+1 · R11 only sms/call are identity-led ·
R12 navigation uses the displayed order · R13 SMS never rendered as HTML ·
R14 unread not colour-only · R15 no LIVE project reference.

`npm run test:admin-notification-name` — 15/15 negative controls CAUGHT, re-run
after the final source edit in both repos.

`check-pending-delivery-*` P25 was re-anchored rather than bypassed: 33/33 checks
and 39/39 controls on TEST, 32/32 and 33/33 on LIVE.

---

## 11. Typecheck and build

| Repo | Typecheck | Build |
|---|---|---|
| TEST | 7 pre-existing errors in `AIAssistantTrustCard.tsx`, `EmployeeHrDirectory.tsx`, `ProviderInternalRecords.tsx` — unchanged count, none in task-owned files | `BUILD_EXIT=0` |
| LIVE | 9 pre-existing errors in `AnalyticsTab.tsx`, `EmployeeHrDirectory.tsx`, `ProviderInternalRecords.tsx`, `page.tsx` — none in task-owned files | `BUILD_EXIT=0` |

Build exit codes were read directly, not from a piped tail.

---

## 12. Browser verification

TEST, real Chrome, signed-in admin session, `https://pawtenant-test.vercel.app/admin-orders`.

- Identity-led group renders `Sandra Cardona` / `Incoming call · (555) ***-0001 · PT-NOTIFQA-01` / `Incoming calls · 18m ago · 1 item`.
- Mixed group renders `New SMS` / **Marcus Webb** ` · SMS: "Stop" · PT-NOTIFQA-02` / `20m ago · 8 items`.
- Expanded rows carry one customer name each — accessible labels confirmed via the DOM, e.g. `New SMS — Priya Raman — SMS: "Two orders same person" · (555) ***-0005 — unread`.
- Clicking the item row opened Marcus Webb's order modal on **Comms** showing both fixture SMS; clicking the identity-led group row opened Sandra Cardona's order on **Comms**. Unread badge fell 19 → 11 → 6 accordingly.
- Geometry at panel widths 380px and 320px: no row, control, span or paragraph escapes the panel; `panelScrollX = 0`; document horizontal overflow = 0. Every truncatable paragraph carries a `title` attribute (`Nathaniel Bartholomew-Fitzgerald`, the 80-char preview).
- Rows are focusable (`tabIndex 0`, `role="button"`) and respond to Enter/Space.
- Two 45-second polls fired with the panel open: 13 rows / 13 unique before and after, expansion state and unread count preserved.

Note on widths: the dropdown is `sm:w-[min(380px,calc(100vw-24px))]`, so 1440 /
1280 / 1024 all render the identical 380px panel; the narrow branch was verified
by constraining the panel to 320px and re-measuring, because the browser window
under test would not report a viewport below 2133 CSS px.

---

## 13. Cleanup

Fixture communications and fixture orders (`PT-NOTIFQA-*`) were deleted from TEST
after verification. Tests, migrations, formatting helpers, this document and the
regression guard are retained. No real notification or communication history was
deleted in either project.

---

## 14. LIVE rollout evidence

- Pre-flight: LIVE `main`, clean tree, `origin/main...HEAD` = `0 0`, and the LIVE
  function definition md5 was re-read immediately before the change and matched
  the value captured at the start — no other operator mid-change.
- Helpers applied first (purely additive), then a **read-only dry run** over all
  46 real inbound communications in the trailing 7 days confirmed every
  resolution came from `match_basis='order_id'`; nothing resolved by phone, so no
  new mis-attribution was possible. Unlinked spam numbers fell back to
  `Unknown contact` with a masked phone.
- The RPC was then swapped. Final ACL on `get_company_notifications`:
  `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` —
  identical to before. `anon` false, `authenticated` true. Both helpers: `anon`
  false, `authenticated` false.
- SQL was applied as explicit MCP statements. `supabase db push` was NOT used.
- No edge function was deployed — none is involved.

Frontend deployment details are recorded in the task report accompanying this
change (deployment id, source SHA and production alias).

---

## 15. Preservation

No SMS sent, no email sent, no GHL workflow touched, no order status changed, no
customer or provider record changed, no payment or Stripe write, no Ads change,
no notification or audit row deleted, no unread counter reset beyond the normal
per-user mark-read produced by clicking a notification during QA. `New paid
orders`, `Completed orders`, `Pending Delivery`, `Correction requested`,
consultations, emails and approvals return exactly as before, now additionally
carrying their own `link_order_id`.

---

## 16. Rollback

1. **Frontend** — revert the bell commit in the affected repo and redeploy. The
   old bundle simply ignores `link_order_id`.
2. **RPC** — forward-only rollback migration: `drop function public.get_company_notifications();`
   then re-create the previous definition (captured verbatim per project before
   the change: LIVE definition md5 `0aae9a67f712cbee2340ddf6bb7288c5`), followed
   by `revoke ... from public; revoke ... from anon; grant execute ... to authenticated; grant execute ... to service_role;`.
3. **Helpers** — `drop function public.resolve_communication_contact(uuid, text, text);`
   and `drop function public.mask_phone_for_display(text);` once nothing
   references them.

Do NOT roll back by deleting notification or communication data.

Rollback triggers: a wrong customer name on any row, navigation opening a
different order from the one displayed, panel failure, unread-count regression,
grouping regression, privacy exposure, N+1 performance regression, or the Admin
page failing to load.
