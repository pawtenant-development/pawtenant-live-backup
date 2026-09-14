// PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 — READ-ONLY history of the
// retired legacy PDF intake (partner_intake_drafts).
//
// The PDF/OCR path is retired: the server refuses every upload / extract /
// review / retry / commit action (partner-manual-intake returns 410), and the
// only intake is the structured New Partner Order form. Historical drafts and
// their storage objects are preserved as audit history. This panel lists them
// and can open a historical source PDF (a 5-minute signed URL through the one
// read-only action the function still serves). It offers NO upload, extraction,
// commit, retry or order-creation control, and never will.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { type PartnerOrg, Badge, EmptyState } from "./shared";

interface DraftRow {
  id: string;
  partner_id: string;
  status: string;
  original_filename: string | null;
  file_size_bytes: number | null;
  page_count: number | null;
  extraction_method: string | null;
  external_order_id: string | null;
  service: string | null;
  committed_order_id: string | null;
  committed_at: string | null;
  created_at: string;
  uploaded_by_email: string | null;
}

const COLUMNS =
  "id, partner_id, status, original_filename, file_size_bytes, page_count, extraction_method, " +
  "external_order_id, service, committed_order_id, committed_at, created_at, uploaded_by_email";

const STATUS_VIEW: Record<string, { label: string; tone: string }> = {
  uploaded: { label: "Uploaded", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  extraction_pending: { label: "Extraction pending", tone: "bg-gray-100 text-gray-600 ring-gray-300" },
  ocr_required: { label: "OCR required", tone: "bg-gray-100 text-gray-600 ring-gray-300" },
  extraction_failed: { label: "Extraction failed", tone: "bg-red-50 text-red-700 ring-red-200" },
  review_required: { label: "Review required", tone: "bg-gray-100 text-gray-600 ring-gray-300" },
  reviewed: { label: "Reviewed", tone: "bg-gray-100 text-gray-600 ring-gray-300" },
  committing: { label: "Committing", tone: "bg-gray-100 text-gray-600 ring-gray-300" },
  committed: { label: "Order created", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  cancelled: { label: "Cancelled", tone: "bg-gray-100 text-gray-500 ring-gray-300" },
};

const NY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "short", day: "2-digit" });

export default function PartnerLegacyIntakeHistory({
  partner, onOpenOrder,
}: {
  partner: PartnerOrg | null;
  onOpenOrder?: (orderId: string) => void;
}) {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let q = supabase.from("partner_intake_drafts").select(COLUMNS).order("created_at", { ascending: false }).limit(200);
    if (partner) q = q.eq("partner_id", partner.id);
    const { data, error: err } = await q;
    if (err) setError("Could not load the legacy intake history (admin access required).");
    setRows(((data ?? []) as unknown as DraftRow[]));
    setLoading(false);
  }, [partner]);

  useEffect(() => { void load(); }, [load]);

  const viewSource = async (draftId: string) => {
    setBusyId(draftId);
    setError("");
    try {
      const { data, error: err } = await supabase.functions.invoke("partner-manual-intake?action=source_url", {
        body: { draft_id: draftId },
      });
      if (err) throw err;
      const url = (data as { signedUrl?: string } | null)?.signedUrl;
      if (!url) throw new Error("The source PDF is no longer available.");
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the source PDF.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
        The PDF upload and extraction path is <strong>retired</strong>. Nothing here can upload, extract,
        retry, commit or create an order — the server refuses those actions. Records and source files are
        kept as audit history only.
      </div>
      {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="py-4 text-center text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No legacy intake records" hint="Nothing was ever uploaded through the retired PDF path for this partner." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3 font-medium">Uploaded</th>
                <th className="py-2 pr-3 font-medium">File</th>
                <th className="py-2 pr-3 font-medium">External ref</th>
                <th className="py-2 pr-3 font-medium">Service</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Result</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const sv = STATUS_VIEW[r.status] ?? { label: r.status, tone: "bg-gray-100 text-gray-600 ring-gray-300" };
                return (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 text-xs text-gray-600 whitespace-nowrap">
                      {NY.format(new Date(r.created_at))}
                      {r.uploaded_by_email && <span className="block text-[11px] text-gray-400">{r.uploaded_by_email}</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray-700 max-w-[220px] truncate" title={r.original_filename ?? ""}>
                      {r.original_filename ?? "—"}
                      {r.page_count ? <span className="block text-[11px] text-gray-400">{r.page_count} page{r.page_count === 1 ? "" : "s"}</span> : null}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-gray-600">{r.external_order_id ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs uppercase text-gray-700">{r.service ?? "—"}</td>
                    <td className="py-2 pr-3"><Badge label={sv.label} tone={sv.tone} /></td>
                    <td className="py-2 pr-3 text-xs text-gray-600">
                      {r.committed_order_id ? (
                        onOpenOrder ? (
                          <button type="button" onClick={() => onOpenOrder(r.committed_order_id as string)}
                            className="font-medium text-indigo-600 hover:underline">
                            Open order
                          </button>
                        ) : "Order created"
                      ) : <span className="text-gray-400">No order</span>}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void viewSource(r.id)}
                        className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {busyId === r.id ? "Opening…" : "View source PDF"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
