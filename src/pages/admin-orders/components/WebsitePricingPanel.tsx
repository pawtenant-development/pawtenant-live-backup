// WebsitePricingPanel — admin control for prices shown as PUBLIC website TEXT.
//
// DISPLAY ONLY. Editing here changes the numbers rendered on public pages
// (homepage, ESA/PSD pricing cards, cost pages). It does NOT touch Stripe
// checkout amounts, price IDs, products, coupons, order totals, refunds, or
// payouts — those are controlled separately by Stripe + checkout logic.
//
// CLOSEOUT-005 Phase E: the panel now shows the canonical server pricing as a
// read-only reference (first-year vs renewal separated), badges every editable
// display row as matching / diverging from the real checkout charge, BLOCKS a
// save that would publish a number different from the checkout price, renders
// retired prices read-only, shows the Stripe TEST Price mapping safely (no
// secrets), and writes an audit_logs record on every change.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { clearSitePricingCache, formatPriceFromCents } from "../../../lib/sitePricing";
import {
  ESA_PRICING,
  PSD_PRICING,
  RENEWAL_PRICING,
  ADDITIONAL_DOC_PRICING,
  BUNDLE_PRICING,
} from "../../../config/pricing";

interface PricingRow {
  id: string;
  key: string;
  label: string;
  service_type: string;
  amount_cents: number;
  currency: string;
  display_text: string | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  updated_at: string | null;
}

interface StripeMapRow {
  lookup_key: string;
  product: string | null;
  package: string | null;
  tier: string | null;
  phase: string | null;
  stripe_price_id: string | null;
  unit_amount: number | null;
  currency: string | null;
  bill_interval: string | null;
  livemode: boolean | null;
  last_result: string | null;
}

// Per-row editable draft state.
interface Draft {
  dollars: string;       // amount in dollars, as typed
  displayText: string;   // optional override string
}

// ── Canonical server pricing (SOURCE OF TRUTH = src/config/pricing.ts, mirrored
//    to the real Stripe charge in supabase/functions/_shared/pricingMatrix.ts).
//    An editable display row that maps to one of these keys must equal this
//    amount — Save is blocked otherwise, so the website can never advertise a
//    number the checkout won't honor. ──────────────────────────────────────────
const CANONICAL_CENTS: Record<string, number> = {
  esa_single_pet:           ESA_PRICING.oneTime * 100,                 // 12900
  esa_multi_pet:            ESA_PRICING.oneTimeMultiPetTotal * 100,    // 14900
  esa_subscription_annual:  ESA_PRICING.subscription * 100,           // 11500 (first year)
  esa_subscription_multi:   ESA_PRICING.subscriptionMultiPetTotal * 100, // 13500 (first year)
  psd_standard:             PSD_PRICING.oneTime * 100,                // 12900
  psd_priority:             PSD_PRICING.oneTime * 100,                // 12900
  psd_multi_dog:            PSD_PRICING.oneTimeMultiDogTotal * 100,   // 14900
  psd_annual:               PSD_PRICING.annual * 100,                // 11500 (first year)
  psd_annual_multi:         PSD_PRICING.annualMultiDogTotal * 100,   // 13500 (first year)
  renewal_annual:           RENEWAL_PRICING.single * 100,            // 10000 (single-tier renewal)
  additional_documentation: ADDITIONAL_DOC_PRICING.addon * 100,      // 5000
};

