// scripts/check-secure-resume-credential.mjs
//
// ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001 — deploy-blocking guard.
//
// ROOT CAUSE THIS GUARD PINS: a confirmation id (`PT-XXXX`) is a DISPLAY
// REFERENCE. It is printed in emails and SMS, carried in URLs, captured by
// analytics and referrers, quoted in support threads and retained by mail
// providers. It was nevertheless the only thing standing between an anonymous
// caller and `first_name, last_name, email, phone, price, letter_type,
// checkout_session_id` and the full `assessment_answers` — the customer's
// mental-health intake.
//
// The fix replaces it with an expiring, single-use, order-bound,
// purpose-bound, environment-bound credential stored only as sha256(raw).
// This guard exists so no future change can quietly walk any of that back.
//
//   S1  no raw-token column exists; the digest column is CHECK-constrained to 64.
//   S2  only a digest ever reaches the database — the issuer hashes before RPC.
//   S3  tokens come from a CSPRNG; Math.random is never used to mint one.
//   S4  at least 256 bits of entropy per token.
//   S5  expiry is mandatory at issue AND re-checked on consume.
//   S6  environment binding exists and is re-checked on consume.
//   S7  purpose binding exists and is re-checked on consume.
//   S8  order binding exists and a token resolves only to its own order.
//   S9  consume is ATOMIC — one UPDATE guarded by `used_at is null`.
//   S10 consume refuses revoked tokens and non-resumable orders.
//   S11 the token table is unreachable by anon/authenticated (RLS + named revokes).
//   S12 every security-definer function in this system pins search_path.
//   S13 a raw token is never logged.
//   S14 a raw token / resume URL is never written to audit_logs.
//   S15 a raw token is never placed in localStorage or sessionStorage.
//   S16 both assessment pages scrub `?rt=` from the URL BEFORE the exchange await.
//   S17 no producer builds `?resume=<confirmationId>` as an access link.
//   S18 every server-side producer routes through the ONE canonical builder.
//   S19 the PSD flow is migrated to `?rt=`.
//   S20 the ESA flow is migrated to `?rt=`.
//   S21 the admin flow mints server-side; the browser never builds a resume link.
//   S22 the /r/ bridge carries a token and leaks no order reference.
//   S23 rate limiting is present on exchange, request-new-link and issuance.
//   S24 the public payment-status six-field allowlist still holds.
//   S25 forged client paid-state is still inert.
//   S26 no LIVE project reference, and no frozen mega-file is claimed here.
//   S27 attribution capture strips credential params from landing_url / referrer.
//   S28 the address bar is scrubbed PRE-BOOT, before any tag can read it.
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-secure-resume-credential.mjs             → guard (exit 1 on fail)
//   node scripts/check-secure-resume-credential.mjs --warn-only → audit (exit 0)
//   node scripts/check-secure-resume-credential.mjs --self-test → prove controls trip

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const F = {
  migration:    "supabase/migrations/20260801170000_order_resume_secure_tokens.sql",
  rateMigration:"supabase/migrations/20260801190000_resume_credential_rate_limits.sql",
  issuer:       "supabase/functions/issue-resume-token/index.ts",
  exchanger:    "supabase/functions/exchange-resume-token/index.ts",
  linkBuilder:  "supabase/functions/_shared/resumeLink.ts",
  rateLimiter:  "supabase/functions/_shared/rateLimit.ts",
  adminIssue:   "supabase/functions/issue-resume-link/index.ts",
  recovery:     "supabase/functions/send-checkout-recovery/index.ts",
  drip:         "supabase/functions/lead-followup-sequence/core.ts",
  newEsaLink:   "supabase/functions/send-new-esa-order-link/index.ts",
  templated:    "supabase/functions/send-templated-email/index.ts",
  broadcast:    "supabase/functions/broadcast-email/index.ts",
  sms:          "supabase/functions/ghl-send-sms/index.ts",
  resumeRead:   "supabase/functions/get-resume-order/index.ts",
  reconciler:   "supabase/functions/check-payment-status/index.ts",
  esaPage:      "src/pages/assessment/page.tsx",
  psdPage:      "src/pages/psd-assessment/page.tsx",
  bridge:       "src/pages/r/page.tsx",
  commsTab:     "src/pages/admin-orders/components/CommunicationTab.tsx",
  leadActions:  "src/pages/admin-orders/components/LeadActionsModal.tsx",
  bookingLib:   "src/lib/bookingProgress.ts",
  attribution:  "src/lib/attributionStore.ts",
  indexHtml:    "index.html",
  tokenParam:   "src/lib/resumeTokenParam.ts",
  frozenModal:  "src/pages/admin-orders/components/OrderDetailModal.tsx",
  frozenAnalytics: "src/pages/admin-orders/components/AnalyticsTab.tsx",
};

