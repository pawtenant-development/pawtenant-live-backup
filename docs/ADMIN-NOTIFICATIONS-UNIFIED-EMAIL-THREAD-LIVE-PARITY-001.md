# ADMIN-NOTIFICATIONS-UNIFIED-EMAIL-THREAD-LIVE-PARITY-001

Make the Admin notification bell's email group actually work in both environments,
leading with the customer or contact rather than an event label or a raw address.

Status: **LIVE COMPLETE — the email arm now reads LIVE's canonical inbound-email
store instead of a table nothing writes; TEST's unified-thread arms lead with the
contact; SMS/call behaviour preserved.**

---

## 1. TEST / LIVE difference

| | TEST | LIVE |
|---|---|---|
| Unified thread tables | `admin_email_threads`, `admin_email_messages` exist | **do not exist** |
| Bell email arms | `email`, `email_reply`, `email_failed` on the thread model | one `email` arm |
| That arm read | the thread model | `public.communications` where `direction='inbound' AND type like 'email%'` |
| Rows that source has ever held | n/a | **0**, across 10,317 communications rows since 2026-03-26 (7,688 of them email — every one outbound) |
| Where inbound email really lands | `contact_submissions` → projected into a thread by `contact-submit` | `contact_submissions` only |
| Admin surface | Communications → Emails → Conversations (`EmailThreadsPanel`) | Contact Requests tab (`ContactRequestsTab`) |

Both environments receive the **same** inbound traffic through the same contact
form. TEST additionally projects it into the thread model.

---

## 2. Root cause

**Inbound emails are stored in a different table.** Not "LIVE is missing the
canonical RPC arms" — the arm exists and is wired correctly; it points at a
source that nothing has ever written on that project.

Evidence: `select count(*) from communications where direction='inbound' and type like 'email%'`
→ `0` on LIVE, against 95 real `contact_submissions` (8 in the trailing week,
newest the day of this task) and 77 admin replies.

---

## 3. Port or retire — and why neither, exactly

**Not a port.** Porting the TEST arms means porting the unified email conversation
model: two tables, the ingest RPC, the rollup trigger, the RLS set, the admin
panel and the customer portal card. That is a multi-phase programme (Phase 1 is
TEST-only and gated on an owner decision), and porting the *arms alone* would
swap one permanently-empty source for another.

**Not a retirement.** §21 allows retiring only if the unified-email inbox
provides the canonical admin workflow. On LIVE there is no unified-email inbox.
Inbound customer email is real, current, and worked daily in Contact Requests.
Deleting the arm would leave Email as the only communication type with no
durable, per-admin, cross-device bell surface — the existing signals (desktop
notification, in-tab sound, `status='new'` sidebar badge) are ephemeral,
opt-in, or global rather than per-admin.

**Decision: repoint.** The LIVE arm now reads `public.contact_submissions` with
the same behaviour contract the SMS/call arms got in
ADMIN-NOTIFICATIONS-CUSTOMER-NAME-FOR-COMMUNICATIONS-001. Each environment reads
its own canonical store; what reaches parity is the **behaviour**, not the
storage. When the thread model ships to LIVE, the arm moves with it.

---

## 4. Canonical email data flow

```
TEST   contact form → contact_submissions → admin_email_threads / _messages
                                              └── bell arms: email, email_reply, email_failed
LIVE   contact form → contact_submissions ────── bell arm:  email
```

Both arms go through the same three new helpers:

- `public.resolve_email_contact(order_id, confirmation_id, email)` — explicit
  order id → order reference matching exactly one order (`'general'` ignored) →
  normalized sender email. A **name** only when every matching order agrees on
  it; an **order id** only when exactly one order matches. This mirrors the rule
  that already governs `admin_email_threads.linked_order_id` in the Phase-1
  backfill, so the bell and the thread model can never disagree.
- `public.mask_email_for_display(email)` — `great_person26@gmail.com` → `g***@gmail.com`.
- `public.safe_text_preview(text, len)` — strips markup and collapses whitespace
  **server-side** before truncation.

All three are SECURITY INVOKER and revoked from `public`, `anon` and
`authenticated` by name; they are reachable only from inside the SECURITY
DEFINER bell RPC.

`admin_find_order_for_contact()` was deliberately **not** reused: it always
returns one best-ranked order even when `match_count > 1`, which is precisely
the behaviour §11 forbids here.

---

## 5. Notification UI

