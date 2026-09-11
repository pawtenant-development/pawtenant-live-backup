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

The PSD planner is a **different document** that has not been supplied yet.
The PSD slot exists so it can be added later, but it is inactive and
**unadvertised**: customers see nothing for it, and no PSD page mentions a
planner. When the real PSD asset arrives: upload it into the **PSD** slot,
publish it, then (in a code task) flip `PSD_PLANNER_PUBLISHED` in
`src/data/plannerBenefit.ts` and add PSD marketing copy. Never upload the ESA
planner into the PSD slot.

---

## Who can download it (the exact predicate)

Decided by the database, once, in `public.customer_resource_order_eligible(orders, family)`:

```text
authenticated customer
AND owns the order        (orders.user_id = auth.uid()
                           OR normalize_email(orders.email) = normalize_email(auth.email()))
AND orders.status NOT IN ('lead','cancelled','archived','refunded','disputed')
AND order_payment_state(orders) IN ('paid','partially_refunded')
AND order_service_family(letter_type, package_key, package_display_name, plan_type, parent_order_id) = 'esa'
AND the ESA slot has a published (active, not retired) version
```

* `order_payment_state()` is the canonical lifecycle payment truth
  (`payment_intent_id` / `paid_at`, minus refunds and disputes).
* `order_service_family()` is the canonical asymmetric classifier: **any PSD
  evidence wins**, `unknown` fails closed. It never reads `confirmation_id`.
* Refund/cancel policy follows the portal: a **full** refund, a cancellation, an
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

## LIVE promotion (not authorized yet)

1. Apply `supabase/migrations/20260909120000_customer_resource_planners.sql` to
   LIVE via MCP `apply_migration` (idempotent; depends on the existing
   `is_admin_staff()`, `normalize_email()`, `order_payment_state()` and
   `order_service_family()` helpers — confirm all four exist on LIVE first).
2. Deploy both edge functions with `verify_jwt=true`.
3. Cherry-pick commit `70b5f71` (never merge TEST `main`).
4. Upload and publish the corrected planner from the LIVE admin panel.
