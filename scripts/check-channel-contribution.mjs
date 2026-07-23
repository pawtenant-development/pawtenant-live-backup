#!/usr/bin/env node
// ACCOUNTS-CHANNEL-CONTRIBUTION-BREAKDOWN-001 — regression guard + test suite.
//
// Locks in the Channel Contribution contract so a future edit can't silently
// break the exclusive 4-category partition, the reconciliation, the reuse of
// the canonical classifier / provider-payment rules, or the no-Stripe-fee /
// no-PII / no-profit invariants.
//
// Two layers:
//   1. LOGIC — imports the REAL pure module src/lib/channelContribution.ts via
//      jiti and runs the behavioural battery (classification precedence,
//      AI-not-referral, Direct-vs-Unknown, aggregation + reconciliation, ad
//      spend only on Paid Media, zero-denominator safety, negative
//      contribution, share math, attribution quality). No mirror to drift.
//   2. STATIC — asserts the required invariants are present (and forbidden
//      shortcuts absent) in channelContribution.ts, ChannelContributionPanel.tsx,
//      PaymentsTab.tsx, and the get_channel_contribution_orders migration.
//
// Usage:
//   node scripts/check-channel-contribution.mjs             # guard TEST source
//   node scripts/check-channel-contribution.mjs --self-test # prove the battery has power

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const F_LIB = join(ROOT, "src", "lib", "channelContribution.ts");
const F_PANEL = join(ROOT, "src", "pages", "admin-orders", "components", "ChannelContributionPanel.tsx");
const F_TAB = join(ROOT, "src", "pages", "admin-orders", "components", "PaymentsTab.tsx");
const F_MIG = join(ROOT, "supabase", "migrations", "20260723120000_add_get_channel_contribution_orders.sql");

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";

const jiti = createJiti(import.meta.url);
async function loadModule() {
  return jiti.import(F_LIB);
}

// ── Classification battery: input → { category, leaf } ───────────────────────
const CLS = [
  { name: "gclid → Paid Media/Google Ads (verified)", in: { gclid: "present" }, cat: "paid_media", leaf: "Google Ads" },
  { name: "gbraid → Google Ads", in: { gbraid: "present" }, cat: "paid_media", leaf: "Google Ads" },
  { name: "wbraid → Google Ads", in: { wbraid: "present" }, cat: "paid_media", leaf: "Google Ads" },
  { name: "utm google+cpc → Google Ads", in: { utm_source: "google", utm_medium: "cpc" }, cat: "paid_media", leaf: "Google Ads" },
  { name: "verified paid WINS over AI referrer (gclid+chatgpt)", in: { gclid: "present", referrer_host: "chatgpt.com" }, cat: "paid_media", leaf: "Google Ads" },
  { name: "fbclid → Paid Media/Other Paid Media", in: { fbclid: "present" }, cat: "paid_media", leaf: "Other Paid Media" },
  { name: "msclkid → Other Paid Media", in: { msclkid: "present" }, cat: "paid_media", leaf: "Other Paid Media" },
  { name: "bing+cpc+msclkid → Other Paid Media (paid, not organic)", in: { utm_source: "bing", utm_medium: "cpc", msclkid: "present", canonical_channel: "bing" }, cat: "paid_media", leaf: "Other Paid Media" },
  { name: "ChatGPT referrer → Organic AI/ChatGPT (NOT Referral)", in: { referrer_host: "chatgpt.com" }, cat: "organic_ai", leaf: "ChatGPT" },
  { name: "Perplexity utm → Organic AI/Perplexity (NOT Referral)", in: { utm_source: "perplexity" }, cat: "organic_ai", leaf: "Perplexity" },
  { name: "Gemini domain → Organic AI/Gemini (NOT Organic Search)", in: { referrer_host: "gemini.google.com" }, cat: "organic_ai", leaf: "Gemini" },
  { name: "Copilot → Organic AI/Copilot (NOT Referral)", in: { referrer_host: "copilot.microsoft.com" }, cat: "organic_ai", leaf: "Copilot" },
  { name: "Claude → Organic AI/Claude (NOT Referral)", in: { referrer_host: "claude.ai" }, cat: "organic_ai", leaf: "Claude" },
  { name: "canonical=chatgpt gap-fill → ChatGPT", in: { canonical_channel: "chatgpt.com" }, cat: "organic_ai", leaf: "ChatGPT" },
  { name: "Poe → Organic AI/Other AI", in: { referrer_host: "poe.com" }, cat: "organic_ai", leaf: "Other AI" },
  { name: "Google organic referrer → Organic/Organic Search", in: { referrer_host: "www.google.com" }, cat: "organic", leaf: "Organic Search" },
  { name: "external referrer → Organic/Referral", in: { referrer_host: "someblog.example" }, cat: "organic", leaf: "Referral" },
  { name: "canonical=direct → Organic/Direct", in: { canonical_channel: "direct" }, cat: "organic", leaf: "Direct" },
  { name: "internal referrer + canonical=direct → Direct (internal stripped)", in: { referrer_host: "pawtenant-test.vercel.app", canonical_channel: "direct" }, cat: "organic", leaf: "Direct" },
  { name: "canonical=direct BUT gclid → Google Ads (stronger wins)", in: { canonical_channel: "direct", gclid: "present" }, cat: "paid_media", leaf: "Google Ads" },
  { name: "no signal → Unknown/Unattributed", in: {}, cat: "unknown", leaf: "Unknown / Unattributed" },
  { name: "internal referrer only, no canonical → Unknown", in: { referrer_host: "localhost:4173" }, cat: "unknown", leaf: "Unknown / Unattributed" },
  { name: "referred_by=google salvage → Google Ads", in: { referred_by: "google" }, cat: "paid_media", leaf: "Google Ads" },
  { name: "facebook organic referrer → Organic/Other Organic", in: { referrer_host: "facebook.com" }, cat: "organic", leaf: "Other Organic" },
  { name: "email recovery seq_ → Organic/Other Organic", in: { ref: "seq_" }, cat: "organic", leaf: "Other Organic" },
];