| Case | Primary | Secondary |
|---|---|---|
| Email linked to one order | `Elena Marchetti` | `Email: "Question about my ESA order" · PT-MAILQA-01` |
| Contact known, no unambiguous order | `Nadia Osei` | `Email: "When will my letter arrive" · m***@pawtenant.test` |
| External sender who gave a name | `Priscilla Vane` | `Email: "Partnership enquiry" · e***@nowhere.test` |
| Nothing resolved | `Unknown contact` | `Email: "No subject" · g***@nowhere.test` |
| Reply on an open thread (TEST) | `Elena Marchetti` | `Reply: "Still waiting on my letter" · 3 messages · PT-MAILQA-01` |
| Delivery failure (TEST) | `Owen Delacroix` | `Delivery failed: "Receipt for your order" · hard bounce after retry · PT-MAILQA-02` |

The email groups joined `CONTACT_IDENTITY_GROUPS`, so a group holding one contact
headlines that contact and moves its label to the meta line (no added height); a
group spanning several contacts keeps the label headline and emphasises the
latest contact on the detail line. Order, booking and approval groups are
untouched.

---

## 6. Customer / order resolution and unread semantics

Resolution priority and ambiguity behaviour are described in §4. Name fallback is
resolved-customer → the submitter's own name (they typed it into the contact
form; it is supplied, not matched) → `Unknown contact`.

Unread state is unchanged and lives where it always did: per-admin, per-group, in
`company_notification_reads`, via `mark_company_notifications_read()`. Showing or
reading a notification writes **nothing** to `admin_email_threads.unread_admin`
or `contact_submissions.status`. Opening a submission from the bell selects the
row exactly as clicking it does, including the established `new → viewed` flip —
that is existing admin semantics, not a new side effect.

---

## 7. Click navigation

- TEST — `entity_type='email_thread'` → Communications → Emails → the exact
  conversation (`?tab=communications&sub=emails&thread=<id>`).
- LIVE — `entity_type='contact_submission'` → Contact Requests with the exact
  submission opened (`?tab=contacts&submission=<id>`).
- Both resolve their own type **before** the order branch, and
  `OWN_DESTINATION_TYPES` stops a group of such rows falling through to a shared
  order. Email rows only started carrying `link_order_id` in this task, which is
  exactly when that fall-through first became possible.

### Two navigation defects found and fixed

1. **The thread deep link was silently discarded.** Clicking an email
   notification landed on Communications → *Command Center* with no thread
   selected. The link itself was correct — pasted into the address bar it opened
   the conversation — but the bell mounted `CommunicationsHub` before the
   navigation had landed, and the hub's mount-time "normalize missing `?sub=`"
   effect ran against the pre-navigation URL and replaced the whole link,
   dropping `?thread=`. Fixed twice over: the handler navigates before switching
   the tab, and the normalizer consults `window.location.search` instead of its
   mount-render snapshot. **Static checks and the SQL matrix both passed while
   the destination was wrong — only clicking it in a browser exposed this.**
2. **Duplicate React keys on repeated delivery failures.** The failure arm
   returned one row per failed message but keyed each row on the *thread*, so two
   failures on one thread collided. It now returns one row per thread.

---

## 8. Privacy

Shown: contact name, sanitised subject or short preview, masked sender, order
confirmation id, timestamp. Never shown: raw HTML, attachments, assessment
answers, diagnosis, provider notes, full message bodies, tokens, hidden
recipients, API metadata, or a full email address. Markup is removed in SQL
rather than trusted to be inert in React, so a hostile subject cannot reach a
`title` attribute either.

---

## 9. TEST fixtures

Synthetic only: `PT-MAILQA-*` confirmation ids, `@pawtenant.test` / `@nowhere.test`
addresses, `mailqa:*` thread keys. No Resend, no send of any kind, no real
customer. All removed afterwards — threads 5, messages 10, submissions 5, orders
587, i.e. exactly the pre-fixture counts.

