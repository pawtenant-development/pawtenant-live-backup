# Customer Resources → Planners (owner runbook)

The **Pet Care Planner by PawTenant** is a free digital planner included with
every paid ESA package. It is a *customer resource* — not an ESA letter, not a
clinical document, not an assessment attachment and not an order document.
This page explains how it works and how the owner replaces it without a
deployment. Task: `ESA-PLANNER-CUSTOMER-RESOURCE-TEST-001` (TEST only so far).

Admin location: **Admin → Settings → Website Content → Customer Resources → Planners**.

---

## What the owner can do (no code, no SQL, no deployment)

| Action | Where | What happens |
| --- | --- | --- |
| **Upload a replacement PDF** | slot card → *Upload a new version* | The file is checked on the server (real `%PDF-` file, `%%EOF` trailer, parses, not encrypted, ≥ 1 page, no JavaScript / OpenAction / embedded files / rich media, ≤ 25 MB) and saved as a **draft** version. Customers do not see it yet. |
| **Upload / replace a thumbnail** | same form, or *Thumbnail* on any version row | JPEG/PNG/WebP ≤ 2 MB into the public previews bucket. If none is set, the committed cover image is used. |
| **Inspect** | *Currently live* card + *Version history* | Original filename, size, page count, SHA-256, who uploaded and when, when published. |
| **Preview** | *Preview PDF* / *Preview* | Opens a fresh 5-minute signed link to that exact version — works for drafts too. |
| **Publish** | *Publish* on a draft row | Moves the slot's single active pointer to that version. Every eligible paid ESA customer gets it immediately, including historical orders. |
| **Roll back** | *Roll back to this* on an older row | Same mechanism as publish; recorded as `rollback`. |
| **Disable** | *Disable (unpublish)* on the live card | Clears the active pointer. Customers see an honest "temporarily unavailable" state until something is published again. |
| **Stale edit protection** | automatic | Every publish/disable carries the `lock_version` the panel last saw; if another admin changed the slot meanwhile the action is refused and the panel reloads. |

Nothing on this screen deletes a version or a storage object. Storage cleanup
is a separate, deliberate operation (not built).

### The PSD slot

The **Psychiatric Service Dog Training Workbook by PawTenant** is a different
document from the ESA planner. Since 2026-09-11 the PSD slot is **published and
advertised** (TEST v1 and LIVE v1, `PSD PLANNER.pdf`, 30 pages, sha `5b7e9cf2…`):
paid PSD customers see a "View Workbook" card in Included Resources, and the PSD
pages carry the workbook section with its scope statement. Replace it exactly
like the ESA planner — upload into the **PSD** slot, preview, publish. Never
upload the ESA planner into the PSD slot (the guard's assets-swapped control
exists for this). Retiring the PSD workbook is a code task: flip
`PSD_PLANNER_PUBLISHED` in `src/data/plannerBenefit.ts` and the PSD copy
disappears everywhere at once.

---

## Who can download it (the exact predicate)

Decided by the database, once, in `public.customer_resource_order_eligible(orders, family)`:

```text
authenticated customer
AND owns the order        (orders.user_id = auth.uid()
                           OR normalize_email(orders.email) = normalize_email(auth.email()))
AND orders.status NOT IN ('lead','cancelled','canceled','archived','refunded','disputed')
AND order_payment_state(orders) IN ('paid','partially_refunded')
AND order_service_family(letter_type, package_key, package_display_name, plan_type, parent_order_id) = the slot's family ('esa' | 'psd')
AND that slot has a published (active, not retired) version
```

* `order_payment_state()` is the canonical lifecycle payment truth
  (`payment_intent_id` / `paid_at`, minus refunds and disputes).
* `order_service_family()` is the canonical asymmetric classifier: **any PSD
  evidence wins**, `unknown` fails closed. It never reads `confirmation_id`.
* Refund/cancel policy follows the portal: a **full** refund, a cancellation
  (either spelling — LIVE data carries both `cancelled` and `canceled`), an
  archive or a dispute ends access; a **partial** refund keeps it.
* Multiple paid ESA orders → one planner card (entitlement is per customer).

