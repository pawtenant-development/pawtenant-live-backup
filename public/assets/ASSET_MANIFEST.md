# PawTenant Asset Manifest

Tracks every asset added to `public/assets/`. Append a row when you add an asset. Every asset must be verified non-AI (or explicitly approved as a generic visual) per `public/assets/README.md`.

## Format columns

- **Filename** — file path relative to `public/assets/`
- **Source** — origin (Freepik ID, `provider-supplied`, `internal/owned`, `local-archive`)
- **Author / Owner** — author name or owner
- **License** — Premium / Freemium / Free / Owned / Provider-supplied
- **is_ai_generated** — `false` / `true` / `n/a` (must be `false` for trust-critical use)
- **Intended Placement** — section/page where the asset is used
- **Notes** — short rationale + special handling

---

## Approved Assets

### `providers/` — Real Provider Headshots (provider-supplied)

| Filename | Source | Owner | License | is_ai_generated | Intended Placement | Notes |
|---|---|---|---|---|---|---|
| `providers/provider-stephanie-white.jpg` (25 KB) | local: `Doctors Headshots/Stephanie White Headshot.jpg` | Stephanie White (provider) | Provider-supplied | false | Provider directory / About / About-Us — captioned with real provider name | Real headshot. Use ONLY captioned with this provider's actual name. |
| `providers/provider-robert-staaf.jpg` (15 KB) | local: `Doctors Headshots/Robert Staaf Headshot.jpg` | Robert Staaf (provider) | Provider-supplied | false | Provider directory / About | Real headshot. Use ONLY captioned with this provider's actual name. |
| `providers/provider-lytara-garcia.jpg` (24 KB) | local: `Doctors Headshots/Lytara Garcia Headshot.jpg` | Lytara Garcia (provider) | Provider-supplied | false | Provider directory / About | Real headshot. Use ONLY captioned with this provider's actual name. |
| `providers/provider-michelle-lafferty.jpg` (29 KB) | local: `Doctors Headshots/Michelle Lafferty Headshot.jpg` | Michelle Lafferty (provider) | Provider-supplied | false | Provider directory / About | Real headshot. Use ONLY captioned with this provider's actual name. |

### `brand/` — Logos & Favicons (owned)

| Filename | Source | License | Intended Placement | Notes |
|---|---|---|---|---|
| `brand/favicon-01.png` (3 KB) | local: `Favicon-01.png` | Owned | Browser tab favicon | Small PNG. Generate `.ico` from this when needed. |
| `brand/favicon-02.png` (4 KB) | local: `Favicon-02.png` | Owned | Browser tab favicon (variant 2) | Variant. |
| `brand/pawtenant-logo-black-01.png` (242 KB) | local: `PNG - Black 01.png` | Owned | Footer / dark-context navbar | Black logo, transparent BG. |
| `brand/pawtenant-logo-black-02.png` (118 KB) | local: `PNG - Black 02.png` | Owned | Compact mark / dark context | Black logo variant 2. |
| `brand/pawtenant-logo-white-01.png` (195 KB) | local: `PNG - White 01.png` | Owned | Dark hero / dark sections | White logo, transparent BG. |
| `brand/pawtenant-logo-white-02.png` (114 KB) | local: `PNG - White 02.png` | Owned | Compact mark / dark context | White logo variant 2. |
| `brand/pawtenant-logo-color-01.jpg` (607 KB) | local: `JPEG-01.jpg` | Owned | OG image / share card / print | Full-color JPG (no transparency). Large — consider resizing for web hero. |
| `brand/pawtenant-logo-color-02.jpg` (545 KB) | local: `JPEG-02.jpg` | Owned | OG variant / print | Full-color JPG variant 2. |
| `brand/og-default.jpg` (917 KB) | local: `og.jpeg` (top-level `assets/`) | Owned | Open Graph default share card / social previews | OG image — used by social media when site is shared. Consider compressing under 500 KB before launch. |

### `documents/` — Sample documents (owned/local)