| Case | Result |
|---|---|
| A inbound email, explicit order | `Elena Marchetti` · `PT-MAILQA-01` |
| B/E customer known, two orders, no explicit link | `Nadia Osei`, **no** order id, masked sender |
| C1 external sender with a submitted name | `Priscilla Vane` |
| C2/N unknown sender, blank subject | `Unknown contact` · `"No subject"` |
| D two orders but an explicit thread link | explicit link wins → `PT-MAILQA-04A` |
| F several unread messages in one thread | `Reply: … · 3 messages · PT-MAILQA-01` |
| G two threads from one customer | two separate rows, never merged |
| H two customers sharing one address | submitter name, **no** order id fabricated |
| I HTML subject and body | `<b>Urgent</b> <script>alert(1)</script>` → `Urgent alert(1) please read` |
| J attachment metadata + two failures on one thread | ONE row, latest error, **no** filename shown |
| K read thread | correctly absent from the replies group |
| L unread thread | present |
| M per-admin read state | bell state is per-admin by construction |
| O very long name and subject | truncated at 70 chars, full text in `title` |
| P linked reference that resolves to no order | `Unknown contact`, no order id |

---

## 10. Automated tests

`npm run check:admin-notification-email` — 16 checks (E1–E16), passing in both
repos. The guard is environment-aware: it reads which inbound-email store the
migration emits and asserts the same contract against either, with per-store
negative controls and explicit SKIP lines for controls that cannot apply.

`npm run test:admin-notification-email` — TEST 22/22 controls (7 N/A), LIVE 20/20
(9 N/A). E11 and E12 exist purely to prove the SMS/call work survived.

`check-admin-notification-customer-name.mjs` R11 was re-anchored to pin the RULE
(communication groups identity-led, event-titled groups not) rather than a
literal set, since the two repos carry different email arms: 15/15 and 16/16
controls in both.

---

## 11. Typecheck and build

| Repo | Typecheck | Build |
|---|---|---|
| TEST | 7 pre-existing errors, unchanged, none in task-owned files | `BUILD_EXIT=0` |
| LIVE | 9 pre-existing errors, unchanged, none in task-owned files | `BUILD_EXIT=0` |

---

## 12. Browser verification (TEST)

- All three email groups render with contact-first rows; the single-contact
  failures group is identity-led (`Owen Delacroix` headline, `Email delivery
  failures · 34m ago · 1 item` meta), the multi-contact groups keep their label
  and emphasise the latest contact.
- Eight expanded rows read one contact each, e.g.
  `New customer emails — Priya… — Email: "…" · m***@pawtenant.test — unread`.
- No `<script>` anywhere in the panel HTML, no attachment filename, all four
  visible addresses masked.
- Clicking an email item opens the exact conversation with its order chip.
- Geometry at 380px and 320px: nothing escapes the panel, no document overflow,
  every truncatable line carries a `title`.

---

## 13. LIVE rollout evidence

- Pre-flight: `main`, clean tree, `origin/main...HEAD` = `0 0`, RPC definition
  md5 re-read immediately before the change and unchanged from the previous
  task's result — no other operator mid-change.
- Helpers applied first (purely additive), then a **read-only dry run** over the
  real trailing-30-day submissions confirmed real names and real order ids, with
  external senders falling back to their submitted name and a masked address.
- The RPC was then replaced with `CREATE OR REPLACE` (signature unchanged, so no
  DROP and no re-granted anon EXECUTE). Final ACL
  `{postgres,authenticated,service_role}` — identical to before; all three
  helpers `anon=false, authenticated=false`.
- The LIVE `email` group returns 8 rows where it had returned 0 since the project
  began. `sms` and `call` still return 8 each with resolved customer names.
- SQL applied as explicit MCP statements. No `db push`. No edge function deployed.

---

## 14. Preservation

No email sent, no email deleted, no customer reply, no SMS, no GHL change, no
order status change, no provider assignment change, no payment or Stripe write,
no Ads change, no message history or audit row deleted. The SMS/call customer-name
feature is asserted intact by E11/E12 and observed intact in the LIVE RPC output.

---

## 15. Rollback

1. **Frontend** — revert the bell/page/tab commit and redeploy; the previous
   bundle ignores the new entity type.
2. **RPC** — `CREATE OR REPLACE` back to the prior definition (LIVE md5
   `e4feed6762cc6452255503cdf278b77a`, i.e. the state after
   ADMIN-NOTIFICATIONS-CUSTOMER-NAME-...-001). No DROP is needed, so grants are
   untouched.
3. **Helpers** — drop `resolve_email_contact`, `mask_email_for_display`,
   `safe_text_preview` once nothing references them.

Never roll back by deleting messages or submissions.

Rollback triggers: a wrong customer on any row, a click opening the wrong
conversation, unread counts that stop reconciling, a thread or submission marked
read that should not be, raw email content on screen, duplicated notifications,
any SMS/call regression, or the notification panel failing to render.
