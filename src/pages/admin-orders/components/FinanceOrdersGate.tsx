// FinanceOrdersGate — shown to Finance role users on the Orders tab
// They must request Owner/Admin approval before gaining access to the full orders list
import { useState } from "react";
import ApprovalRequestModal from "./ApprovalRequestModal";

interface FinanceOrdersGateProps {
  adminName: string;
  adminUserId: string;
  onAccessGranted: () => void;
}

export default function FinanceOrdersGate({ adminName, adminUserId, onAccessGranted }: FinanceOrdersGateProps) {
  const [showApproval, setShowApproval] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  // Pre-filled context for the Finance-specific approval request
  const financeRequestPayload = {
    requestedBy: adminName,
    requestedAt: new Date().toISOString(),
    accessType: "orders_tab_full_view",
    financeContext: "Finance user needs to cross-reference order data with payment records and analytics.",
    willBeAbleTo: [
      "View all orders and order details",
      "See provider assignments and status",
      "Access order documents and assessment data",
    ],
    willNotBeAbleTo: [
      "Issue refunds (requires separate approval)",
      "Delete orders (requires separate approval)",
      "Send bulk broadcasts or SMS campaigns",
    ],
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 py-16 text-center">
      {/* Icon */}
      <div className="w-24 h-24 flex items-center justify-center bg-emerald-50 border-2 border-emerald-200 rounded-full mb-6">
        <i className="ri-lock-2-line text-emerald-600 text-4xl"></i>
      </div>

      {/* Role badge */}
      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-extrabold rounded-full mb-4">
        <i className="ri-money-dollar-circle-line text-sm"></i>
        Finance Role
      </span>

      <h2 className="text-xl font-extrabold text-gray-900 mb-2">Orders Tab — Access Restricted</h2>
      <p className="text-sm text-gray-500 max-w-md leading-relaxed mb-8">
        Finance users require <strong>Owner</strong> or <strong>Admin Manager</strong> approval to access the full Orders tab.
        This is a security measure to protect customer data and order integrity.
      </p>

      {requestSubmitted ? (
        /* ── Submitted state ── */
        <div className="w-full max-w-md bg-[#f0faf7] border border-[#b8ddd5] rounded-2xl p-6 space-y-4">
          <div className="w-14 h-14 flex items-center justify-center bg-[#1a5c4f]/10 rounded-full mx-auto">
            <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-3xl"></i>
          </div>
          <div>
            <p className="text-base font-extrabold text-[#1a5c4f]">Request Submitted!</p>
            <p className="text-sm text-[#2d7a6a] mt-1 leading-relaxed">
              Your request has been sent to all Owners and Admin Managers. You&apos;ll be notified via the bell icon and by email once it&apos;s reviewed.
            </p>
          </div>
          <div className="space-y-2 text-left">
            {[
              { icon: "ri-mail-send-line", text: "Email notification sent to all owners & admins" },
              { icon: "ri-notification-3-line", text: "They'll see it in their Approvals inbox" },
              { icon: "ri-time-line", text: "You'll be notified by email and bell when decided" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2 text-xs text-[#1a5c4f]">
                <i className={`${item.icon} flex-shrink-0`}></i>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md space-y-4">
          {/* What Finance CAN access */}
          <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-2xl p-5 text-left">
            <p className="text-xs font-extrabold text-[#1a5c4f] uppercase tracking-widest mb-3 flex items-center gap-2">
              <i className="ri-checkbox-circle-line text-base"></i>
              What you can access without approval
            </p>
            <div className="space-y-2">
              {[
                { icon: "ri-dashboard-line", text: "Dashboard — overview metrics and stats" },
                { icon: "ri-bar-chart-2-line", text: "Analytics — revenue charts and trends" },
                { icon: "ri-bank-card-line", text: "Payments — all payment records and history" },
                { icon: "ri-money-dollar-circle-line", text: "Earnings — provider payout tracking" },
                { icon: "ri-group-line", text: "Customers — customer profiles and history" },
                { icon: "ri-file-list-3-line", text: "Audit Log — full system audit trail" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-2 text-xs text-[#1a5c4f]">
                  <i className={`${item.icon} flex-shrink-0`}></i>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* What requires approval */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 text-left">
            <p className="text-xs font-extrabold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <i className="ri-shield-keyhole-line text-base"></i>
              Requires Owner / Admin Manager approval
            </p>
            <div className="space-y-2">
              {[
                { icon: "ri-file-list-3-line", text: "Full Orders tab — view and manage all orders" },
                { icon: "ri-user-settings-line", text: "Order detail — customer info, status, documents" },
                { icon: "ri-stethoscope-line", text: "Provider assignment and order management" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-2 text-xs text-gray-400">
                  <i className={`${item.icon} flex-shrink-0`}></i>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Finance-specific context note */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left">
            <div className="flex items-start gap-2">
              <i className="ri-information-line text-amber-600 text-sm flex-shrink-0 mt-0.5"></i>
              <div>
                <p className="text-xs font-bold text-amber-800 mb-1">Finance Role — What the reviewer will see</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Your request will be sent as: <strong>&ldquo;Orders Tab Access Request from {adminName} (Finance)&rdquo;</strong>.
                  The reviewer will see exactly what you&apos;ll gain access to and what remains restricted — so they can approve with confidence.
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowApproval(true)}
              className="whitespace-nowrap flex items-center justify-center gap-2 px-6 py-3 bg-[#1a5c4f] text-white text-sm font-bold rounded-xl hover:bg-[#17504a] cursor-pointer transition-colors"
            >
              <i className="ri-send-plane-line"></i>
              Request Access to Orders Tab
            </button>
            <p className="text-xs text-gray-400 text-center">
              Your request will be pre-filled with Finance context for the reviewer
            </p>
          </div>
        </div>
      )}

      {/* Approval Request Modal — pre-filled with Finance-specific context */}
      {showApproval && (
        <ApprovalRequestModal
          actionType="orders_tab_access"
          actionLabel="Orders Tab Access"
          actionDescription={`Finance user ${adminName} is requesting access to the full Orders tab to cross-reference order data with payment records and analytics. If approved, they will be able to view orders and order details, but cannot issue refunds, delete orders, or send broadcasts without separate approval.`}
          payload={financeRequestPayload}
          requesterName={adminName}
          requesterRole="finance"
          requesterUserId={adminUserId}
          onClose={() => {
            setShowApproval(false);
            setRequestSubmitted(true);
          }}
        />
      )}
    </div>
  );
}
