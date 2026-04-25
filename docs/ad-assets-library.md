# PawTenant Ad Assets Library

Permanent home for marketing/ad creative used by HeyGen, Claude, Meta Ads, TikTok Ads, and future creative workflows.

---

## Bucket

| Field        | Value                                          |
|--------------|------------------------------------------------|
| Project      | `pawtenant-live-supabase` (LIVE)               |
| Project ref  | `cvwbozlbbmrjxznknouq`                         |
| Bucket name  | `ad-assets`                                    |
| Public?      | Yes — anyone with the URL can view             |
| Max file     | 500 MB                                         |
| Allowed MIME | jpeg, png, webp, gif, svg, mp4, mov, webm, avi |

---

## ⚠️ Safety — read before uploading

This bucket is **PUBLIC**. Anyone on the internet who has a URL can view the file. Assume every file you put here is permanently public.

**NEVER upload to `ad-assets`:**

- Real customer names, emails, phone numbers, addresses
- Real pet records, intake forms, vet documents
- Real landlord verification certificates
- Real PHI (protected health info) of any kind
- Order PDFs, invoices, receipts
- Government IDs, driver's licenses, passports
- Provider personal info, credentials, signed docs
- Stripe payouts, financial reports
- Anything from the `customer-uploads`, `provider-docs`, `order-pdfs` (or similar private) buckets

If unsure → **do not upload**. Use the existing private buckets instead.

This bucket is for marketing creative ONLY: stock-style imagery, paid actors, demo screen recordings, brand graphics, and HeyGen/AI-generated assets.

---

## Folder structure

Supabase Storage folders are virtual — they appear once a file is uploaded with that path prefix. No setup needed; just upload to the path.

```
ad-assets/
├── avatars/          # HeyGen/AI-generated talking head avatars + reference photos
├── dogs-pets/        # Stock pet imagery, B-roll of dogs/cats for ads
├── assessment-ui/    # Screen recordings/screenshots of the assessment flow
├── verification/     # Marketing visuals of the landlord verification certificate (sample/dummy data only)
├── provider-clips/   # Stock or paid-actor clips of "providers" / "vets" / clinicians
├── documents/        # Branded sample documents, mock certificates (no real customer data)
├── backgrounds/      # Background plates, textures, gradients for video editing
├── logos-brand/      # PawTenant logos, wordmarks, brand kit assets
└── raw-uploads/      # Staging area for raw footage before sorting into proper folder
```

| Folder            | What goes in                                                                |
|-------------------|------------------------------------------------------------------------------|
| `avatars/`        | HeyGen avatars, AI talking heads, source reference photos for avatar gen     |
| `dogs-pets/`      | Stock + paid pet footage and stills for ads                                  |
| `assessment-ui/`  | Demo/marketing screen captures of the assessment product (no real PII)       |
| `verification/`   | Mock certificate visuals, marketing renderings of the verification result    |
| `provider-clips/` | Paid-actor or stock "provider/vet" footage                                   |
| `documents/`      | Branded mock paperwork (rental ad, application form) — never real docs       |
| `backgrounds/`    | Reusable background plates, textures, gradients, color washes                |
| `logos-brand/`    | Logos (svg/png), wordmarks, brand kit assets                                 |
| `raw-uploads/`    | Untriaged drops; move into the proper folder once reviewed                   |

---

## Naming convention

- **lowercase** only
- **hyphens** between words (no spaces, no underscores)
- include **purpose** and **date** (`YYYY-MM`) when useful
- end with a clear **extension** (`.mp4`, `.png`, `.webp`, etc.)
- if multiple takes, suffix with `-01`, `-02`

**Good:**

```
avatars/heygen-female-host-friendly-2026-04.mp4
dogs-pets/golden-retriever-happy-01.mp4
assessment-ui/assessment-question-screen-2026-04.mp4
verification/landlord-verification-valid-result.png
provider-clips/provider-typing-laptop-01.mp4
logos-brand/pawtenant-wordmark-dark.svg
backgrounds/calm-blue-gradient-1080x1920.png
```

**Bad:**

```
IMG_4421.MOV
Final FINAL v3 (use this one).mp4
my upload.png
```

---

## How to upload

**Option A — Supabase Dashboard (easiest)**

1. Open the [Supabase project](https://supabase.com/dashboard/project/cvwbozlbbmrjxznknouq).
2. Storage → `ad-assets`.
3. Click into the right folder (or type the folder name to create it on first upload).
4. Drag & drop the file. Rename to follow the naming convention above before uploading.

**Option B — Supabase CLI**

```bash
supabase storage cp ./local-file.mp4 \
  ss:///ad-assets/avatars/heygen-female-host-friendly-2026-04.mp4 \
  --project-ref cvwbozlbbmrjxznknouq
```

---

## How to get the public URL

Public URL pattern:

```
https://cvwbozlbbmrjxznknouq.supabase.co/storage/v1/object/public/ad-assets/<folder>/<filename>
```

**Example:**

```
https://cvwbozlbbmrjxznknouq.supabase.co/storage/v1/object/public/ad-assets/dogs-pets/golden-retriever-happy-01.mp4
```

In the Supabase Dashboard, right-click any file → **Copy URL** → "Get a public URL".

After uploading anything new, paste the URL into [`ad-assets-manifest.md`](./ad-assets-manifest.md) so the team can find it.

---

## Permissions

- **Read:** public (anyone, no auth)
- **Write/update/delete:** authenticated users only (admins via Supabase dashboard)

No RLS gating beyond that — this is intentional. It is marketing creative, not customer data.

---

## Example HeyGen prompt using a Supabase asset URL

```
Create a 30-second vertical (9:16) HeyGen video.

Avatar: female friendly host, neutral background.
Voice: warm, calm, professional — US English.

Script:
"Renting with a pet just got easier.
PawTenant verifies your pet's behavior, vaccinations, and rental
readiness — so landlords can say yes with confidence.
Get your PawTenant Pet Profile in minutes."

Background visuals (B-roll, intercut every 3-5 seconds):
1. https://cvwbozlbbmrjxznknouq.supabase.co/storage/v1/object/public/ad-assets/dogs-pets/golden-retriever-happy-01.mp4
2. https://cvwbozlbbmrjxznknouq.supabase.co/storage/v1/object/public/ad-assets/assessment-ui/assessment-question-screen-2026-04.mp4
3. https://cvwbozlbbmrjxznknouq.supabase.co/storage/v1/object/public/ad-assets/verification/landlord-verification-valid-result.png

Logo overlay (bottom-right, last 3 seconds):
https://cvwbozlbbmrjxznknouq.supabase.co/storage/v1/object/public/ad-assets/logos-brand/pawtenant-wordmark-dark.svg

End card: "Verified pets. Happy landlords. PawTenant.com"
```

---

## Related docs

- [`ad-assets-manifest.md`](./ad-assets-manifest.md) — running list of every uploaded asset and its public URL.
