import { useEffect } from "react";

interface PolicyModalProps {
  url: string;
  title: string;
  onClose: () => void;
}

export default function PolicyModal({ url, title, onClose }: PolicyModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal Panel */}
      <div className="relative z-10 w-full sm:w-[90vw] sm:max-w-3xl bg-white rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden"
        style={{ height: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center bg-[#E8F1EE] rounded-lg">
              <i className="ri-file-text-line text-[#1A5C4F] text-sm"></i>
            </div>
            <span className="font-bold text-gray-900 text-sm">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <i className="ri-close-line text-base"></i>
          </button>
        </div>

        {/* iframe Content */}
        <div className="flex-1 overflow-hidden">
          <iframe
            src={url}
            title={title}
            className="w-full h-full border-0"
            loading="lazy"
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end flex-shrink-0 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="whitespace-nowrap px-5 py-2 bg-[#1A5C4F] text-white text-xs font-bold rounded-lg hover:bg-[#14493E] transition-colors cursor-pointer"
          >
            Close &amp; Return to Checkout
          </button>
        </div>
      </div>
    </div>
  );
}