| Filename | Source | License | is_ai_generated | Intended Placement | Notes |
|---|---|---|---|---|---|
| `documents/esa-letter-sample.jpg` (875 KB) | local: `Random images for website/pet-ESA-Letter-scaled.jpg` | Owned (local archive) | n/a (document mockup) | "What you receive" preview / ESA letter sample section | Letter mockup. Verify no real customer PII visible before going live. |
| `documents/dog-certification-sample.jpg` (184 KB) | local: `Random images for website/DOG-CERTIFICATION.jpg` | Owned (local archive) | n/a | Certification visual / supporting document | Smallest of the certification variants. |
| `documents/esa-sample-letter.svg` (7 KB) | local: `esa-sample-letter.svg` (top-level `assets/`) | Owned | n/a | Inline letter graphic / icon-style preview | SVG vector — scales infinitely, tiny file. |
| `documents/esa-letter-mockup.png` (301 KB) | local: `esa_letter_1080x1920.png` | Owned | n/a | Mobile-format letter mockup (1080×1920 portrait) | Vertical letter screen — good for mobile hero / story format. |
| `documents/form-sample.jpg` (626 KB) | local: `Form.jpeg` | Owned | n/a | Form/intake screen mockup | Sample form/document image. |

### `ui/` — UI mockups & screenshots

| Filename | Source | License | Intended Placement | Notes |
|---|---|---|---|---|
| `ui/verification-screen-mockup.png` (282 KB) | local: `verification_screen_1080x1920.png` | Owned | Verification feature section / "How landlords verify" preview | Verification screen mockup, 1080×1920 portrait. Matches current ID-only verification system. |

### `lifestyle/` — Customer + pet at home / Google Ads + homepage hero (round 4 compressed imports)

All sourced from local `Downloads/assets/` originals (multi-MB raw JPGs from previous Freepik-style stock packs). Compressed via Pillow (target widths 1200–1600px, JPEG q=80, progressive, optimized) on 2026-05-05. Used as **generic lifestyle / customer-side** visuals only — never captioned with provider identity. Real-photo style, no AI artifacts visible.

| Filename | Source | License | is_ai_generated | Intended Placement | Size | Notes |
|---|---|---|---|---|---|---|
| `lifestyle/woman-telehealth-with-dog.jpg` | local: `attractive-young-woman-designer-working-from-home-having-meeting-online-pet-dog-is-with-her.jpg` (16.5 MB raw) | Owned (local archive) | false (visually verified) | **Primary Google Ads landing-page hero** / homepage hero — telehealth-style call + dog at home | 141 KB | Strong "online consult + pet at home" composition. Compressed from 16.5 MB → 141 KB (1600w, q80). |
| `lifestyle/freelancer-with-dog-laptop.jpg` | local: `attractive-young-female-freelancer-working-laptop-from-her-home-having-her-pet-dog-her-lap-keep-her-company.jpg` (16.9 MB raw) | Owned (local archive) | false (visually verified) | Google Ads alt hero / homepage secondary hero | 159 KB | Calm work-from-home + dog. Compressed from 16.9 MB → 159 KB (1600w). |
| `lifestyle/woman-with-dog-new-apartment.jpg` | local: `woman-with-dog-relocating-new-apartment.jpg` (23.4 MB raw) | Owned (local archive) | false (visually verified) | **Housing-section hero** / "move in with your ESA" / state-page hero | 156 KB | **High-value asset — explicitly housing/move-in themed.** Perfect for ESA housing positioning. Compressed from 23.4 MB → 156 KB. |
| `lifestyle/woman-laptop-home.jpg` | local: `front-view-woman-with-laptop-home.jpg` (12.3 MB raw) | Owned (local archive) | false (visually verified) | Generic calm-home-office background / "how it works" section | 196 KB | Customer-side telehealth concept. Compressed from 12.3 MB → 196 KB (1600w). |
| `lifestyle/owner-with-dog-laptop.jpg` | local: `cute-dog-with-owner-laptop.jpg` (7.5 MB raw) | Owned (local archive) | false (visually verified) | "How it works" section / homepage trust strip | 91 KB | Owner + dog + laptop combo. Compressed from 7.5 MB → 91 KB (1400w). |
| `lifestyle/senior-with-pet-home.jpg` | local: `old-man-is-playing-with-pet-while-working-sofa-home.jpg` (10.0 MB raw) | Owned (local archive) | false (visually verified) | "Who is this for" / inclusive demographic visual | 105 KB | Older adult with pet at home — broadens demographic representation. Compressed 10 MB → 105 KB. |
| `lifestyle/woman-with-dog-office.jpg` | local: `young-affectionate-woman-enjoying-with-her-dog-office.jpg` (9.4 MB raw) | Owned (local archive) | false (visually verified) | Lifestyle / homepage section background | 113 KB | Woman + dog at home/office. Compressed 9.4 MB → 113 KB. |
| `lifestyle/person-paperwork-with-dog.jpg` | local: `businessman-with-dog-doing-paperwork-desk-home.jpg` (7.2 MB raw) | Owned (local archive) | false (visually verified) | Forms / paperwork / "landlord docs" section | 173 KB | Person + paperwork + dog — fits ESA housing-letter-paperwork narrative. Compressed 7.2 MB → 173 KB. |
| `lifestyle/woman-laptop-clean.jpg` | local: `medium-shot-woman-working-with-laptop.jpg` (4.0 MB raw) | Owned (local archive) | false (visually verified) | Clean fallback / smaller card / generic telehealth | 91 KB | Plain neutral laptop shot. Compressed 4 MB → 91 KB (1200w). |

