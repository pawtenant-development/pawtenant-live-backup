// PartnerPsdQuestionnaire — PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002.
//
// The structured, canonical `psd_v1` question set for a manual PSD partner
// order. The REQUIREMENT set comes from the live `psd_assessment_questions`
// catalog (which questions, which are required) — never a hardcoded list —
// so intake and the assignment gate cannot disagree. The wording and option
// labels come from the same schema module the provider's assessment view
// renders, so the customer's answers appear to the provider exactly as the
// partner entered them.
//
// Nothing here infers an answer from pasted text, and nothing here decides
// eligibility. It collects answers; the database validates and stores them.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { PSD_QUESTIONNAIRE_ITEMS, type PsdQuestion } from "../../pages/admin-orders/components/psdAssessmentSchema";
import { PARTNER_PSD_TARGET_ASSESSMENT_VERSION, type PsdCatalogEntry } from "../../lib/partnerPsdIntake";

export type PsdAnswerDraft = Record<string, string | string[]>;

/** Read the live catalog (authenticated-readable). Fails closed: an unreadable
 *  or empty catalog yields [] and the form refuses to submit. */
export function usePsdCatalog(): { catalog: PsdCatalogEntry[]; loading: boolean; error: string | null } {
  const [catalog, setCatalog] = useState<PsdCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: err } = await supabase
        .from("psd_assessment_questions")
        .select("question_id, required, sort_order")
        .eq("assessment_version", PARTNER_PSD_TARGET_ASSESSMENT_VERSION)
        .order("sort_order");
      if (cancelled) return;
      if (err) setError(err.message);
      setCatalog((data ?? []) as PsdCatalogEntry[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);
  return { catalog, loading, error };
}

const field =
  "w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900 transition-colors text-gray-800";

function Field({ q, required, value, onChange }: {
  q: PsdQuestion; required: boolean; value: string | string[] | undefined; onChange: (v: string | string[]) => void;
}) {
  const label = (
    <label className="block text-sm font-semibold text-gray-800 mb-1.5">
      <span className="inline-flex w-6 h-6 items-center justify-center rounded-full border border-gray-900 text-[11px] font-bold mr-2">{q.n}</span>
      {q.label}{required && <span className="text-red-500"> *</span>}
    </label>
  );
  if (q.kind === "single" && q.options) {
    return (
      <div>
        {label}
        <select className={field} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {Object.entries(q.options).map(([code, text]) => <option key={code} value={code}>{text}</option>)}
        </select>
      </div>
    );
  }
  if (q.kind === "multi") {
    const list = Array.isArray(value) ? value : [];
    return (
      <div>
        {label}
        <textarea className={`${field} min-h-[80px]`} value={list.join("\n")} rows={3}
          placeholder="One item per line"
          onChange={(e) => onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
        <p className="text-[11px] text-gray-400 mt-1">One per line, exactly as the customer stated.</p>
      </div>
    );
  }
  if (q.kind === "evidence") {
    return (
      <div>
        {label}
        <input className={field} value={typeof value === "string" ? value : ""} placeholder="Link to training evidence (optional)"
          onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  return (
    <div>
      {label}
      <textarea className={`${field} min-h-[96px]`} rows={4} value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default function PartnerPsdQuestionnaire({
  catalog, value, onChange,
}: {
  catalog: PsdCatalogEntry[];
  value: PsdAnswerDraft;
  onChange: (next: PsdAnswerDraft) => void;
}) {
  // Questions the catalog knows, in catalog order; follow-ups render with
  // their parent. `taskEvidence` (kind "evidence") maps to taskEvidenceUrl.
  const items = useMemo(() => {
    const known = new Map(catalog.map((c) => [c.question_id, c]));
    return PSD_QUESTIONNAIRE_ITEMS
      .map((q) => {
        const key = q.kind === "evidence" ? "taskEvidenceUrl" : q.key;
        const entry = known.get(key);
        return entry ? { q, key, required: entry.required, sort: entry.sort_order } : null;
      })
      .filter((x): x is { q: PsdQuestion; key: string; required: boolean; sort: number } => x !== null)
      .sort((a, b) => a.sort - b.sort);
  }, [catalog]);

  const set = (key: string, v: string | string[]) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-5" data-partner-psd-questionnaire>
      <p className="text-sm text-gray-500">
        Enter the customer&apos;s answers to the PSD assessment exactly as given. These are the clinical answers the
        licensed provider reviews; nothing is inferred from the pasted questionnaire.
      </p>
      {items.map(({ q, key, required }) => (
        <div key={key}>
          <Field q={q} required={required} value={value[key]} onChange={(v) => set(key, v)} />
          {q.followUp && (
            <div className="mt-2 pl-8">
              <label className="block text-xs font-semibold text-gray-600 mb-1">{q.followUp.label}</label>
              <textarea className={`${field} min-h-[56px]`} rows={2}
                value={typeof value[q.followUp.key] === "string" ? (value[q.followUp.key] as string) : ""}
                onChange={(e) => set(q.followUp!.key, e.target.value)} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
