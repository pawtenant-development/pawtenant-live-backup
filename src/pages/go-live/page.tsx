import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

type CheckItem = {
  id: string;
  label: string;
  detail?: string;
  code?: string;
  codeLabel?: string;
  link?: { href: string; text: string };
  warning?: string;
  note?: string;
};

type Section = {
  id: string;
  step: number;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  items: CheckItem[];
};

const SECTIONS: Section[] = [
  {
    id: "stripe-keys",
    step: 1,
    title: "Stripe — Swap to Live Keys",
    subtitle: "Your current code uses test keys. Live mode needs different ones.",
    icon: "ri-bank-card-line",
    color: "text-violet-600 bg-violet-50 border-violet-100",
    items: [
      {
        id: "stripe-live-secret",
        label: "Copy your live Secret Key from Stripe",
        detail: "Stripe Dashboard → Developers → API Keys → Secret key (starts with sk_live_...)",
        link: { href: "https://dashboard.stripe.com/apikeys", text: "Open Stripe API Keys →" },
        note: "You'll paste this into Supabase in Step 3.",
      },
      {
        id: "stripe-live-pub",
        label: "Copy your live Publishable Key from Stripe",
        detail: "Same page — the key that starts with pk_live_...",
        link: { href: "https://dashboard.stripe.com/apikeys", text: "Open Stripe API Keys →" },
        note: "You'll paste this into Readdy's environment settings in Step 4.",
      },
    ],
  },
  {
    id: "stripe-webhook",
    step: 2,
    title: "Stripe — Register Live Webhook",
    subtitle: "Test webhook is already registered and active. You need to register a separate one for Live mode.",
    icon: "ri-webhook-line",
    color: "text-amber-600 bg-amber-50 border-amber-100",
    items: [
      {
        id: "webhook-switch-live",
        label: "Switch Stripe to Live mode before doing this step",
        detail: "Top-right of Stripe Dashboard — toggle 'Test mode' OFF. The dashboard will turn dark. Everything you do now is real-money live.",
        warning: "Test webhook (exquisite-sensation) is already registered and active — do NOT touch it. You are creating a new, separate webhook for live mode only.",
      },
      {
        id: "webhook-endpoint",
        label: "Add a new endpoint in Live mode → Developers → Webhooks",
        detail: "Click 'Add destination' (Stripe Workbench) or 'Add endpoint' (classic Stripe). Paste the URL below.",
        link: { href: "https://dashboard.stripe.com/webhooks", text: "Open Stripe Webhooks →" },
        code: "https://cvwbozlbbmrjxznknouq.supabase.co/functions/v1/stripe-webhook",
        codeLabel: "Endpoint URL:",
        note: "Under 'Select events', add: payment_intent.succeeded",
      },
      {
        id: "webhook-secret",
        label: "Copy the LIVE Signing Secret Stripe generates",
        detail: "After adding the endpoint, click 'Reveal' next to the Signing secret. It starts with whsec_... — this is DIFFERENT from the test one.",
        warning: "You must update STRIPE_WEBHOOK_SECRET in Supabase with this live value. If you leave the test whsec_ in place, every live webhook will be rejected as invalid signature.",
      },
    ],
  },
  {
    id: "supabase-secrets",
    step: 3,
    title: "Supabase — Update Live Secrets",
    subtitle: "Your edge functions read these server-side. Nothing touches client code.",
    icon: "ri-shield-keyhole-line",
    color: "text-emerald-600 bg-emerald-50 border-emerald-100",
    items: [
      {
        id: "supabase-nav",
        label: "Open Supabase Edge Function secrets",
        detail: "Go to supabase.com/dashboard → your project → Edge Functions → (any function) → Secrets tab",
        link: {
          href: "https://supabase.com/dashboard/project/cvwbozlbbmrjxznknouq/functions",
          text: "Open Supabase Functions →",
        },
        note: "Secrets are shared across ALL edge functions — you only need to update them once.",
      },
      {
        id: "secret-stripe-key",
        label: "Update STRIPE_SECRET_KEY → paste your live sk_live_... value",
        code: "STRIPE_SECRET_KEY",
        codeLabel: "Secret name:",
        detail: "Find the existing secret and edit its value to your live sk_live_... key from Step 1.",
        warning: "This is the most important swap. Every charge, refund, and payment intent creation goes through this key.",
      },
      {
        id: "secret-webhook",
        label: "Update STRIPE_WEBHOOK_SECRET → paste the live whsec_... value",
        code: "STRIPE_WEBHOOK_SECRET",
        codeLabel: "Secret name:",
        detail: "Replace the current test whsec_ with the live one from Step 2. Without this, every live webhook is rejected.",
        warning: "The test webhook will stop working once you swap this. That's fine — in production you'll be using the live webhook.",
      },
    ],
  },
  {
    id: "frontend-key",
    step: 4,
    title: "Frontend — Swap Stripe Publishable Key",
    subtitle: "The pk_test_ key in your app needs to become pk_live_ so the payment form talks to live Stripe.",
    icon: "ri-code-s-slash-line",
    color: "text-sky-600 bg-sky-50 border-sky-100",
    items: [
      {
        id: "readdy-env",
        label: "Ask Readdy support to update VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY",
        detail: "In the project's environment settings, change the value from pk_test_51Q6lIK... to your pk_live_... key. This is the key the Stripe payment form uses in the browser.",
        warning: "The current value is: pk_test_51Q6lIKGwm9wIWlgigt1r5RhQ... — this MUST be swapped or live card payments won't work.",
        note: "After updating, redeploy the site for the change to take effect.",
      },
    ],
  },
  {
    id: "stripe-prices",
    step: 5,
    title: "Stripe — Recreate Products & Prices in Live Mode",
    subtitle: "Your price IDs (price_1TCsIX...) are test-mode only. Live mode needs its own set.",
    icon: "ri-price-tag-3-line",
    color: "text-rose-600 bg-rose-50 border-rose-100",
    items: [
      {
        id: "create-products",
        label: "Create all 7 products in your Stripe LIVE account",
        detail: "Stripe Dashboard → Products (make sure you're in Live mode, not Test). Create one product per price combination below.",
        link: { href: "https://dashboard.stripe.com/products", text: "Open Stripe Products →" },
        note: "Switch Stripe to 'Live mode' using the toggle in the top-right of the dashboard before creating.",
      },
      {
        id: "price-table",
        label: "Match these exact prices when creating:",
        detail: "1 Pet Standard • 1 Pet Priority • 2 Pets Standard • 2 Pets Priority • 3+ Pets Standard • 3+ Pets Priority • Annual Renewal (subscription, yearly). Copy the new price IDs and share them so the code can be updated.",
        warning: "Once you have your 7 live price IDs, message Readdy to update the code — this is a 2-minute change.",
      },
    ],
  },
  {
    id: "ghl",
    step: 6,
    title: "GoHighLevel — Optional Hardening",
    subtitle: "Your GHL webhook URLs are already hardcoded and working. This step is optional but cleaner.",
    icon: "ri-links-line",
    color: "text-slate-600 bg-slate-50 border-slate-100",
    items: [
      {
        id: "ghl-optional",
        label: "(Optional) Move GHL URLs to Supabase secrets",
        detail: "If your GHL webhook URLs ever change, you'd have to redeploy code. Moving them to secrets means you can update them in the Supabase dashboard without touching code.",
        code: "GHL_WEBHOOK_URL",
        codeLabel: "Secret name for main webhook:",
        note: "Current URLs are hardcoded as fallbacks in ghl-webhook-proxy — they work fine as-is for launch.",
      },
    ],
  },
  {
    id: "prod-confirmation",
    step: 7,
    title: "Production Confirmation — Vercel & Stripe",
    subtitle: "Two manual steps that can't be done in code — must be done before going live.",
    icon: "ri-settings-4-line",
    color: "text-violet-600 bg-violet-50 border-violet-100",
    items: [
      {
        id: "vercel-env-scope",
        label: "Scope live keys to Production only in Vercel",
        detail: "Vercel → your project → Settings → Environment Variables. Edit each key below and uncheck Preview + Development — Production only.",
        code: "VITE_PUBLIC_SUPABASE_URL  |  VITE_PUBLIC_SUPABASE_ANON_KEY  |  VITE_STRIPE_PUBLISHABLE_KEY",
        codeLabel: "Keys to scope:",
        warning: "Until this is done, every preview branch URL is connected to your real live database and Stripe account.",
        link: { href: "https://vercel.com/dashboard", text: "Open Vercel Dashboard →" },
      },
      {
        id: "stripe-webhook-prod",
        label: "Confirm Stripe live webhook points to the correct Supabase URL",
        detail: "Stripe Dashboard (Live mode) → Developers → Webhooks. Verify the endpoint URL is exactly as shown below — not a dev or staging URL.",
        code: "https://cvwbozlbbmrjxznknouq.supabase.co/functions/v1/stripe-webhook",
        codeLabel: "Expected endpoint:",
        warning: "If the webhook points to a wrong URL, payments succeed but orders never update — silent failure.",
        link: { href: "https://dashboard.stripe.com/webhooks", text: "Open Stripe Webhooks →" },
      },
    ],
  },
  {
    id: "email-deliverability",
    step: 8,
    title: "Email Deliverability — SPF, DKIM, DMARC",
    subtitle: "Without these DNS records, ESA confirmation emails and letters land in spam. Worst possible time for that to happen.",
    icon: "ri-mail-check-line",
    color: "text-emerald-600 bg-emerald-50 border-emerald-100",
    items: [
      {
        id: "spf-record",
        label: "Add SPF record to pawtenant.com DNS",
        detail: "Log into your domain registrar (Namecheap / GoDaddy / Cloudflare etc.) and add a TXT record for the root domain (@). Resend's SPF is below — if you already have an SPF record, merge it rather than adding a second one.",
        code: "v=spf1 include:amazonses.com ~all",
        codeLabel: "SPF TXT value (via Resend):",
        note: "Check your exact SPF record in Resend → Settings → Domains → pawtenant.com for the current recommended value.",
        link: { href: "https://resend.com/domains", text: "Open Resend Domains →" },
      },
      {
        id: "dkim-record",
        label: "Add DKIM CNAME records from Resend",
        detail: "Resend → Domains → pawtenant.com will show you 2–3 CNAME records to add. These are unique to your account — copy them directly from the dashboard.",
        link: { href: "https://resend.com/domains", text: "Get DKIM records from Resend →" },
        note: "DNS propagation can take up to 48 hours, but usually under 30 minutes.",
      },
      {
        id: "dmarc-record",
        label: "Add DMARC TXT record",
        detail: "Add a TXT record for the subdomain _dmarc.pawtenant.com. Start with 'none' policy — it monitors without blocking, safe for launch.",
        code: "v=DMARC1; p=none; rua=mailto:hello@pawtenant.com",
        codeLabel: "DMARC TXT value:",
      },
      {
        id: "email-test",
        label: "Run a deliverability test after DNS propagates",
        detail: "Send a test email through the site and check it against mail-tester.com or use Google Admin Toolbox to verify SPF/DKIM pass.",
        link: { href: "https://www.mail-tester.com", text: "Open mail-tester.com →" },
      },
    ],
  },
  {
    id: "google-reviews",
    step: 9,
    title: "Google Business & Reviews",
    subtitle: "Social proof at the exact moment a customer has just paid — high conversion impact.",
    icon: "ri-star-line",
    color: "text-amber-600 bg-amber-50 border-amber-100",
    items: [
      {
        id: "gbp-verify",
        label: "Verify your Google Business Profile if not already done",
        detail: "Google sends a postcard or offers instant verification for some categories. Verified profiles show up in Maps and local search.",
        link: { href: "https://business.google.com", text: "Open Google Business Profile →" },
      },
      {
        id: "get-place-id",
        label: "Get your real Google Place ID",
        detail: "Go to the Google Place ID Finder, search for 'Pawtenant', and copy the Place ID (starts with ChIJ...).",
        link: { href: "https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder", text: "Open Place ID Finder →" },
        note: "Once you have it, send it to Readdy and the two thank-you pages will be updated automatically.",
        warning: "Both /assessment-thankyou and /psd-assessment-thankyou currently have a placeholder Place ID — the review link won't work until this is replaced.",
      },
    ],
  },
  {
    id: "seo-crawl",
    step: 10,
    title: "SEO — Crawl Health & URL Fixes",
    subtitle: "Protect rankings from the old WordPress site and stop the contact subdomain from cluttering Google's index.",
    icon: "ri-search-eye-line",
    color: "text-sky-600 bg-sky-50 border-sky-100",
    items: [
      {
        id: "contact-noindex",
        label: "Block contact.pawtenant.com from Google indexing",
        detail: "The GHL contact site is public but shouldn't appear in search results. Add a noindex meta tag and robots.txt to that subdomain via GHL's page settings. The page stays accessible — it just won't be crawled.",
        note: "After adding, verify in Google Search Console → URL Inspection that the page is not indexed.",
      },
      {
        id: "gsc-export",
        label: "Export all currently indexed WordPress URLs from Google Search Console",
        detail: "GSC → Pages → Indexing → Indexed. Export the list. Look for old patterns like /esa-letter-california/ — these need to redirect to the new format /esa-letter/california.",
        link: { href: "https://search.google.com/search-console", text: "Open Google Search Console →" },
      },
      {
        id: "301-redirects",
        label: "Add 301 redirects for old WordPress URL patterns in vercel.json",
        detail: "Map each old URL to the correct new one. Example: /esa-letter-california/ → /esa-letter/california. Without these, any Google traffic to old URLs hits a 404 and rankings are lost permanently.",
        note: "Share the exported GSC URL list with Readdy and the redirects will be added to vercel.json in one pass.",
      },
      {
        id: "gsc-sitemap",
        label: "Submit sitemap to Google Search Console",
        detail: "GSC → Sitemaps → Add a new sitemap. The sitemap is already live and production-ready.",
        code: "https://www.pawtenant.com/sitemap.xml",
        codeLabel: "Sitemap URL:",
        link: { href: "https://search.google.com/search-console/sitemaps", text: "Open GSC Sitemaps →" },
      },
    ],
  },
  {
    id: "attribution",
    step: 11,
    title: "Attribution & Conversion Tracking",
    subtitle: "Know exactly which channel and campaign is generating revenue before you start spending on ads.",
    icon: "ri-bar-chart-grouped-line",
    color: "text-rose-600 bg-rose-50 border-rose-100",
    items: [
      {
        id: "utm-columns",
        label: "Add UTM + click ID columns to Google Sheets",
        detail: "utm_source, utm_medium, utm_campaign, utm_term, gclid, fbclid. These are already captured on the frontend — just need to be written through to the sheet. Share with Readdy to implement.",
        note: "Once live, every new order row will show exactly which Google/Facebook/TikTok campaign drove it.",
      },
      {
        id: "traffic-source-fix",
        label: "Upgrade trafficSource logic to map correctly",
        detail: "Current logic often falls through to 'Direct / Unknown'. The fix maps gclid → Google Ads, fbclid → Facebook Ads, utm_source=tiktok → TikTok Ads, referrer present but no UTMs → Referral, nothing → Direct.",
        note: "This is a code change — let Readdy handle it alongside the UTM columns above.",
      },
      {
        id: "meta-pixel-test",
        label: "Verify Meta Pixel fires correctly in production",
        detail: "Open Meta Events Manager → Test Events tab. Load the assessment page, complete a checkout, and confirm Lead + Purchase events appear with correct values.",
        link: { href: "https://business.facebook.com/events_manager", text: "Open Meta Events Manager →" },
      },
      {
        id: "gads-conversion",
        label: "Verify Google Ads conversion tracking fires on checkout completion",
        detail: "Google Ads → Tools → Measurement → Conversions. Use Google Tag Assistant or the Ads conversion debugger to confirm a Purchase event fires after payment.",
        link: { href: "https://ads.google.com/aw/conversions", text: "Open Google Ads Conversions →" },
      },
    ],
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
      className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors whitespace-nowrap cursor-pointer"
    >
      <i className={copied ? "ri-check-line text-emerald-600" : "ri-clipboard-line"} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function GoLivePage() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // ── Admin auth gate ────────────────────────────────────────────────────────
  // Only allow access if the visitor has an active Supabase session (i.e. is
  // logged in to the admin panel). Anyone who just guesses /go-live gets
  // redirected to /admin-login with a ?next= so they land here after sign-in.
  useEffect(() => {
    const verify = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin-login?next=/go-live", { replace: true });
        return;
      }
      setAuthorized(true);
      setAuthChecked(true);
    };
    verify();
  }, [navigate]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Checking access...</p>
        </div>
      </div>
    );
  }

  if (!authorized) return null;

  const totalItems = SECTIONS.reduce((acc, s) => acc + s.items.length, 0);
  const doneCount = Object.values(checked).filter(Boolean).length;
  const allDone = doneCount === totalItems;

  const toggle = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="min-h-screen bg-slate-50 py-14 px-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
            <i className="ri-rocket-line" />
            Internal Use Only
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Go-Live Checklist</h1>
          <p className="text-slate-500 text-base">
            Everything you need to flip PawTenant from test mode to real-world live.
            Tick each item as you complete it — your progress saves automatically.
          </p>
          {/* Progress bar */}
          <div className="mt-6 bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Overall progress</span>
              <span className="text-sm font-semibold text-slate-900">
                {doneCount} / {totalItems} done
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${(doneCount / totalItems) * 100}%` }}
              />
            </div>
            {allDone && (
              <p className="mt-3 text-sm font-semibold text-emerald-600 flex items-center gap-2">
                <i className="ri-checkbox-circle-fill text-lg" />
                You&apos;re ready to go live!
              </p>
            )}
          </div>
        </div>

        {/* ── Test environment status banner ── */}
        <div className="mb-8 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 border border-slate-200 text-slate-500">
              <i className="ri-test-tube-line text-lg" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Current Test Environment Status</p>
              <p className="text-xs text-slate-500">What&apos;s already done — nothing to action here</p>
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {[
              { label: "Stripe test webhook registered", value: "exquisite-sensation → active, 0% error rate, listening to payment_intent.succeeded", ok: true },
              { label: "Test webhook delivery", value: "19 total deliveries, 0 failures — Stripe always reached the server", ok: true },
              { label: "RLS policy (payment write)", value: "Fixed — anon users can now write payment_intent_id when upgrading lead → processing", ok: true },
              { label: "Webhook code (payment_intent_id save)", value: "Fixed — webhook now writes payment_intent_id using service role key, bypasses RLS", ok: true },
              { label: "Refresh button", value: "Now calls Stripe search API first, then syncs any missed payments before loading DB", ok: true },
              { label: "Historical broken orders", value: "Zeeshan, Usman, Huzaifa, Olivia — all synced and showing correct payment_intent_id", ok: true },
            ].map((row) => (
              <div key={row.label} className="px-6 py-3 flex items-start gap-3">
                <div className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded-full flex items-center justify-center text-xs ${row.ok ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-500"}`}>
                  <i className={row.ok ? "ri-check-line" : "ri-close-line"} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{row.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{row.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pre-deploy security fixes — already completed */}
        <div className="mb-8 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-600">
              <i className="ri-shield-check-line text-lg" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Pre-Deploy Security Fixes — Completed</p>
              <p className="text-xs text-slate-500">These were fixed before launch — nothing to action</p>
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {[
              { label: "Sheets secret removed from browser bundle", value: "SHEETS_SECRET + webhook URL deleted from frontend code. All syncing now routes through sync-to-sheets edge function only." },
              { label: "robots.txt disallow paths corrected", value: "/assessment-thankyou and /psd-assessment-thankyou now match actual routes." },
              { label: "Meta Pixel console logs stripped from production", value: "All 6 console.log/warn calls in metaPixel.ts wrapped in import.meta.env.DEV — silent in production." },
              { label: "React Error Boundary added", value: "Any unhandled component crash now shows a clean error page instead of a blank white screen." },
              { label: "/go-live page access-controlled", value: "Redirects to /admin-login if no active admin session. Not publicly accessible." },
            ].map((row) => (
              <div key={row.label} className="px-6 py-3 flex items-start gap-3">
                <div className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-full flex items-center justify-center text-xs bg-emerald-100 text-emerald-600">
                  <i className="ri-check-line" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{row.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{row.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Root cause explanation ── */}
        <div className="mb-8 bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <i className="ri-bug-line text-amber-500 text-lg mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-800 mb-1">Why did orders show unpaid even though the webhook fired?</p>
              <p className="text-sm text-amber-700 leading-relaxed">
                The Stripe webhook was always delivered successfully (19/19, 0 failures). The bug was <strong>inside the webhook code</strong>:
                it found the order, synced GHL, then tried to write <code className="bg-amber-100 px-1 rounded text-xs">payment_intent_id</code> to
                Supabase — but the RLS policy had an implicit <code className="bg-amber-100 px-1 rounded text-xs">WITH CHECK (status = &apos;lead&apos;)</code>.
                Since the code was also changing status to <code className="bg-amber-100 px-1 rounded text-xs">processing</code>, Postgres rejected the entire
                row update silently. Stripe got a 200 OK, marked delivery as success — but the DB was never updated.
                The same RLS block also hit the client-side save on the checkout page. Both are now fixed.
              </p>
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-6">
          {SECTIONS.map((section) => {
            const sectionDone = section.items.every((i) => checked[i.id]);
            return (
              <div
                key={section.id}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
              >
                {/* Section header */}
                <div className="flex items-start gap-4 px-6 py-5 border-b border-slate-100">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-xl border text-lg flex-shrink-0 ${section.color}`}>
                    <i className={section.icon} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        Step {section.step}
                      </span>
                      {sectionDone && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <i className="ri-check-line" /> Complete
                        </span>
                      )}
                    </div>
                    <h2 className="text-base font-bold text-slate-900">{section.title}</h2>
                    <p className="text-sm text-slate-500 mt-0.5">{section.subtitle}</p>
                  </div>
                </div>

                {/* Items */}
                <div className="divide-y divide-slate-50">
                  {section.items.map((item) => (
                    <div
                      key={item.id}
                      className={`px-6 py-4 flex gap-4 transition-colors ${
                        checked[item.id] ? "bg-slate-50" : "hover:bg-slate-50/60"
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={() => toggle(item.id)}
                        className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center cursor-pointer transition-all ${
                          checked[item.id]
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "border-slate-300 bg-white hover:border-emerald-400"
                        }`}
                      >
                        {checked[item.id] && <i className="ri-check-line text-xs" />}
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-semibold leading-snug ${
                            checked[item.id] ? "line-through text-slate-400" : "text-slate-800"
                          }`}
                        >
                          {item.label}
                        </p>

                        {item.detail && (
                          <p className="text-sm text-slate-500 mt-1">{item.detail}</p>
                        )}

                        {item.code && (
                          <div className="mt-2 flex items-center">
                            {item.codeLabel && (
                              <span className="text-xs text-slate-500 mr-2">{item.codeLabel}</span>
                            )}
                            <code className="text-xs bg-slate-100 text-slate-800 px-2.5 py-1 rounded font-mono">
                              {item.code}
                            </code>
                            <CopyButton text={item.code} />
                          </div>
                        )}

                        {item.warning && (
                          <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <i className="ri-alert-line text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700">{item.warning}</p>
                          </div>
                        )}

                        {item.note && (
                          <div className="mt-2 flex items-start gap-2 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
                            <i className="ri-information-line text-sky-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-sky-700">{item.note}</p>
                          </div>
                        )}

                        {item.link && (
                          <a
                            href={item.link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-2 cursor-pointer"
                          >
                            <i className="ri-external-link-line" />
                            {item.link.text}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary / what to tell Readdy */}
        <div className="mt-8 bg-slate-900 text-white rounded-2xl p-6">
          <h3 className="font-bold text-base mb-2 flex items-center gap-2">
            <i className="ri-chat-3-line text-slate-400" />
            What to send Readdy after Step 5
          </h3>
          <p className="text-slate-400 text-sm mb-3">
            Once you have your 7 live Stripe price IDs, just paste them in a message and the code will be updated in minutes. Here&apos;s the format:
          </p>
          <pre className="text-xs text-emerald-400 font-mono leading-relaxed bg-slate-800 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
{`1 Pet Standard:   price_live_...
1 Pet Priority:   price_live_...
2 Pets Standard:  price_live_...
2 Pets Priority:  price_live_...
3+ Pets Standard: price_live_...
3+ Pets Priority: price_live_...
Annual Renewal:   price_live_...`}
          </pre>
        </div>

        <p className="text-center text-xs text-slate-400 mt-8">
          This page is not linked from the public site. Access it at /go-live.
        </p>
      </div>
    </div>
  );
}
