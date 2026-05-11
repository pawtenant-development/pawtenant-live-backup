// Calm support / contact card.
//
// Mounted in Step 3 left (trust) column. Phone + email, both clickable
// (`tel:` and `mailto:`). Mentions landlord verification support so the
// user knows help is available BEFORE and AFTER checkout. No chatbot,
// no fake live agent indicator, no urgency.

const BRAND_GREEN = "#1A5C4F";
const BRAND_GREEN_SOFT = "#E8F1EE";

export default function SupportCard() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_0_rgba(15,23,42,0.03),0_8px_28px_-14px_rgba(15,23,42,0.12)] overflow-hidden">
      <div className="px-5 py-5">
        <div className="flex items-start gap-3.5 mb-4">
          <div
            className="w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0"
            style={{ backgroundColor: BRAND_GREEN_SOFT }}
          >
            <i className="ri-customer-service-2-line text-xl" style={{ color: BRAND_GREEN }}></i>
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-900 leading-snug tracking-tight">
              Questions before or after checkout?
            </p>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Our team is here to help — including if your landlord has follow-up questions about your letter or how to verify it.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <a
            href="tel:+14099655885"
            className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Call PawTenant support"
          >
            <div
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-white ring-1 ring-slate-200 flex-shrink-0"
            >
              <i className="ri-phone-line text-sm" style={{ color: BRAND_GREEN }}></i>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.18em] leading-none">
                Call us
              </p>
              <p className="text-sm font-bold text-slate-900 mt-1.5 leading-none">
                (409) 965-5885
              </p>
            </div>
          </a>

          <a
            href="mailto:hello@pawtenant.com"
            className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Email PawTenant support"
          >
            <div
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-white ring-1 ring-slate-200 flex-shrink-0"
            >
              <i className="ri-mail-line text-sm" style={{ color: BRAND_GREEN }}></i>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.18em] leading-none">
                Email us
              </p>
              <p className="text-sm font-bold text-slate-900 mt-1.5 leading-none break-all">
                hello@pawtenant.com
              </p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
