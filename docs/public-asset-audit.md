# Public Asset Audit & Use Map

Task: **PAWTENANT-TEST-ASSET-DIVERSITY-AND-VETERANS-SECTIONS** (TEST only)
Date: 2026-06-08

Goal: improve visual diversity on public pages and add respectful, emotional
veterans-support sections to selected non-homepage pages. Homepage and
`/meta-esa-letter` intentionally untouched.

---

## 1. Asset folder inventory (`public/assets/`)

| Folder | # images | State | Notes |
|---|---|---|---|
| backgrounds | 8 | usable | several large raw originals (0.4–1.1 MB) — heavy, used sparingly |
| blog | 28 | usable | largest pool; many `fp-*` lifestyle photos |
| brand | 13 | usable | logos / OG defaults |
| breeds | 10 | usable | breed portraits |
| colleges | 3 | usable | student-housing/dorm dog photos |
| documents | 5 | usable | letter/cert samples (some very large — `esa-letter-sample.jpg` 875 KB) |
| housing | 3 | usable | renter/home-with-dog |
| **legal** | **0** | **EMPTY** (.gitkeep) | FHA/landlord/accommodation imagery gap |
| lifestyle | 9 | usable | most-reused folder (telehealth/owner+dog) |
| meta | 1 | usable | meta LP only — do not touch |
| providers | 4 | usable | real provider headshots — do NOT use as generic "customers" |
| psd | 1 | thin | only `man-working-holding-dog.jpg` |
| service-dogs | 2 | thin | handler/calm-dog |
| states | 8 | usable | CA, FL, IL, NY, NC, PA, TX, VA |
| testimonials | 3 | usable | home-with-pet scenes |
| therapists | 2 | usable | clinician images — do NOT use as customers |
| travel | 3 | usable | walk/cafe |
| **trust** | **0** | **EMPTY** (.gitkeep) | trust-badge imagery gap |
| ui | 2 | usable | verification screenshot |
| **ui-screenshots** | **0** | **EMPTY** | — |
| **verification** | **0** | **EMPTY** | — |
| veterans | 3 | usable | calm, NON-military: porch+dog, man+puppy, senior+pets |
| video | n/a | — | video assets |

### Empty / weak folders
- **Empty:** `legal`, `trust`, `verification`, `ui-screenshots`.
- **Thin:** `psd` (1), `service-dogs` (2), `therapists` (2), `housing` (3), `colleges` (3).

### Over-reused images (same 3–4 everywhere)
From a scan of `src/pages` asset references:
- `lifestyle/woman-with-dog-new-apartment.jpg` — **11×**
- `lifestyle/woman-telehealth-with-dog.jpg` — **11×**
- `housing/home-together.jpg` — **8×**
- `blog/man-puppy-portrait.jpg` — **7×**
- `backgrounds/telehealth-woman-doctor-videocall.jpg` — **7×**

### Useful but UNUSED before this task
- `veterans/man-on-porch-with-dog.jpg` — 0 refs
- `veterans/man-with-puppy-portrait.jpg` — 0 refs
- `veterans/senior-with-pets.jpg` — 0 refs

These three respectful veteran images were sitting unused; this task puts all
three to work (one per page) — a direct diversity win with **zero new files**.

---

## 2. Priority state imagery coverage

Have: California, Florida, Illinois, New York, North Carolina, Pennsylvania, Texas, Virginia.
**Missing from priority list:** Ohio, Georgia, Arizona.

(State imagery is generic location/lifestyle, not landmark-specific. Adding
Ohio/Georgia/Arizona requires sourcing new commercial-safe images — deferred,
see §5.)

---

## 3. Changes made in this batch (additive only)

Added a reusable **`VeteransSupportSection`** to
`src/components/feature/SeoKit.tsx` and mounted it on 3 non-homepage pages:

| Page | Veteran image used | Heading |
|---|---|---|
| `/esa-letter-cost` | `veterans/man-on-porch-with-dog.jpg` | Supporting Veterans and the Pets Who Support Them |
| `/how-to-get-esa-letter-online` | `veterans/senior-with-pets.jpg` | (same) |
| `/landlord-denied-esa-letter` | `veterans/man-with-puppy-portrait.jpg` | (same) |

No existing optimized hero/section images were swapped (avoids churning
PageSpeed-tuned pages owned by a separate active session). Diversity improvement
here comes from activating the 3 unused veteran images, not from replacing
existing ones.

---

## 4. Existing-asset reuse rules honored
- Provider/therapist photos NOT used as fake customers.
- Veteran imagery is calm + non-military (no uniform/VA signal).
- No medical/diagnosis claims; no VA affiliation; no guaranteed approval; no
  invented discount amount.

---

## 5. Remaining asset gaps (need owner approval to source)
- `legal/` empty — FHA/accommodation/document theme.
- `trust/`, `verification/`, `ui-screenshots/` empty.
- States missing: **Ohio, Georgia, Arizona**.
- Thin: `psd`, `service-dogs`.

Sourcing new external images was **not** done in this batch — it needs license/
attribution decisions (royalty-free source, no watermarks, WebP optimization)
and Hamza's sign-off. If approved, suggested filenames:
- `states/ohio-housing.webp`, `states/georgia-housing.webp`, `states/arizona-housing.webp`
- `legal/fair-housing-documents.webp`
- `housing/renter-with-dog-apartment.webp`
- `colleges/student-housing-dog.webp`
- `psd/service-dog-handler.webp`
- `veterans/veteran-with-dog-home.webp`

New assets, when added, must be logged with source + license here.