### `testimonials/` — Customer + pet trust visuals

| Filename | Source | License | is_ai_generated | Intended Placement | Size | Notes |
|---|---|---|---|---|---|---|
| `testimonials/home-together-with-pet.jpg` | local: `homegrown-happiness-our-home-together-photo.jpg` (2.5 MB raw) | Owned (local archive) | false (visually verified) | Testimonial card / "we keep families together" trust strip | 130 KB | Filename literally says "home together" — strong tagline-fit asset. Compressed 2.5 MB → 130 KB. |
| `testimonials/couple-with-dog-home.jpg` | local: `couple-with-dog-hugging.jpg` (1.2 MB raw) | Owned (local archive) | false (visually verified) | Testimonial card / trust strip | 103 KB | Couple + dog. Compressed 1.2 MB → 103 KB. |
| `testimonials/man-with-dog-home.jpg` | local: `front-view-man-working-while-holding-dog.jpg` (1.6 MB raw) | Owned (local archive) | false (visually verified) | Male-customer testimonial / demographic balance | 81 KB | Compressed 1.6 MB → 81 KB. |

### `states/` — State guide imagery for `TopStatesSection.tsx`

All Pexels stock under Pexels Free License (free for commercial, no attribution required, no AI-generated). Downloaded via Pexels CDN with `?auto=compress&cs=tinysrgb&w=1200` to pre-compress for web. Real photos — verified visually as residential / location-recognizable, not stylized illustrations or AI.

| Filename | Pexels ID | Photographer | License | is_ai_generated | Intended Placement | Size | Notes |
|---|---|---|---|---|---|---|---|
| `states/california.jpg` | 30151761 | myatezhny39 (Pexels) | Pexels Free | false | TopStatesSection — California card / `/esa-letter-california` page | 153 KB | Spanish-style homes + palm trees at sunset, Southern California feel. Strong CA visual cue. |
| `states/texas.jpg` | 18462221 | Introspective Design (Pexels) | Pexels Free | false | TopStatesSection — Texas card / `/esa-letter-texas` page | 124 KB | Suburban brick houses at dusk. Clean residential feel. |
| `states/florida.jpg` | 9533831 | damanory (Pexels) | Pexels Free | false | TopStatesSection — Florida card / `/esa-letter-florida` page | 378 KB | Lush palm-lined Florida street, summer sky. Canonical FL look. |
| `states/new-york.jpg` | 29419908 | Paulo Veloso (Pexels) | Pexels Free | false | TopStatesSection — New York card / `/esa-letter-new-york` page | 430 KB | Classic Brooklyn brownstone row, tree-lined NYC street. Matches NYC ESA housing context. |
| `states/north-carolina.jpg` | 5502221 | Curtis Adams (Pexels) | Pexels Free | false | TopStatesSection — North Carolina card / `/esa-letter-north-carolina` page | 263 KB | Brick house with well-maintained yard in Timberlake, NC. Residential trust feel. |
| `states/pennsylvania.jpg` | 9686093 | Ryan Hiebendahl (Pexels) | Pexels Free | false | TopStatesSection — Pennsylvania card / `/esa-letter-pennsylvania` page | 313 KB | Classic Philadelphia-style brick townhouses, tree-lined summer street. |
| `states/virginia.jpg` | 13005859 | Brian Magill (Pexels) | Pexels Free | false | TopStatesSection — Virginia card / `/esa-letter-virginia` page | 188 KB | Brick colonial residence in Williamsburg, VA. Distinctive VA architecture. |

