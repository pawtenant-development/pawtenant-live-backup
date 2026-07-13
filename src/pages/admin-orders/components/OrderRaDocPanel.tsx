// OrderRaDocPanel — admin "Housing Accommodation Documents" panel for the
// order detail Documents tab (RA-DOCUMENT-WORKFLOW-PORTALS-CONSISTENCY-001).
//
// Mounted as a single isolated component inside the FROZEN OrderDetailModal
// Documents tab (approved "isolated component mount"). It is fully
// self-contained: it fetches its own authoritative RA fields, add-on requests,
// and customer-uploaded documents so it never depends on which columns the
// frozen modal's order query selected. Entitlement is read from authoritative
// metadata only (never inferred from price).
//
// Shows: request source (Combo included vs $70 add-on), request date, upload
// status, uploaded filename + date, and a signed View/Download action (reuses
// the modal's existing openDocumentSignedUrl via the onOpenFile prop).

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface Props {
  orderId: string;
  /** Opens a document by id via the modal's signed-URL helper. */
  onOpenFile: (documentId: string) => void;
}

interface OrderRa {
  package_key: string | null;
  package_display_name: string | null;
  billing_plan: string | null;
  includes_reasonable_accommodation_letter: boolean | null;
  additional_documentation_status: string | null;
  additional_documentation_requested_at: string | null;
  customer_uploaded_additional_document_at: string | null;
}
interface AddonReq { id: string; status: string; amount_cents: number | null; created_at: string; paid_at: string | null; }
interface Doc { id: string; label: string | null; uploaded_at: string | null; doc_type: string; }

function fmt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-xs font-semibold text-gray-800 mt-0.5 break-words">{value}</p>
    </div>
  );
}

export default function OrderRaDocPanel({ orderId, onOpenFile }: Props) {
  const [ra, setRa] = useState<OrderRa | null>(null);
  const [reqs, setReqs] = useState<AddonReq[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [orderRes, reqRes, docRes] = await Promise.all([
          supabase
            .from("orders")
            .select("package_key, package_display_name, billing_plan, includes_reasonable_accommodation_letter, additional_documentation_status, additional_documentation_requested_at, customer_uploaded_additional_document_at")
            .eq("id", orderId)
            .maybeSingle(),
          supabase
            .from("order_additional_documentation_requests")
            .select("id, status, amount_cents, created_at, paid_at")
            .eq("order_id", orderId)
            .order("created_at", { ascending: false }),
          supabase
            .from("order_documents")
            .select("id, label, uploaded_at, doc_type")
            .eq("order_id", orderId)
            .eq("doc_type", "customer_upload")
            .order("uploaded_at", { ascending: false }),
        ]);
        if (!alive) return;
        setRa((orderRes.data as OrderRa) ?? null);
        setReqs((reqRes.data as AddonReq[]) ?? []);
        setDocs((docRes.data as Doc[]) ?? []);
      } catch {
        /* fail soft — panel simply renders the empty/idle state */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [orderId]);

  if (loading) return null;

  const isCombo = ra?.includes_reasonable_accommodation_letter === true;
  const paidAddon = reqs.find((r) => r.status === "paid") ?? null;
  const pendingAddon = reqs.find((r) => r.status === "pending") ?? null;
  const hasAny = isCombo || !!paidAddon || !!pendingAddon || docs.length > 0;

  if (!hasAny) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
          <i className="ri-file-shield-2-line text-[#3b6ea5]"></i>Housing Accommodation Documents
        </p>
        <p className="text-xs text-gray-500">No Reasonable Accommodation entitlement or add-on on this order.</p>
      </div>
    );
  }

  const s = (ra?.additional_documentation_status ?? "").toLowerCase();
  let statusLabel = "Waiting for customer upload";
  let statusCls = "bg-amber-50 text-[#B45309]";
  if (s === "completed") { statusLabel = "Completed by provider"; statusCls = "bg-emerald-50 text-emerald-700"; }
  else if (s === "in_review" || s === "uploaded" || docs.length > 0) { statusLabel = "Uploaded — under provider review"; statusCls = "bg-blue-50 text-blue-700"; }

  const source = isCombo
    ? "Combo included"
    : paidAddon
      ? `$${Math.round((paidAddon.amount_cents ?? 7000) / 100)} add-on · paid`
      : pendingAddon
        ? "Add-on · payment pending"
        : "—";

  return (
    <div className="bg-white border-2 border-[#dbe4f0] rounded-xl overflow-hidden">
      <div className="bg-[#e8f0f9] px-4 py-2.5 flex items-center gap-2 border-b border-[#dbe4f0]">
        <i className="ri-file-shield-2-line text-[#3b6ea5]"></i>
        <p className="text-xs font-extrabold text-[#1e3a5f] uppercase tracking-widest">Housing Accommodation Documents</p>
        <span className={`ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${statusCls}`}>{statusLabel}</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Source" value={source} />
          <Field label="Package" value={ra?.package_display_name ?? (isCombo ? "Reasonable Accommodation bundle" : "Standard")} />
          <Field label="Requested" value={fmt(ra?.additional_documentation_requested_at ?? paidAddon?.created_at ?? pendingAddon?.created_at) || "—"} />
          <Field label="Customer uploaded" value={fmt(ra?.customer_uploaded_additional_document_at) || (docs.length ? fmt(docs[0].uploaded_at) : "Not yet")} />
        </div>
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Uploaded form{docs.length === 1 ? "" : "s"}</p>
          {docs.length === 0 ? (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">No file uploaded yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-gray-800 truncate">{d.label ?? "Document"}</span>
                    {d.uploaded_at && <span className="block text-[10px] text-gray-400">Uploaded {fmt(d.uploaded_at)}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenFile(d.id)}
                    className="text-xs font-semibold text-[#3b6ea5] hover:text-[#1e3a5f] whitespace-nowrap flex items-center gap-1 cursor-pointer flex-shrink-0"
                  >
                    <i className="ri-external-link-line"></i>Open
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
