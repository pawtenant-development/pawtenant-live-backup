import { useState, FormEvent } from "react";
import { submitContactRequest } from "../../../lib/contactSubmit";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
const GHL_PROXY_URL = `${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`;

export default function ContactSection() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const charMax = 500;

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
      const [ptRes, ghlRes] = await Promise.allSettled([
        submitContactRequest({
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          subject: form.subject || null,
          message: form.message,
          source_page: "/",
          metadata: {
            sms_consent: smsConsent,
            lead_source: "Homepage Contact Form",
            landing_url: window.location.href,
            referrer: document.referrer || "direct",
          },
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
            leadSource: "Homepage Contact Form",
            tags: [
              "Website Inquiry",
              "Homepage Contact Form",
              form.subject,
              smsConsent ? "SMS Opted-In" : "SMS Opted-Out",
            ].filter(Boolean),
            submittedAt: new Date().toISOString(),
            landingUrl: window.location.href,
            referrer: document.referrer || "direct",
          }),
        }),
      ]);

      if (ptRes.status === "rejected") {
        throw ptRes.reason instanceof Error
          ? ptRes.reason
          : new Error("Submission failed");
      }
      if (ghlRes.status === "rejected") {
        console.warn("GHL proxy failed silently:", ghlRes.reason);
      }

      setSubmitted(true);
      setSmsConsent(false);
      setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (err) {
      setError(
        (err as Error)?.message ||
          "Something went wrong. Please try again or email us directly.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="contact-form" className="py-20 bg-[#fdf8f3]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          {/* Left: Info */}
          <div>
            <span className="inline-block px-4 py-1.5 bg-orange-50 text-orange-600 text-xs font-semibold rounded-full uppercase tracking-widest mb-4">
              Get in Touch
            </span>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              We&apos;re Here to Help
            </h2>
            <p className="text-gray-500 leading-relaxed mb-8 text-sm">
              Have questions about the ESA letter process, your rights, or your specific situation? Our team of ESA specialists is ready to help. We typically respond within 2-4 business hours.
            </p>

            <div className="space-y-5">
              {[
                {
                  icon: "ri-mail-send-line",
                  title: "Email Us",
                  value: "hello@pawtenant.com",
                  sub: "We respond within 2-4 hours",
                  href: "mailto:hello@pawtenant.com"
                },
                {
                  icon: "ri-phone-line",
                  title: "Call Us",
                  value: "(409) 965-5885",
                  sub: "Mon–Fri 7am–6pm, Sat 9am–4pm",
                  href: "tel:+14099655885"
                },
                {
                  icon: "ri-time-line",
                  title: "Business Hours",
                  value: "Mon–Fri: 7:00 AM – 6:00 PM",
                  sub: "Saturday: 9:00 AM – 4:00 PM | Sun: Closed",
                  href: undefined
                }
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-4">
                  <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-orange-50 flex-shrink-0">
                    <i className={`${item.icon} text-orange-500 text-lg`}></i>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{item.title}</p>
                    {item.href ? (
                      <a href={item.href} className="text-sm font-semibold text-gray-900 hover:text-orange-500 transition-colors cursor-pointer">
                        {item.value}
                      </a>
                    ) : (
                      <p className="text-sm font-semibold text-gray-900">{item.value}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">{item.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 bg-white rounded-2xl p-5 border border-orange-100">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                  <i className="ri-shield-check-fill text-orange-500 text-xl"></i>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-1">Your Privacy Is Protected</p>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    All communications with PawTenant are confidential. We are HIPAA-compliant and never share your personal information with third parties.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Form */}
          <div className="bg-white rounded-2xl p-8 border border-orange-100/60">
            {submitted ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 flex items-center justify-center bg-orange-50 rounded-full mx-auto mb-4">
                  <i className="ri-checkbox-circle-fill text-orange-500 text-3xl"></i>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Message Sent!</h3>
                <p className="text-gray-500 text-sm leading-relaxed max-w-xs mx-auto">
                  Thank you for reaching out. We&apos;ll get back to you at {form.email || "your email"} within 2-4 business hours.
                </p>
                <button
                  onClick={() => setSubmitted(false)}
                  className="whitespace-nowrap mt-6 px-5 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="text-lg font-bold text-gray-900 mb-5">Contact Us — PawTenant</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Full Name *</label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Jane Smith"
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:border-orange-400 transition-colors"
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
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:border-orange-400 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email Address *</label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    placeholder="jane@example.com"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:border-orange-400 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">What Can We Help With? *</label>
                  <select
                    name="subject"
                    required
                    value={form.subject}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:border-orange-400 transition-colors cursor-pointer"
                  >
                    <option value="">Select a topic...</option>
                    <option value="ESA Letter Process">ESA Letter Process</option>
                    <option value="Housing Rights Question">Housing Rights Question</option>
                    <option value="University ESA Accommodation">University ESA Accommodation</option>
                    <option value="Landlord Dispute">Landlord Dispute</option>
                    <option value="Letter Renewal">Letter Renewal</option>
                    <option value="Refund Request">Refund Request</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Your Message *
                    <span className={`ml-2 font-normal ${form.message.length > charMax * 0.9 ? "text-red-400" : "text-gray-400"}`}>
                      {form.message.length}/{charMax}
                    </span>
                  </label>
                  <textarea
                    name="message"
                    required
                    rows={4}
                    value={form.message}
                    onChange={handleChange}
                    placeholder="Tell us about your situation and how we can help..."
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:border-orange-400 transition-colors resize-none"
                  />
                  {form.message.length >= charMax && (
                    <p className="text-xs text-red-400 mt-1">Message has reached the 500 character limit.</p>
                  )}
                </div>

                {error && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
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
                  className="whitespace-nowrap w-full py-3 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <i className="ri-loader-4-line animate-spin"></i> Sending...
                    </span>
                  ) : (
                    "Send Message"
                  )}
                </button>
                <p className="text-xs text-gray-400 text-center">
                  Your message will be sent directly to hello@pawtenant.com
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