### `backgrounds/` — Lifestyle, Trust, Hero

| Filename | Source | Author / Owner | License | is_ai_generated | Intended Placement | Notes |
|---|---|---|---|---|---|---|
| `backgrounds/telehealth-woman-doctor-videocall.jpg` (151 KB) | Freepik 29954988 | DC Studio | Free (Freemium) | false | Homepage hero / generic telehealth concept | Real photo (verified). Used as concept, NOT as named provider. |
| `backgrounds/telehealth-female-patient-doctor.jpg` (141 KB) | Freepik 419702245 | DC Studio | Free (Freemium) | false | Homepage hero alternate / lifestyle | Real photo (verified). Used as concept, NOT as named provider. |
| `backgrounds/pet-lifestyle.jpg` (1.1 MB) | local: `Random images for website/pet-scaled.jpg` | local-archive | Owned (local archive) | unknown — verify before use | Pet lifestyle / hero | **Large file — 1.1 MB.** Compress before production use. Manually verify it's a real photo (not AI). |
| `backgrounds/lifestyle-laibun.jpg` (296 KB) | local: `pexels-laibun-5488833-scaled.jpg` | Pexels (laibun) | Pexels Free License | false | Lifestyle / generic background | Pexels stock — license is Pexels Free (free for commercial). Verify content matches PawTenant brand before use. |
| `backgrounds/lifestyle-mikhail-nilov.jpg` (447 KB) | local: `pexels-mikhail-nilov-6980904-scaled.jpg` | Pexels (Mikhail Nilov) | Pexels Free License | false | Lifestyle / generic background | Pexels stock — verify content. |
| `backgrounds/lifestyle-unsplash-celine.jpg` (422 KB) | local: `celine-sayuri-tagami-2s6ORaJY6gI-unsplash.jpg` | Unsplash (Celine Sayuri Tagami) | Unsplash Free License | false (verify visually) | Lifestyle / hero | Unsplash stock — verify content matches PawTenant brand before use. |
| `backgrounds/lifestyle-freelancer-home-cat.jpg` (753 KB) | local: `high-angle-freelancer-woman-home-desk-with-cat.jpg` | local-archive (likely stock) | Owned (local archive) | unknown — verify before use | Customer-side lifestyle / freelancer home | Generic lifestyle (woman + cat at home). Use as concept, NOT as provider. |
| `backgrounds/lifestyle-pexels-anntarazevich.jpg` (856 KB) | local: `pexels-anntarazevich-5763583.jpg` | Pexels (Ann Tarazevich) | Pexels Free License | false (verify visually) | Lifestyle / generic | Pexels stock — verify content. |

---

## Rejected / Skipped (Reason)

