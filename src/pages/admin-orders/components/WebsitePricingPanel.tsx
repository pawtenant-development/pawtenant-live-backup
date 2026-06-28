// WebsitePricingPanel — admin control for prices shown as PUBLIC website TEXT.
//
// DISPLAY ONLY. Editing here changes the numbers rendered on public pages
// (homepage, ESA/PSD pricing cards, cost pages). It does NOT touch Stripe
// checkout amounts, price IDs, products, coupons, order totals, refunds, or
// payouts — those are controlled separately by Stripe + checkout logic.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { clearSitePricingCache, formatPriceFromCents } from "../../../lib/sitePricing";

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

// Per-row editable draft state.
interface Draft {
  dollars: string;       // amount in dollars, as typed
  displayText: string;   // optional override string
}

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
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  const showToast = (kind: "success" | "error", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("site_pricing_settings")
      .select("id,key,label,service_type,amount_cents,currency,display_text,description,is_active,sort_order,updated_at")
      .order("sort_order", { ascending: true });
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

  const handleSave = async (r: PricingRow) => {
    const d = drafts[r.key];
    if (!d) return;

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

    setSavingKey(r.key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("site_pricing_settings")
        .update({
          amount_cents,
          display_text: d.displayText.trim() === "" ? null : d.displayText.trim(),
          updated_by: user?.id ?? null,
        })
        .eq("id", r.id);

      if (error) {
        showToast("error", `Save failed: ${error.message}`);
      } else {
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

  const grouped = useMemo(() => {
    return GROUPS.map((g) => ({ ...g, items: rows.filter((r) => r.service_type === g.type) }))
      .filter((g) => g.items.length > 0);
  }, [rows]);

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
            Stripe + checkout. Use this to keep the marketing copy on public pages in sync.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-gray-400">
          <i className="ri-loader-4-line animate-spin"></i>
          <span className="text-sm">Loading pricing settings…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500 py-6 text-center">No pricing keys found.</div>
      ) : (
        grouped.map((g) => (
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

                return (
                  <div key={r.id} className="border border-gray-200 rounded-xl p-4 bg-white">
                    <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900">{r.label}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <code className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{r.key}</code>
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
                            className="w-full text-sm border border-gray-200 rounded-lg pl-7 pr-3 py-2 bg-gray-50 text-gray-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#3b6ea5]/20"
                          />
                        </div>
                      </div>

                      {/* Optional display override */}
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-1">
                          Display override <span className="font-normal text-gray-400">(optional)</span>
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
                        disabled={!dirty || savingKey === r.key}
                        className={`whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          dirty ? "bg-[#3b6ea5] text-white hover:bg-[#2d5a8e]" : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {savingKey === r.key ? <><i className="ri-loader-4-line animate-spin"></i>Saving…</> : <><i className="ri-save-line"></i>Save</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold ${
          toast.kind === "success" ? "bg-[#3b6ea5] text-white" : "bg-red-500 text-white"
        }`}>
          <i className={toast.kind === "success" ? "ri-checkbox-circle-fill" : "ri-error-warning-fill"}></i>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
