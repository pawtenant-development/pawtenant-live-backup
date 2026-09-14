// PartnerProfilePanel — PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001
//
// The per-partner PROFILE and RATE surface of the Partner Platform Settings
// sub-tab: verified domain, intake mode (Manual / API / Both), communication
// and document-delivery policies, support owner, allowed services/states, the
// production state (read-only here — activation is an owner decision and a
// separate LIVE rollout), the CURRENT agreed per-order charge per service and
// the full rate history.
//
// Every write is a SECURITY DEFINER RPC that re-checks is_chat_admin():
//   * partner_admin_update_profile(p_partner_id, p_patch)  — allowlisted keys
//   * partner_admin_set_rate(...)                          — closes the open
//     card and inserts version+1; NEVER edits an amount in place, so accepted
//     orders (own immutable snapshot) and issued invoices are untouched.
// Rates are economics: this panel mounts ONLY inside the Partner Platform
// workspace (admin-only RLS) and never in a provider or customer surface.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { type PartnerOrg, INTAKE_MODE_LABELS, money, Badge, Notice, Section, EmptyState } from "./shared";

interface RateCard {
  id: string;
  service: "esa" | "psd";
  environment: "sandbox" | "production";
  version: number;
  wholesale_unit_price_cents: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
}

const RATE_COLUMNS = "id, service, environment, version, wholesale_unit_price_cents, currency, effective_from, effective_to, notes, created_at";

const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";
const labelCls = "mb-1 block text-xs font-medium text-gray-600";

