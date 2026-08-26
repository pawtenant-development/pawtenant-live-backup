// ProviderAdditionalPetQueue — ADDITIONAL-PET-REJECTION-REASSIGNMENT-AND-
// DOCUMENT-REVISION-001 §3: the provider-portal work queue for Additional Pet
// reviews assigned at the REQUEST level.
//
// A reassigned reviewer does not hold the base order, so the order list can
// never surface their review — this queue reads the SECURITY DEFINER
// list_additional_pet_reviews_for_provider() projection (safe fields only: no
// amount, no pricing outcome, no Stripe identifier, no refund field) and
// expands each row into the same ProviderAdditionalPetReview surface the
// order's own provider uses, with the clinical context section enabled.
//
// After approval the reviewer submits the revised letter from here: the file
// streams to provider-submit-letter, which authorises the request-level
// reviewer for the ESA/PSD letter revision only and never rewrites the
// completed base order's provider.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import ProviderAdditionalPetReview from "./ProviderAdditionalPetReview";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

interface QueueRow {
  request_id: string;
  order_id: string;
  confirmation_id: string;
  status: string;
  service_type: string;
  pet_name: string | null;
  customer_first_name: string | null;
  state: string | null;
  is_order_provider: boolean;
  created_at: string;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending_provider_review: { label: "Awaiting your review", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  clarification_requested: { label: "Awaiting the customer", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  resubmitted: { label: "Customer responded", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  approved_pending_document: { label: "Approved — revised letter needed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export default function ProviderAdditionalPetQueue({ readOnly = false }: { readOnly?: boolean }) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("list_additional_pet_reviews_for_provider");
      if (error) { setRows([]); return; }
      setRows(((data ?? []) as QueueRow[]));
    } catch { setRows([]); }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!loaded || rows.length === 0) return null;

  return (
    <div className="mb-5 bg-white rounded-2xl border border-orange-200 overflow-hidden">
      <div className="px-4 sm:px-5 py-3 bg-orange-50 border-b border-orange-100 flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-extrabold text-orange-600">
          <i className="ri-heart-add-line mr-1.5" aria-hidden="true"></i>
          Additional Pet Reviews
        </h3>
        <span className="text-[11px] font-semibold text-orange-700">
          {rows.length} awaiting action
        </span>
      </div>

      <ul className="divide-y divide-gray-100">
        {rows.map((r) => {
          const badge = STATUS_BADGE[r.status] ?? { label: r.status, cls: "bg-gray-50 text-gray-600 border-gray-200" };
          const isOpen = openId === r.request_id;
          return (
            <li key={r.request_id} className="px-4 sm:px-5 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 break-words">
                    {r.pet_name ?? "Additional pet"}
                    <span className="ml-2 font-normal text-gray-500 text-xs">
                      {r.customer_first_name ?? "Customer"}{r.state ? ` · ${r.state}` : ""} · {r.confirmation_id}
                    </span>
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Requested {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {r.is_order_provider ? " · your case" : " · reassigned review"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <button type="button"
                    onClick={() => setOpenId(isOpen ? null : r.request_id)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    {isOpen ? "Close" : "Open"}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-3 space-y-3">
                  <ProviderAdditionalPetReview orderId={r.order_id} showClinicalContext />
                  {r.status === "approved_pending_document" && !readOnly && (
                    <RevisedLetterUpload confirmationId={r.confirmation_id} onSubmitted={load} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Streams the revised letter PDF to provider-submit-letter. The server side
 *  decides everything: revision vs first letter, verification ID minting,
 *  QR stamping, admin approval gating, and completing the add-on request. */
function RevisedLetterUpload({
  confirmationId, onSubmitted,
}: { confirmationId: string; onSubmitted: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Your session has expired — please sign in again.");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("confirmationId", confirmationId);
      fd.append("documentLabel", "Accommodation Copy");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/provider-submit-letter`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
        body: fd,
      });
      const d = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!res.ok || d?.ok === false) throw new Error(d?.error ?? `Upload failed (HTTP ${res.status})`);
      setMsg({ ok: true, text: "Revised letter submitted. A PawTenant reviewer will approve and deliver it — the customer's current letter stays valid until then." });
      setFile(null);
      onSubmitted();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Upload failed. Please try again." });
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 space-y-2">
      <p className="text-xs font-bold text-emerald-800">
        Submit the revised letter
      </p>
      <p className="text-[11px] text-emerald-900/80 leading-relaxed">
        The revised letter must cover <span className="font-semibold">every approved pet</span> listed
        above. It becomes a new document version with its own verification ID; the
        customer's previous letter is preserved as history.
      </p>
      <input
        type="file" accept="application/pdf,.pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-[12px] text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-emerald-700"
      />
      {msg && (
        <p role={msg.ok ? "status" : "alert"}
          className={`rounded-lg border px-3 py-2 text-[12px] leading-relaxed break-words ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {msg.text}
        </p>
      )}
      <button type="button" disabled={!file || busy} onClick={submit}
        className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
        {busy ? "Submitting…" : "Submit revised letter"}
      </button>
    </div>
  );
}
