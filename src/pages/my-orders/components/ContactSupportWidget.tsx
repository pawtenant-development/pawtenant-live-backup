import { useState, useRef, useEffect } from "react";
import { submitContactRequest } from "../../../lib/contactSubmit";

interface Order {
  id: string;
  confirmation_id: string;
  first_name: string | null;
  last_name: string | null;
}

interface Props {
  userEmail: string;
  userName: string;
  orders: Order[];
  externalOpen?: boolean;
  onExternalClose?: () => void;
}

const SUBJECT_OPTIONS = [
  { value: "order_status", label: "Question about my order status" },
  { value: "documents", label: "Issue with my documents / letter" },
  { value: "provider", label: "Question about my assigned provider" },
  { value: "billing", label: "Billing or payment issue" },
  { value: "refund", label: "Refund request" },
  { value: "other", label: "Something else" },
];

export default function ContactSupportWidget({ userEmail, userName, orders, externalOpen, onExternalClose }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(orders[0]?.confirmation_id ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // sync with external open trigger
  useEffect(() => {
    if (externalOpen) setOpen(true);
  }, [externalOpen]);

  // keep the selected order in sync if orders load after mount
  useEffect(() => {
    if (!selectedOrder && orders.length > 0) {
      setSelectedOrder(orders[0].confirmation_id);
    }
  }, [orders, selectedOrder]);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject) { setError("Please select a topic."); return; }
    if (message.trim().length < 10) { setError("Please describe your issue (at least 10 characters)."); return; }
    setError("");
    setSending(true);

    const subjectLabel = SUBJECT_OPTIONS.find((o) => o.value === subject)?.label ?? subject;

    try {
      await submitContactRequest({
        name: userName,
        email: userEmail,
        phone: null,
        subject: subjectLabel,
        message: message.trim(),
        source_page: "/my-orders",
        metadata: {
          order_reference: selectedOrder,
          lead_source: "My Orders Support Widget",
        },
      });
      setSent(true);
    } catch (err) {
      setError(
        (err as Error)?.message ||
          "Something went wrong. Please email us at hello@pawtenant.com.",
      );
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    onExternalClose?.();
    // reset after close animation
    setTimeout(() => { setSent(false); setMessage(""); setSubject(""); setError(""); }, 300);
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="whitespace-nowrap fixed bottom-7 right-7 z-50 flex items-center gap-2 px-5 py-3 bg-[#2c5282] text-white text-sm font-bold rounded-full shadow-lg hover:bg-[#1e3a5f] active:scale-95 transition-all cursor-pointer"
        aria-label="Contact Support"
      >
        <div className="w-5 h-5 flex items-center justify-center">
          <i className="ri-customer-service-2-line text-base"></i>
        </div>
        Contact Support
        {/* pulse dot */}
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-400 rounded-full animate-ping opacity-75"></span>
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-400 rounded-full"></span>
      </button>

      {/* Overlay backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center sm:justify-end sm:pr-7 sm:pb-24 transition-opacity">
          <div
            ref={panelRef}
            className="w-full sm:w-96 bg-white rounded-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: "90vh" }}
          >
            {/* Header */}
            <div className="bg-[#2c5282] px-5 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 flex items-center justify-center bg-white/20 rounded-full">
                  <i className="ri-customer-service-2-line text-white text-base"></i>
                </div>
                <div>
                  <p className="text-sm font-extrabold text-white">Contact Support</p>
                  <p className="text-xs text-green-200">We reply within 1 hour</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1">
              {sent ? (
                <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                  <div className="w-16 h-16 flex items-center justify-center bg-green-100 rounded-full mb-4">
                    <i className="ri-checkbox-circle-fill text-green-500 text-3xl"></i>
                  </div>
                  <h3 className="text-base font-extrabold text-gray-900 mb-2">Message sent!</h3>
                  <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                    Our team will get back to you at <strong>{userEmail}</strong> within 1 hour.
                  </p>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="whitespace-nowrap px-6 py-2.5 bg-[#2c5282] text-white text-sm font-bold rounded-lg hover:bg-[#1e3a5f] transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="px-5 py-5 space-y-4"
                >
                  {/* Quick contact strip */}
                  <div className="flex gap-2">
                    <a
                      href="tel:+14099655885"
                      className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:border-[#2c5282] hover:text-[#2c5282] transition-colors cursor-pointer"
                    >
                      <div className="w-4 h-4 flex items-center justify-center">
                        <i className="ri-phone-line"></i>
                      </div>
                      Call Us
                    </a>
                    <a
                      href="mailto:hello@pawtenant.com"
                      className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:border-[#2c5282] hover:text-[#2c5282] transition-colors cursor-pointer"
                    >
                      <div className="w-4 h-4 flex items-center justify-center">
                        <i className="ri-mail-line"></i>
                      </div>
                      Email Us
                    </a>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-100"></div>
                    <span className="text-xs text-gray-400 font-semibold">or send a message below</span>
                    <div className="flex-1 h-px bg-gray-100"></div>
                  </div>

                  {/* Order reference */}
                  {orders.length > 0 && (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">
                        Order Reference
                      </label>
                      <select
                        name="order_reference"
                        value={selectedOrder}
                        onChange={(e) => setSelectedOrder(e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 text-gray-800 bg-gray-50 focus:outline-none focus:border-[#2c5282] cursor-pointer"
                      >
                        {orders.map((o) => (
                          <option key={o.id} value={o.confirmation_id}>
                            {o.confirmation_id}{o.first_name ? ` · ${o.first_name} ${o.last_name ?? ""}` : ""}
                          </option>
                        ))}
                        <option value="general">General question (no specific order)</option>
                      </select>
                    </div>
                  )}

                  {/* Subject */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      What do you need help with? <span className="text-red-400">*</span>
                    </label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {SUBJECT_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSubject(opt.value)}
                          className={`whitespace-nowrap text-left px-3 py-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                            subject === opt.value
                              ? "border-[#2c5282] bg-[#e8f0f9] text-[#2c5282]"
                              : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          {subject === opt.value && (
                            <i className="ri-checkbox-circle-fill mr-1.5 text-[#2c5282]"></i>
                          )}
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Your message <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      name="message"
                      rows={4}
                      maxLength={500}
                      placeholder="Describe your question or issue in detail..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#2c5282] resize-none bg-gray-50"
                    />
                    <p className="text-right text-xs text-gray-400 mt-1">{message.length}/500</p>
                  </div>

                  {/* Hidden fields */}
                  <input type="hidden" name="email" value={userEmail} />
                  <input type="hidden" name="name" value={userName} />

                  {error && (
                    <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                      <i className="ri-error-warning-line flex-shrink-0"></i>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={sending}
                    className="whitespace-nowrap w-full flex items-center justify-center gap-2 py-3 bg-orange-500 text-white text-sm font-extrabold rounded-lg hover:bg-orange-600 disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    {sending ? (
                      <>
                        <i className="ri-loader-4-line animate-spin"></i>Sending...
                      </>
                    ) : (
                      <>
                        <i className="ri-send-plane-fill"></i>Send Message
                      </>
                    )}
                  </button>

                  <p className="text-center text-xs text-gray-400">
                    We typically respond within 1 hour during business hours.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
