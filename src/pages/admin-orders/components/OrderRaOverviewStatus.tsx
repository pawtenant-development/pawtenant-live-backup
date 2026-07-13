// OrderRaOverviewStatus — prominent Housing Accommodation summary + follow-up
// action for the admin order OVERVIEW (RA-ADMIN-VISIBILITY-STORAGE-HARDENING-LIVE-001).
//
// The detailed panel lives on the Documents tab (OrderRaDocPanel). This block
// surfaces the same authoritative status at the TOP of the Overview so admin
// staff can never overlook the workflow, and gives them one-click follow-up:
//   • "Contact customer" — opens the Comms tab + preselects the approved
//     `ra_additional_documentation_request` email template (via a decoupled
//     CustomEvent CommunicationTab listens for). Editable/manual send only.
//   • "Open Documents"   — jumps to the Documents tab.
//   • "View document"    — opens the uploaded file via a signed URL.
//
// Self-contained (fetches its own authoritative RA fields, add-on requests, and
// customer uploads) so it never depends on which columns the frozen modal's
// order query selected. Entitlement is read from authoritative metadata only —
// NEVER inferred from price.

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

/** Fired when the admin clicks "Contact customer"; CommunicationTab preselects
 *  the RA upload-reminder email template. Kept as a CustomEvent so the frozen
 *  OrderDetailModal needs only a single isolated mount (no new shell state). */
export const RA_CONTACT_CUSTOMER_EVENT = "pt:ra-contact-customer";
export const RA_REMINDER_EMAIL_SLUG = "ra_additional_documentation_request";

interface Props {
  orderId: string;
  /** Switch the modal to the Documents tab. */
  onOpenDocuments: () => void;
  /** Switch the modal to the Comms tab (the CustomEvent does the prefill). */
  onContactCustomer: () => void;
  /** Open a document by id via the modal's signed-URL helper. */
  onOpenFile: (documentId: string) => void;
}

interface OrderRa {
  package_key: string | null;
  package_display_name: string | null;
  includes_reasonable_accommodation_letter: boolean | null;
  additional_documentation_status: string | null;
  additional_documentation_requested_at: string | null;
  customer_uploaded_additional_document_at: string | null;
  doctor_name: string | null;
  doctor_status: string | null;
}
interface AddonReq { id: string; status: string; amount_cents: number | null; created_at: string; paid_at: string | null; }
interface Doc { id: string; label: string | null; uploaded_at: string | null; }

