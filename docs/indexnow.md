# IndexNow — fast URL submission for Bing & partners

## What it does

IndexNow is a simple ping protocol. When you add, update, or delete a page, you
tell participating search engines (Bing, Yandex, Seznam, Naver, and others) the
exact URL that changed. They then crawl it sooner instead of waiting to
rediscover it on their own schedule.

**It does NOT guarantee indexing or ranking.** It only speeds up *discovery* of
changed URLs for the engines that support it. Google does not currently consume
IndexNow.

## How it works here

- **Canonical host:** `https://pawtenant.com` (non-www only).
- **Key:** `ce66e575dc225ae46de73e6a8954171a`
- **Key file (must stay public):** `public/ce66e575dc225ae46de73e6a8954171a.txt`
  → served at `https://pawtenant.com/ce66e575dc225ae46de73e6a8954171a.txt`.
  The file body is exactly the key, nothing else. This is how IndexNow verifies
  we own the domain — it is meant to be public, so it is safe to commit.
- **Submitter script:** `scripts/submit-indexnow.mjs` (native Node fetch, no
  dependencies). Run via `npm run indexnow`.
- **Endpoint:** `https://api.indexnow.org/indexnow`

## Rules — use it sparingly and correctly

- Submit **only** URLs that were **added, updated, or deleted**.
- Do **NOT** submit the whole sitemap.
- Do **NOT** re-submit old, unchanged URLs.
- The script never runs during `build` — submission is always a manual step
  after a deploy.
- Relative paths are resolved to `https://pawtenant.com/...`; `www` is forced to
  non-www; external hosts are rejected; hashes are stripped; duplicates removed.

## Usage

Relative paths or full URLs both work:

```bash
# Dry-run — prints the payload, submits nothing (safe anywhere, incl. TEST)
npm run indexnow -- --dry-run /blog/example /esa-letter/california

# Real submission — only from a machine deploying canonical production URLs
npm run indexnow -- /blog/example /esa-letter/california
npm run indexnow -- https://pawtenant.com/esa-letter-for-apartments
```

The script prints: the URL count, each URL submitted, the HTTP status, and any
response body. It exits non-zero on rejected URLs or a non-200/202 response.

## Typical workflow after a deploy

1. Deploy the changed pages to production so the URLs are live.
2. Collect the URLs you changed (added / updated / deleted).
3. Dry-run first to sanity-check the payload:
   ```bash
   npm run indexnow -- --dry-run /new-page /updated-page
   ```
4. Submit for real:
   ```bash
   npm run indexnow -- /new-page /updated-page
   ```

> Only submit real URLs that are already live on `https://pawtenant.com`.
> On TEST, prefer `--dry-run` only.

## Verify the key file

After a deploy, confirm the key file is reachable and correct:

```bash
curl https://pawtenant.com/ce66e575dc225ae46de73e6a8954171a.txt
# → ce66e575dc225ae46de73e6a8954171a
```

It must return HTTP 200 with a body equal to the key. If it 404s, IndexNow
submissions will be ignored.

## Check Bing Webmaster Tools

1. Sign in to [Bing Webmaster Tools](https://www.bing.com/webmasters).
2. Add / select the `pawtenant.com` property.
3. Open **IndexNow** in the left nav to see submitted URLs and their status.
4. Bing auto-verifies ownership via the hosted key file — no extra step needed
   once the key file returns 200.