| Source File | Reason |
|---|---|
| `Logo Final Files/Ai Master File.ai` | Adobe Illustrator source — not for web. Keep in archive only. |
| `Logo Final Files/Favicon-02.rar` | RAR archive — not a usable web asset. |
| `Logo Final Files/PDF.pdf` | PDF — not an image. Belongs to docs archive, not `assets/`. |
| `Logo Final Files/Ad Creatives batch 1/` (7 PNGs) | Ad creatives, not site logos. Belong in marketing folder, not `brand/`. |
| `Logo Final Files/Ad Creatives batch 2/` (6 PNGs) | Same as above. |
| `Random images/1.png`, `2.png`, `3.png` (1.5–2 MB each) | Unknown content — cannot evaluate without inspection. Hold for review. |
| `Random images/DOG-CERTIFICATION-1.png` through `DOG-CERTIFICATION-4.png` + `-2-1.png` (1.2–2 MB) | Multiple PNG variants of the same certification — kept the smallest JPG only. PNGs too large. |
| `Random images/Airline Pet & ESA Policy Guide 2026.jpg` (32 MB) | **Massive file** — needs major compression before web use. Pending optimization. |
| `Random images/Everything You Need to Know About Service Dogs.jpg` (9.8 MB) | Too large. Pending optimization. |
| `Random images/Housing Protection Support.jpg` (2.1 MB) | Borderline size. Pending optimization. |
| `Random images/How to Get a Psychiatric Service Dog Letter.jpg` (3.4 MB) | Too large. Pending optimization. |
| `Random images/Laws That Protect a College Student's ESA.jpg` (9.8 MB) | Too large. Pending optimization. |
| `Random images/Licensed Mental Health Professionals.jpg` (7.7 MB) | Too large. Pending optimization. |
| `Random images/Removing Barriers Between People & Their Support Animals.jpg` (11.9 MB) | Too large. Pending optimization. |
| `Random images/Simple Online Approval.jpg` (7.9 MB) | Too large. Pending optimization. |
| `Random images/We Help People & Their Pets Stay Together.jpg` (3.5 MB) | Too large. Pending optimization. |
| `Random images/What Is an Emotional Support Animal (ESA).jpg` (1.3 MB) | Borderline. Pending optimization. |
| `Random images/What is a PSD Letter.jpg` (5.5 MB) | Too large. Pending optimization. |
| `Random images/full-shot-couple-sitting-near-heater.jpg` (14 MB) | Massive — and contains people. Pending optimization + AI/realness verification. |

### Additional rejections from top-level `assets/` (round 3)