function fmt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function OrderRaOverviewStatus({ orderId, onOpenDocuments, onContactCustomer, onOpenFile }: Props) {
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
            .select("package_key, package_display_name, includes_reasonable_accommodation_letter, additional_documentation_status, additional_documentation_requested_at, customer_uploaded_additional_document_at, doctor_name, doctor_status")
            .eq("id", orderId)
            .maybeSingle(),
          supabase
            .from("order_additional_documentation_requests")
            .select("id, status, amount_cents, created_at, paid_at")
            .eq("order_id", orderId)
            .order("created_at", { ascending: false }),
          supabase
            .from("order_documents")
            .select("id, label, uploaded_at")
            .eq("order_id", orderId)
            .eq("doc_type", "customer_upload")
            .order("uploaded_at", { ascending: false }),
        ]);
        if (!alive) return;
        setRa((orderRes.data as OrderRa) ?? null);
        setReqs((reqRes.data as AddonReq[]) ?? []);
        setDocs((docRes.data as Doc[]) ?? []);
      } catch {
        /* fail soft — nothing renders */
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
  const uploaded = docs.length > 0 || ["uploaded", "in_review", "completed"].includes((ra?.additional_documentation_status ?? "").toLowerCase());

  // Phase 1C — no RA entitlement / request → render nothing.
  if (!isCombo && !paidAddon && !pendingAddon && !uploaded) return null;

  const s = (ra?.additional_documentation_status ?? "").toLowerCase();
  const addonDollars = paidAddon ? Math.round((paidAddon.amount_cents ?? 7000) / 100) : 70;
  const provider = ra?.doctor_name?.trim() || null;
  const uploadDate = fmt(ra?.customer_uploaded_additional_document_at) || (docs.length ? fmt(docs[0].uploaded_at) : "");

  // Package label (Phase 4) + source line (Phase 1).
  const packageLabel = ra?.package_display_name
    || (isCombo ? "Reasonable Accommodation bundle" : "Standard");
  const sourceLine = isCombo
    ? "Combo Package · included — no payment required"
    : paidAddon
      ? `$${addonDollars} Add-on · paid ${fmt(paidAddon.paid_at) ? "· " + fmt(paidAddon.paid_at) : ""}`.trim()
      : pendingAddon
        ? `$${addonDollars} Add-on · payment pending`
        : "";

  // ── Resolve the display state ──────────────────────────────────────────────
  type Tone = "amber" | "emerald" | "blue" | "review";
  let chip = "";
  let tone: Tone = "amber";
  let text = "";
  let showContact = false;
  let showViewDoc = false;

  if (s === "completed") {
    chip = "Housing Accommodation completed";
    tone = "emerald";
    text = "The Housing Accommodation documentation has been completed by the provider.";
    showViewDoc = docs.length > 0;
  } else if (s === "in_review") {
    chip = "Under provider review";
    tone = "review";
    text = provider
      ? `The customer's form is with ${provider} for review.`
      : "The customer's form is with the assigned provider for review.";
    showViewDoc = docs.length > 0;
  } else if (uploaded) {
    chip = "Document uploaded";
    tone = "emerald";
    text = "The customer's Housing Accommodation form is available in Documents"
      + (provider ? ` and is with ${provider} for review.` : ".");
    showViewDoc = docs.length > 0;
  } else if (pendingAddon && !isCombo) {
    chip = `$${addonDollars} add-on — payment pending`;
    tone = "amber";
    text = "The customer started the Additional Documentation add-on but payment is not complete yet.";
    showContact = true;
  } else if (paidAddon && !isCombo) {
    chip = `$${addonDollars} add-on paid — waiting for upload`;
    tone = "amber";
    text = "The customer purchased Additional Documentation, but no form has been uploaded yet.";
    showContact = true;
  } else {
    // Combo, awaiting upload
    chip = "Waiting for customer upload";
    tone = "amber";
    text = "Housing Accommodation support is included, but the customer has not uploaded a landlord/property form yet.";
    showContact = true;
  }

  const heading = isCombo ? "Housing Accommodation Included" : "Additional Documentation Purchased";

  const toneCls: Record<Tone, { card: string; head: string; icon: string; chip: string }> = {
    amber:   { card: "border-amber-200 bg-amber-50/50",   head: "text-[#92400E]", icon: "text-[#B45309]", chip: "bg-amber-100 text-[#92400E]" },
    emerald: { card: "border-emerald-200 bg-emerald-50/50", head: "text-emerald-800", icon: "text-emerald-600", chip: "bg-emerald-100 text-emerald-800" },
    blue:    { card: "border-[#b8cce4] bg-[#e8f0f9]",      head: "text-[#1e3a5f]", icon: "text-[#3b6ea5]", chip: "bg-[#dbe4f0] text-[#1e3a5f]" },
    review:  { card: "border-[#bfdbfe] bg-[#eff6ff]",      head: "text-[#1e3a8a]", icon: "text-[#2563EB]", chip: "bg-[#dbeafe] text-[#1e40af]" },
  };
  const t = toneCls[tone];

  return (
    <div className={`rounded-xl border-2 ${t.card} p-4`}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/70 flex-shrink-0">
          <i className={`ri-home-heart-line text-base ${t.icon}`}></i>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-sm font-extrabold ${t.head}`}>{heading}</p>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${t.chip}`}>{chip}</span>
          </div>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{text}</p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-500">
            <span><span className="font-bold text-gray-400 uppercase tracking-wider">Package</span> · <span className="font-semibold text-gray-700">{packageLabel}</span></span>
            {sourceLine && <span><span className="font-bold text-gray-400 uppercase tracking-wider">Source</span> · <span className="font-semibold text-gray-700">{sourceLine}</span></span>}
            {uploaded && uploadDate && <span><span className="font-bold text-gray-400 uppercase tracking-wider">Uploaded</span> · <span className="font-semibold text-gray-700">{uploadDate}</span></span>}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            {showContact && (
              <button
                type="button"
                onClick={() => {
                  try { window.dispatchEvent(new CustomEvent(RA_CONTACT_CUSTOMER_EVENT, { detail: { slug: RA_REMINDER_EMAIL_SLUG } })); } catch { /* no-op */ }
                  onContactCustomer();
                }}
                className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 bg-[#3b6ea5] hover:bg-[#1e3a5f] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-mail-send-line"></i>Contact customer
              </button>
            )}
            {showViewDoc && docs[0] && (
              <button
                type="button"
                onClick={() => onOpenFile(docs[0].id)}
                className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:border-[#3b6ea5] text-gray-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-external-link-line"></i>View document
              </button>
            )}
            <button
              type="button"
              onClick={onOpenDocuments}
              className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:border-[#3b6ea5] text-gray-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              <i className="ri-folder-open-line"></i>Open Documents
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
