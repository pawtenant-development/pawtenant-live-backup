import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";

const sections = [
  { id: "hipaa", title: "1. HIPAA" },
  { id: "information-collected", title: "2. Information We Collect" },
  { id: "cookies", title: "3. Cookies & Tracking" },
  { id: "how-we-use", title: "4. How We Use Your Information" },
  { id: "how-we-share", title: "5. How We Share Your Information" },
  { id: "protection", title: "6. How We Protect Your Information" },
  { id: "retention", title: "7. Retention" },
  { id: "your-choices", title: "8. Your Privacy Choices" },
  { id: "children", title: "9. Children\'s Privacy" },
  { id: "updates", title: "10. Updates" },
  { id: "california", title: "11. California Residents" },
  { id: "sms", title: "12. SMS Opt-In" },
];

export default function PrivacyPolicyPage() {
  const [activeId, setActiveId] = useState("hipaa");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <main>
      <SharedNavbar />

      {/* Hero */}
      <section className="pt-32 pb-12 bg-[#fdf6ee]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <Link to="/" className="hover:text-orange-500 transition-colors cursor-pointer">Home</Link>
            <i className="ri-arrow-right-s-line text-gray-400"></i>
            <span className="text-gray-800 font-medium">Privacy Policy</span>
          </div>
          <h1 className="text-4xl font-extrabold text-gray-900 mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
            Privacy Policy
          </h1>
          <p className="text-sm text-gray-500">
            <strong>Pawtenant (HyperSpace Solutions LLC)</strong> &nbsp;·&nbsp; Effective Date: <strong>November, 2024</strong>
          </p>
          <p className="text-gray-600 text-sm leading-relaxed mt-4 max-w-3xl">
            This Privacy Notice outlines how Pawtenant, Inc. ("Pawtenant," "we," or "us") collects, uses, and shares your information when you engage with our website (pawtenant.com), emails from us, or other forms of communication (collectively referred to as our "Services").
          </p>
          <p className="text-gray-600 text-sm leading-relaxed mt-2 max-w-3xl">
            Please be aware that this Privacy Notice does not apply to non-Pawtenant websites or services operating under different privacy policies. For any questions about our privacy practices, you can email us at <a href="mailto:hello@pawtenant.com" className="text-orange-500 font-semibold hover:underline">hello@pawtenant.com</a>.
          </p>
        </div>
      </section>

      {/* Body */}
      <section className="py-14 bg-white">
        <div className="max-w-6xl mx-auto px-6 flex gap-12">

          {/* Sidebar TOC */}
          <aside className="w-64 flex-shrink-0 hidden lg:block">
            <div className="sticky top-28">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">On This Page</p>
              <ul className="space-y-1">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className={`block text-sm py-1.5 px-3 rounded-lg transition-colors cursor-pointer ${
                        activeId === s.id
                          ? "bg-orange-50 text-orange-600 font-semibold border-l-2 border-orange-500"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-12">

            <div id="hipaa" className="scroll-mt-28">
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-100 text-orange-600 text-xs font-extrabold flex-shrink-0">1</span>
                HIPAA
              </h2>
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>Pawtenant connects individuals with mental health professionals to support emotional support animal (ESA) letters and psychiatric service dog (PSD) evaluations.</p>
                <p>In doing so, we may collect, share, and store protected health information (PHI) in accordance with the Health Insurance Portability and Accountability Act ("HIPAA"), acting as a business associate of these mental health providers.</p>
                <p>As a business associate, Pawtenant can only handle PHI in ways the provider is authorized to. For details on how your mental health provider handles your PHI, please refer to their specific privacy notice.</p>
              </div>
            </div>

            <div id="information-collected" className="scroll-mt-28">
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-100 text-orange-600 text-xs font-extrabold flex-shrink-0">2</span>
                The Information We Collect
              </h2>
              <div className="text-gray-600 text-sm leading-relaxed space-y-4">
                <p>Depending on how you interact with Pawtenant, we may collect information through the following ways:</p>
                <div>
                  <p className="font-bold text-gray-800 mb-2">Information You Provide Directly:</p>
                  <ul className="space-y-1.5">
                    {[
                      { label: "Contact Information:", desc: "Details you share when communicating with us via email, mail, phone, or chat." },
                      { label: "Account Information:", desc: "Your name, email, phone number, and password." },
                      { label: "Transactional Information:", desc: "Payment details and purchase history when using our Services." },
                      { label: "Photographs:", desc: "If you apply for a Pawtenant scholarship." },
                      { label: "Health Information:", desc: "Mental health details submitted through ESA or PSD service questionnaires." },
                      { label: "Demographic Data:", desc: "Age, gender, race, or ethnicity when requested by your mental health provider." },
                      { label: "Employment and Educational Information:", desc: "When relevant for scholarships or ESA/PSD services." },
                    ].map((item) => (
                      <li key={item.label} className="flex items-start gap-2">
                        <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
                        <span><strong className="text-gray-800">{item.label}</strong> {item.desc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-2">Information Collected Automatically:</p>
                  <ul className="space-y-1.5">
                    <li className="flex items-start gap-2">
                      <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
                      <span><strong className="text-gray-800">Device and Online Activity Data:</strong> Information like your IP address, browser type, device identifiers, visited pages, clicks, and time spent on the Site.</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-2">Information from Third Parties:</p>
                  <ul className="space-y-1.5">
                    {[
                      { label: "Health Information:", desc: "Shared by your mental health provider to facilitate ESA or PSD evaluations." },
                      { label: "Marketing Data:", desc: "Information from advertising partners about ads you have seen or clicked, including your email address for targeted marketing." },
                    ].map((item) => (
                      <li key={item.label} className="flex items-start gap-2">
                        <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
                        <span><strong className="text-gray-800">{item.label}</strong> {item.desc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
                  <strong>Note:</strong> External vendors (like payment processors) may collect sensitive information like payment data on our behalf. Pawtenant does not store your full payment card details.
                </div>
              </div>
            </div>

            <div id="cookies" className="scroll-mt-28">
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-100 text-orange-600 text-xs font-extrabold flex-shrink-0">3</span>
                Cookies and Other Tracking Technologies
              </h2>
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>When you engage with our online Services, certain data is automatically collected using cookies and similar technologies, including:</p>
                <ul className="space-y-1.5">
                  {[
                    { label: "Usage Information:", desc: "Details about how you use our Services such as visit dates, times, page views, time spent, and referral sources." },
                    { label: "Device Information:", desc: "Data like your IP address, device model, operating system, browser type, and mobile network details." },
                    { label: "Location Information:", desc: "When permitted, we may access your device's location information." },
                    { label: "Website Session Details:", desc: "Activity such as mouse movements, clicks, text entered, and navigation paths on our Services." },
                  ].map((item) => (
                    <li key={item.label} className="flex items-start gap-2">
                      <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
                      <span><strong className="text-gray-800">{item.label}</strong> {item.desc}</span>
                    </li>
                  ))}
                </ul>
                <p>We rely on partners like <strong className="text-gray-800">Google Analytics</strong> to gather usage data and measure how our Services are performing. You can learn about Google Analytics' data practices <a href="https://support.google.com/analytics/answer/6004245" className="text-orange-500 hover:underline" rel="nofollow noreferrer" target="_blank">here</a> and opt out with their <a href="https://tools.google.com/dlpage/gaoptout" className="text-orange-500 hover:underline" rel="nofollow noreferrer" target="_blank">browser add-on</a>.</p>
                <p>We also use <strong className="text-gray-800">Google Ads</strong> and <strong className="text-gray-800">Facebook Pixel</strong> to tailor advertising based on your behavior across different websites. Learn more about <a href="https://policies.google.com/privacy" className="text-orange-500 hover:underline" rel="nofollow noreferrer" target="_blank">Google's advertising policies</a> and <a href="https://www.facebook.com/privacy/policy" className="text-orange-500 hover:underline" rel="nofollow noreferrer" target="_blank">Facebook's here</a>.</p>
                <p>You can control how cookies are used by visiting our cookie management page or adjusting your browser settings. Additional opt-out options are available at <a href="https://app.retention.com/optout" className="text-orange-500 hover:underline" rel="nofollow noreferrer" target="_blank">Retention.com Opt-Out</a>.</p>
              </div>
            </div>

            <div id="how-we-use" className="scroll-mt-28">
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-100 text-orange-600 text-xs font-extrabold flex-shrink-0">4</span>
                How We Use Your Personal Information
              </h2>
              <div className="text-gray-600 text-sm leading-relaxed space-y-2">
                <p>We may use the information we gather to:</p>
                <ul className="space-y-1.5">
                  {[
                    { label: "Deliver our Services:", desc: "Facilitate your communication with mental health professionals, manage accounts, process purchases, and send important notices." },
                    { label: "Respond to you:", desc: "Address your inquiries, support requests, and feedback." },
                    { label: "Improve and maintain our Services:", desc: "Diagnose technical problems, monitor system performance, and expand our Services through analysis of consumer behavior and marketing efforts." },
                    { label: "Market our Services:", desc: "Develop and administer promotional campaigns and personalize the marketing messages and content you see." },
                    { label: "Meet legal obligations:", desc: "Fulfill legal requirements, enforce our terms, prevent fraud, and protect rights, property, and safety." },
                    { label: "Support relationships with mental health professionals:", desc: "Manage necessary contracts and perform general business operations." },
                  ].map((item) => (
                    <li key={item.label} className="flex items-start gap-2">
                      <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
                      <span><strong className="text-gray-800">{item.label}</strong> {item.desc}</span>
                    </li>
                  ))}
                </ul>
                <p className="pt-1">We may also use aggregated or de-identified data for research, analysis, marketing, or to improve our Services.</p>
              </div>
            </div>

            <div id="how-we-share" className="scroll-mt-28">
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-100 text-orange-600 text-xs font-extrabold flex-shrink-0">5</span>
                How We Share Your Personal Information
              </h2>
              <div className="text-gray-600 text-sm leading-relaxed space-y-2">
                <p>We may share your information in the following situations:</p>
                <ul className="space-y-1.5">
                  {[
                    { label: "With Service Providers:", desc: "Companies that provide technology, payment processing, maintenance, legal, accounting, auditing, or other services for us." },
                    { label: "With Mental Health Professionals:", desc: "To help facilitate your ESA letter and/or PSD training services." },
                    { label: "With Analytics Partners:", desc: "To track website usage and improve the performance of our online Services." },
                    { label: "With Advertising Partners:", desc: "To show interest-based ads to you and others who may find our Services relevant." },
                    { label: "With Affiliates:", desc: "To support service delivery and business operations, where permitted by law." },
                    { label: "During Corporate Transactions:", desc: "If Pawtenant merges, sells assets, undergoes reorganization, or is acquired, we may transfer your information to involved parties." },
                    { label: "For Legal Compliance:", desc: "To comply with legal requirements, enforce our rights, or protect the safety of others in legal or emergency situations." },
                  ].map((item) => (
                    <li key={item.label} className="flex items-start gap-2">
                      <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
                      <span><strong className="text-gray-800">{item.label}</strong> {item.desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div id="protection" className="scroll-mt-28">
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-100 text-orange-600 text-xs font-extrabold flex-shrink-0">6</span>
                How We Protect and Store Your Personal Information
              </h2>
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>We implement a mix of physical, technical, and administrative safeguards to protect the personal information we collect through our Services.</p>
                <p>While we take appropriate measures to protect your information, no system, server, or network is completely secure. We cannot guarantee the absolute security of any information transmitted to or stored by Pawtenant or its third-party partners.</p>
              </div>
            </div>

            <div id="retention" className="scroll-mt-28">
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-100 text-orange-600 text-xs font-extrabold flex-shrink-0">7</span>
                Retention of Your Personal Information
              </h2>
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>We retain your personal information for as long as necessary to fulfill the purposes for which it was collected or as required by applicable laws. California law requires us to share how we determine retention periods:</p>
                <ul className="space-y-1.5">
                  <li className="flex items-start gap-2">
                    <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
                    <span>Some personal data is kept for the duration of our relationship to deliver Services.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
                    <span>After services end, we may retain information for legal, regulatory, or business obligations (for example, for tax purposes or fraud prevention).</span>
                  </li>
                </ul>
              </div>
            </div>

            <div id="your-choices" className="scroll-mt-28">
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-100 text-orange-600 text-xs font-extrabold flex-shrink-0">8</span>
                Your Privacy Options
              </h2>
              <div className="text-gray-600 text-sm leading-relaxed space-y-4">
                <p>You have several choices regarding how we collect and use your personal information:</p>
                <div>
                  <p className="font-bold text-gray-800 mb-1">Managing Your Account:</p>
                  <p>Visit your Pawtenant account settings to view or update your personal information like contact details.</p>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-1">Email Communications:</p>
                  <p>If you no longer wish to receive marketing emails from us, click the <strong>unsubscribe</strong> link at the bottom of any marketing email.</p>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-2">Cookies and Tracking:</p>
                  <ul className="space-y-1.5">
                    {[
                      "Use our cookie management tool to set your cookie preferences.",
                      "Adjust your browser settings to block or limit cookies.",
                      "Note: Disabling cookies may affect certain features on our Services.",
                      "Mobile device users can manage interest-based advertising settings through their device's operating system.",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-2">Opt-Out from Interest-Based Ads:</p>
                  <ul className="space-y-1.5">
                    <li className="flex items-start gap-2">
                      <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
                      <span>Visit <a href="http://www.networkadvertising.org" className="text-orange-500 hover:underline" rel="nofollow noreferrer" target="_blank">Network Advertising Initiative</a> or <a href="http://www.aboutads.info" className="text-orange-500 hover:underline" rel="nofollow noreferrer" target="_blank">About Ads</a> to opt out of targeted ads.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
                      <span>Please note: Opting out doesn't eliminate ads; it just stops personalized ads based on your browsing activity.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div id="children" className="scroll-mt-28">
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-100 text-orange-600 text-xs font-extrabold flex-shrink-0">9</span>
                Children's Information
              </h2>
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>We do not knowingly collect personal information from children. If you believe that we have unintentionally gathered a child's personal data, please contact us at <a href="mailto:hello@pawtenant.com" className="text-orange-500 hover:underline">hello@pawtenant.com</a>.</p>
                <p>A parent or guardian may request that we delete their child's information or stop using it. Upon verification, we will promptly remove any such information from our records.</p>
              </div>
            </div>

            <div id="updates" className="scroll-mt-28">
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-100 text-orange-600 text-xs font-extrabold flex-shrink-0">10</span>
                Updates to This Privacy Notice
              </h2>
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>We may revise this Privacy Notice from time to time. The "Effective Date" at the top of the page reflects when the Privacy Notice was last updated.</p>
                <p>If significant changes are made, we may notify you by other methods, such as email or a notice posted on our Services. Your continued use of our Services after updates means you accept the revised Privacy Notice.</p>
              </div>
            </div>

            <div id="california" className="scroll-mt-28">
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-100 text-orange-600 text-xs font-extrabold flex-shrink-0">11</span>
                Additional Notice for California Residents
              </h2>
              <div className="text-gray-600 text-sm leading-relaxed space-y-4">
                <p>The California Consumer Privacy Act (CCPA) grants California residents rights regarding their personal information. These rights apply whether you are a customer, a visitor to our site, or otherwise interacting with us.</p>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-xs text-orange-800">
                  <strong>Please note:</strong> Personal health information (PHI) managed under HIPAA is <strong>not</strong> covered by the CCPA.
                </div>
                <p className="font-bold text-gray-800">Collection, Use, and Retention</p>
                <p>California residents have the right to know what categories of personal information we collect and for what purposes. Here is a summary:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#fdf6ee]">
                        <th className="border border-gray-200 px-3 py-2 text-left font-bold text-gray-800">Category</th>
                        <th className="border border-gray-200 px-3 py-2 text-left font-bold text-gray-800">Examples</th>
                        <th className="border border-gray-200 px-3 py-2 text-left font-bold text-gray-800">Sources</th>
                        <th className="border border-gray-200 px-3 py-2 text-left font-bold text-gray-800">Purpose</th>
                        <th className="border border-gray-200 px-3 py-2 text-left font-bold text-gray-800">Retention</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { cat: "Personal Identifiers", ex: "Name, email, phone number, unique IDs", src: "Directly from you; advertising and analytics partners", purpose: "Service delivery, marketing, customer service", ret: "Retained during active relationship and longer for legal/business needs" },
                        { cat: "Customer Records", ex: "Telephone number, credit card details", src: "Directly from you", purpose: "Transactions and service delivery", ret: "Retained as required for taxes and fraud prevention" },
                        { cat: "Protected Classifications", ex: "Race, gender, ethnicity", src: "Directly from you", purpose: "ESA/PSD Services", ret: "Retained as needed for service fulfillment" },
                        { cat: "Commercial Information", ex: "Purchases, order history", src: "Directly from you", purpose: "Record-keeping, service improvement", ret: "Retained per state legal obligations" },
                        { cat: "Internet/Network Activity", ex: "Cookies, device ID, browsing history", src: "Automatically from your device; advertising partners", purpose: "Website analytics, advertising", ret: "Regularly deleted once no longer needed" },
                        { cat: "Sensitive Information", ex: "Login credentials, racial/ethnic origin", src: "Directly from you", purpose: "Account management, ESA/PSD services", ret: "Retained during service relationship" },
                        { cat: "Audio/Visual Information", ex: "Photograph", src: "Directly from you", purpose: "Scholarship or service use", ret: "Retained during relationship" },
                      ].map((row) => (
                        <tr key={row.cat} className="even:bg-gray-50">
                          <td className="border border-gray-200 px-3 py-2 font-medium text-gray-800">{row.cat}</td>
                          <td className="border border-gray-200 px-3 py-2 text-gray-600">{row.ex}</td>
                          <td className="border border-gray-200 px-3 py-2 text-gray-600">{row.src}</td>
                          <td className="border border-gray-200 px-3 py-2 text-gray-600">{row.purpose}</td>
                          <td className="border border-gray-200 px-3 py-2 text-gray-600">{row.ret}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>We do <strong>not</strong> collect biometric or precise geolocation data.</p>
                <p className="font-bold text-gray-800">Your Rights</p>
                <p>As a California resident, you have the following rights:</p>
                <ul className="space-y-1.5">
                  {[
                    { label: "Access:", desc: "Request access to the personal information we have collected about you." },
                    { label: "Delete:", desc: "Request deletion of your personal information (subject to legal exceptions)." },
                    { label: "Correct:", desc: "Request correction of inaccurate personal information." },
                    { label: "Opt-Out:", desc: "Opt out of the sale or sharing of your personal information." },
                  ].map((item) => (
                    <li key={item.label} className="flex items-start gap-2">
                      <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
                      <span><strong className="text-gray-800">{item.label}</strong> {item.desc}</span>
                    </li>
                  ))}
                </ul>
                <p>You or your authorized agent can submit a request by emailing <a href="mailto:hello@pawtenant.com" className="text-orange-500 hover:underline">hello@pawtenant.com</a> or visiting <a href="https://pawtenant.com/rights-request" className="text-orange-500 hover:underline" rel="nofollow noreferrer" target="_blank">pawtenant.com/rights-request</a>.</p>
              </div>
            </div>

            <div id="sms" className="scroll-mt-28">
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-100 text-orange-600 text-xs font-extrabold flex-shrink-0">12</span>
                SMS Opt-In Details
              </h2>
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>By providing your mobile phone number and explicitly opting in through a website form, you consent to receive SMS messages from PawTenant related to your ESA intake, form submission confirmations, account notifications, and service-related updates. SMS messages are sent only to users who have voluntarily opted in. Message frequency may vary. Message and data rates may apply. You may opt out at any time by replying <strong>STOP</strong>.</p>
                <p className="font-bold text-gray-800">Mobile Information Sharing Statement</p>
                <p>Mobile information will not be shared with third parties or affiliates for marketing or promotional purposes. Mobile information may only be shared with service providers necessary to deliver SMS communications, such as messaging platforms or carriers.</p>
              </div>
            </div>

          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
