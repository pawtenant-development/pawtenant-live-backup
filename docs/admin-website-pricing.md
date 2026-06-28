# Admin-Managed Website Pricing

One central, admin-controlled source of truth for the prices shown as **text on
the public website** (ESA / PSD / add-on / subscription package prices).

Admin location: **Admin → Settings → Website Content → Website Pricing**.

---

## What this controls

The numbers rendered as marketing/UI copy on public pages, e.g.:

- Homepage pricing cards (`PricingSection`)
- ESA pricing cards everywhere (`EsaPricingMini` — used on ~30 ESA/SEO pages)
- PSD pricing cards (`PsdPricingMini`)
- `/esa-letter-cost` (cards + hero price chip)
- `/meta-esa-letter` pricing block
- `/how-to-get-psd-letter` pricing cards
- Anywhere using `<PricingText priceKey="…" />`

Change a value in the admin panel → the displayed number updates everywhere it
is read from the central source.

## What this does NOT control

**Stripe is not connected to this system.** Editing a price here does **not**:

- change Stripe products, price IDs, checkout amounts, or coupons
- change what a customer is actually charged
- change order totals, refunds, provider payouts, or accounting

The real selling price is still computed by checkout logic
(`src/pages/assessment/page.tsx` → `getAssessmentBasePrice()`, currently
`$110` one-time / `$99` annual base) plus the Stripe catalog. Those files do
**not** import this system.

> If you actually want to change what customers pay, the Stripe product/price
> IDs must be created/updated first (separate task). Only after that should the
> matching display value here be changed, so the website copy and the real
> charge stay in sync.

---

## Architecture

| Layer | File | Role |
| --- | --- | --- |
| DB table | `site_pricing_settings` (migration `20260628120000_site_pricing_settings.sql`) | Source of truth. Public read (active rows), admin-only write (RLS `is_admin_staff()`). |
| Fallback constants | `src/lib/sitePricing.ts` (`FALLBACK_PRICING_MAP`) | In-code defaults for build/prerender/offline safety. ESA fallbacks derive from `src/config/pricing.ts`. |
| Fetch + cache | `src/lib/sitePricing.ts` (`fetchSitePricing`) | One shared, cached fetch per session. |
| Hook | `src/hooks/useSitePricing.ts` | `price(key, fallback?)` → display string; `dollars(key)` → number. |
| Inline helper | `src/components/feature/PricingText.tsx` | `<PricingText priceKey="esa_single_pet" fallback="$110" />` for prose. |
| Admin UI | `src/pages/admin-orders/components/WebsitePricingPanel.tsx` | Grouped editor mounted in `SettingsTab`. |

### Pricing keys (seeded)

| key | service_type | seeded display |
| --- | --- | --- |
| `esa_single_pet` | esa | $110 |
| `esa_additional_pet` | esa | $25 |
| `esa_subscription_annual` | subscription | $99 |
| `esa_subscription_addon` | subscription | $20 |
| `psd_standard` | psd | $100 |
| `psd_priority` | psd | $120 |
| `psd_annual` | psd | $99 |
| `additional_documentation` | addon | $40 |

Prices are stored as `amount_cents` (integer). `display_text` is an optional
per-row override (e.g. show exactly `"$110"` regardless of amount).

---

## How fallback values work

Every consumer starts from `FALLBACK_PRICING_MAP` (in code), then hydrates from
the DB on mount. If the Supabase fetch fails, the page keeps the fallback — a
price never breaks the layout. Components also pass an explicit literal fallback
(e.g. `getPrice("esa_single_pet", ESA_PRICE_LABELS.oneTime)`) so the very first
render and prerender output are correct.

## SEO / prerender caveat

Public pages are prerendered to static HTML at build time. Prerender does **not**
run the runtime Supabase fetch, so the **prerendered HTML contains the fallback
values** (the in-code defaults). When a real browser loads the page, React
hydrates and updates the visible numbers from the admin settings.

Practical implication: after changing a price in admin, the **live UI updates
immediately** (on next page load + hydration), but the **static HTML snapshot**
(and anything that only reads pre-hydration HTML, e.g. a raw `curl`) keeps the
old fallback until the next deploy/rebuild. To make the prerendered HTML match a
new price, update the fallback in `src/lib/sitePricing.ts`
(via `src/config/pricing.ts` for ESA) and rebuild.

This system is for **display sync**, not for SEO-critical price text that must
appear in static HTML. FAQ/schema price prose that drives rich results is left
hardcoded on purpose (see below).

---

## Adding a new pricing key

1. Add a row to the DB (idempotent seed pattern):
   ```sql
   insert into public.site_pricing_settings (key, label, service_type, amount_cents, sort_order)
   values ('my_new_key', 'My New Price', 'esa', 5000, 40)
   on conflict (key) do nothing;
   ```
2. Add the matching fallback in `PRICING_FALLBACKS` (`src/lib/sitePricing.ts`)
   and, if useful, a constant in `PRICING_KEYS`.
3. Use it: `<PricingText priceKey="my_new_key" fallback="$50" />` or
   `const { price } = useSitePricing(); price("my_new_key")`.

---

## Known caveats / out of scope

- **`/faqs` PSD per-dog prose** (`$100 for 1 dog, $120 for 2 dogs …`) and the ESA
  FAQ answer are left hardcoded — they feed the FAQ schema (AEO/rich results),
  which needs literal text in static HTML, and they encode per-dog tiers not in
  the central key set. Keep them in sync manually if base prices change.
- **`/pet-rent-savings-calculator`** uses `ESA_PRICING.subscription` only as the
  editable default doc-cost input. Left on the static config to avoid the input
  value jumping after hydration.
- Suffixes like `/year`, `one-time`, `/yr` are static text in the components;
  only the dollar amount is centralized.

---

## LIVE mirror / runbook

This shipped to **TEST only**. To mirror to LIVE later (after explicit approval):

1. Apply the migration `20260628120000_site_pricing_settings.sql` to LIVE
   (Supabase ref `cvwbozlbbmrjxznknouq`). It is idempotent + non-destructive
   and depends on the existing `public.is_admin_staff()` helper (confirm it
   exists on LIVE first).
2. Mirror the frontend files (lib/hook/PricingText, the 3 components, the 4
   pages, `WebsitePricingPanel`, `SettingsTab` registration).
3. Verify LIVE seeded values match what LIVE currently displays before relying
   on them (LIVE PSD/ESA prices may differ from TEST — adjust the seed if so).
4. Confirm checkout amounts are unchanged on LIVE (this system never touches
   them).
