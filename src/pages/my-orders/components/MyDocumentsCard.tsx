// MyDocumentsCard — the dedicated "My Documents" deliverables card that lives in
// the right-hand column on desktop (CUSTOMER-PORTAL-DOCUMENTS-IA-HOUSING-VISIBILITY-001).
//
// Shows ONLY true customer deliverables, resolved by the shared
// resolveCustomerDocuments():
//   • the FINALIZED (footer-injected) ESA/PSD letter — with its Verification ID,
//   • the provider-COMPLETED Housing Accommodation form — with NO Verification ID.
// It never shows the customer's own SOURCE upload (that stays in the Housing
// workflow section) and never shows the provider's raw un-stamped original.
//
// Every open/download mints a fresh short-lived signed URL via the shared
// openSecureDocument/downloadSecureDocument helper (get-document-signed-url →
// service-role signing behind owning-customer authz). No storage path or raw URL
// is ever exposed in the DOM.

import { useState } from "react";
import CustomerPortalSection from "./CustomerPortalSection";
import {
  resolveCustomerDocuments,
  formatDeliverableDate,
  type ResolverOrder,
  type CustomerDeliverable,
} from "@/lib/customerDocuments";
import { openSecureDocument, downloadSecureDocument } from "@/lib/openSecureDocument";

type RowBusy = "view" | "download" | null;

function DeliverableRow({ doc }: { doc: CustomerDeliverable }) {
  const [busy, setBusy] = useState<RowBusy>(null);
  const [err, setErr] = useState("");

  const act = async (mode: "view" | "download") => {
    setErr("");
    // Legacy delivered order with no order_documents row — direct stored URL.
    if (doc.isLegacyDirect) {
      if (doc.fallbackUrl) window.open(doc.fallbackUrl, mode === "view" ? "_blank" : "_self");
      else setErr("This document isn't available right now. Please contact support.");
      return;
    }
    if (!doc.id) {
      setErr("This document isn't available right now. Please contact support.");
      return;
    }
    setBusy(mode);
    const r = mode === "download"
      ? await downloadSecureDocument(doc.id)
      : await openSecureDocument(doc.id);
    if (!r.ok) setErr(r.error ?? "Couldn't open this document. Please try again.");
    setBusy(null);
  };

  const dateLine = doc.date ? `${doc.dateVerb} ${formatDeliverableDate(doc.date)}` : doc.dateVerb;

  return (
    <li className="rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <span className="w-9 h-9 flex items-center justify-center bg-[#e8f0f9] rounded-lg flex-shrink-0">
          <i className={`${doc.icon} text-[#3b6ea5] text-base`}></i>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#172033] leading-snug break-words" title={doc.title}>
            {doc.title}
          </p>
          {doc.verificationId && (
            <p className="text-[11px] text-[#5F6B7A] mt-0.5">
              Verification ID <span className="font-mono font-semibold text-[#1e3a5f]">{doc.verificationId}</span>
            </p>
          )}
          <p className="text-[11px] text-[#64748b] mt-0.5">{dateLine}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2.5">
        <button
          type="button"
          onClick={() => act("view")}
          disabled={busy !== null}
          className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-200 disabled:opacity-60 cursor-pointer transition-colors"
        >
          {busy === "view" ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-eye-line"></i>}
          Open
        </button>
        <button
          type="button"
          onClick={() => act("download")}
          disabled={busy !== null}
          className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#1e3a5f] disabled:opacity-60 cursor-pointer transition-colors"
        >
          {busy === "download" ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-download-line"></i>}
          Download
        </button>
      </div>

      {err && (
        <p className="text-[11px] text-red-600 mt-2 flex items-center gap-1">
          <i className="ri-error-warning-line flex-shrink-0"></i>
          <span>{err}</span>
        </p>
      )}
    </li>
  );
}

export default function MyDocumentsCard({ order }: { order: ResolverOrder }) {
  const { deliverables } = resolveCustomerDocuments(order);
  const count = deliverables.length;

  return (
    <CustomerPortalSection
      title="My Documents"
      icon="ri-folder-open-line"
      tone="blue"
      headerRight={
        count > 0 ? (
          <span className="text-xs font-bold px-2 py-0.5 bg-[#e8f0f9] text-[#1e3a5f] rounded-full">{count}</span>
        ) : undefined
      }
    >
      {count === 0 ? (
        <div className="text-center py-5">
          <span className="w-10 h-10 flex items-center justify-center bg-[#f1f5f9] rounded-full mx-auto mb-2.5">
            <i className="ri-folder-3-line text-[#94a3b8] text-lg"></i>
          </span>
          <p className="text-xs text-[#64748b] leading-relaxed max-w-[220px] mx-auto">
            Your completed documents will appear here as soon as your provider delivers them.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {deliverables.map((doc, i) => (
            <DeliverableRow key={doc.id ?? `legacy-${doc.kind}-${i}`} doc={doc} />
          ))}
        </ul>
      )}
    </CustomerPortalSection>
  );
}
