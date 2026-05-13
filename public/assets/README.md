# PawTenant Asset Library

Central home for all static visual assets served from `/assets/*`. Goal: replace Readdy-hosted images with self-hosted, vetted, brand-safe assets that look premium, calm, medically credible, and landlord-friendly.

---

## Purpose

- Single source of truth for site imagery.
- Self-hosted (no third-party image hosts in production).
- Trust-first: every asset must reinforce legitimacy, not undermine it.
- Versioned in git so changes are auditable.

---

## Folder Structure

| Folder | Purpose | Examples |
|---|---|---|
| `brand/` | PawTenant logos, wordmarks, favicons, brand-locked graphics. | `pawtenant-logo.svg`, `pawtenant-mark.svg`, `favicon-512.png` |
| `documents/` | Photos/illustrations of paperwork, forms, sample letters, envelopes, ID-style documents. | `esa-letter-closeup.jpg`, `envelope-stack.jpg` |
| `verification/` | Visuals for the Verification ID-only system (cards, IDs, secure document graphics). NO QR codes. | `verification-id-card.png`, `id-shield.svg` |
| `providers/` | Real or provider-submitted headshots. Initials-fallback graphics live here too. | `provider-jdoe.jpg`, `initials-fallback.svg` |
| `states/` | State-specific landscape/skyline imagery for state landing pages. | `texas-landscape.jpg`, `florida-coast.jpg` |
| `backgrounds/` | Abstract, geometric, gradient, or empty-interior backgrounds for hero/section bgs. | `gradient-soft-blue.jpg`, `empty-livingroom.jpg` |
| `ui-screenshots/` | Annotated UI screenshots (dashboard, letter preview, assessment) used in marketing pages. | `dashboard-overview.png`, `letter-preview.png` |
| `legal/` | Compliance/legal-adjacent visuals (HUD, FHA, ADA references, document mockups). | `fha-document.jpg`, `hud-seal-reference.png` |

---

## Hard Rules (NON-NEGOTIABLE)

These exist because trust is the product. Violations get reverted.

1. **No AI-generated people.** Faces, hands, bodies — none. Detection is improving and AI faces erode credibility.
2. **No AI-generated pets.** Real pets only.
3. **No fake provider photos.** Provider imagery is real provider headshots or the initials-fallback graphic. Never stock, never AI.
4. **No generic stock humans.** No iStock smiling-couple-shaking-hands. No "diverse team in office" stock. Customers spot it instantly.
5. **Freepik usage is restricted.** Allowed only for:
   - State landscapes / skylines
   - Abstract / gradient / geometric backgrounds
   - Document, paper, envelope, pen, object closeups
   - Empty interiors (living rooms, apartments, no people)
   Anything else from Freepik = NOT allowed.
6. **Provider photos must be real or initials fallback.** No exceptions. Submitted by the provider, used with consent.
7. **Verification visuals must match the current Verification ID-only system.** No legacy QR-code imagery. No scan-this-code graphics. ID card style only.
8. **No QR code visuals — for now.** Revisit when/if QR verification ships.
9. **No watermarks visible** in shipped assets.
10. **No competitor branding** anywhere, ever.

---

## Naming Conventions

```
[category]-[descriptor]-[variant?]-[size?].[ext]
```

Rules:
- All lowercase.
- Words separated by hyphens (`-`), never underscores or spaces.
- Use the folder name as implicit category — don't repeat it in the filename unless needed for disambiguation.
- Variants: `light`, `dark`, `mobile`, `desktop`, `2x`.
- Sizes only when multiple sizes coexist: `512`, `1024`, `2048`.

Examples:
- `pawtenant-logo-dark.svg`
- `texas-landscape-desktop.jpg`
- `dashboard-overview-2x.png`
- `provider-initials-fallback.svg`
- `esa-letter-closeup.jpg`

Avoid: `IMG_2034.jpg`, `Final_v2 (1).png`, `Screen Shot 2026-01-04.png`.

---

## Image Size Guidelines