| Source File | Reason |
|---|---|
| `assets/Thumbnail Image.jpg.jpeg` (917 KB) | Apparent duplicate of `og.jpeg` (same size) — kept the cleaner-named copy as `og-default.jpg`. |
| `assets/60251850-...-_og.jpeg` (917 KB) | Apparent duplicate of `og.jpeg` — opaque hash filename, skipped. |
| `assets/Favicon-02.png` (3 KB) | Already imported in earlier round from `Logo Final Files/`. |
| `assets/JPEG-01.jpg`, `JPEG-02.jpg`, `PNG - Black/White 01/02.png` | All already imported in earlier round. |
| `assets/Lytara/Robert/Stephanie *Headshot.jpg` | Already imported in earlier round. |
| `assets/DOG-CERTIFICATION.jpg`, `pet-ESA-Letter-scaled.jpg`, `pet-scaled.jpg`, `pexels-laibun-...`, `pexels-mikhail-nilov-...` | All already imported in earlier round. |
| `assets/adult-woman-holding-her-best-friend.jpg` (9.1 MB) | Too large. Pending compression. |
| ~~`assets/attractive-young-female-freelancer-working-laptop-from-her-home-having-her-pet-dog-her-lap-keep-her-company.jpg`~~ | **Imported (round 4)** → `lifestyle/freelancer-with-dog-laptop.jpg` (159 KB after compression). |
| ~~`assets/attractive-young-woman-designer-working-from-home-having-meeting-online-pet-dog-is-with-her.jpg`~~ | **Imported (round 4)** → `lifestyle/woman-telehealth-with-dog.jpg` (141 KB). |
| ~~`assets/businessman-with-dog-doing-paperwork-desk-home.jpg`~~ | **Imported (round 4)** → `lifestyle/person-paperwork-with-dog.jpg` (173 KB). |
| `assets/close-up-beautiful-cat-with-owner.jpg` (17.9 MB) | Massive. Pending compression. |
| `assets/close-up-woman-hugging-her-pet-dog.jpg` + `(1).jpg` (26 MB each) | Massive. Pending compression. |
| ~~`assets/couple-with-dog-hugging.jpg`~~ | **Imported (round 4)** → `testimonials/couple-with-dog-home.jpg` (103 KB). |
| ~~`assets/cute-dog-with-owner-laptop.jpg`~~ | **Imported (round 4)** → `lifestyle/owner-with-dog-laptop.jpg` (91 KB). |
| `assets/elderly-person-spendng-tim-with-their-pets.jpg` (14.7 MB) | Massive. Pending compression. |
| `assets/four-legged-friend-young-adult-...-fine-day.jpg` (13.7 MB) | Massive. Pending compression. |
| ~~`assets/front-view-man-working-while-holding-dog.jpg`~~ | **Imported (round 4)** → `testimonials/man-with-dog-home.jpg` (81 KB). |
| ~~`assets/front-view-woman-with-laptop-home.jpg`~~ | **Imported (round 4)** → `lifestyle/woman-laptop-home.jpg` (196 KB). |
| `assets/full-shot-couple-petting-dog-outdoors.jpg` (2.3 MB) | Borderline. Held. |
| `assets/full-shot-couple-with-dog.jpg` (2.2 MB) | Borderline. Held. |
| `assets/girl-with-dog.jpg` (3.4 MB) | Too large. Pending. |
| `assets/handsome-man-charming-puppy-close-up.jpg` (6.5 MB) | Too large. |
| ~~`assets/homegrown-happiness-our-home-together-photo.jpg`~~ | **Imported (round 4)** → `testimonials/home-together-with-pet.jpg` (130 KB). |
| `assets/hovawart-golden-puppy-young-boy-playing-with-his-puppy-home.jpg` (25 MB) | Massive. |
| `assets/jay-wennington-CdK2eYhWfQ0-unsplash.jpg` (4 MB) | Too large. |
| `assets/lady-pink-coat-walks-with-puppy-...` (7.8 MB) | Too large. |
| `assets/little-child-walking-with-dog-garden-happy-childhood.jpg` (9.2 MB) | Too large. |
| `assets/medium-shot-pregnant-woman-with-cute-dog.jpg` (2.2 MB) | Borderline. |
| `assets/medium-shot-woman-holding-dog.jpg` + `(1).jpg` (1.6 MB each, duplicates) | Borderline + duplicate. |
| `assets/medium-shot-woman-looking-dog.jpg` (1.3 MB) | Borderline. |
| `assets/medium-shot-woman-working-with-cute-dog.jpg` (1.4 MB) | Borderline. |
| ~~`assets/medium-shot-woman-working-with-laptop.jpg`~~ | **Imported (round 4)** → `lifestyle/woman-laptop-clean.jpg` (91 KB). |
| ~~`assets/old-man-is-playing-with-pet-while-working-sofa-home.jpg`~~ | **Imported (round 4)** → `lifestyle/senior-with-pet-home.jpg` (105 KB). |
| `assets/outdoor-portrait-curly-european-tanned-woman-holds-happy-pet-dog-pomeranian-spitz.jpg` (8.2 MB) | Too large. |
| `assets/pexels-ayyeee-...-36802161.jpg` (2.6 MB) | Borderline. |
| `assets/pexels-mohit-chanderh-...-18109070.jpg` (1.25 MB) | Borderline. Held. |
| `assets/pexels-rednguyen-17502410.jpg` (1.36 MB) | Borderline. Held. |
| `assets/portrait-happy-young-man-...-petfriendly-cafe.jpg` (6.2 MB) | Too large. |
| `assets/richard-brutyo-...-unsplash.jpg` (2.4 MB) | Borderline. |
| `assets/smiley-woman-dog-with-tablet.jpg` (1.7 MB) | Borderline. Held. |
| `assets/vertical-cropped-picture-male-hands-typing-...-puppy.jpg` (6.3 MB) | Too large. |
| ~~`assets/woman-with-dog-relocating-new-apartment.jpg`~~ | **Imported (round 4)** → `lifestyle/woman-with-dog-new-apartment.jpg` (156 KB). High-value housing-themed asset. |
| `assets/woman-with-her-cute-dog-street.jpg` (4.4 MB) | Too large. |
| ~~`assets/young-affectionate-woman-enjoying-with-her-dog-office.jpg`~~ | **Imported (round 4)** → `lifestyle/woman-with-dog-office.jpg` (113 KB). |

