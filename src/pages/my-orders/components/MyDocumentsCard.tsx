// MyDocumentsCard — the dedicated "My Documents" deliverables card that lives in
// the right-hand column on desktop (CUSTOMER-PORTAL-DOCUMENTS-IA-HOUSING-VISIBILITY-001).
//
// Shows ONLY true customer deliverables, resolved by the shared
// resolveCustomerDocuments():
//   • the delivered ESA/PSD letter — with its verification QR code,
//   • the provider-COMPLETED Housing Accommodation form — with NO verification QR code.
// It never shows the customer's own SOURCE upload (that stays in the Housing
// workflow section).
//
// CUSTOMER-DUAL-LETTER-DOWNLOADS-001: the letter card offers BOTH stored
// artifacts — "Download Original" (the provider's exact submitted file) then
// "Download QR-verified copy" (the separate generated copy carrying the
// verification QR code) — in that fixed order. They are two different storage
// objects in two different buckets; neither is ever derived from or substituted
// for the other. The Housing form has only one file and keeps Open/Download.
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
import MyDocumentVersionHistory from "./MyDocumentVersionHistory";

type RowBusy = "view" | "download" | "original" | "verification" | null;

/** Shared button chrome. `flex-1 basis-[9.5rem]` is what makes the pair sit
 *  side-by-side from ~390px up and stack cleanly at 375px, and the label is
 *  never truncated — no `truncate`, no fixed width, `whitespace-nowrap` so the
 *  text sets the minimum and the BUTTON wraps instead of the words. */
const BTN_BASE =
  "inline-flex flex-1 basis-[9.5rem] items-center justify-center gap-1.5 whitespace-nowrap " +
  "px-3 py-2 text-xs font-bold rounded-lg disabled:opacity-60 cursor-pointer transition-colors";
const BTN_NEUTRAL = `${BTN_BASE} bg-gray-100 text-gray-700 hover:bg-gray-200`;
const BTN_PRIMARY = `${BTN_BASE} bg-[#3b6ea5] text-white hover:bg-[#1e3a5f]`;

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

  // CUSTOMER-DUAL-LETTER-DOWNLOADS-001 — one artifact, named strictly. The
  // variant is sent to the edge function, which resolves THAT stored object or
  // fails; it never quietly serves the other one.
  const download = async (target: NonNullable<CustomerDeliverable["originalDownload"]>) => {
    setErr("");
    setBusy(target.variant);
    const r = await downloadSecureDocument(target.documentId, target.filename, {
      variant: target.variant,
      downloadFilename: target.filename,
    });
    if (!r.ok) {
      setErr(
        r.code === "verification_unavailable"
          ? "The QR-verified copy isn't available for this letter. Please contact support."
          : r.code === "original_unavailable"
            ? "The original letter file isn't available. Please contact support."
            : r.error ?? "Couldn't download this document. Please try again.",
      );
    }
    setBusy(null);
  };

  // CUSTOMER-PORTAL-LETTER-VIEW-RECOVERY-001 — downloading is not the same as
  // viewing, especially on iPhone where a download may disappear into Files.
  // Open the best customer-facing artifact in a popup-safe tab: prefer the
  // QR-verified copy, then the provider original when no verified copy exists.
  const viewTarget = doc.verificationDownload ?? doc.originalDownload;
  const view = async () => {
    if (!viewTarget) return;
    setErr("");
    setBusy("view");
    const r = await openSecureDocument(viewTarget.documentId, {
      variant: viewTarget.variant,
    });
    if (!r.ok) setErr(r.error ?? "Couldn't open this document. Please try again.");
    setBusy(null);
  };

  const dateLine = doc.date ? `${doc.dateVerb} ${formatDeliverableDate(doc.date)}` : doc.dateVerb;
  const dualDownloads = doc.originalDownload || doc.verificationDownload;

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
          {/* The row's own stored label. Interpolated as TEXT by React — never
              dangerouslySetInnerHTML — so a hostile filename renders inert.
              `break-words` keeps a long, space-free name inside the card at
              390px instead of forcing the page to scroll sideways. */}
          {doc.detail && (
            <p className="text-[11px] text-[#5F6B7A] mt-0.5 break-words" title={doc.detail}>
              {doc.detail}
            </p>
          )}
          {doc.verificationId && (
            <p className="text-[11px] text-[#5F6B7A] mt-0.5">
              Verification reference <span className="font-mono font-semibold text-[#1e3a5f]">{doc.verificationId}</span>
            </p>
          )}
          <p className="text-[11px] text-[#64748b] mt-0.5">{dateLine}</p>
        </div>
      </div>

      {dualDownloads ? (
        // View the best customer-facing artifact first, then preserve the two
        // explicit download choices in their required order: original, verified.
        // A variant with no genuine stored file renders no button rather than
        // aliasing the other one.
        <div className="flex flex-wrap items-stretch gap-2 mt-2.5">
          {viewTarget && (
            <button
              type="button"
              onClick={view}
              disabled={busy !== null}
              className={BTN_PRIMARY}
            >
              {busy === "view"
                ? <i className="ri-loader-4-line animate-spin"></i>
                : <i className="ri-eye-line"></i>}
              {doc.kind === "esa_letter" || doc.kind === "psd_letter" ? "View letter" : "View document"}
            </button>
          )}
          {doc.originalDownload && (
            <button
              type="button"
              onClick={() => download(doc.originalDownload!)}
              disabled={busy !== null}
              className={BTN_NEUTRAL}
            >
              {busy === "original"
                ? <i className="ri-loader-4-line animate-spin"></i>
                : <i className="ri-file-text-line"></i>}
              Download Original
            </button>
          )}
          {doc.verificationDownload && (
            <button
              type="button"
              onClick={() => download(doc.verificationDownload!)}
              disabled={busy !== null}
              className={BTN_PRIMARY}
            >
              {busy === "verification"
                ? <i className="ri-loader-4-line animate-spin"></i>
                : <i className="ri-shield-check-line"></i>}
              Download QR-verified copy
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-stretch gap-2 mt-2.5">
          <button
            type="button"
            onClick={() => act("view")}
            disabled={busy !== null}
            className={BTN_NEUTRAL}
          >
            {busy === "view" ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-eye-line"></i>}
            Open
          </button>
          <button
            type="button"
            onClick={() => act("download")}
            disabled={busy !== null}
            className={BTN_PRIMARY}
          >
            {busy === "download" ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-download-line"></i>}
            Download
          </button>
        </div>
      )}

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
        <>
          <ul className="space-y-2.5">
            {deliverables.map((doc, i) => (
              <DeliverableRow key={doc.id ?? `legacy-${doc.kind}-${i}`} doc={doc} />
            ))}
          </ul>
          {/* ORDER-ENTITLEMENT-DOCUMENT-FOUNDATION-CLOSURE-001 §11: collapsed
              superseded-version history. Renders nothing when the order has
              never been revised, so legacy orders are untouched. */}
          <MyDocumentVersionHistory confirmationId={order.confirmation_id} />
        </>
      )}
    </CustomerPortalSection>
  );
}