| Use case | Target size | Format | Notes |
|---|---|---|---|
| Logos / icons | Vector | `.svg` | Always SVG when possible. |
| Favicons | 512×512 source | `.png` | Generate `.ico` from this. |
| Hero / full-bleed bg | 1920×1080 (desktop), 800×1000 (mobile) | `.jpg` or `.webp` | Compress aggressively. Target < 250KB. |
| State landscapes | 1600×900 | `.jpg` or `.webp` | Target < 200KB. |
| Section backgrounds | 1600×900 | `.jpg` or `.webp` | Target < 150KB. |
| Document closeups | 1200×800 | `.jpg` or `.webp` | Target < 150KB. |
| UI screenshots | 2× retina (e.g., 2400×1500) | `.png` | Crisp text required. Target < 400KB. |
| Provider headshots | 600×600 square | `.jpg` or `.webp` | Center-cropped. Target < 80KB. |
| Initials fallback | Vector | `.svg` | One file, themable. |

General:
- Prefer `.webp` for photos when no transparency is needed.
- Strip EXIF/metadata before commit.
- Run through compression (squoosh, ImageOptim, or equivalent) before commit.
- Never commit a single image > 1MB without justification.

---

## Sourcing Log

Track every asset added so we can audit license, source, and substitution path later.

| Filename | Source | License | Date Added | Replaces (Readdy URL?) | Notes |
|---|---|---|---|---|---|
| _example: brand/pawtenant-logo.svg_ | _internal_ | _owned_ | _2026-05-04_ | _n/a_ | _master logo_ |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

Append a row every time you add an asset. Keep the table alphabetical by filename.

---

## Phased Asset Collection Checklist

### Phase 1 — Brand foundation
- [ ] PawTenant primary logo (SVG, light + dark)
- [ ] PawTenant mark / icon
- [ ] Favicon set (512, 192, 32, 16, .ico)
- [ ] Open Graph default image (1200×630)
- [ ] Initials-fallback provider graphic

### Phase 2 — Trust & verification
- [ ] Verification ID card visual (front)
- [ ] Verification ID card visual (back, if applicable)
- [ ] Document/letter closeup hero (ESA letter)
- [ ] Document/letter closeup hero (PSD letter)
- [ ] HUD/FHA reference imagery (legal/)

### Phase 3 — Geographic / landing
- [ ] Top 10 state landscapes (TX, FL, CA, NY, GA, NC, OH, IL, PA, MI)
- [ ] Remaining 40 states (rolling)
- [ ] Generic US landscape fallback

### Phase 4 — Section/background imagery
- [ ] Soft gradient background (hero variant)
- [ ] Empty interior — living room
- [ ] Empty interior — apartment
- [ ] Abstract geometric background

### Phase 5 — UI screenshots
- [ ] Dashboard overview (annotated)
- [ ] Assessment flow preview
- [ ] Letter preview screenshot
- [ ] Provider review interface screenshot

### Phase 6 — Provider photos
- [ ] Collect real headshots from active providers (consent required)
- [ ] Confirm initials fallback is wired for missing photos

### Phase 7 — Documents/objects
- [ ] Envelope closeup
- [ ] Pen + paper closeup
- [ ] Stamped/sealed document
- [ ] ID-style card closeup (non-verification)

---

## Readdy Replacement Notes

This library exists in part to retire Readdy-hosted images. Replacement is **not** part of this scaffolding step — it will be done in a later, scoped change.

When that work happens:
- Replace Readdy URLs (`readdy.ai/...`) one section at a time.
- Update the **Sourcing Log** with the Readdy URL the asset replaces.
- Test pages visually after each batch.
- Do NOT touch Readdy references in this commit.

Tracking:
- [ ] Audit current Readdy usage (grep `readdy` in `src/`)
- [ ] Map each Readdy URL → planned replacement asset
- [ ] Replace in batches by page/section
- [ ] Final pass: confirm zero `readdy` references remain
- [ ] Remove any Readdy-specific config / domains from `next.config` / image allowlists

---

## Out of Scope (for the scaffolding commit)

- No actual image files yet.
- No code changes.
- No UI component updates.
- No Readdy URL replacements.
- No assessment, checkout, Stripe, Supabase, or attribution changes.

This README and the empty folders are the entire deliverable.
