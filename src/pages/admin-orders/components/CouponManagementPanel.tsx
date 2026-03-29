import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface Coupon {
  id: string;
  code: string;
  discount: number;
  description: string | null;
  is_active: boolean;
  max_uses: number | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  usage_count?: number;
}

interface CreateForm {
  code: string;
  discount: string;
  description: string;
  max_uses: string;
  expires_at: string;
}

const EMPTY_FORM: CreateForm = {
  code: "",
  discount: "",
  description: "",
  max_uses: "",
  expires_at: "",
};

function fmt(ts: string) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CouponManagementPanel() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});

  const loadCoupons = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false });
    setCoupons((data as Coupon[]) ?? []);
    setLoading(false);
  }, []);

  const loadUsageCounts = useCallback(async (codes: string[]) => {
    if (codes.length === 0) return;
    const { data } = await supabase
      .from("orders")
      .select("coupon_code")
      .in("coupon_code", codes);
    const counts: Record<string, number> = {};
    (data ?? []).forEach((row: { coupon_code: string | null }) => {
      if (row.coupon_code) {
        counts[row.coupon_code] = (counts[row.coupon_code] ?? 0) + 1;
      }
    });
    setUsageCounts(counts);
  }, []);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  useEffect(() => {
    if (coupons.length > 0) {
      loadUsageCounts(coupons.map((c) => c.code));
    }
  }, [coupons, loadUsageCounts]);

  const handleCreate = async () => {
    const code = form.code.trim().toUpperCase();
    const discount = parseInt(form.discount, 10);

    if (!code) { setSaveMsg("Coupon code is required."); return; }
    if (isNaN(discount) || discount <= 0) { setSaveMsg("Discount must be a positive number."); return; }
    if (code.length < 3) { setSaveMsg("Code must be at least 3 characters."); return; }

    setSaving(true);
    setSaveMsg("");

    const { error } = await supabase.from("coupons").insert({
      code,
      discount,
      description: form.description.trim() || null,
      max_uses: form.max_uses ? parseInt(form.max_uses, 10) : null,
      expires_at: form.expires_at || null,
      created_by: "admin",
      is_active: true,
    });

    if (error) {
      setSaveMsg(error.code === "23505" ? "A coupon with that code already exists." : `Failed: ${error.message}`);
    } else {
      setSaveMsg("Coupon created successfully!");
      setForm(EMPTY_FORM);
      setShowCreate(false);
      loadCoupons();
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 4000);
  };

  const handleToggleActive = async (coupon: Coupon) => {
    setTogglingId(coupon.id);
    await supabase
      .from("coupons")
      .update({ is_active: !coupon.is_active })
      .eq("id", coupon.id);
    setCoupons((prev) =>
      prev.map((c) => c.id === coupon.id ? { ...c, is_active: !c.is_active } : c)
    );
    setTogglingId(null);
  };

  const activeCoupons = coupons.filter((c) => c.is_active);
  const inactiveCoupons = coupons.filter((c) => !c.is_active);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-green-50 rounded-xl flex-shrink-0">
            <i className="ri-coupon-3-line text-green-700 text-lg"></i>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Coupon Code Management</h3>
            <p className="text-xs text-gray-400">Create, view, and deactivate promotional coupon codes</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"></span>
              {activeCoupons.length} Active
            </span>
            {inactiveCoupons.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500">
                {inactiveCoupons.length} Inactive
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setShowCreate((v) => !v); setSaveMsg(""); }}
            className={`whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${showCreate ? "bg-gray-100 text-gray-600 hover:bg-gray-200" : "bg-[#1a5c4f] text-white hover:bg-[#17504a]"}`}
          >
            <i className={showCreate ? "ri-close-line" : "ri-add-line"}></i>
            {showCreate ? "Cancel" : "New Coupon"}
          </button>
        </div>
      </div>

      <div className="px-5 py-5 space-y-5">

        {/* Create Form */}
        {showCreate && (
          <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-5">
            <p className="text-xs font-extrabold text-[#1a5c4f] uppercase tracking-widest mb-4 flex items-center gap-1.5">
              <i className="ri-add-circle-line"></i>Create New Coupon
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">
                  Coupon Code <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. SAVE20"
                  maxLength={30}
                  className="w-full px-3 py-2.5 border border-[#b8ddd5] rounded-lg text-sm font-mono font-bold uppercase focus:outline-none focus:border-[#1a5c4f] bg-white"
                />
                <p className="text-xs text-gray-400 mt-1">Letters, numbers only. Auto-uppercased.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">
                  Discount Amount ($) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">$</span>
                  <input
                    type="number"
                    value={form.discount}
                    onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
                    placeholder="20"
                    min={1}
                    max={999}
                    className="w-full pl-7 pr-3 py-2.5 border border-[#b8ddd5] rounded-lg text-sm font-bold focus:outline-none focus:border-[#1a5c4f] bg-white"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Fixed dollar amount off the total.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">Description (optional)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Summer sale campaign"
                  className="w-full px-3 py-2.5 border border-[#b8ddd5] rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">Max Uses (optional)</label>
                <input
                  type="number"
                  value={form.max_uses}
                  onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value }))}
                  placeholder="Unlimited"
                  min={1}
                  className="w-full px-3 py-2.5 border border-[#b8ddd5] rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white"
                />
                <p className="text-xs text-gray-400 mt-1">Leave blank for unlimited uses.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">Expiry Date (optional)</label>
                <input
                  type="date"
                  value={form.expires_at}
                  onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full px-3 py-2.5 border border-[#b8ddd5] rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white cursor-pointer"
                />
                <p className="text-xs text-gray-400 mt-1">Leave blank for no expiry.</p>
              </div>
            </div>

            {saveMsg && (
              <p className={`text-xs mb-3 flex items-center gap-1.5 font-semibold ${saveMsg.includes("success") ? "text-[#1a5c4f]" : "text-red-600"}`}>
                <i className={saveMsg.includes("success") ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                {saveMsg}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={saving}
                className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg hover:bg-[#17504a] disabled:opacity-60 cursor-pointer transition-colors"
              >
                {saving
                  ? <><i className="ri-loader-4-line animate-spin"></i>Creating...</>
                  : <><i className="ri-save-line"></i>Create Coupon</>}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); setSaveMsg(""); }}
                className="whitespace-nowrap px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Coupon List */}
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-gray-500">
            <i className="ri-loader-4-line animate-spin"></i>
            <span className="text-sm">Loading coupons...</span>
          </div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
              <i className="ri-coupon-3-line text-gray-300 text-xl"></i>
            </div>
            <p className="text-sm font-bold text-gray-600 mb-1">No coupons yet</p>
            <p className="text-xs text-gray-400">Create your first coupon code above</p>
          </div>
        ) : (
          <div className="space-y-2">
            {coupons.map((coupon) => {
              const usage = usageCounts[coupon.code] ?? 0;
              const isExpired = coupon.expires_at ? new Date(coupon.expires_at) < new Date() : false;
              const isAtLimit = coupon.max_uses != null && usage >= coupon.max_uses;
              const effectivelyActive = coupon.is_active && !isExpired && !isAtLimit;

              return (
                <div
                  key={coupon.id}
                  className={`rounded-xl border overflow-hidden transition-all ${effectivelyActive ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50/60"}`}
                >
                  <div className="flex items-center gap-4 px-4 py-3.5">
                    {/* Code + badge */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0 ${effectivelyActive ? "bg-green-50" : "bg-gray-100"}`}>
                        <i className={`ri-coupon-3-line text-sm ${effectivelyActive ? "text-green-600" : "text-gray-400"}`}></i>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-mono font-extrabold text-sm tracking-wide ${effectivelyActive ? "text-gray-900" : "text-gray-400"}`}>
                            {coupon.code}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${effectivelyActive ? "bg-green-100 text-green-700" : isExpired ? "bg-orange-100 text-orange-600" : isAtLimit ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-500"}`}>
                            {effectivelyActive ? "Active" : isExpired ? "Expired" : isAtLimit ? "Limit Reached" : "Inactive"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className={`text-xs font-bold ${effectivelyActive ? "text-[#1a5c4f]" : "text-gray-400"}`}>
                            ${coupon.discount} off
                          </span>
                          {coupon.description && (
                            <span className="text-xs text-gray-400 truncate max-w-[180px]">{coupon.description}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
                      {/* Usage */}
                      <div className="text-center">
                        <p className="text-sm font-extrabold text-gray-800">{usage}</p>
                        <p className="text-xs text-gray-400">
                          {coupon.max_uses != null ? `/ ${coupon.max_uses} uses` : "uses"}
                        </p>
                      </div>
                      {/* Expiry */}
                      <div className="text-center min-w-[80px]">
                        <p className={`text-xs font-semibold ${isExpired ? "text-orange-500" : "text-gray-600"}`}>
                          {coupon.expires_at ? fmt(coupon.expires_at) : "No expiry"}
                        </p>
                        <p className="text-xs text-gray-400">expiry</p>
                      </div>
                      {/* Created */}
                      <div className="text-center min-w-[80px]">
                        <p className="text-xs font-semibold text-gray-600">{fmt(coupon.created_at)}</p>
                        <p className="text-xs text-gray-400">created</p>
                      </div>
                    </div>

                    {/* Toggle button */}
                    <button
                      type="button"
                      onClick={() => handleToggleActive(coupon)}
                      disabled={togglingId === coupon.id}
                      title={coupon.is_active ? "Deactivate coupon" : "Reactivate coupon"}
                      className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0 ${coupon.is_active ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-700 hover:bg-green-50"}`}
                    >
                      {togglingId === coupon.id
                        ? <i className="ri-loader-4-line animate-spin"></i>
                        : <i className={coupon.is_active ? "ri-forbid-line" : "ri-checkbox-circle-line"}></i>
                      }
                      {coupon.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>

                  {/* Usage progress bar for coupons with max_uses */}
                  {coupon.max_uses != null && (
                    <div className="px-4 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, Math.round((usage / coupon.max_uses) * 100))}%`,
                              backgroundColor: isAtLimit ? "#ef4444" : usage / coupon.max_uses > 0.7 ? "#f59e0b" : "#1a5c4f",
                            }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {Math.min(100, Math.round((usage / coupon.max_uses) * 100))}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Info note */}
        <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-4 py-3 flex items-start gap-2">
          <i className="ri-information-line text-[#1a5c4f] text-sm mt-0.5 flex-shrink-0"></i>
          <p className="text-xs text-[#2d7a6a] leading-relaxed">
            Coupons are validated in real-time at checkout. Deactivated coupons will be rejected immediately even if a customer already entered them.
            Usage counts reflect orders that successfully completed checkout with that code.
          </p>
        </div>
      </div>
    </div>
  );
}
