// NeedHelpCard — compact support card for the right-hand portal column
// (CUSTOMER-PORTAL-DOCUMENTS-IA-HOUSING-VISIBILITY-001). Renders through the shared
// CustomerPortalSection shell so its header matches every other section. Opens the
// existing floating ContactSupportWidget (no new support system) and offers the
// phone / email fallbacks.

import CustomerPortalSection from "./CustomerPortalSection";

export default function NeedHelpCard({ onContactSupport }: { onContactSupport: () => void }) {
  return (
    <CustomerPortalSection title="Need Help?" icon="ri-customer-service-2-line" tone="blue">
      <p className="text-xs text-[#5F6B7A] leading-relaxed mb-3">
        Questions about your order or documents? Our team typically responds within an hour.
      </p>
      <button
        type="button"
        onClick={onContactSupport}
        className="whitespace-nowrap w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#1e3a5f] transition-colors cursor-pointer"
      >
        <i className="ri-message-3-line"></i>Send a Message
      </button>
      <div className="mt-3 pt-3 border-t border-[#eef2f7] flex flex-col gap-2">
        <a
          href="tel:+14099655885"
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#5F6B7A] hover:text-[#3b6ea5] transition-colors cursor-pointer"
        >
          <i className="ri-phone-line text-[#3b6ea5]"></i>(409) 965-5885
        </a>
        <a
          href="mailto:hello@pawtenant.com"
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#5F6B7A] hover:text-[#3b6ea5] transition-colors cursor-pointer break-all"
        >
          <i className="ri-mail-line text-[#3b6ea5]"></i>hello@pawtenant.com
        </a>
      </div>
    </CustomerPortalSection>
  );
}