// Full canonical structure, read-only reference. First-year and renewal are
// deliberately separate rows so the difference is unmistakable.
const CANONICAL_REFERENCE: { group: string; note?: string; rows: { label: string; dollars: number; suffix: string }[] }[] = [
  { group: "ESA — One-Time", rows: [
    { label: "1 pet", dollars: ESA_PRICING.oneTime, suffix: "one-time" },
    { label: "2 or 3 pets (fixed total)", dollars: ESA_PRICING.oneTimeMultiPetTotal, suffix: "one-time" },
  ]},
  { group: "ESA — Subscription · First Year", rows: [
    { label: "1 pet", dollars: ESA_PRICING.subscription, suffix: "first year" },
    { label: "2 or 3 pets (fixed total)", dollars: ESA_PRICING.subscriptionMultiPetTotal, suffix: "first year" },
  ]},
  { group: "ESA — Subscription · Renewal (year 2+)", rows: [
    { label: "1 pet", dollars: RENEWAL_PRICING.single, suffix: "/year" },
    { label: "2 or 3 pets (fixed total)", dollars: RENEWAL_PRICING.multi, suffix: "/year" },
  ]},
  { group: "PSD — One-Time", rows: [
    { label: "1 dog", dollars: PSD_PRICING.oneTime, suffix: "one-time" },
    { label: "2 or 3 dogs (fixed total)", dollars: PSD_PRICING.oneTimeMultiDogTotal, suffix: "one-time" },
  ]},
  { group: "PSD — Subscription · First Year", rows: [
    { label: "1 dog", dollars: PSD_PRICING.annual, suffix: "first year" },
    { label: "2 or 3 dogs (fixed total)", dollars: PSD_PRICING.annualMultiDogTotal, suffix: "first year" },
  ]},
  { group: "PSD — Subscription · Renewal (year 2+)", rows: [
    { label: "1 dog", dollars: RENEWAL_PRICING.single, suffix: "/year" },
    { label: "2 or 3 dogs (fixed total)", dollars: RENEWAL_PRICING.multi, suffix: "/year" },
  ]},
  { group: "Combo (+ Reasonable Accommodation letter)", note: "Flat — no year-two reduction", rows: [
    { label: "One-time", dollars: BUNDLE_PRICING.oneTime, suffix: "one-time" },
    { label: "Annual", dollars: BUNDLE_PRICING.annual, suffix: "/year (both years)" },
  ]},
];

const GROUPS: { type: string; label: string; icon: string; iconBg: string; iconColor: string }[] = [
  { type: "esa", label: "ESA Pricing", icon: "ri-heart-line", iconBg: "bg-orange-50", iconColor: "text-orange-600" },
  { type: "subscription", label: "Subscriptions & Packages", icon: "ri-repeat-line", iconBg: "bg-amber-50", iconColor: "text-amber-600" },
  { type: "psd", label: "PSD Pricing", icon: "ri-mental-health-line", iconBg: "bg-[#e8f4f1]", iconColor: "text-[#4A8472]" },
  { type: "addon", label: "Add-ons", icon: "ri-add-circle-line", iconBg: "bg-sky-50", iconColor: "text-sky-600" },
  { type: "general", label: "Other", icon: "ri-price-tag-3-line", iconBg: "bg-gray-50", iconColor: "text-gray-600" },
];

