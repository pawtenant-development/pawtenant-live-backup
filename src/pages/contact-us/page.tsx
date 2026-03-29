import { useState, FormEvent } from "react";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { Link } from "react-router-dom";

const FORM_URL = "https://readdy.ai/api/form/d6t2rg5m9vk3c28i5b7g";
const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
const GHL_PROXY_URL = `${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`;
const charMax = 500;

const contactSchema = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ContactPage",
  "name": "Contact PawTenant — ESA Letter Support",
  "url": "https://www.pawtenant.com/contact-us",
  "description": "Contact PawTenant for ESA letter support, housing rights questions, or landlord disputes. Reach us by phone, email, or the contact form.",
  "mainEntity": {
    "@type": "LocalBusiness",
    "name": "PawTenant",
    "url": "https://www.pawtenant.com",
    "telephone": "+14099655885",
    "email": "hello@pawtenant.com",
    "openingHoursSpecification": [
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
        "opens": "07:00",
        "closes": "18:00"
      },
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Saturday"],
        "opens": "09:00",
        "closes": "16:00"
      }
    ]
  }
});

export default function ContactUsPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === "message" && value.length > charMax) return;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (form.message.length > charMax) {
      setError(`Message must be under ${charMax} characters.`);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const params = new URLSearchParams();
      Object.entries(form).forEach(([k, v]) => params.append(k, v));

      // Fire both in parallel — Readdy form storage + GHL CRM via proxy
      const [, ghlRes] = await Promise.allSettled([
        fetch(FORM_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        }),
        fetch(GHL_PROXY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({
            webhookType: "contact",
            firstName: form.name.split(" ")[0] || form.name,
            lastName: form.name.split(" ").slice(1).join(" ") || "",
            email: form.email,
            phone: form.phone || "",
            subject: form.subject,
            message: form.message,
            smsConsentGiven: smsConsent,
            leadSource: "Website Contact Form",
            tags: ["Website Inquiry", "Contact Form", form.subject, smsConsent ? "SMS Opted-In" : "SMS Opted-Out"].filter(Boolean),
            submittedAt: new Date().toISOString(),
            landingUrl: window.location.href,
            referrer: document.referrer || "direct",
          }),
        }),
      ]);

      if (ghlRes.status === "rejected") {
        console.warn("GHL proxy failed silently:", ghlRes.reason);
      }

      setSubmitted(true);
      setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch {
      setError("Something went wrong. Please try again or email us directly.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <title>Contact PawTenant | ESA Letter Support — Email &amp; Phone Help</title>
      <meta name="description" content="Contact PawTenant for ESA letter support. Call (409) 965-5885, email hello@pawtenant.com, or use our form. Mon–Fri 7am–6pm CT. Same-day ESA letter help from licensed professionals." />
      <meta name="keywords" content="contact PawTenant, ESA letter support, emotional support animal help, PawTenant phone number, ESA letter questions" />
      <link rel="canonical" href="https://www.pawtenant.com/contact-us" />
      <meta name="last-modified" content={new Date().toISOString().split("T")[0]} />
      <meta property="og:title" content="Contact PawTenant | ESA Letter Support — Email &amp; Phone" />
      <meta property="og:description" content="Questions about your ESA letter, housing rights, or landlord dispute? Contact PawTenant — phone, email, or contact form. Replies within 2–4 hours." />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://www.pawtenant.com/contact-us" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content="Contact PawTenant | ESA Letter Support" />
      <meta name="twitter:description" content="Reach PawTenant by phone at (409) 965-5885 or email hello@pawtenant.com. Mon–Fri 7am–6pm CT, Sat 9am–4pm CT." />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: contactSchema }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="pt-28 pb-14 bg-gradient-to-b from-orange-50 to-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <span className="inline-block px-4 py-1.5 bg-orange-100 text-orange-600 text-xs font-bold rounded-full uppercase tracking-widest mb-4">
            Contact Us
          </span>
          <h1 className="text-4xl font-bold text-gray-900 mb-4 leading-tight">
            We&apos;re Here to Help You &amp; Your Animal
          </h1>
          <p className="text-gray-500 text-base leading-relaxed max-w-xl mx-auto">
            Questions about ESA letters, housing rights, or your specific situation? Our team of specialists is ready — we typically respond within 2–4 business hours.
          </p>
        </div>
      </section>

      {/* Contact Cards */}
      <section className="py-10 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: "ri-mail-send-line",
                title: "Email Us",
                value: "hello@pawtenant.com",
                sub: "Replies within 2–4 hours",
                href: "mailto:hello@pawtenant.com",
                color: "bg-orange-50 text-orange-500",
              },
              {
                icon: "ri-phone-line",
                title: "Call Us",
                value: "(409) 965-5885",
                sub: "Mon–Fri 7am–6pm, Sat 9am–4pm",
                href: "tel:+14099655885",
                color: "bg-green-50 text-green-600",
              },
              {
                icon: "ri-shield-check-line",
                title: "HIPAA Compliant",
                value: "Your Privacy Is Protected",
                sub: "We never share your information",
                href: undefined,
                color: "bg-blue-50 text-blue-500",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="flex flex-col items-center text-center bg-[#fdf8f3] rounded-2xl p-7 border border-orange-50"
              >
                <div className={`w-12 h-12 flex items-center justify-center rounded-full ${card.color} mb-4`}>
                  <i className={`${card.icon} text-xl`}></i>
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">{card.title}</p>
                {card.href ? (
                  <a
                    href={card.href}
                    className="text-sm font-bold text-gray-900 hover:text-orange-500 transition-colors cursor-pointer"
                  >
                    {card.value}
                  </a>
                ) : (
                  <p className="text-sm font-bold text-gray-900">{card.value}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Form + Info */}
      <section className="py-16 bg-[#fdf8f3]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-start">
            {/* Left sidebar */}
            <div className="lg:col-span-2 space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">Frequently Asked Before Reaching Out</h2>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Save time — check if your question is already answered here.
                </p>
              </div>

              <div className="space-y-4">
                {[
                  {
                    q: "How long does it take to get an ESA letter?",
                    a: "Most clients receive their letter within 24 hours of completing the licensed therapist consultation."
                  },
                  {
                    q: "Does my landlord have to accept your letter?",
                    a: "Yes — if they refuse without a valid legal reason, it may be a Fair Housing Act violation. Our letters are fully compliant."
                  },
                  {
                    q: "What is your refund policy?",
                    a: "We offer a 100% money-back guarantee. If you don't qualify or your landlord unlawfully denies your letter, you're covered."
                  },
                  {
                    q: "Can I get a letter if I'm already in a dispute with my landlord?",
                    a: "Yes. Get your assessment started now — our team can also advise on next steps for your situation."
                  }
                ].map((item) => (
                  <div key={item.q} className="bg-white rounded-xl p-5 border border-orange-100/60">
                    <p className="text-sm font-semibold text-gray-800 mb-1.5">{item.q}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl p-5 border border-orange-100">
                <p className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                  <i className="ri-question-answer-line text-orange-500"></i>
                  Looking for More Answers?
                </p>
                <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                  Our FAQ page covers 30+ ESA questions across housing, airlines, costs, and more.
                </p>
                <Link
                  to="/faqs"
                  className="whitespace-nowrap inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors cursor-pointer"
                >
                  Browse All FAQs <i className="ri-arrow-right-line text-xs"></i>
                </Link>
              </div>

              {/* Hours */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Business Hours</p>
                {[
                  { day: "Monday – Friday", hours: "7:00 AM – 6:00 PM CT" },
                  { day: "Saturday", hours: "9:00 AM – 4:00 PM CT" },
                  { day: "Sunday", hours: "Closed" },
                ].map((row) => (
                  <div key={row.day} className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">{row.day}</span>
                    <span className="text-gray-400">{row.hours}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-3 bg-white rounded-2xl p-8 border border-orange-100/60">
              {submitted ? (
                <div className="text-center py-16">
                  <div className="w-20 h-20 flex items-center justify-center bg-orange-50 rounded-full mx-auto mb-5">
                    <i className="ri-checkbox-circle-fill text-orange-500 text-4xl"></i>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Message Sent!</h3>
                  <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto mb-6">
                    Thanks for reaching out! We&apos;ve received your message and will get back to you within 2–4 business hours.
                  </p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="whitespace-nowrap px-6 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
                  >
                    Send Another Message
                  </button>
                  <div className="mt-8 pt-8 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-4">Ready to get your ESA letter?</p>
                    <Link
                      to="/assessment"
                      className="whitespace-nowrap inline-block px-6 py-3 bg-gray-900 text-white text-sm font-semibold rounded-md hover:bg-gray-800 transition-colors cursor-pointer"
                    >
                      Start My Assessment
                    </Link>
                  </div>
                </div>
              ) : (
                <form data-readdy-form onSubmit={handleSubmit} className="space-y-5">
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Contact Us — PawTenant</h3>
                    <p className="text-sm text-gray-400">Your message goes directly to hello@pawtenant.com</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Full Name <span className="text-orange-500">*</span></label>
                      <input
                        type="text"
                        name="name"
                        required
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Jane Smith"
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-400 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phone Number</label>
                      <input
                        type="tel"
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        placeholder="(555) 000-0000"
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-400 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email Address <span className="text-orange-500">*</span></label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="jane@example.com"
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-400 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">What Can We Help With? <span className="text-orange-500">*</span></label>
                    <select
                      name="subject"
                      required
                      value={form.subject}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-400 transition-colors cursor-pointer"
                    >
                      <option value="">Select a topic...</option>
                      <option value="ESA Letter Process">ESA Letter Process</option>
                      <option value="Housing Rights Question">Housing Rights Question</option>
                      <option value="Landlord Dispute">Landlord Dispute</option>
                      <option value="University ESA Accommodation">University ESA Accommodation</option>
                      <option value="Service Dog / PSD Letter">Service Dog / PSD Letter</option>
                      <option value="Letter Renewal">Letter Renewal</option>
                      <option value="Refund Request">Refund Request</option>
                      <option value="General Question">General Question</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      Your Message <span className="text-orange-500">*</span>
                      <span className={`ml-2 font-normal ${form.message.length > charMax * 0.9 ? "text-red-400" : "text-gray-400"}`}>
                        {form.message.length}/{charMax}
                      </span>
                    </label>
                    <textarea
                      name="message"
                      required
                      rows={5}
                      value={form.message}
                      onChange={handleChange}
                      placeholder="Tell us about your situation and how we can help — the more detail, the better we can assist you..."
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-400 transition-colors resize-none"
                    />
                    {form.message.length >= charMax && (
                      <p className="text-xs text-red-400 mt-1">Message has reached the 500 character limit.</p>
                    )}
                  </div>

                  {error && (
                    <p className="text-xs text-red-500 flex items-center gap-1.5">
                      <i className="ri-error-warning-line"></i> {error}
                    </p>
                  )}

                  {/* SMS Consent — TCPA-compliant, optional */}
                  {form.phone && (
                    <label className="flex items-start gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={smsConsent}
                        onChange={(e) => setSmsConsent(e.target.checked)}
                        className="accent-orange-500 mt-0.5 flex-shrink-0 cursor-pointer"
                      />
                      <span className="text-xs text-gray-500 leading-relaxed">
                        <span className="font-semibold text-gray-700">(Optional)</span> I consent to receive automated marketing text messages (SMS/MMS) from PawTenant at the phone number provided. Message frequency may vary. Message &amp; data rates may apply. Consent is not a condition of purchase. Reply <strong>STOP</strong> to unsubscribe, <strong>HELP</strong> for help. See our{" "}
                        <a href="/privacy-policy" className="text-orange-500 hover:underline cursor-pointer">Privacy Policy</a>{" "}&amp;{" "}
                        <a href="/terms-of-use" className="text-orange-500 hover:underline cursor-pointer">Terms</a>.
                      </span>
                    </label>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="whitespace-nowrap w-full py-3.5 bg-orange-500 text-white font-semibold text-sm rounded-lg hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <i className="ri-loader-4-line animate-spin"></i> Sending Your Message...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <i className="ri-send-plane-2-line"></i> Send Message
                      </span>
                    )}
                  </button>

                  <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
                    <i className="ri-shield-check-line text-orange-400"></i>
                    HIPAA-compliant. Your information is never shared.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Strip */}
      <section className="py-14 bg-orange-500">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-100 mb-3">Ready to Get Started?</p>
          <h2 className="text-3xl font-bold text-white mb-4">Get Your ESA Letter in 24 Hours</h2>
          <p className="text-orange-100 text-sm leading-relaxed mb-8 max-w-lg mx-auto">
            Connect with a licensed mental health professional today. Fast, affordable, and backed by our 100% money-back guarantee.
          </p>
          <Link
            to="/assessment"
            className="whitespace-nowrap inline-block px-8 py-3.5 bg-white text-orange-600 font-bold text-sm rounded-lg hover:bg-orange-50 transition-colors cursor-pointer"
          >
            Start My Free Assessment
          </Link>
        </div>
      </section>

      <SharedFooter />
    </>
  );
}
