// Google Ads Campaign Builder — guarded draft → validate → approve → PAUSED create.
//
// All Google Ads mutations go through the google-ads-campaign-builder edge
// function (secrets never touch the browser). This panel only edits JSON,
// shows validation/preview, and drives the approval workflow. Campaigns are
// ALWAYS created PAUSED; there is no enable path in this tool.

import { useState, useEffect, useCallback } from "react";
import { supabase, getAdminUserToken } from "../../../lib/supabaseClient";
import { isAdminLevel, type AdminRole } from "../../../lib/adminPermissions";
import {
  parseDraftJson,
  validateCampaignDraft,
  type CampaignDraft,
  type DraftValidationResult,
} from "../../../lib/googleAdsCampaignDraft";
import { CAMPAIGN_TEMPLATES, templateJson } from "../../../lib/googleAdsCampaignTemplates";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const FN_URL = `${SUPABASE_URL}/functions/v1/google-ads-campaign-builder`;

interface DraftRow {
  id: string;
  title: string;
  draft_json: CampaignDraft;
  validation_status: string;
  validation_errors: string[];
  validation_warnings: string[];
  created_by_name: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  applied_at: string | null;
  apply_status: string;
  google_ads_campaign_resource_name: string | null;
  created_at: string;
}

interface ApplyOutcome {
  campaignResourceName: string | null;
  resourceNames: { label: string; resourceName: string }[];
  labels?: { attached: string[]; warnings: string[] };
}

async function callBuilder(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = await getAdminUserToken();
  if (!token) throw new Error("Not signed in — refresh and log in again.");
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.error ?? `Request failed (${res.status})`));
  }
  return data;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "bg-gray-100 text-gray-600" },
    passed: { label: "Valid", cls: "bg-[#e6f2ef] text-[#1a5c4f]" },
    passed_with_warnings: { label: "Valid (warnings)", cls: "bg-amber-100 text-amber-700" },
    failed: { label: "Invalid", cls: "bg-red-100 text-red-600" },
    not_applied: { label: "Not applied", cls: "bg-gray-100 text-gray-500" },
    api_validated: { label: "API validated", cls: "bg-[#e8f0f9] text-[#3b6ea5]" },
    applied_paused: { label: "Created (PAUSED)", cls: "bg-[#e6f2ef] text-[#1a5c4f]" },
    apply_failed: { label: "Apply failed", cls: "bg-red-100 text-red-600" },
  };
  const s = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${s.cls}`}>{s.label}</span>;
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${ok ? "bg-[#e6f2ef] text-[#1a5c4f]" : "bg-red-100 text-red-600"}`}>
      <i className={ok ? "ri-checkbox-circle-line" : "ri-close-circle-line"}></i>
      {label}
    </span>
  );
}

