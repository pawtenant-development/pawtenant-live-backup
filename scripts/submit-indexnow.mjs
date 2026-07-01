// scripts/submit-indexnow.mjs
//
// IndexNow URL submitter for PawTenant.
//
// Submits a SMALL, EXPLICIT list of changed URLs (added / updated / deleted)
// to the IndexNow API so Bing and participating engines can discover them
// quickly after a deploy. It is NOT a sitemap crawler and will NOT auto-submit
// the whole site. Pass only the URLs you actually changed.
//
// Usage:
//   node scripts/submit-indexnow.mjs [--dry-run] <url> [<url> ...]
//   npm run indexnow -- /blog/example /esa-letter/california
//   npm run indexnow -- --dry-run https://pawtenant.com/full-url
//
// URLs may be relative ("/blog/example") or absolute
// ("https://pawtenant.com/blog/example"). Relative paths are resolved against
// the canonical host. External hosts are rejected. Hashes are stripped and
// duplicates removed.
//
// No dependencies — uses native Node fetch (Node 18+). Never runs during build.

// ── Canonical config ─────────────────────────────────────────────────────────
const HOST = "pawtenant.com";
const CANONICAL_ORIGIN = `https://${HOST}`;
const KEY = "ce66e575dc225ae46de73e6a8954171a";
const KEY_LOCATION = `${CANONICAL_ORIGIN}/${KEY}.txt`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

// ── Parse args ───────────────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2);
const dryRun = rawArgs.includes("--dry-run");
const urlArgs = rawArgs.filter((a) => a !== "--dry-run");

function usage(message) {
  if (message) console.error(`\n  ✗ ${message}`);
  console.error(
    [
      "",
      "  IndexNow submitter — submit changed URLs to Bing / IndexNow.",
      "",
      "  Usage:",
      "    node scripts/submit-indexnow.mjs [--dry-run] <url> [<url> ...]",
      "    npm run indexnow -- /blog/example /esa-letter/california",
      "    npm run indexnow -- --dry-run https://pawtenant.com/full-url",
      "",
      "  Notes:",
      "    • Pass only ADDED / UPDATED / DELETED URLs — not the whole sitemap.",
      "    • Relative paths are resolved against " + CANONICAL_ORIGIN + ".",
      "    • External hosts are rejected. www is forced to non-www.",
      "    • --dry-run prints the payload without submitting.",
      "",
    ].join("\n"),
  );
}

// ── Normalize one URL ────────────────────────────────────────────────────────
// Returns a canonical absolute URL string, or throws on an invalid / external URL.
function normalizeUrl(input) {
  const trimmed = String(input).trim();
  if (!trimmed) throw new Error("empty URL");

  let parsed;
  if (trimmed.startsWith("/")) {
    // Relative path → resolve against canonical origin.
    parsed = new URL(trimmed, CANONICAL_ORIGIN);
  } else if (/^https?:\/\//i.test(trimmed)) {
    parsed = new URL(trimmed);
  } else {
    // Bare path like "blog/example" — treat as site-relative.
    parsed = new URL("/" + trimmed.replace(/^\/+/, ""), CANONICAL_ORIGIN);
  }

  // Force https + canonical non-www host. Reject any other host.
  const host = parsed.hostname.toLowerCase();
  const normalizedHost = host.replace(/^www\./, "");
  if (normalizedHost !== HOST) {
    throw new Error(`external host not allowed: ${parsed.hostname}`);
  }
  parsed.protocol = "https:";
  parsed.hostname = HOST;
  parsed.hash = ""; // strip hash fragments

  return parsed.toString();
}

// ── Build the deduped, validated URL list ────────────────────────────────────
const seen = new Set();
const urlList = [];
const rejected = [];

for (const arg of urlArgs) {
  try {
    const url = normalizeUrl(arg);
    if (!seen.has(url)) {
      seen.add(url);
      urlList.push(url);
    }
  } catch (err) {
    rejected.push({ input: arg, reason: err.message });
  }
}

// Rejected external / invalid URLs are a hard failure — surface and exit.
if (rejected.length > 0) {
  usage("Some URLs were rejected:");
  for (const r of rejected) {
    console.error(`    • ${r.input} — ${r.reason}`);
  }
  process.exit(1);
}

if (urlList.length === 0) {
  usage("No URLs provided.");
  process.exit(1);
}

// ── Build payload ────────────────────────────────────────────────────────────
const payload = {
  host: HOST,
  key: KEY,
  keyLocation: KEY_LOCATION,
  urlList,
};

console.log(`\n  IndexNow — ${urlList.length} URL(s) to submit:`);
for (const url of urlList) console.log(`    • ${url}`);
console.log(`  Endpoint:    ${ENDPOINT}`);
console.log(`  keyLocation: ${KEY_LOCATION}`);

if (dryRun) {
  console.log("\n  [dry-run] Payload (not submitted):");
  console.log(JSON.stringify(payload, null, 2));
  console.log("");
  process.exit(0);
}

// ── Submit ───────────────────────────────────────────────────────────────────
try {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => "");
  console.log(`\n  HTTP ${res.status} ${res.statusText}`);
  if (text) console.log(`  Response: ${text}`);

  // IndexNow returns 200 or 202 on success.
  if (res.status === 200 || res.status === 202) {
    console.log(`  ✓ Submitted ${urlList.length} URL(s).\n`);
    process.exit(0);
  } else {
    console.error(`  ✗ Unexpected status — treating as failure.\n`);
    process.exit(1);
  }
} catch (err) {
  console.error(`\n  ✗ Request failed: ${err.message}\n`);
  process.exit(1);
}