function fmtDate(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function WebsitePricingPanel() {
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [stripeMap, setStripeMap] = useState<StripeMapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  const showToast = (kind: "success" | "error", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4500);
  };

  const load = async () => {
    setLoading(true);
    const [{ data, error }, mapRes] = await Promise.all([
      supabase
        .from("site_pricing_settings")
        .select("id,key,label,service_type,amount_cents,currency,display_text,description,is_active,sort_order,updated_at")
        .order("sort_order", { ascending: true }),
      supabase
        .from("pricing_stripe_map")
        .select("lookup_key,product,package,tier,phase,stripe_price_id,unit_amount,currency,bill_interval,livemode,last_result")
        .order("lookup_key", { ascending: true }),
    ]);
    if (!error && data) {
      const list = data as PricingRow[];
      setRows(list);
      const d: Record<string, Draft> = {};
      for (const r of list) {
        d[r.key] = { dollars: String(r.amount_cents / 100), displayText: r.display_text ?? "" };
      }
      setDrafts(d);
    } else {
      showToast("error", "Could not load pricing settings.");
    }
    // Stripe map is read-only reference; a failure here is non-fatal.
    if (!mapRes.error && mapRes.data) setStripeMap(mapRes.data as StripeMapRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateDraft = (key: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const isDirty = (r: PricingRow): boolean => {
    const d = drafts[r.key];
    if (!d) return false;
    const centsNow = Math.round(parseFloat(d.dollars) * 100);
    const amountChanged = Number.isFinite(centsNow) && centsNow !== r.amount_cents;
    const overrideChanged = (d.displayText.trim() || "") !== (r.display_text?.trim() ?? "");
    return amountChanged || overrideChanged;
  };

  /** Canonical checkout amount for a key, or null if the key has no server charge. */
  const canonicalFor = (key: string): number | null =>
    Object.prototype.hasOwnProperty.call(CANONICAL_CENTS, key) ? CANONICAL_CENTS[key] : null;

  const handleSave = async (r: PricingRow) => {
    const d = drafts[r.key];
    if (!d) return;

    // Retired rows are read-only — never savable.
    if (!r.is_active) {
      showToast("error", `${r.label} is retired and read-only.`);
      return;
    }

    // ── Validation ──
    const raw = d.dollars.trim();
    if (raw === "") {
      showToast("error", `${r.label}: amount cannot be empty.`);
      return;
    }
    const dollars = Number(raw);
    if (!Number.isFinite(dollars)) {
      showToast("error", `${r.label}: amount must be a number.`);
      return;
    }
    if (dollars <= 0) {
      showToast("error", `${r.label}: amount must be greater than 0.`);
      return;
    }
    const amount_cents = Math.round(dollars * 100);

    // ── Publish guard: a display price MUST equal the real checkout charge ──
    const canonical = canonicalFor(r.key);
    if (canonical !== null && amount_cents !== canonical) {
      showToast(
        "error",
        `${r.label}: display $${(amount_cents / 100)} must equal the checkout price $${(canonical / 100)}. Publishing a different number would mislead customers.`,
      );
      return;
    }

    setSavingKey(r.key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const newDisplayText = d.displayText.trim() === "" ? null : d.displayText.trim();
      const { error } = await supabase
        .from("site_pricing_settings")
        .update({
          amount_cents,
          display_text: newDisplayText,
          updated_by: user?.id ?? null,
        })
        .eq("id", r.id);

      if (error) {
        showToast("error", `Save failed: ${error.message}`);
      } else {
        // Audit trail (best-effort; RLS allows an authenticated admin to insert).
        try {
          await supabase.from("audit_logs").insert({
            actor_id: user?.id ?? null,
            actor_role: "admin",
            object_type: "site_pricing_setting",
            object_id: r.key,
            action: "update",
            description: `Website display price "${r.label}" updated`,
            old_values: { amount_cents: r.amount_cents, display_text: r.display_text },
            new_values: { amount_cents, display_text: newDisplayText },
          });
        } catch { /* non-fatal — updated_by/updated_at still record the change */ }
        clearSitePricingCache(); // public site picks up new values on next fetch
        showToast("success", `${r.label} updated.`);
        await load();
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSavingKey(null);
    }
  };

  const activeRows = useMemo(() => rows.filter((r) => r.is_active), [rows]);
  const retiredRows = useMemo(
    () => rows.filter((r) => !r.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [rows],
  );

  const grouped = useMemo(() => {
    return GROUPS.map((g) => ({ ...g, items: activeRows.filter((r) => r.service_type === g.type) }))
      .filter((g) => g.items.length > 0);
  }, [activeRows]);

  const mismatchCount = useMemo(
    () => activeRows.filter((r) => {
      const c = canonicalFor(r.key);
      return c !== null && r.amount_cents !== c;
    }).length,
    [activeRows],
  );

  return (
    <div className="space-y-5">
      {/* Stripe-safety warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <i className="ri-alert-line text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
        <div>
          <p className="text-xs font-bold text-amber-800 mb-0.5">Display prices only</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            This updates website <strong>display</strong> prices only. It does <strong>not</strong> update
            Stripe checkout prices or product IDs. Customers are still charged the amounts configured in
            Stripe + checkout. A save is <strong>blocked</strong> if a display amount would not match the real
            checkout charge, so the website can never advertise a price the checkout won&apos;t honor.
          </p>
        </div>
      </div>

      {/* Canonical server pricing — read-only source of truth */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-900 px-4 py-3 flex items-center gap-2">
          <i className="ri-shield-check-line text-emerald-400 text-sm"></i>
          <p className="text-xs font-extrabold text-white uppercase tracking-[0.12em]">Canonical checkout pricing — read-only</p>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CANONICAL_REFERENCE.map((g) => (
            <div key={g.group} className="border border-gray-100 rounded-lg p-3 bg-gray-50/60">
              <p className="text-[11px] font-extrabold text-gray-700 mb-2 leading-snug">{g.group}</p>
              <div className="space-y-1.5">
                {g.rows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-gray-500">{row.label}</span>
                    <span className="text-xs font-bold text-gray-900 whitespace-nowrap">${row.dollars} <span className="font-normal text-gray-400">{row.suffix}</span></span>
                  </div>
                ))}
              </div>
              {g.note && <p className="text-[10px] text-gray-400 mt-2 italic">{g.note}</p>}
            </div>
          ))}
        </div>
        <p className="px-4 pb-3 text-[10px] text-gray-400">
          Source of truth: <code className="font-mono">src/config/pricing.ts</code> (mirrored to the Stripe charge in <code className="font-mono">_shared/pricingMatrix.ts</code>). First-year and renewal are separate.
        </p>
      </div>

      {mismatchCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
          <i className="ri-error-warning-line text-red-500 text-sm"></i>
          <p className="text-xs font-semibold text-red-700">
            {mismatchCount} display price{mismatchCount === 1 ? "" : "s"} currently differ from the checkout charge. Fix each flagged row below.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-gray-400">
          <i className="ri-loader-4-line animate-spin"></i>
          <span className="text-sm">Loading pricing settings…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500 py-6 text-center">No pricing keys found.</div>
      ) : (
        <>
          {grouped.map((g) => (
            <div key={g.type}>
              {/* Group header */}
              <div className="flex items-center gap-2 mb-2.5">
                <div className={`w-7 h-7 flex items-center justify-center ${g.iconBg} rounded-lg flex-shrink-0`}>
                  <i className={`${g.icon} ${g.iconColor} text-sm`}></i>
                </div>
                <h4 className="text-xs font-extrabold uppercase tracking-[0.12em] text-gray-700">{g.label}</h4>
              </div>

              <div className="space-y-3">
                {g.items.map((r) => {
                  const d = drafts[r.key] ?? { dollars: "", displayText: "" };
                  const dirty = isDirty(r);
                  const parsed = Number(d.dollars);
                  const previewCents = Number.isFinite(parsed) ? Math.round(parsed * 100) : r.amount_cents;
                  const preview = d.displayText.trim() || formatPriceFromCents(previewCents, r.currency);
                  const canonical = canonicalFor(r.key);
                  const typedCents = Math.round(parsed * 100);
                  const draftMatches = canonical === null || (Number.isFinite(typedCents) && typedCents === canonical);
                  const liveMatches = canonical === null || r.amount_cents === canonical;
                  const blocked = canonical !== null && Number.isFinite(typedCents) && typedCents !== canonical;

                  return (
                    <div key={r.id} className={`border rounded-xl p-4 bg-white ${liveMatches ? "border-gray-200" : "border-red-300"}`}>
                      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900">{r.label}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <code className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{r.key}</code>
                            {/* Parity badge vs the real checkout charge */}
                            {canonical !== null ? (
                              liveMatches ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                  <i className="ri-checkbox-circle-fill"></i>Matches checkout ${canonical / 100}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                                  <i className="ri-error-warning-fill"></i>≠ checkout ${canonical / 100}
                                </span>
                              )
                            ) : (
                              <span className="text-[10px] font-semibold text-gray-400">display-only</span>
                            )}
                            <span className="text-[10px] text-gray-400">Updated {fmtDate(r.updated_at)}</span>
                          </div>
                          {r.description && <p className="text-xs text-gray-400 mt-1">{r.description}</p>}
                        </div>
                        <div className="flex flex-col items-end flex-shrink-0">
                          <span className="text-[10px] text-gray-400 uppercase tracking-wide">Preview</span>
                          <span className="text-lg font-black text-gray-900 leading-none">{preview}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-3 items-end">
                        {/* Amount in dollars */}
                        <div>
                          <label className="block text-[11px] font-bold text-gray-600 mb-1">Amount ({r.currency})</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={d.dollars}
                              onChange={(e) => updateDraft(r.key, { dollars: e.target.value })}
                              className={`w-full text-sm border rounded-lg pl-7 pr-3 py-2 font-semibold focus:outline-none focus:ring-2 ${blocked ? "border-red-300 bg-red-50 text-red-800 focus:ring-red-200" : "border-gray-200 bg-gray-50 text-gray-800 focus:ring-[#3b6ea5]/20"}`}
                            />
                          </div>
                        </div>

                        {/* Optional display override */}
                        <div>
                          <label className="block text-[11px] font-bold text-gray-600 mb-1">
                            Display override <span className="font-normal text-gray-400">(reformat only)</span>
                          </label>
                          <input
                            type="text"
                            value={d.displayText}
                            onChange={(e) => updateDraft(r.key, { displayText: e.target.value })}
                            placeholder={`Defaults to ${formatPriceFromCents(previewCents, r.currency)}`}
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#3b6ea5]/20"
                          />
                        </div>

                        {/* Save */}
                        <button
                          type="button"
                          onClick={() => handleSave(r)}
                          disabled={!dirty || savingKey === r.key || blocked}
                          title={blocked ? `Blocked: display must equal the checkout price $${(canonical ?? 0) / 100}` : undefined}
                          className={`whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            dirty && !blocked ? "bg-[#3b6ea5] text-white hover:bg-[#2d5a8e]" : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {savingKey === r.key ? <><i className="ri-loader-4-line animate-spin"></i>Saving…</> : blocked ? <><i className="ri-lock-line"></i>Blocked</> : <><i className="ri-save-line"></i>Save</>}
                        </button>
                      </div>

                      {blocked && !draftMatches && (
                        <p className="text-[11px] text-red-600 mt-2 flex items-center gap-1">
                          <i className="ri-error-warning-line"></i>
                          Display must equal the checkout price ${canonical! / 100}. Publishing is blocked until it matches.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Retired / read-only prices */}
          {retiredRows.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded-lg flex-shrink-0">
                  <i className="ri-archive-line text-gray-500 text-sm"></i>
                </div>
                <h4 className="text-xs font-extrabold uppercase tracking-[0.12em] text-gray-500">Retired — read-only (historical)</h4>
              </div>
              <div className="space-y-2">
                {retiredRows.map((r) => (
                  <div key={r.id} className="border border-gray-200 border-dashed rounded-xl p-3.5 bg-gray-50 flex items-center justify-between gap-3 flex-wrap opacity-90">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-500 line-through decoration-gray-300">{r.label}</p>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded uppercase tracking-wide">
                          <i className="ri-archive-line"></i>Retired
                        </span>
                      </div>
                      <code className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded mt-1 inline-block">{r.key}</code>
                    </div>
                    <span className="text-base font-black text-gray-400 whitespace-nowrap">{formatPriceFromCents(r.amount_cents, r.currency)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Retired prices are kept for historical records only. They have no active card, button, or checkout path and cannot be edited here.
              </p>
            </div>
          )}

          {/* Stripe TEST Price mapping — read-only, no secrets */}
          {stripeMap.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-[#f6f8fb] px-4 py-3 flex items-center gap-2 border-b border-gray-200">
                <i className="ri-bank-card-line text-[#3b6ea5] text-sm"></i>
                <p className="text-xs font-extrabold text-gray-700 uppercase tracking-[0.12em]">Stripe subscription Price map — read-only</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[640px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                      <th className="px-3 py-2 font-bold">Lookup key</th>
                      <th className="px-3 py-2 font-bold">Product / tier / phase</th>
                      <th className="px-3 py-2 font-bold">Amount</th>
                      <th className="px-3 py-2 font-bold">Stripe Price ID</th>
                      <th className="px-3 py-2 font-bold">Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stripeMap.map((m) => (
                      <tr key={m.lookup_key} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2"><code className="font-mono text-[10px] text-gray-600">{m.lookup_key}</code></td>
                        <td className="px-3 py-2 text-gray-500">{[m.product, m.tier, m.phase].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="px-3 py-2 font-bold text-gray-800">{m.unit_amount != null ? formatPriceFromCents(m.unit_amount, m.currency ?? "USD") : "—"}{m.bill_interval ? <span className="font-normal text-gray-400">/{m.bill_interval}</span> : null}</td>
                        <td className="px-3 py-2"><code className="font-mono text-[10px] text-gray-400">{m.stripe_price_id ?? "—"}</code></td>
                        <td className="px-3 py-2">
                          {m.livemode
                            ? <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">LIVE</span>
                            : <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">test</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-2.5 text-[10px] text-gray-400 border-t border-gray-100">
                Read-only mapping of subscription lookup keys to provisioned Stripe Prices. Price IDs are public identifiers; no secret keys are shown or editable here.
              </p>
            </div>
          )}
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold max-w-md ${
          toast.kind === "success" ? "bg-[#3b6ea5] text-white" : "bg-red-500 text-white"
        }`}>
          <i className={toast.kind === "success" ? "ri-checkbox-circle-fill" : "ri-error-warning-fill"}></i>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