---

## Rejected — Freepik state-image search (round 4, 2026-05-05)

All 7 state searches against Freepik returned **only Premium-licensed assets**. Cannot download without active Premium subscription (HTTP 403). Documented here in case Premium becomes active later — these were the strongest matches, but **Pexels alternatives were used instead** (see `states/` table above).

| Freepik ID | State | Title | License | Reason Skipped |
|---|---|---|---|---|
| 357010506 | CA | Aerial suburban neighborhood w/ red-tile roofs + palm trees | Premium | Premium-only. |
| 238468943 | TX | Aerial suburban neighborhood Dallas | Premium | Premium-only. |
| 250541731 | FL | Coral Gables Miami palm street sunrise | Premium | Premium-only + 20 MB raw size. |
| 255645998 | NY | Brooklyn Heights brownstone | Premium | Premium-only. |
| n/a | NC | (search returned irrelevant results — Plovdiv, Fort Wayne) | n/a | No good NC match in Freepik. |
| n/a | PA | (search returned non-US — Luneburg, Bremen, Haarlem) | n/a | No good PA match in Freepik. |
| 41658696 | VA | Williamsburg historical houses | Premium | Premium-only. |

---

## Pending Freepik Premium Downloads

These approved IDs failed because the Freepik account is not on a Premium subscription. Re-run download once Premium is active.

| Source ID | Author | Intended Placement | Reason Failed |
|---|---|---|---|
| 269960487 | Yuri Arcurs Collection | Hero — female doctor laptop video call | HTTP 403: Premium required |
| 34604157 | Anna Tolipova | Trust block — online consultation psychologist | HTTP 403: Premium required |
| 13694383 | patty-photo | Trust strip — doctor video conf elderly | HTTP 403: Premium required |
| 155721209 | vh-studio | How-it-works — young female online therapy session | HTTP 403: Premium required |
| 58417835 | seventyfour | Provider concept (face hidden) — psychologist making notes | HTTP 403: Premium required |
| 81613534 | insta_photos | Diversity / hero — Indian female doctor telemedicine | HTTP 403: Premium required |
| 321763079 | sodawhiskey | Lifestyle — senior couple online consultation | HTTP 403: Premium required |

---

## Hard Rules (reaffirming `public/assets/README.md`)

- ✅ Provider photos in `providers/` are **real provider-supplied headshots** — caption with the actual provider's name.
- ⛔ NEVER use Freepik / stock / AI faces as named provider photos. Use only the 4 provider-supplied photos above OR initials fallback.
- ⛔ NEVER caption stock photos with provider names or imply the person is a real PawTenant provider.
- ✅ Stock/Freepik photos used only as: hero background, trust strip, generic telehealth concept, customer-side lifestyle.
- ✅ Files served from local `/assets/...` path (no external CDN dependency).
- ✅ All Freepik photos verified `is_ai_generated: false` via detail endpoint.

---

## Optimization notes

- Provider headshots: **15–29 KB each** — already optimized.
- Brand logos: PNG transparent variants under 250 KB, JPGs ~600 KB (consider downscaling for web hero / OG).
- Documents (`esa-letter-sample.jpg` 875 KB, `dog-certification-sample.jpg` 184 KB) — both under 1 MB.
- Backgrounds: telehealth (~145 KB) and pexels (~300–450 KB) are within target. `pet-lifestyle.jpg` at 1.1 MB is borderline — compress before launch.
- WebP conversion deferred (sandbox blocked) — `.claude/scratch/convert_webp.py` script available for later batch run.
- All large/oversize source files listed in **Rejected/Skipped** are pending compression — do not commit raw multi-MB JPGs.

---

## Update log