/**
 * Producers that legitimately exist in one repo but not the other.
 * `send-new-esa-order-link` is TEST-only — it was never deployed to LIVE.
 *
 * An optional file that is ABSENT reads as null and its producer assertions are
 * skipped. An optional file that is PRESENT is held to exactly the same standard
 * as every other producer, so this can never be used to hide an unmigrated one.
 */
const OPTIONAL = new Set(["newEsaLink"]);

function read(key, override) {
  if (override && override[key] !== undefined) return override[key];
  const abs = resolve(ROOT, F[key]);
  if (!existsSync(abs)) {
    if (OPTIONAL.has(key)) return null;
    throw new Error(`missing required file: ${F[key]}`);
  }
  // Normalize CRLF. The repo is checked out with autocrlf=true, so a guard that
  // matched raw bytes would behave differently on Windows and Linux — and the
  // planted negative controls (which anchor on "\n") would silently no-op.
  return readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
}

/** Strip comments so prose can never satisfy a code assertion. This guard's
 *  whole job is to read CODE, not the intent described around it. */
function code(src) {
  if (src === null) return "";
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** SQL comment stripper (`--` line comments). */
function sql(src) {
  if (src === null) return "";
  return src.replace(/^\s*--.*$/gm, "");
}

/** The body of a named SQL function, for scoping assertions to it. */
function sqlFn(src, name) {
  const c = sql(src);
  const i = c.indexOf(`function public.${name}`);
  if (i < 0) return "";
  const end = c.indexOf("$$;", i);
  return end > i ? c.slice(i, end) : c.slice(i);
}

/** The token-exchange effect of an assessment page. */
function resumeEffect(src) {
  const c = code(src);
  const i = c.indexOf("exchange-resume-token");
  if (i < 0) return "";
  // Walk back to the start of the enclosing fetchLead, then forward past it.
  const start = Math.max(0, c.lastIndexOf("const fetchLead", i));
  return c.slice(start, i + 2000);
}

const CHECKS = [
  ["S1", "no raw-token column; the digest column is CHECK-constrained to 64 chars", (s) => {
    const c = sql(s.migration);
    const hasDigest = /token_hash\s+text\s+not null/i.test(c);
    const lenPinned = /char_length\(token_hash\)\s*=\s*64/i.test(c);
    // Any column that would hold a token in the clear.
    const rawCol = /\b(token|raw_token|token_plain|token_value|secret)\s+text\b/i.test(c);
    return hasDigest && lenPinned && !rawCol;
  }],

  ["S2", "only a digest ever reaches the database — the issuer hashes before the RPC", (s) => {
    const c = code(s.issuer);
    const hashes = /sha256Hex\(\s*rawToken\s*\)/.test(c);
    const sendsDigest = /p_token_hash:\s*tokenHash/.test(c);
    const sendsRaw = /p_token_hash:\s*rawToken/.test(c);
    return hashes && sendsDigest && !sendsRaw;
  }],

  ["S3", "tokens come from a CSPRNG; Math.random never mints one", (s) => {
    const c = code(s.issuer);
    return /crypto\.getRandomValues\(/.test(c) && !/Math\.random/.test(c);
  }],

  ["S4", "at least 256 bits of entropy per token", (s) => {
    const c = code(s.issuer);
    const m = c.match(/new Uint8Array\((\d+)\)/);
    return !!m && Number(m[1]) >= 32;
  }],

  ["S5", "expiry is mandatory at issue and re-checked on consume", (s) => {
    const c = sql(s.migration);
    const col = /expires_at\s+timestamptz\s+not null/i.test(c);
    const future = /expires_at\s*>\s*created_at/i.test(c);
    const onConsume = /expires_at\s*>\s*now\(\)/i.test(sqlFn(s.migration, "consume_order_resume_token"));
    return col && future && onConsume;
  }],

  ["S6", "environment binding exists and is re-checked on consume", (s) => {
    const c = sql(s.migration);
    const col = /environment\s+text\s+not null\s+check/i.test(c);
    const onConsume = /t\.environment\s*=\s*p_environment/i.test(
      sqlFn(s.migration, "consume_order_resume_token"));
    return col && onConsume;
  }],

  ["S7", "purpose binding exists and is re-checked on consume", (s) => {
    const c = sql(s.migration);
    const col = /purpose\s+text\s+not null\s+check/i.test(c);
    const onConsume = /t\.purpose\s*=\s*p_purpose/i.test(
      sqlFn(s.migration, "consume_order_resume_token"));
    return col && onConsume;
  }],

  ["S8", "order binding exists and a token resolves only to its own order", (s) => {
    const c = sql(s.migration);
    const fk = /order_id\s+uuid\s+not null\s+references\s+public\.orders/i.test(c);
    const returnsOwn = /returning\s+t\.order_id/i.test(
      sqlFn(s.migration, "consume_order_resume_token"));
    return fk && returnsOwn;
  }],

  ["S9", "consume is ATOMIC — one UPDATE guarded by `used_at is null`", (s) => {
    const fn = sqlFn(s.migration, "consume_order_resume_token");
    const singleUpdate = (fn.match(/\bupdate\s+public\.order_resume_tokens/gi) ?? []).length === 1;
    const guarded = /t\.used_at\s+is\s+null/i.test(fn);
    // A read-then-write would open a race window.
    const noSelectFirst = !/\bselect\b[\s\S]*\binto\b/i.test(fn);
    return singleUpdate && guarded && noSelectFirst;
  }],

  ["S10", "consume refuses revoked tokens and non-resumable orders", (s) => {
    const fn = sqlFn(s.migration, "consume_order_resume_token");
    return /t\.revoked_at\s+is\s+null/i.test(fn)
        && /order_is_resumable\(\s*t\.order_id\s*\)/i.test(fn);
  }],

  ["S11", "the token table is unreachable by anon/authenticated (RLS + named revokes)", (s) => {
    const c = sql(s.migration);
    const rls = /alter table public\.order_resume_tokens enable row level security/i.test(c);
    const noPolicy = !/create policy/i.test(c);
    // Revoking "from public" does NOT undo the default grant — each role must
    // be named explicitly.
    const revAnon = /revoke all on public\.order_resume_tokens from anon/i.test(c);
    const revAuth = /revoke all on public\.order_resume_tokens from authenticated/i.test(c);
    const noGrant = !/grant\s+(select|insert|update|delete|all)[^;]*on public\.order_resume_tokens\s+to\s+(anon|authenticated)/i.test(c);
    return rls && noPolicy && revAnon && revAuth && noGrant;
  }],

  ["S12", "every security-definer function in this system pins search_path", (s) => {
    for (const src of [s.migration, s.rateMigration]) {
      const c = sql(src);
      const definers = (c.match(/security definer/gi) ?? []).length;
      const pinned = (c.match(/security definer\s+set search_path\s*=\s*public/gi) ?? []).length;
      if (definers === 0 || definers !== pinned) return false;
    }
    return true;
  }],

  ["S13", "a raw token is never logged", (s) => {
    for (const key of ["issuer", "exchanger", "linkBuilder", "adminIssue", "recovery", "drip", "sms"]) {
      if (s[key] === null) continue;
      const c = code(s[key]);
      // console.* that interpolates a raw-token-bearing identifier.
      if (/console\.\w+\([^)]*\b(rawToken|issued\.token|resumeLink|issued\.url|outboundMessage)\b/.test(c)) {
        return false;
      }
    }
    return true;
  }],

  ["S14", "a raw token / resume URL is never written to audit_logs", (s) => {
    const c = code(s.adminIssue);
    const i = c.indexOf("audit_logs");
    if (i < 0) return true;
    // Scope strictly to the INSERT object. The function legitimately returns
    // `url:` in its own response — that is the caller's link, not a log — so a
    // greedy region would flag correct code.
    const end = c.indexOf("} catch", i);
    const region = c.slice(i, end > i ? end : i + 1400);
    return !/\b(token|token_hash|issued\.url|url|resume_url|rawToken)\s*:/.test(region);
  }],

  ["S15", "a raw token is never placed in localStorage or sessionStorage", (s) => {
    for (const key of ["esaPage", "psdPage", "bridge"]) {
      const c = code(s[key]);
      // Any storage write whose payload mentions a token identifier.
      if (/(local|session)Storage\.setItem\([^)]*\b(rt|rawToken|resumeToken|token)\b/.test(c)) {
        return false;
      }
    }
    return true;
  }],

  ["S16", "both assessment pages scrub ?rt= from the URL BEFORE the exchange await", (s) => {
    for (const key of ["esaPage", "psdPage"]) {
      const region = resumeEffect(s[key]);
      if (!region) return false;
      const scrub = region.indexOf("history.replaceState");
      const del = region.indexOf('searchParams.delete("rt")');
      const fetchAt = region.indexOf("await fetch");
      if (scrub < 0 || del < 0 || fetchAt < 0) return false;
      // Scrubbing must precede the network call, not follow it.
      if (scrub > fetchAt || del > fetchAt) return false;
    }
    return true;
  }],

  ["S17", "no producer builds ?resume=<confirmationId> as an access link", (s) => {
    const producers = ["linkBuilder", "recovery", "drip", "newEsaLink", "templated",
                       "broadcast", "sms", "adminIssue", "commsTab", "leadActions",
                       "bridge", "bookingLib"];
    for (const key of producers) {
      if (s[key] === null) continue;   // optional producer absent in this repo
      const c = code(s[key]);
      // An interpolated `?resume=` is a constructed credential link. A literal
      // `?resume=` with no interpolation (docs/sample text) is not.
      if (/[?&]resume=\$\{/.test(c)) return false;
      if (/[?&]resume=["'`]\s*\+/.test(c)) return false;
    }
    return true;
  }],

  ["S18", "every server-side producer routes through the ONE canonical builder", (s) => {
    for (const key of ["recovery", "drip", "newEsaLink", "templated", "broadcast", "sms", "adminIssue"]) {
      if (s[key] === null) continue;   // optional producer absent in this repo
      const c = code(s[key]);
      if (!/issueResumeLink\s*\(/.test(c)) return false;
      if (!/_shared\/resumeLink\.ts/.test(c)) return false;
    }
    // And the builder is the only place that calls the issuing endpoint.
    const builder = code(s.linkBuilder);
    if (!/functions\/v1\/issue-resume-token/.test(builder)) return false;
    for (const key of ["recovery", "drip", "newEsaLink", "templated", "broadcast", "sms", "adminIssue"]) {
      if (s[key] === null) continue;
      if (/functions\/v1\/issue-resume-token/.test(code(s[key]))) return false;
    }
    return true;
  }],

  ["S19", "the PSD flow is migrated to ?rt=", (s) => {
    const c = code(s.psdPage);
    // Either the direct query read or the pre-boot-aware helper counts — what
    // must hold is that the page OBTAINS the token and exchanges it.
    const obtainsToken = /searchParams\.get\("rt"\)/.test(c) || /readResumeToken\(/.test(c);
    return obtainsToken
        && /exchange-resume-token/.test(c)
        && /purpose:\s*"resume_assessment"/.test(c);
  }],

  ["S20", "the ESA flow is migrated to ?rt=", (s) => {
    const c = code(s.esaPage);
    const obtainsToken = /searchParams\.get\("rt"\)/.test(c) || /readResumeToken\(/.test(c);
    return obtainsToken && /exchange-resume-token/.test(c);
  }],

  ["S21", "the admin flow mints server-side; the browser never builds a resume link", (s) => {
    const tab = code(s.commsTab);
    // No client-side resume URL construction, and no client-supplied override
    // of the resume vars (send-templated-email owns them).
    const noClientBuild = !/resume_url\s*:/.test(tab) && !/const resumeUrl\s*=/.test(tab);
    const server = code(s.templated);
    const mintsServerSide = /issueResumeLink\s*\(/.test(server)
      && /authoritativeResumeVars/.test(server);
    // Authoritative vars must be spread AFTER caller vars, or a caller could
    // override the link.
    const varsBlock = server.slice(server.indexOf("const vars"), server.indexOf("const subject"));
    const callerAt = varsBlock.indexOf("body.vars");
    const authAt = varsBlock.indexOf("authoritativeResumeVars");
    const orderOk = callerAt >= 0 && authAt > callerAt;
    return noClientBuild && mintsServerSide && orderOk;
  }],

  ["S22", "the /r/ bridge carries a token and leaks no order reference", (s) => {
    const c = code(s.bridge);
    const carriesToken = (/searchParams\.get\("rt"\)/.test(c) || /readResumeToken\(/.test(c))
      && /params\.set\("rt"/.test(c);
    // The confirmation id must no longer be persisted or sent to analytics.
    const noCidStored = !/confirmation_id\s*:/.test(c);
    const noCidTracked = !/trackRecoveryClick\([^)]*confirmationId/.test(c);
    // Destination must come from a fixed allowlist, never from the query string
    // (open-redirect protection).
    const fixedDest = /const DESTINATIONS\s*=/.test(c)
      && !/location\.replace\(\s*(searchParams|params)\./.test(c);
    return carriesToken && noCidStored && noCidTracked && fixedDest;
  }],

  ["S23", "rate limiting is present on exchange, request-new-link and issuance", (s) => {
    const ex = code(s.exchanger);
    const rd = code(s.resumeRead);
    const ai = code(s.adminIssue);
    const exOk = /consumeRateLimit\([^)]*"exchange"/.test(ex);
    const rdOk = /consumeRateLimit\([^)]*"request_new_link"/.test(rd);
    const aiOk = /consumeRateLimit\([^)]*"issue_admin"/.test(ai);
    // The limiter must be concurrency-safe: a single atomic upsert, not a
    // read-then-write.
    const rl = sql(s.rateMigration);
    const atomic = /on conflict\s*\(bucket_key\)\s*do update/i.test(rl)
      && /returning\s+r\.attempt_count/i.test(rl);
    // And it must never be handed a raw IP or a raw token.
    const helper = code(s.rateLimiter);
    const hmac = /HMAC/.test(helper) && /hmacSha256Hex\(/.test(helper);
    return exOk && rdOk && aiOk && atomic && hmac;
  }],

  ["S24", "the public payment-status six-field allowlist still holds", (s) => {
    const c = code(s.reconciler);
    // No customer PII may be returned by the public endpoint.
    return !/\bemail\s*:\s*(order|data|o)\./.test(c)
        && !/\bphone\s*:\s*(order|data|o)\./.test(c)
        && !/\bfirst_name\s*:\s*(order|data|o)\./.test(c);
  }],

  ["S25", "forged client paid-state is still inert", (s) => {
    const c = code(s.resumeRead);
    return !/\bpaid_at\s*:/.test(c)
        && !/\.paid_at\s*=[^=]/.test(c);
  }],

  ["S27", "attribution capture strips credential params from landing_url / referrer", (s) => {
    const c = code(s.attribution);
    // The strip must exist, must name `rt`, and must be applied to BOTH
    // set-once captures. Attribution runs on mount — BEFORE the page scrubs
    // `?rt=` — so an unstripped capture persists a live token into
    // sessionStorage and from there into the order row, GHL and analytics.
    const hasStrip = /export function stripCredentialParams/.test(c);
    const namesRt = /CREDENTIAL_PARAMS\s*=\s*\[[^\]]*["']rt["']/.test(c);
    const landingStripped = /ssSet\(KEYS\.landing_url,\s*url\)/.test(c)
      && /const url = stripCredentialParams\(/.test(c);
    const referrerStripped = /const ref = stripCredentialParams\(/.test(c);
    // And neither page may hand a raw live URL to the landing-url helper.
    const pagesOk = ["esaPage", "psdPage"].every((k) => {
      const p = code(s[k]);
      const i = p.indexOf("function getLandingUrl");
      if (i < 0) return true;
      const region = p.slice(i, i + 400);
      return !/window\.location\.href/.test(region)
        || /stripCredentialParams\(/.test(region);
    });
    // The INLINE capture in index.html runs BEFORE React boots and is therefore
    // the FIRST writer of landing_url. Stripping only in the module left the
    // leak fully intact — this assertion is why that is no longer possible.
    const html = s.indexHtml;
    const i = html.indexOf("sessionStorage.setItem('landing_url'");
    const inlineStripped = i > 0
      && /stripCreds\(window\.location\.href\)/.test(html.slice(i, i + 120))
      && /\['rt', 'resume', 'token'\]/.test(html);
    const inlineReferrerStripped = /setItem\('referrer', stripCreds\(/.test(html);
    return hasStrip && namesRt && landingStripped && referrerStripped && pagesOk
      && inlineStripped && inlineReferrerStripped;
  }],

  ["S28", "the address bar is scrubbed PRE-BOOT, before any analytics tag reads it", (s) => {
    const html = s.indexHtml;
    // The scrub must (a) exist, (b) name the credential params, (c) actually
    // rewrite the address bar, and (d) run BEFORE the tracking bootstrap —
    // otherwise the tag stack reports the raw tokenised URL as dl/dr. This is
    // not theoretical: nine production beacons carried the token before it.
    const scrubAt = html.indexOf("__ptCredentialParams");
    const replaceAt = html.indexOf("window.history.replaceState({}, '', cu.pathname");
    const trackingAt = html.indexOf("Tracking bootstrap");
    const namesParams = /\['rt', 'resume', 'token'\]/.test(html);
    if (scrubAt < 0 || replaceAt < 0 || !namesParams) return false;
    if (trackingAt > 0 && scrubAt > trackingAt) return false;
    // The stash must be in-memory only — never persisted.
    const stashRegion = html.slice(scrubAt - 400, scrubAt + 400);
    if (/(local|session)Storage\.setItem\([^)]*__ptCredentialParams/.test(stashRegion)) return false;
    // And the app must actually READ the stash, or the scrub would break resume.
    const reader = code(s.tokenParam);
    return /__ptCredentialParams/.test(reader) && /export function readResumeToken/.test(reader);
  }],

  ["S26", "no LIVE project reference, and no frozen mega-file is claimed here", (s) => {
    const LIVE = "cvwbozlbbmrjxznknouq";
    for (const key of Object.keys(F)) {
      if (key === "frozenModal" || key === "frozenAnalytics") continue;
      if (s[key] !== null && s[key].includes(LIVE)) return false;
    }
    // The two merge-frozen files must not have been drawn into this task.
    for (const key of ["frozenModal", "frozenAnalytics"]) {
      if (/ORDER-RESUME-SECURE-TOKEN/.test(s[key])) return false;
    }
    return true;
  }],
];

// ── Planted negative controls ────────────────────────────────────────────────
// Each mutates the real source into the regression it names. A control that
// fails to change the file proves nothing and is reported as NO-OP.
const CONTROLS = [
  ["S1", "a raw token column is added to the schema", (b) => ({
    migration: b.migration.replace(
      "  token_hash     text not null,",
      "  token_hash     text not null,\n  token          text,",
    ),
  })],
  ["S2", "the issuer sends the RAW token to the database", (b) => ({
    issuer: b.issuer.replace("p_token_hash: tokenHash,", "p_token_hash: rawToken,"),
  })],
  ["S3", "Math.random is used to mint the token", (b) => ({
    issuer: b.issuer.replace(
      "crypto.getRandomValues(bytes);",
      "for (let i = 0; i < bytes.length; i++) bytes[i] = Math.random() * 256;",
    ),
  })],
  ["S4", "entropy is cut to 64 bits", (b) => ({
    issuer: b.issuer.replace("new Uint8Array(32)", "new Uint8Array(8)"),
  })],
  ["S5", "the expiry check is removed from consume", (b) => ({
    migration: b.migration.replace("     and t.expires_at > now()\n", ""),
  })],
  ["S6", "the environment check is removed from consume", (b) => ({
    migration: b.migration.replace("     and t.environment = p_environment\n", ""),
  })],
  ["S7", "the purpose check is removed from consume", (b) => ({
    migration: b.migration.replace("     and t.purpose = p_purpose\n", ""),
  })],
  ["S8", "order binding is dropped from the token table", (b) => ({
    migration: b.migration.replace(
      "order_id       uuid not null references public.orders(id) on delete cascade,",
      "order_id       uuid not null,",
    ),
  })],
  ["S9", "the single-use guard is removed from the atomic consume", (b) => ({
    migration: b.migration.replace(
      "     and t.used_at is null\n",
      "",
    ),
  })],
  ["S10", "consume stops refusing revoked tokens", (b) => ({
    migration: b.migration.replace("     and t.revoked_at is null\n", ""),
  })],
  ["S11", "anon is granted SELECT on the token table", (b) => ({
    migration: b.migration +
      "\ngrant select on public.order_resume_tokens to anon;\n",
  })],
  ["S12", "a security-definer function stops pinning search_path", (b) => ({
    rateMigration: b.rateMigration.replace(
      "language plpgsql volatile security definer set search_path = public as $$",
      "language plpgsql volatile security definer as $$",
    ),
  })],
  ["S13", "the raw token is logged", (b) => ({
    exchanger: b.exchanger.replace(
      "    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);",
      "    console.log(`exchanging ${rawToken}`);\n    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);",
    ),
  })],
  ["S14", "the resume URL is written into audit_logs", (b) => ({
    adminIssue: b.adminIssue.replace(
      "          purpose,\n          expires_at: issued.expiresAt,",
      "          purpose,\n          url: issued.url,\n          expires_at: issued.expiresAt,",
    ),
  })],
  ["S15", "the token is cached in localStorage", (b) => ({
    bridge: b.bridge.replace(
      "    try {\n      const flag: RecoveryFlag = {",
      "    localStorage.setItem('pt_rt', resumeToken);\n    try {\n      const flag: RecoveryFlag = {",
    ),
  })],
  ["S16", "the PSD URL scrub is removed", (b) => ({
    psdPage: b.psdPage.replace('            u.searchParams.delete("rt");\n', ""),
  })],
  ["S17", "a confirmation-ID resume link is restored in the drip", (b) => ({
    drip: b.drip.replace(
      "          _resumeLink = issued.url;",
      "          _resumeLink = `${SITE_URL}/assessment?resume=${lead.confirmation_id}`;",
    ),
  })],
  ["S18", "a producer bypasses the canonical builder", (b) => ({
    broadcast: b.broadcast.replace(
      'import { issueResumeLink } from "../_shared/resumeLink.ts";\n',
      "",
    ),
  })],
  ["S19", "the PSD producer is left on the legacy read path", (b) => ({
    psdPage: b.psdPage.replace("const resumeToken = readResumeToken(searchParams);",
                               'const resumeToken = "";'),
  })],
  ["S21", "the admin browser builds the resume link again", (b) => ({
    commsTab: b.commsTab.replace(
      "  const isPsd = letterType === \"psd\" || confirmationId.includes(\"-PSD\");",
      "  const isPsd = letterType === \"psd\" || confirmationId.includes(\"-PSD\");\n  const resumeUrl = `/assessment`;",
    ),
  })],
  ["S22", "the /r/ bridge leaks the confirmation id to analytics again", (b) => ({
    bridge: b.bridge.replace(
      "      trackRecoveryClick(stage || \"unknown\", null, {",
      "      const confirmationId = searchParams.get(\"o\") ?? \"\";\n      trackRecoveryClick(stage || \"unknown\", confirmationId, {",
    ),
  })],
  ["S23", "the exchange rate limit is removed", (b) => ({
    exchanger: b.exchanger
      .replace('const ipAllowed = await consumeRateLimit(admin, "exchange", clientIp(req));',
               "const ipAllowed = true;")
      .replace(
        'const tokenAllowed = await consumeRateLimit(\n      admin, "exchange", tokenHash, RESUME_SUBJECT_LIMITS.perToken);',
        "const tokenAllowed = true;"),
  })],
  ["S24", "the public payment endpoint returns the customer email again", (b) => ({
    reconciler: b.reconciler.replace(
      "  const paid = opts.paid === true;",
      "  const paid = opts.paid === true;\n  const leak = { email: order.email };",
    ),
  })],
  ["S27", "attribution captures the raw landing URL again (token leaks to storage)", (b) => ({
    attribution: b.attribution.replace(
      "    const url = stripCredentialParams(",
      "    const url = String(",
    ),
  })],
  ["S27", "the INLINE pre-boot capture stores the raw URL again", (b) => ({
    indexHtml: b.indexHtml.replace(
      "sessionStorage.setItem('landing_url', stripCreds(window.location.href));",
      "sessionStorage.setItem('landing_url', window.location.href);",
    ),
  })],
  ["S28", "the pre-boot address-bar scrub is removed (tags see the raw token)", (b) => ({
    indexHtml: b.indexHtml.replace(
      "window.history.replaceState({}, '', cu.pathname + cu.search + cu.hash);",
      "/* scrub removed */",
    ),
  })],
  ["S25", "client paidAt is written to the order again", (b) => ({
    resumeRead: b.resumeRead.replace(
      "    const alreadyPaid = !!(data.payment_intent_id || data.paid_at);",
      "    const alreadyPaid = !!(data.payment_intent_id || data.paid_at);\n    const forged = { paid_at: body.paidAt };",
    ),
  })],
];

function loadAll(override) {
  const out = {};
  for (const k of Object.keys(F)) out[k] = read(k, override);
  return out;
}

function runChecks(src) {
  return CHECKS.map(([id, desc, fn]) => {
    let ok;
    try { ok = !!fn(src); } catch { ok = false; }
    return { id, desc, ok };
  });
}

const NAME = "check-secure-resume-credential";

try {
  const base = loadAll();

  if (SELF) {
    console.log(`[${NAME}] self-test — every planted regression MUST trip its check\n`);
    let bad = 0;
    for (const [target, label, mutate] of CONTROLS) {
      const patch = mutate(base);
      const changed = Object.keys(patch).some((k) => patch[k] !== base[k]);
      const results = runChecks({ ...base, ...patch });
      const hit = results.find((r) => r.id === target);
      const tripped = changed && hit && !hit.ok;
      if (!tripped) bad++;
      console.log(
        `  ${tripped ? "CAUGHT " : changed ? "MISSED " : "NO-OP  "} ${target.padEnd(4)} ${label}`,
      );
    }
    console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const results = runChecks(base);
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(4)} ${r.desc}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length && !WARN) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error(`[${NAME}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(WARN ? 0 : 1);
}
