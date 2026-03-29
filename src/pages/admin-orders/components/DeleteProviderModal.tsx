import { useState } from "react";

interface DeleteProviderModalProps {
  providerName: string;
  providerEmail: string;
  activeCases: number;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export default function DeleteProviderModal({
  providerName,
  providerEmail,
  activeCases,
  onConfirm,
  onClose,
}: DeleteProviderModalProps) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const isConfirmed = confirmText.trim().toLowerCase() === providerName.trim().toLowerCase();

  const handleDelete = async () => {
    if (!isConfirmed) return;
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-start gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-red-100 rounded-full flex-shrink-0">
            <i className="ri-delete-bin-6-line text-red-600 text-lg"></i>
          </div>
          <div>
            <h3 className="text-base font-extrabold text-red-800">Delete Provider</h3>
            <p className="text-xs text-red-600 mt-0.5">This action is permanent and cannot be undone.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="whitespace-nowrap ml-auto w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-100 cursor-pointer transition-colors"
          >
            <i className="ri-close-line text-sm"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Provider summary */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-sm font-bold text-gray-900">{providerName}</p>
            <p className="text-xs text-gray-400 mt-0.5">{providerEmail}</p>
          </div>

          {/* Active cases warning */}
          {activeCases > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                <i className="ri-error-warning-fill text-amber-500 text-base"></i>
              </div>
              <div>
                <p className="text-sm font-bold text-amber-800">
                  This provider has {activeCases} active case{activeCases !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                  Deleting them will NOT remove their assigned orders — those orders will remain
                  unassigned. Make sure to reassign them manually from the Orders tab before deleting.
                </p>
              </div>
            </div>
          )}

          {/* What gets deleted */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">What will be deleted:</p>
            <ul className="space-y-1.5">
              {[
                "Provider profile and portal access",
                "Supabase login account — they will no longer be able to sign in",
                "Contact record and licensed states",
                "All internal notes linked to this provider",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs text-gray-600">
                  <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                    <i className="ri-checkbox-blank-circle-line text-red-400"></i>
                  </div>
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              Past orders and assignment history are preserved for record-keeping.
            </p>
          </div>

          {/* Confirm by typing name */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Type <span className="font-extrabold text-gray-900">{providerName}</span> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`Type "${providerName}" here`}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200 transition-colors"
            />
            {confirmText.length > 0 && !isConfirmed && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <i className="ri-error-warning-line"></i>
                Name doesn&apos;t match — please type it exactly
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={!isConfirmed || deleting}
            className="whitespace-nowrap flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {deleting ? (
              <><i className="ri-loader-4-line animate-spin"></i>Deleting...</>
            ) : (
              <><i className="ri-delete-bin-6-line"></i>Permanently Delete</>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="whitespace-nowrap px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
