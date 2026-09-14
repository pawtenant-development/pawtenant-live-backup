// Admin "New Partner Order" — the structured form.
//
// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002.
//
// A thin modal around the SHARED `PartnerOrderWizard`. The admin picks the
// partner first; every step after that is byte-for-byte the form a partner
// user fills in, so the two surfaces cannot drift apart and both submit
// through the one `partner_submit_manual_order` transaction.
//
// This replaces PDF upload + OCR as the DEFAULT intake path. The legacy PDF
// wizard is still reachable from a clearly labelled secondary control on the
// Orders sub-tab and its drafts stay visible for audit — nothing historical
// was deleted, and API-connected partners are unaffected.

import PartnerOrderWizard, { type PartnerOrderSubmitted } from "../../../../components/partner/PartnerOrderWizard";
import type { PartnerOrg } from "./shared";

interface Props {
  open: boolean;
  partners: PartnerOrg[];
  /** Pre-select the partner the workspace header is already showing. */
  preselect: PartnerOrg | null;
  onClose: () => void;
  onOrderCreated: (result: PartnerOrderSubmitted) => void;
}

export default function PartnerAdminOrderIntake({ open, partners, preselect, onClose, onOrderCreated }: Props) {
  if (!open) return null;

  // Only organizations that can actually receive an order. A draft or
  // terminated partner has no active rate and would be refused at submission,
  // so it is not offered in the first place.
  const selectable = partners
    .filter((p) => p.status === "sandbox" || p.status === "active")
    .map((p) => ({ id: p.id, display_name: p.display_name, allowed_services: p.allowed_services, status: p.status }));

  // Put the workspace's currently selected partner at the top of the list so
  // the obvious choice is the first one.
  const ordered = preselect
    ? [...selectable.filter((p) => p.id === preselect.id), ...selectable.filter((p) => p.id !== preselect.id)]
    : selectable;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" aria-hidden onClick={onClose}></div>
      <div className="relative flex h-[100dvh] w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900">New Partner Order</h3>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              Enter the customer, pets and questionnaire answers directly — no PDF upload.
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 cursor-pointer" aria-label="Close">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <PartnerOrderWizard
            mode="admin"
            partners={ordered}
            onSubmitted={onOrderCreated}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