Admins may preview a customer's entitlement by email (the portal's Customer
View); `is_admin_staff()` is re-checked in SQL. Editable `user_metadata` is
never consulted.

---

## Architecture

| Layer | Object | Notes |
| --- | --- | --- |
| Storage | bucket `customer-resources` (**private**, PDF only, 25 MB) | No anon/authenticated policy exists — only the service role can read it. |
| Storage | bucket `customer-resource-previews` (**public**, images, 2 MB) | Thumbnails only; admin staff may write. |
| Table | `customer_resource_slots` | `esa_planner`, `psd_planner`; single `active_version_id`; `lock_version`; `advertised`. |
| Table | `customer_resource_versions` | Append-only: bucket/path, filename, bytes, sha256, pages, uploader, timestamps, `superseded_by_version_id`, `retired_at`. |
| Table | `customer_resource_events` | upload / publish / rollback / unpublish / thumbnail — actor + timestamp. |
| RPC (customer) | `customer_resource_entitlements(p_preview_email)` | Projection only — never a storage path or hash. |
| RPC (customer) | `customer_resource_access(key, p_preview_email)` | Used by the edge function with the caller's JWT. |
| RPC (admin) | `admin_customer_resources_overview()`, `admin_customer_resource_register_version(...)`, `admin_customer_resource_publish(...)`, `admin_customer_resource_unpublish(...)`, `admin_customer_resource_set_thumbnail(...)`, `admin_customer_resource_version_location(...)` | All `is_admin_staff()`-gated, SECURITY DEFINER, pinned `search_path`, revoked from anon/authenticated by name. |
| Edge fn | `get-customer-resource-url` (`verify_jwt=true`) | Resolves the user, asks the RPC with the caller's JWT, mints a **300-second** signed URL. Never stored. Refuses the service-role/anon key as a bearer. |
| Edge fn | `admin-upload-customer-resource` (`verify_jwt=true`) | Admin-only multipart upload with content validation; registers the version with the admin's JWT. |
| Client | `src/lib/customerResources.ts` | Entitlements fetch, popup-safe open, Content-Disposition download. |
| Portal | `IncludedResourcesSection.tsx` | The separate "Included Resources" card. |
| Admin | `CustomerResourcesPanel.tsx` (mounted in `SettingsTab`) | The workflow above. |
| Marketing | `src/data/plannerBenefit.ts` | The one copy source; `plannerBenefitFor("psd")` is `null`. Preview section: `PlannerPreviewSection.tsx` on `/esa-letter-cost#pet-care-planner`. |
| Guard | `scripts/check-customer-resource-planner.mjs` | `npm run check:customer-resources` / `test:customer-resources` (28 planted controls). In `npm run build`. |

Opening or downloading the planner writes **nothing**: no order, review,
provider, document, delivery, earning, communication or lifecycle change.

## LIVE — promoted 2026-09-11 (ESA-PSD-PLANNERS-MARKETING-LIVE-001)

Both migrations applied, both edge functions deployed (`verify_jwt=true`, v1),
frontend on LIVE `650367e4` (`dpl_9KHLfNxiXDMyZwiZAEeowaKM9HQw`), ESA planner v1
and PSD workbook v1 uploaded, hash-checked and published from the LIVE admin
panel. Full record: `docs/tasks/ESA-PSD-PLANNERS-MARKETING-LIVE-001.md`.

**Hardening (closure 2026-09-11):**
`supabase/migrations/20260911130000_customer_resource_cancel_spelling.sql`
(adds the `canceled` spelling to the exclusion list) is applied on TEST **and**
LIVE (LIVE ledger `20260911081234`, MCP `apply_migration`, owner-authorized).
LIVE rolled-back access matrix afterwards: 22/22. SQL-only — no function or
frontend deployment was needed.

### Rollback on LIVE

* **Asset problem** — admin panel: *Disable (unpublish)* or *Roll back to this*
  on an earlier version. No deployment, nothing deleted.
* **Code problem** — `git revert 650367e4` (and `1e96f75f`) on
  `pawtenant-live-backup`, or promote the previous production deployment in
  Vercel. The migrations are additive and safe to leave in place.
* **Never** delete rows from `customer_resource_versions` or objects from the
  private bucket as a rollback step.