async function runLogic(CC) {
  const F = [];
  const {
    classifyPaidOrderChannel, aggregateChannelContribution,
    CHANNEL_CATEGORIES, CHANNEL_LEAVES, CHANNEL_LEAF_CATEGORY,
  } = CC;

  // 1/2 exclusive + exhaustive classification.
  for (const c of CLS) {
    const r = classifyPaidOrderChannel(c.in);
    if (r.category !== c.cat || r.leaf !== c.leaf) F.push(`[cls] ${c.name}: got ${r.category}/${r.leaf}`);
    if (typeof r.leaf !== "string" || CHANNEL_LEAF_CATEGORY[r.leaf] !== r.category)
      F.push(`[cls] ${c.name}: leaf/category mismatch (${r.leaf} not in ${r.category})`);
  }
  // AI must never be Referral/Organic Search.
  for (const ai of ["chatgpt.com", "perplexity.ai", "copilot.microsoft.com", "claude.ai", "gemini.google.com"]) {
    const r = classifyPaidOrderChannel({ referrer_host: ai });
    if (r.leaf === "Referral" || r.leaf === "Organic Search") F.push(`[cls] AI ${ai} misfiled as ${r.leaf}`);
    if (r.category !== "organic_ai") F.push(`[cls] AI ${ai} not in organic_ai (${r.category})`);
  }

  // Taxonomy structure.
  if (CHANNEL_CATEGORIES.length !== 4) F.push(`[tax] expected 4 categories, got ${CHANNEL_CATEGORIES.length}`);
  for (const need of ["paid_media", "organic", "organic_ai", "unknown"])
    if (!CHANNEL_CATEGORIES.includes(need)) F.push(`[tax] missing category ${need}`);
  if (CHANNEL_LEAF_CATEGORY["Google Ads"] !== "paid_media") F.push("[tax] Google Ads not under paid_media");
  if (CHANNEL_LEAF_CATEGORY["Direct"] !== "organic") F.push("[tax] Direct not under organic");
  if (CHANNEL_LEAF_CATEGORY["Referral"] !== "organic") F.push("[tax] Referral not under organic");
  for (const ai of ["ChatGPT", "Perplexity", "Gemini", "Copilot", "Claude", "Other AI"])
    if (CHANNEL_LEAF_CATEGORY[ai] !== "organic_ai") F.push(`[tax] ${ai} not under organic_ai`);
  if (CHANNEL_LEAF_CATEGORY["Unknown / Unattributed"] !== "unknown") F.push("[tax] Unknown not under unknown");
  // Google Ads appears under exactly one category.
  const gaCats = CHANNEL_CATEGORIES.filter((c) => CHANNEL_LEAVES[c].includes("Google Ads"));
  if (gaCats.length !== 1 || gaCats[0] !== "paid_media") F.push(`[tax] Google Ads must be only under paid_media (found ${gaCats})`);

  // Aggregation + reconciliation.
  const rows = [
    { gclid: "present", gross_usd: 129, refund_usd: 0, provider_usd: 30 },
    { gclid: "present", gross_usd: 149, refund_usd: 149, provider_usd: 0 },
    { canonical_channel: "direct", gross_usd: 110, refund_usd: 0, provider_usd: 30 },
    { referrer_host: "chatgpt.com", gross_usd: 179, refund_usd: 0, provider_usd: 30 },
    { fbclid: "present", gross_usd: 99, refund_usd: 0, provider_usd: 0 },
    {},
  ];
  const res = aggregateChannelContribution(rows, { googleAdsSpendUsd: 50 });
  const t = res.total;
  const eq = (a, b) => Math.abs(a - b) < 0.005;
  if (t.paidOrders !== 6) F.push(`[agg] paidOrders ${t.paidOrders} != 6`);
  if (!eq(t.grossCharged, 666)) F.push(`[agg] gross ${t.grossCharged} != 666`);
  if (!eq(t.refunds, 149)) F.push(`[agg] refunds ${t.refunds} != 149`);
  if (!eq(t.netRevenue, 517)) F.push(`[agg] net ${t.netRevenue} != 517`);
  if (!eq(t.providerPayments, 90)) F.push(`[agg] provider ${t.providerPayments} != 90`);
  if (!eq(t.contributionBeforeStripeAndSpend, 427)) F.push(`[agg] contribution ${t.contributionBeforeStripeAndSpend} != 427`);
  if (!eq(t.adSpend, 50)) F.push(`[agg] adSpend ${t.adSpend} != 50`);
  if (!eq(t.netAfterAdSpendBeforeStripe, 377)) F.push(`[agg] netAfterSpend ${t.netAfterAdSpendBeforeStripe} != 377`);
  if (!res.reconciliation.balanced) F.push(`[agg] reconciliation not balanced: ${JSON.stringify(res.reconciliation)}`);

  const cat = (k) => res.categories.find((c) => c.category === k);
  // parent = Σ children (every metric base).
  for (const c of res.categories) {
    const sg = c.children.reduce((s, ch) => s + ch.grossCharged, 0);
    const sp = c.children.reduce((s, ch) => s + ch.paidOrders, 0);
    if (!eq(c.grossCharged, sg)) F.push(`[agg] ${c.category} gross != Σ children`);
    if (c.paidOrders !== sp) F.push(`[agg] ${c.category} paidOrders != Σ children`);
  }
  // Σ categories = total.
  if (res.categories.reduce((s, c) => s + c.paidOrders, 0) !== t.paidOrders) F.push("[agg] Σ categories paidOrders != total");
  if (!eq(res.categories.reduce((s, c) => s + c.grossCharged, 0), t.grossCharged)) F.push("[agg] Σ categories gross != total");

  // Ad spend only on Paid Media / Google Ads.
  if (!eq(cat("paid_media").adSpend, 50)) F.push("[spend] paid_media adSpend != 50");
  if (!eq(cat("organic").adSpend, 0)) F.push("[spend] organic adSpend != 0");
  if (!eq(cat("organic_ai").adSpend, 0)) F.push("[spend] organic_ai adSpend != 0");
  if (!eq(cat("unknown").adSpend, 0)) F.push("[spend] unknown adSpend != 0");
  const ga = cat("paid_media").children.find((c) => c.leaf === "Google Ads");
  if (!eq(ga.adSpend, 50)) F.push("[spend] Google Ads leaf adSpend != 50 (duplicated or missing)");

  // Unknown visible + separate.
  if (cat("unknown").paidOrders !== 1) F.push(`[unknown] expected 1 unknown order, got ${cat("unknown").paidOrders}`);

  // Zero-denominator safety (ratios null, never NaN/Infinity).
  for (const c of res.categories)
    for (const ch of c.children)
      for (const k of ["averageOrderValue", "refundRate", "contributionMargin", "paidOrderShare", "netRevenueShare"])
        if (ch[k] != null && !isFinite(ch[k])) F.push(`[safe] ${c.category}/${ch.leaf} ${k} is ${ch[k]}`);
  const empty = aggregateChannelContribution([], {});
  if (empty.total.averageOrderValue !== null) F.push("[safe] empty AOV should be null");
  if (empty.total.paidOrders !== 0) F.push("[safe] empty paidOrders should be 0");

  // Negative contribution stays negative.
  const neg = aggregateChannelContribution([{ canonical_channel: "direct", gross_usd: 10, refund_usd: 0, provider_usd: 30 }], {});
  if (!eq(neg.total.contributionBeforeStripeAndSpend, -20)) F.push(`[neg] expected -20, got ${neg.total.contributionBeforeStripeAndSpend}`);

  // Refunds reduce gross → net.
  const rr = aggregateChannelContribution([{ gclid: "present", gross_usd: 100, refund_usd: 40, provider_usd: 0 }], {});
  if (!eq(rr.total.netRevenue, 60)) F.push(`[refund] net should be 60, got ${rr.total.netRevenue}`);

  // Paid Media == Google Ads initially (no non-Google paid order → Other Paid Media zero-volume).
  const gaOnly = aggregateChannelContribution([{ gclid: "present", gross_usd: 100, refund_usd: 0, provider_usd: 0 }], { googleAdsSpendUsd: 20 });
  const pm = gaOnly.categories.find((c) => c.category === "paid_media");
  const gaLeaf = pm.children.find((c) => c.leaf === "Google Ads");
  const otherPaid = pm.children.find((c) => c.leaf === "Other Paid Media");
  if (!eq(pm.grossCharged, gaLeaf.grossCharged) || !eq(pm.adSpend, gaLeaf.adSpend))
    F.push("[init] Paid Media != Google Ads when only Google Ads present");
  if (otherPaid.hasVolume) F.push("[init] Other Paid Media should be zero-volume when no non-Google paid order");

  // Attribution quality.
  if (res.quality.unknown !== 1) F.push(`[quality] unknown count ${res.quality.unknown} != 1`);
  if (!eq(res.quality.unknownPct, Math.round((1 / 6) * 10000) / 100)) F.push(`[quality] unknownPct ${res.quality.unknownPct} wrong`);

  return F;
}