export default function GoogleAdsCampaignBuilderPanel({ adminRole }: { adminRole: AdminRole }) {
  const canApprove = isAdminLevel(adminRole);

  const [jsonText, setJsonText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [validation, setValidation] = useState<DraftValidationResult | null>(null);
  const [apiValidation, setApiValidation] = useState<{ ran: boolean; success?: boolean; error?: string } | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [applyOutcome, setApplyOutcome] = useState<ApplyOutcome | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const loadDrafts = useCallback(async () => {
    const { data } = await supabase
      .from("google_ads_campaign_drafts")
      .select("id, title, draft_json, validation_status, validation_errors, validation_warnings, created_by_name, approved_by_name, approved_at, applied_at, apply_status, google_ads_campaign_resource_name, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setDrafts((data as DraftRow[] | null) ?? []);
  }, []);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const parseCurrent = (): CampaignDraft | null => {
    try {
      const draft = parseDraftJson(jsonText);
      setParseError(null);
      return draft;
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      setValidation(null);
      return null;
    }
  };

  const handleFormat = () => {
    const draft = parseCurrent();
    if (draft) setJsonText(JSON.stringify(draft, null, 2));
  };

  const handleLoadTemplate = (key: string) => {
    const t = CAMPAIGN_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    setJsonText(templateJson(t));
    setParseError(null);
    setValidation(null);
    setApiValidation(null);
    setActiveDraftId(null);
    setApplyOutcome(null);
    setBanner(null);
  };

  const handleValidate = async (withApi: boolean) => {
    const draft = parseCurrent();
    if (!draft) return;
    // Instant local pass first
    const local = validateCampaignDraft(draft);
    setValidation(local);
    setApiValidation(null);
    setApplyOutcome(null);
    setBusy(withApi ? "api" : "validate");
    setBanner(null);
    try {
      const data = await callBuilder({
        mode: "validate",
        draft,
        draftId: activeDraftId ?? undefined,
        googleAdsValidateOnly: withApi,
      });
      const v = data.validation as DraftValidationResult;
      setValidation(v);
      if (withApi) {
        const api = data.apiValidation as { ran: boolean; success?: boolean; error?: string };
        setApiValidation(api);
        if (api?.ran && api.success) setBanner({ kind: "ok", text: "Google Ads API validate-only passed — nothing was created." });
        else if (api?.ran) setBanner({ kind: "err", text: `Google Ads API validate-only failed: ${api.error ?? "unknown"}` });
        else setBanner({ kind: "err", text: `API validation did not run: ${api?.error ?? "guardrail errors must pass first"}` });
      } else {
        setBanner(v.valid
          ? { kind: "ok", text: `Validation passed${v.warnings.length ? ` with ${v.warnings.length} warning(s)` : ""}.` }
          : { kind: "err", text: `Validation failed with ${v.errors.length} error(s).` });
      }
      if (activeDraftId) void loadDrafts();
    } catch (err) {
      setBanner({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const handleSaveDraft = async () => {
    const draft = parseCurrent();
    if (!draft) return;
    setBusy("save");
    setBanner(null);
    try {
      const data = await callBuilder({
        mode: "save_draft",
        draft,
        title: draft.name,
        draftId: activeDraftId ?? undefined,
      });
      setActiveDraftId(String(data.draftId));
      setValidation(data.validation as DraftValidationResult);
      setBanner({ kind: "ok", text: activeDraftId ? "Draft updated (approval reset — re-approve before applying)." : "Draft saved." });
      void loadDrafts();
    } catch (err) {
      setBanner({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async (draftId: string) => {
    setBusy(`approve:${draftId}`);
    setBanner(null);
    try {
      await callBuilder({ mode: "approve_draft", draftId });
      setBanner({ kind: "ok", text: "Draft approved. You can now create the PAUSED campaign." });
      void loadDrafts();
    } catch (err) {
      setBanner({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const handleApply = async (row: DraftRow) => {
    const confirmed = window.confirm(
      `Create "${row.title}" in Google Ads as a PAUSED campaign?\n\nAccount: 248-085-3323\nDaily budget: PKR ${Number(row.draft_json?.dailyBudgetPkr ?? 0).toLocaleString()}\n\nThe campaign will NOT spend until you review and enable it in Google Ads.`,
    );
    if (!confirmed) return;
    setBusy(`apply:${row.id}`);
    setBanner(null);
    try {
      const data = await callBuilder({ mode: "apply_paused", draftId: row.id, confirmApply: true });
      setApplyOutcome({
        campaignResourceName: (data.campaignResourceName as string | null) ?? null,
        resourceNames: (data.resourceNames as ApplyOutcome["resourceNames"]) ?? [],
        labels: data.labels as ApplyOutcome["labels"],
      });
      setBanner({ kind: "ok", text: "PAUSED campaign created. Review it in Google Ads before enabling." });
      void loadDrafts();
    } catch (err) {
      setBanner({ kind: "err", text: err instanceof Error ? err.message : String(err) });
      void loadDrafts();
    } finally {
      setBusy(null);
    }
  };

  const handleLoadDraftIntoEditor = (row: DraftRow) => {
    setJsonText(JSON.stringify(row.draft_json, null, 2));
    setActiveDraftId(row.id);
    setParseError(null);
    setValidation(null);
    setApiValidation(null);
    setApplyOutcome(null);
    setBanner({ kind: "ok", text: `Loaded draft "${row.title}" into the editor.` });
  };

  const summary = validation?.summary ?? null;
  const previewDraft: CampaignDraft | null = (() => {
    try { return jsonText.trim() ? parseDraftJson(jsonText) : null; } catch { return null; }
  })();

  return (
    <div className="space-y-4">
      {/* PAUSED-only warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
        <i className="ri-pause-circle-line text-amber-600 text-base mt-0.5 flex-shrink-0"></i>
        <div>
          <p className="text-xs font-bold text-amber-800 mb-0.5">Campaigns are created PAUSED. Review in Google Ads before enabling.</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            This tool never enables campaigns and never edits existing campaigns, budgets, keywords, or conversion goals.
            Creating requires a validated draft + owner/admin approval. Account 248-085-3323 · MCC 762-950-8384.
          </p>
        </div>
      </div>

      {banner && (
        <div className={`rounded-xl px-4 py-2.5 text-xs font-bold flex items-start gap-2 ${banner.kind === "ok" ? "bg-[#e6f2ef] text-[#1a5c4f] border border-[#bfe0d7]" : "bg-red-50 text-red-700 border border-red-200"}`}>
          <i className={`${banner.kind === "ok" ? "ri-checkbox-circle-line" : "ri-error-warning-line"} mt-0.5 flex-shrink-0`}></i>
          <span className="break-words min-w-0">{banner.text}</span>
        </div>
      )}

      {/* ── Editor ── */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-2">
          <i className="ri-braces-line text-gray-500 text-sm"></i>
          <p className="text-xs font-extrabold text-gray-700">Campaign Draft (JSON)</p>
          {activeDraftId && <span className="text-[10px] text-gray-400 font-mono">draft {activeDraftId.slice(0, 8)}</span>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              onChange={(e) => { if (e.target.value) handleLoadTemplate(e.target.value); e.target.value = ""; }}
              defaultValue=""
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 cursor-pointer pr-7"
            >
              <option value="" disabled>Load sample template…</option>
              {CAMPAIGN_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
            <button type="button" onClick={handleFormat}
              className="text-xs font-bold text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50 cursor-pointer whitespace-nowrap">
              <i className="ri-magic-line mr-1"></i>Format
            </button>
          </div>
        </div>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          spellCheck={false}
          rows={16}
          placeholder='Paste a campaign draft JSON here, or load a sample template above.'
          className="w-full font-mono text-xs p-4 outline-none resize-y text-gray-800 bg-white"
        />
        {parseError && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-xs text-red-700 font-mono break-words">
            JSON error: {parseError}
          </div>
        )}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center gap-2">
          <button type="button" disabled={!!busy || !jsonText.trim()} onClick={() => void handleValidate(false)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#3b6ea5] text-white text-xs font-extrabold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer whitespace-nowrap">
            {busy === "validate" ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-shield-check-line"></i>}
            Validate
          </button>
          <button type="button" disabled={!!busy || !jsonText.trim()} onClick={() => void handleValidate(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-white text-[#3b6ea5] border border-[#b8cce4] text-xs font-extrabold rounded-lg hover:bg-[#e8f0f9] disabled:opacity-50 cursor-pointer whitespace-nowrap">
            {busy === "api" ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-google-line"></i>}
            Validate vs Google Ads API (creates nothing)
          </button>
          <button type="button" disabled={!!busy || !jsonText.trim()} onClick={() => void handleSaveDraft()}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1a5c4f] text-white text-xs font-extrabold rounded-lg hover:bg-[#144a3f] disabled:opacity-50 cursor-pointer whitespace-nowrap">
            {busy === "save" ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-save-3-line"></i>}
            {activeDraftId ? "Update Draft" : "Save Draft"}
          </button>
          {activeDraftId && (
            <button type="button" onClick={() => { setActiveDraftId(null); setBanner({ kind: "ok", text: "Editor detached — saving now creates a new draft." }); }}
              className="text-xs font-bold text-gray-500 hover:text-gray-700 cursor-pointer whitespace-nowrap">
              New draft
            </button>
          )}
        </div>
      </div>

      {/* ── Validation results ── */}
      {validation && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <i className="ri-shield-check-line text-gray-500 text-sm"></i>
            <p className="text-xs font-extrabold text-gray-700">Validation</p>
            <span className={`ml-auto inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${validation.valid ? (validation.warnings.length ? "bg-amber-100 text-amber-700" : "bg-[#e6f2ef] text-[#1a5c4f]") : "bg-red-100 text-red-600"}`}>
              {validation.valid ? (validation.warnings.length ? `Passed · ${validation.warnings.length} warning(s)` : "Passed") : `${validation.errors.length} error(s)`}
            </span>
          </div>
          <div className="p-4 space-y-3">
            {summary && (
              <div className="flex flex-wrap gap-1.5">
                <Chip ok={summary.status === "PAUSED"} label={`Status: ${summary.status || "—"}`} />
                <Chip ok={summary.dailyBudgetPkr <= summary.budgetCapPkr || summary.budgetOverride} label={`Budget: PKR ${summary.dailyBudgetPkr.toLocaleString()}/day`} />
                <Chip ok label={`Bidding: ${summary.biddingStrategy}`} />
                <Chip ok={!summary.networks.displayNetwork} label={summary.networks.displayNetwork ? "Display: ON" : "Display: off"} />
                <Chip ok={!summary.networks.searchPartners} label={summary.networks.searchPartners ? "Search Partners: ON" : "Search Partners: off"} />
                <Chip ok={!summary.aiMaxEnabled} label={summary.aiMaxEnabled ? "AI Max: ON" : "AI Max: off"} />
                <Chip ok={!summary.matchTypesUsed.includes("BROAD")} label={`Match types: ${summary.matchTypesUsed.join(", ") || "—"}`} />
                <Chip ok label={`${summary.adGroupCount} ad group(s) · ${summary.keywordCount} keyword(s) · ${summary.rsaCount} RSA(s)`} />
                {summary.competitorKeywordCount > 0 && (
                  <Chip ok={false} label={`${summary.competitorKeywordCount} competitor keyword(s)`} />
                )}
              </div>
            )}
            {summary && summary.finalUrls.length > 0 && (
              <div className="text-xs text-gray-600">
                <p className="font-bold text-gray-700 mb-1">Final URLs</p>
                {summary.finalUrls.map((u) => (
                  <p key={u} className="font-mono text-[11px] text-[#3b6ea5] break-all">{u}</p>
                ))}
              </div>
            )}
            {validation.errors.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 space-y-1">
                {validation.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                    <i className="ri-close-circle-line mt-0.5 flex-shrink-0"></i>
                    <span className="break-words min-w-0">{e}</span>
                  </p>
                ))}
              </div>
            )}
            {validation.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 space-y-1">
                {validation.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                    <i className="ri-alert-line mt-0.5 flex-shrink-0"></i>
                    <span className="break-words min-w-0">{w}</span>
                  </p>
                ))}
              </div>
            )}
            {apiValidation && (
              <div className={`rounded-lg p-3 text-xs ${apiValidation.ran && apiValidation.success ? "bg-[#e6f2ef] text-[#1a5c4f] border border-[#bfe0d7]" : "bg-red-50 text-red-700 border border-red-100"}`}>
                <p className="font-bold mb-0.5">
                  Google Ads API validate-only: {apiValidation.ran ? (apiValidation.success ? "PASSED (nothing created)" : "FAILED") : "did not run"}
                </p>
                {apiValidation.error && <p className="break-words">{apiValidation.error}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Preview ── */}
      {previewDraft && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <button type="button" onClick={() => setShowPreview((s) => !s)}
            className="w-full px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2 cursor-pointer">
            <i className="ri-eye-line text-gray-500 text-sm"></i>
            <p className="text-xs font-extrabold text-gray-700">Preview</p>
            <i className={`ml-auto ri-arrow-${showPreview ? "up" : "down"}-s-line text-gray-400`}></i>
          </button>
          {showPreview && (
            <div className="p-4 space-y-3 text-xs text-gray-700">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-0.5">Campaign</p>
                  <p className="font-bold break-words">{previewDraft.name || "—"}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-0.5">Daily budget</p>
                  <p className="font-bold">PKR {Number(previewDraft.dailyBudgetPkr ?? 0).toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-0.5">Locations</p>
                  <p className="font-bold">{(previewDraft.locations ?? ["United States"]).join(", ")}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-0.5">Languages</p>
                  <p className="font-bold">{(previewDraft.languages ?? ["English"]).join(", ")}</p>
                </div>
              </div>
              {(previewDraft.adGroups ?? []).map((ag, i) => (
                <div key={i} className="border border-gray-100 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 flex flex-wrap items-center gap-2">
                    <p className="font-extrabold text-gray-800">{ag.name}</p>
                    <p className="ml-auto font-mono text-[10px] text-[#3b6ea5] break-all">{(ag.finalUrls ?? []).join(" · ")}</p>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {(ag.keywords ?? []).map((kw, j) => (
                        <span key={j} className="inline-flex px-2 py-0.5 bg-[#e8f0f9] text-[#3b6ea5] rounded-full text-[10px] font-bold">
                          {kw.matchType === "EXACT" ? `[${kw.text}]` : kw.matchType === "PHRASE" ? `"${kw.text}"` : kw.text}
                        </span>
                      ))}
                      {(ag.negativeKeywords ?? []).map((kw, j) => (
                        <span key={`n${j}`} className="inline-flex px-2 py-0.5 bg-red-50 text-red-500 rounded-full text-[10px] font-bold">−{kw.text}</span>
                      ))}
                    </div>
                    {(ag.responsiveSearchAds ?? []).map((rsa, j) => (
                      <div key={j} className="bg-gray-50 border border-gray-100 rounded-lg p-2.5">
                        <p className="text-[10px] text-gray-400 mb-1">RSA {j + 1} — {(rsa.headlines ?? []).length} headlines · {(rsa.descriptions ?? []).length} descriptions</p>
                        <p className="font-bold text-[#3b6ea5] leading-snug">{(rsa.headlines ?? []).slice(0, 3).join(" | ")}</p>
                        <p className="text-gray-600 leading-snug mt-0.5">{(rsa.descriptions ?? [])[0] ?? ""}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(previewDraft.campaignNegatives ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="text-[10px] text-gray-400 font-bold">Campaign negatives:</span>
                  {(previewDraft.campaignNegatives ?? []).map((kw, j) => (
                    <span key={j} className="inline-flex px-2 py-0.5 bg-red-50 text-red-500 rounded-full text-[10px] font-bold">−{kw.text}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Apply result ── */}
      {applyOutcome && (
        <div className="rounded-xl border border-[#bfe0d7] bg-[#e6f2ef] p-4 space-y-2">
          <p className="text-xs font-extrabold text-[#1a5c4f] flex items-center gap-1.5">
            <i className="ri-pause-circle-fill"></i>
            PAUSED campaign created — review in Google Ads before enabling
          </p>
          {applyOutcome.campaignResourceName && (
            <p className="text-xs text-[#1a5c4f]">Campaign: <span className="font-mono break-all">{applyOutcome.campaignResourceName}</span></p>
          )}
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {applyOutcome.resourceNames.map((r, i) => (
              <p key={i} className="text-[11px] text-[#1a5c4f] font-mono break-all">
                <span className="text-[#1a5c4f]/60">{r.label}:</span> {r.resourceName}
              </p>
            ))}
          </div>
          {applyOutcome.labels && applyOutcome.labels.warnings.length > 0 && (
            <p className="text-[11px] text-amber-700">Label warnings: {applyOutcome.labels.warnings.join("; ")}</p>
          )}
        </div>
      )}

      {/* ── Saved drafts ── */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <i className="ri-draft-line text-gray-500 text-sm"></i>
          <p className="text-xs font-extrabold text-gray-700">Saved Drafts</p>
          <button type="button" onClick={() => void loadDrafts()} className="ml-auto text-xs font-bold text-gray-500 hover:text-gray-700 cursor-pointer">
            <i className="ri-refresh-line mr-1"></i>Refresh
          </button>
        </div>
        {drafts.length === 0 ? (
          <p className="px-4 py-6 text-xs text-gray-400 text-center">No drafts yet — validate and save one above.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {drafts.map((row) => {
              const validationOk = row.validation_status === "passed" || row.validation_status === "passed_with_warnings";
              const approved = !!row.approved_at;
              const applied = row.apply_status === "applied_paused";
              const canCreate = canApprove && validationOk && approved && !applied;
              return (
                <div key={row.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <p className="text-xs font-extrabold text-gray-800 break-words min-w-0">{row.title}</p>
                    <StatusPill status={row.validation_status} />
                    <StatusPill status={row.apply_status} />
                    {approved && !applied && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f0f9] text-[#3b6ea5]">
                        Approved by {row.approved_by_name ?? "admin"}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mb-2">
                    {new Date(row.created_at).toLocaleString()} · by {row.created_by_name ?? "—"}
                    {row.google_ads_campaign_resource_name && (
                      <span className="font-mono text-[#1a5c4f]"> · {row.google_ads_campaign_resource_name}</span>
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => handleLoadDraftIntoEditor(row)}
                      className="text-[11px] font-bold text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1 bg-white hover:bg-gray-50 cursor-pointer whitespace-nowrap">
                      <i className="ri-edit-line mr-1"></i>Open in editor
                    </button>
                    {!applied && (
                      <button type="button" disabled={!canApprove || !validationOk || !!busy || approved}
                        onClick={() => void handleApprove(row.id)}
                        title={!canApprove ? "Owner / admin only" : !validationOk ? "Fix validation errors first" : approved ? "Already approved" : ""}
                        className="text-[11px] font-bold text-[#3b6ea5] border border-[#b8cce4] rounded-lg px-2.5 py-1 bg-white hover:bg-[#e8f0f9] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap">
                        {busy === `approve:${row.id}` ? <i className="ri-loader-4-line animate-spin mr-1"></i> : <i className="ri-check-double-line mr-1"></i>}
                        {approved ? "Approved" : "Approve Draft"}
                      </button>
                    )}
                    {!applied && (
                      <button type="button" disabled={!canCreate || !!busy}
                        onClick={() => void handleApply(row)}
                        title={!canApprove ? "Owner / admin only" : !validationOk ? "Fix validation errors first" : !approved ? "Approve the draft first" : ""}
                        className="text-[11px] font-extrabold text-white bg-[#1a5c4f] rounded-lg px-3 py-1 hover:bg-[#144a3f] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap">
                        {busy === `apply:${row.id}` ? <i className="ri-loader-4-line animate-spin mr-1"></i> : <i className="ri-pause-circle-line mr-1"></i>}
                        Create Paused Campaign
                      </button>
                    )}
                  </div>
                  {row.validation_errors?.length > 0 && (
                    <p className="mt-1.5 text-[10px] text-red-500">{row.validation_errors.length} validation error(s) — open in editor to fix.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