- `2026-05-05 (1)` — Initial manifest. Added 2 free Freepik assets (29954988, 419702245) to `backgrounds/`. 7 Premium-gated IDs queued pending subscription.
- `2026-05-05 (2)` — Added local archive imports: 4 provider headshots → `providers/`, 8 logo files → `brand/`, 2 documents → `documents/`, 3 lifestyle backgrounds → `backgrounds/`. 19 source files rejected (too large / wrong format / not vetted). Total new files: 17.
- `2026-05-05 (3)` — Inspected top-level `Downloads/assets/`. Added 8 NEW files: 1 OG image → `brand/`, 3 documents → `documents/` (SVG + portrait PNG + form sample), 1 verification mockup → `ui/` (new folder), 3 lifestyle backgrounds → `backgrounds/` (Unsplash, freelancer+cat, Pexels Tarazevich). 30+ files rejected (large pending compression / duplicates of prior imports / unknown content).
- `2026-05-05 (4)` — State imagery batch. Added 7 Pexels state images → `states/` (new folder) for `TopStatesSection.tsx`: california, texas, florida, new-york, north-carolina, pennsylvania, virginia. All under 500 KB after `w=1200` Pexels resize. Freepik abandoned this round — every search result returned only Premium-licensed assets (account not on Premium). No code/UI/backend touched.
- `2026-05-05 (5)` — **Lifestyle + testimonial compression batch (Google Ads + homepage prep).** Compressed 12 oversized local archive originals (4–24 MB raw) using Pillow (1200–1600px wide, JPEG q80, progressive + optimized). Added 9 → `lifestyle/` (new folder) and 3 → `testimonials/` (new folder). All compressed outputs are 81–196 KB (1–8% of source size). Source files marked as imported in their original "Rejected" rows. Compression script: `.claude/tmp/compress_round4.py`. **Best Google Ads hero:** `lifestyle/woman-telehealth-with-dog.jpg`. **Best housing/move-in hero:** `lifestyle/woman-with-dog-new-apartment.jpg`. No code/UI/backend touched.
- `2026-05-09 (Phase 3)` — **Breed + college library.** Created `breeds/` (6 freemium Freepik portraits: labrador-retriever, golden-retriever, german-shepherd, poodle, border-collie, bernese-mountain-dog at 76–200 KB) and `colleges/` (1 freemium Freepik: college-student-bed-dog 76 KB). Bernese is a closest-fit fallback — authentic Bernese only available on Freepik Premium. Compression scripts at `.claude/tmp/phase3/`.
- `2026-05-09 (Phase 4)` — **Blog mock theme re-mapping.** No new assets — re-mapped 15 blog post `image:` fields across `blogPosts.ts` and `blogPostsExtended.ts` for theme fit (college posts → `colleges/`, state law posts → `states/`, PSD state guides → `breeds/`, removed 3 duplicate uses of `owner-laptop-cuddle.jpg`). Freepik MCP rate-limited — no new downloads.
- `2026-05-09 (Phase 5)` — **Asset infrastructure expansion (8 new categories).** Created `travel/`, `service-dogs/`, `therapists/`, `veterans/`, `housing/`, `psd/` folders + expanded `colleges/` and `breeds/`. Compressed 19 local archive originals (1.2–24 MB raw) → 68–202 KB outputs at 1300px width JPEG q78. Each folder has a README.md documenting contents, cross-references to existing assets in other folders, and remaining gaps (need future Freepik freemium downloads when MCP quota resets). No code/UI/backend touched. Compression script: `.claude/tmp/phase5/import_archive.py`.

### Phase 5 detail — newly imported by category

**`travel/`** (3): petfriendly-cafe, dog-walk-street, walk-with-puppy-city  
**`service-dogs/`** (2): handler-working-with-dog, calm-attentive-dog  
**`therapists/`** (2): calm-counseling-look, clinician-tablet-with-pet  
**`veterans/`** (3): senior-with-pets, man-on-porch-with-dog, man-with-puppy-portrait  
**`housing/`** (3): family-with-dog-home, home-together, hands-typing-paperwork  
**`colleges/`** +2: student-portrait-with-dog, student-holding-dog (now 3 total)  
**`breeds/`** +3: golden-puppy-with-owner, pomeranian-with-owner, cat-with-owner (now 9 total)  
**`psd/`** (1): man-working-holding-dog

**Total Phase 5 imports**: 19 files, ~2.4 MB on disk. Sources: all from `Downloads/assets/` local archive (Freepik / Unsplash / Pexels-licensed images already on disk).