// ── STATIC layer ─────────────────────────────────────────────────────────────
function assert(cond, msg, F) { if (!cond) F.push(msg); }

// Strip block + line comments so forbidden-word checks don't fire on the very
// documentation that explains a rule is being honoured (":" guard keeps URLs).
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

function runStatic() {
  const F = [];
  const lib = readFileSync(F_LIB, "utf8");
  const panel = readFileSync(F_PANEL, "utf8");
  const tab = readFileSync(F_TAB, "utf8");
  const mig = readFileSync(F_MIG, "utf8");

  // channelContribution.ts — reuse, not duplicate; no fee estimation; no PII fields.
  assert(/from ["']\.\/acquisitionClassifier["']/.test(lib), "channelContribution must REUSE ./acquisitionClassifier (no duplicated detection)", F);
  assert(/classifyAcquisition/.test(lib) && /canonicalChannelToLabel/.test(lib), "must call the canonical classifyAcquisition + canonicalChannelToLabel", F);
  assert(/"paid_media"[\s\S]*"organic"[\s\S]*"organic_ai"[\s\S]*"unknown"/.test(lib), "must declare exactly the 4 categories", F);
  assert(/canonical_channel\)\s*===\s*"direct"/.test(lib), "Direct-vs-Unknown split must key on canonical_channel === 'direct'", F);
  assert(/denom > 0 \?/.test(lib), "ratios must guard denominator > 0 (no NaN/Infinity)", F);
  // Forbidden checks target VIOLATIONS (fee constants, string labels, PII field
  // identifiers) — not the explanatory prose that documents compliance.
  assert(!/(0\.029|2\.9\s*%|stripe_fee|stripefee|fee_rate)/i.test(lib), "FORBIDDEN: no Stripe-fee estimation/constant in channelContribution", F);
  assert(!/\bprofit\b/i.test(stripComments(lib)), "FORBIDDEN: must not use 'profit' in code/labels (docs may explain we avoid it)", F);
  // No PII field IDENTIFIERS in the evidence contract (channel names like "Email Recovery" are fine).
  assert(!/(customer_email|user_email|email_address|phone_number|\bfirst_name\b|\blast_name\b|\bfull_name\b|home_address|street_address|\bpet_name\b|\bssn\b)/i.test(lib), "FORBIDDEN: no PII field identifiers in channelContribution", F);

  // Panel — single RPC (no N+1), no profit label, Stripe-fee limitation note, mounted.
  const rpcCalls = (panel.match(/supabase\.rpc\(/g) || []).length;
  assert(rpcCalls === 1, `panel must make exactly ONE rpc call (N+1 guard); found ${rpcCalls}`, F);
  assert(/get_channel_contribution_orders/.test(panel), "panel must call get_channel_contribution_orders", F);
  assert(/aggregateChannelContribution/.test(panel), "panel must aggregate via the pure aggregator", F);
  assert(/pending actual order-level reconciliation/i.test(panel), "panel must show the Stripe-fee limitation note", F);
  assert(/before Stripe fees|before fees/i.test(panel), "panel must state contribution is before Stripe fees", F);
  // Forbid a profit LABEL (the "…is not profit" disclaimer is desirable and allowed).
  assert(!/(net|final|true|gross)\s+profit|["'>]\s*profit\b/i.test(panel), "FORBIDDEN: panel must not label anything as profit", F);
  // Totals independent of expand/collapse: result comes from useMemo on raw, expand only drives rendering.
  assert(/useMemo\(\(\) => \{[\s\S]*aggregateChannelContribution/.test(panel), "aggregation must be memoized on raw data (independent of expand state)", F);
  assert(/overflow-x-auto/.test(panel), "wide table must scroll inside its own container (no page overflow)", F);
  assert(/sticky left-0/.test(panel), "channel column should be sticky when the table is wide", F);

  // Mounted in PaymentsTab Accounts view.
  assert(/import ChannelContributionPanel from ["']\.\/ChannelContributionPanel["']/.test(tab), "PaymentsTab must import ChannelContributionPanel", F);
  assert(/<ChannelContributionPanel\b/.test(tab), "PaymentsTab must mount <ChannelContributionPanel>", F);

  // Migration — secured, canonical money, PII-safe, no coupon double-deduct, no fee.
  assert(/security definer/.test(mig), "RPC must be security definer", F);
  assert(/is_accounts_admin\(\)/.test(mig), "RPC must gate on is_accounts_admin()", F);
  assert(/grant execute on function public\.get_channel_contribution_orders\(date, date\) to authenticated/.test(mig), "RPC must grant execute to authenticated", F);
  assert(/doctor_status = 'patient_notified'/.test(mig), "provider payment must gate on doctor_status='patient_notified'", F);
  assert(/lower\(coalesce\(de\.status,''\)\) <> 'cancelled'/.test(mig), "provider payment must exclude only cancelled earnings", F);
  assert(/doctor_earnings/.test(mig), "provider payment must read canonical doctor_earnings", F);
  assert(/coalesce\(p\.price, 0\) as gross_usd/.test(mig), "gross must be orders.price (canonical, coupon already baked in)", F);
  assert(/coalesce\(p\.refund_amount, 0\) as refund_usd/.test(mig), "refund must be orders.refund_amount (canonical)", F);
  assert(!/coupon/i.test(mig), "FORBIDDEN: must not touch coupon columns (no double-deduction)", F);
  assert(!/per_order_rate|\* 0\.\d|price \*/.test(mig), "FORBIDDEN: provider/gross must not be derived from rate/percentage", F);
  assert(!/2\.9|0\.029|stripe.{0,4}fee/i.test(mig), "FORBIDDEN: no Stripe-fee estimation in the RPC", F);
  assert(/then 'present' end as (gclid|gbraid|wbraid|fbclid|msclkid|ttclid)/.test(mig), "click IDs must be projected as 'present' sentinels (no raw click IDs)", F);
  // No obvious PII columns projected.
  assert(!/\bp\.(email|phone|full_name|first_name|last_name|address|pet_name|customer_name)\b/i.test(mig), "FORBIDDEN: RPC must not project PII columns", F);
  assert(/paid_at >= p_from::timestamptz and o\.paid_at <  \(p_to \+ 1\)::timestamptz|paid_at < \(p_to \+ 1\)/.test(mig.replace(/\s+/g, " ")) || /paid_at < \(p_to \+ 1\)/.test(mig), "date window must be [p_from, p_to+1) on paid_at", F);

  return F;
}

// ── Self-test: poisoned expectations must FAIL (proves the battery has power) ─
async function runSelfTest(CC) {
  const results = [];
  const { classifyPaidOrderChannel } = CC;
  // Correct battery passes.
  const logicF = await runLogic(CC);
  results.push({ name: "correct module passes full battery", pass: logicF.length === 0, detail: logicF.join(" | ") });
  // Poisoned: these WRONG expectations must not hold (module must disagree).
  const poison = [
    { name: "ChatGPT is NOT Referral", in: { referrer_host: "chatgpt.com" }, wrongLeaf: "Referral" },
    { name: "gclid is NOT Unknown", in: { gclid: "present" }, wrongLeaf: "Unknown / Unattributed" },
    { name: "no-signal is NOT Direct", in: {}, wrongLeaf: "Direct" },
    { name: "Gemini is NOT Organic Search", in: { referrer_host: "gemini.google.com" }, wrongLeaf: "Organic Search" },
    { name: "fbclid is NOT under organic", in: { fbclid: "present" }, wrongCat: "organic" },
  ];
  for (const p of poison) {
    const r = classifyPaidOrderChannel(p.in);
    const triggered = (p.wrongLeaf && r.leaf === p.wrongLeaf) || (p.wrongCat && r.category === p.wrongCat);
    results.push({ name: `discriminates: ${p.name}`, pass: !triggered, detail: triggered ? `module produced the wrong value ${r.category}/${r.leaf}` : "" });
  }
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`  ${r.pass ? GREEN + "✓" : RED + "✗"} ${r.name}${RESET}${r.detail ? " — " + r.detail : ""}`));
  if (failed.length) { console.error(`${RED}✗ self-test FAILED (${failed.length}/${results.length})${RESET}`); process.exit(1); }
  console.log(`${GREEN}✓ self-test passed (${results.length}/${results.length})${RESET}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
const selfTest = process.argv.includes("--self-test");
const CC = await loadModule();

if (selfTest) {
  console.log(`${YELLOW}channel-contribution — self-test (battery power + discrimination)${RESET}`);
  await runSelfTest(CC);
} else {
  console.log(`${YELLOW}channel-contribution — guard (logic + static)${RESET}`);
  const logicF = await runLogic(CC);
  const staticF = runStatic();
  const all = [...logicF.map((f) => `[logic] ${f}`), ...staticF.map((f) => `[static] ${f}`)];
  if (all.length) {
    console.error(`${RED}✗ channel-contribution guard FAILED${RESET}`);
    all.forEach((f) => console.error(`  ${RED}✗${RESET} ${f}`));
    process.exit(1);
  }
  console.log(`${GREEN}✓ ${CLS.length} classification + aggregation/reconciliation logic checks + all static invariants passed${RESET}`);
}