export default function PartnerProfilePanel({ partner, onChanged }: { partner: PartnerOrg | null; onChanged: () => void }) {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // ── Profile form (mirrors the row; saved as an allowlisted patch) ─────────
  const [form, setForm] = useState({
    domain: "", domainVerified: false, intakeMode: "api" as PartnerOrg["intake_mode"],
    comm: "partner_managed" as PartnerOrg["default_communication_policy"],
    doc: "partner_neutral" as PartnerOrg["default_document_policy"],
    supportOwner: "partner", esa: true, psd: true, states: "",
  });
  useEffect(() => {
    if (!partner) return;
    setForm({
      domain: partner.domain ?? "", domainVerified: Boolean(partner.domain_verified_at), intakeMode: partner.intake_mode ?? "api",
      comm: partner.default_communication_policy ?? "partner_managed", doc: partner.default_document_policy ?? "partner_neutral",
      supportOwner: partner.support_owner ?? "partner",
      esa: (partner.allowed_services ?? []).includes("esa"), psd: (partner.allowed_services ?? []).includes("psd"),
      states: (partner.allowed_states ?? []).join(", "),
    });
  }, [partner]);

  const saveProfile = async () => {
    if (!partner) return;
    setBusy(true); setNotice(""); setError("");
    try {
      const services = [form.esa ? "esa" : null, form.psd ? "psd" : null].filter(Boolean);
      const states = form.states.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
      const { error: err } = await supabase.rpc("partner_admin_update_profile", {
        p_partner_id: partner.id,
        p_patch: {
          domain: form.domain.trim() || null,
          domain_verified: form.domainVerified,
          intake_mode: form.intakeMode,
          default_communication_policy: form.comm,
          default_document_policy: form.doc,
          support_owner: form.supportOwner,
          allowed_services: services,
          allowed_states: states,
        },
      });
      if (err) { setError(`Profile save failed: ${err.message}`); return; }
      setNotice("Partner profile saved.");
      onChanged();
    } finally { setBusy(false); }
  };

  // ── Rates ────────────────────────────────────────────────────────────────
  const [rates, setRates] = useState<RateCard[]>([]);
  const [ratesReload, setRatesReload] = useState(0);
  const [rateForm, setRateForm] = useState({ service: "esa" as "esa" | "psd", environment: "sandbox" as "sandbox" | "production", dollars: "", effective: "", notes: "" });

  useEffect(() => {
    let cancelled = false;
    if (!partner) { setRates([]); return; }
    void (async () => {
      const { data, error: err } = await supabase.from("partner_rate_cards").select(RATE_COLUMNS)
        .eq("partner_id", partner.id).order("service").order("environment").order("version", { ascending: false });
      if (cancelled) return;
      if (err) { setError("Could not load rate cards (admin access required)."); return; }
      setRates((data as RateCard[]) ?? []);
    })();
    return () => { cancelled = true; };
  }, [partner, ratesReload]);

  const current = useMemo(() => rates.filter((r) => r.effective_to === null), [rates]);
  const currentFor = useCallback((service: string, env: string) =>
    current.find((r) => r.service === service && r.environment === env) ?? null, [current]);

  const setRate = async () => {
    if (!partner) return;
    const cents = Math.round(Number(rateForm.dollars) * 100);
    if (!Number.isFinite(cents) || cents <= 0) { setError("Enter the agreed per-order charge in dollars, e.g. 45.00"); return; }
    setBusy(true); setNotice(""); setError("");
    try {
      const { error: err } = await supabase.rpc("partner_admin_set_rate", {
        p_partner_id: partner.id, p_service: rateForm.service, p_environment: rateForm.environment,
        p_amount_cents: cents,
        p_effective_from: rateForm.effective ? new Date(`${rateForm.effective}T00:00:00`).toISOString() : new Date().toISOString(),
        p_notes: rateForm.notes.trim() || null,
      });
      if (err) { setError(`Rate change failed: ${err.message}`); return; }
      setNotice(`New ${rateForm.service.toUpperCase()} ${rateForm.environment} rate recorded. Earlier orders keep their own snapshot.`);
      setRateForm((f) => ({ ...f, dollars: "", effective: "", notes: "" }));
      setRatesReload((n) => n + 1);
    } finally { setBusy(false); }
  };

  if (!partner) return <EmptyState title="No partner selected" hint="Create or select a partner organization above." />;

  const prodBadge = partner.production_enabled
    ? { label: "Production enabled", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" }
    : { label: "Production not enabled", tone: "bg-gray-100 text-gray-600 ring-gray-300" };

  return (
    <div className="space-y-4">
      <Notice notice={notice} error={error} />

      <Section
        title={`Partner profile — ${partner.display_name}`}
        subtitle="Identity, intake mode and the policies snapshotted onto every accepted order. Changing a policy never rewrites an existing order."
        actions={<Badge label={prodBadge.label} tone={prodBadge.tone} />}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Partner domain</span>
            <input value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} placeholder="partner-site.com" className={`${inputCls} font-mono`} />
            <span className="mt-1 block text-[11px] text-gray-500">Display and verification only — never used for attribution, UTM, GHL, Stripe or ad platforms.</span>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.domainVerified} onChange={(e) => setForm((f) => ({ ...f, domainVerified: e.target.checked }))} />
            Domain verified {partner.domain_verified_at && <span className="text-xs text-gray-500">({new Date(partner.domain_verified_at).toLocaleDateString()})</span>}
          </label>

          <label className="block">
            <span className={labelCls}>Intake mode</span>
            <select value={form.intakeMode} onChange={(e) => setForm((f) => ({ ...f, intakeMode: e.target.value as PartnerOrg["intake_mode"] }))} className={inputCls}>
              {(Object.keys(INTAKE_MODE_LABELS) as PartnerOrg["intake_mode"][]).map((k) => <option key={k} value={k}>{INTAKE_MODE_LABELS[k]}</option>)}
            </select>
            <span className="mt-1 block text-[11px] text-gray-500">Manual = orders are typed and pasted into the structured New Partner Order form (admin or partner portal) until the API integration is live.</span>
          </label>
          <label className="block">
            <span className={labelCls}>Support owner</span>
            <select value={form.supportOwner} onChange={(e) => setForm((f) => ({ ...f, supportOwner: e.target.value }))} className={inputCls}>
              <option value="partner">Partner handles customer support</option>
              <option value="pawtenant">PawTenant handles customer support</option>
            </select>
          </label>

          <label className="block">
            <span className={labelCls}>Communication policy</span>
            <select value={form.comm} onChange={(e) => setForm((f) => ({ ...f, comm: e.target.value as PartnerOrg["default_communication_policy"] }))} className={inputCls}>
              <option value="partner_managed">Partner managed — PawTenant never contacts the customer</option>
              <option value="pawtenant_managed">PawTenant managed — normal customer communication</option>
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Document delivery policy</span>
            <select value={form.doc} onChange={(e) => setForm((f) => ({ ...f, doc: e.target.value as PartnerOrg["default_document_policy"] }))} className={inputCls}>
              <option value="partner_neutral">Partner neutral — no PawTenant branding or QR verification</option>
              <option value="pawtenant_branded">PawTenant branded — QR verification and portal delivery</option>
            </select>
          </label>

          <div className="block">
            <span className={labelCls}>Allowed services</span>
            <div className="flex gap-4 rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.esa} onChange={(e) => setForm((f) => ({ ...f, esa: e.target.checked }))} /> ESA</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.psd} onChange={(e) => setForm((f) => ({ ...f, psd: e.target.checked }))} /> PSD</label>
            </div>
          </div>
          <label className="block">
            <span className={labelCls}>Allowed states (blank = every state a licensed provider covers)</span>
            <input value={form.states} onChange={(e) => setForm((f) => ({ ...f, states: e.target.value }))} placeholder="TX, CA, FL" className={`${inputCls} font-mono uppercase`} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={() => void saveProfile()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            Save profile
          </button>
          <span className="text-xs text-gray-500">
            Status: <strong>{partner.status}</strong>. Production activation is an owner decision and a separate LIVE rollout.
          </span>
        </div>
      </Section>

      <Section
        title="Agreed per-order charge"
        subtitle="The wholesale fee PawTenant bills this partner per completed order. Selected server-side at acceptance and frozen on the order; a new rate applies only to orders accepted after its effective date."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {(["esa", "psd"] as const).flatMap((svc) => (["sandbox", "production"] as const).map((env) => {
            const r = currentFor(svc, env);
            return (
              <div key={`${svc}-${env}`} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{svc} · {env === "production" ? "Live" : "Sandbox"}</p>
                <p className="mt-1 text-lg font-bold text-gray-900">{r ? money(r.wholesale_unit_price_cents, r.currency) : "—"}</p>
                <p className="text-[11px] text-gray-500">{r ? `v${r.version} since ${new Date(r.effective_from).toLocaleDateString()}` : "no current rate"}</p>
              </div>
            );
          }))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 sm:grid-cols-5">
          <label className="block">
            <span className={labelCls}>Service</span>
            <select value={rateForm.service} onChange={(e) => setRateForm((f) => ({ ...f, service: e.target.value as "esa" | "psd" }))} className={inputCls}>
              <option value="esa">ESA</option><option value="psd">PSD</option>
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Environment</span>
            <select value={rateForm.environment} onChange={(e) => setRateForm((f) => ({ ...f, environment: e.target.value as "sandbox" | "production" }))} className={inputCls}>
              <option value="sandbox">Sandbox</option><option value="production">Live</option>
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Charge (USD)</span>
            <input inputMode="decimal" value={rateForm.dollars} onChange={(e) => setRateForm((f) => ({ ...f, dollars: e.target.value }))} placeholder="45.00" className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Effective from</span>
            <input type="date" value={rateForm.effective} onChange={(e) => setRateForm((f) => ({ ...f, effective: e.target.value }))} className={inputCls} />
          </label>
          <div className="flex items-end">
            <button type="button" disabled={busy || !rateForm.dollars} onClick={() => void setRate()} className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
              Record new rate
            </button>
          </div>
          <label className="block sm:col-span-5">
            <span className={labelCls}>Notes (contract reference, who agreed it)</span>
            <input value={rateForm.notes} onChange={(e) => setRateForm((f) => ({ ...f, notes: e.target.value }))} className={inputCls} />
          </label>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Rate history</p>
          {rates.length === 0 ? <EmptyState title="No rates recorded" hint="Record the agreed per-order charge above before uploading partner orders." /> : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-3">Service</th><th className="py-2 pr-3">Env</th><th className="py-2 pr-3">Version</th>
                    <th className="py-2 pr-3">Charge</th><th className="py-2 pr-3">Effective</th><th className="py-2 pr-3">Ended</th><th className="py-2 pr-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r) => (
                    <tr key={r.id} className={`border-b border-gray-100 ${r.effective_to === null ? "bg-emerald-50/40" : ""}`}>
                      <td className="py-2 pr-3 uppercase">{r.service}</td>
                      <td className="py-2 pr-3">{r.environment === "production" ? "Live" : "Sandbox"}</td>
                      <td className="py-2 pr-3 tabular-nums">v{r.version}{r.effective_to === null && <span className="ml-1 text-[10px] font-semibold text-emerald-700">current</span>}</td>
                      <td className="py-2 pr-3 tabular-nums font-medium">{money(r.wholesale_unit_price_cents, r.currency)}</td>
                      <td className="py-2 pr-3 text-xs text-gray-600">{new Date(r.effective_from).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-xs text-gray-600">{r.effective_to ? new Date(r.effective_to).toLocaleString() : "—"}</td>
                      <td className="py-2 pr-3 text-xs text-gray-600">{r.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
