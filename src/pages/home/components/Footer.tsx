import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";

const hours = [
  { day: "Monday – Friday", time: "7:00 AM – 6:00 PM CT" },
  { day: "Saturday", time: "9:00 AM – 4:00 PM CT" },
  { day: "Sunday", time: "Closed" },
];

const siteMap = [
  { label: "Home", href: "/" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "What is an ESA?", href: "#states" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact Us", href: "#contact" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms of Service", href: "/terms-of-use" },
];

const topStateGuides = [
  { label: "ESA Letter California", href: "/esa-letter/california" },
  { label: "ESA Letter Texas", href: "/esa-letter/texas" },
  { label: "ESA Letter Florida", href: "/esa-letter/florida" },
  { label: "ESA Letter New York", href: "/esa-letter/new-york" },
  { label: "All 50 State Guides", href: "/explore-esa-letters-all-states" },
];

export default function Footer() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const params = new URLSearchParams();
      params.append("email", email);
      await fetch("https://readdy.ai/api/form/d6t1f9gq778icnc8uhag", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      setSubmitted(true);
      setEmail("");
    } catch (_) {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <footer id="contact" className="bg-[#f5f0e8] pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <a href="/" className="inline-block mb-4 cursor-pointer">
              <img
                src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
                alt="PawTenant"
                className="h-14 w-auto object-contain"
              />
            </a>
            <p className="text-gray-600 text-sm leading-relaxed mb-5">
              Fast, legitimate ESA letters from licensed professionals. Protect your housing rights and keep your pet by your side.
            </p>
            <div className="flex items-center gap-3">
              {[
                { icon: "ri-facebook-fill", href: "https://www.facebook.com/PawTenant/" },
                { icon: "ri-instagram-line", href: "https://www.instagram.com/pawtenant/" },
                { icon: "ri-twitter-x-line", href: "#" },
              ].map((s) => (
                <a
                  key={s.icon}
                  href={s.href}
                  target={s.href !== "#" ? "_blank" : undefined}
                  rel="nofollow noreferrer"
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 hover:text-orange-500 hover:border-orange-300 transition-colors cursor-pointer"
                >
                  <i className={`${s.icon} text-sm`}></i>
                </a>
              ))}
            </div>
          </div>

          {/* Working Hours */}
          <div>
            <h4 id="working-hours" className="text-gray-900 font-bold text-sm mb-5 uppercase tracking-wide">
              <a href="#working-hours" className="hover:text-orange-500 transition-colors">Working Hours</a>
            </h4>
            <ul className="space-y-3">
              {hours.map((h) => (
                <li key={h.day} className="flex justify-between text-sm">
                  <span className="text-gray-600">{h.day}</span>
                  <span className={`font-semibold ${h.time === "Closed" ? "text-red-400" : "text-gray-900"}`}>
                    {h.time}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 pt-5 border-t border-gray-200">
              <a
                href="tel:+14099655885"
                className="flex items-center gap-2 text-sm text-gray-700 hover:text-orange-500 transition-colors cursor-pointer"
              >
                <div className="w-5 h-5 flex items-center justify-center">
                  <i className="ri-phone-line text-orange-500"></i>
                </div>
                (409) 965-5885
              </a>
              <a
                href="mailto:hello@pawtenant.com"
                className="flex items-center gap-2 text-sm text-gray-700 hover:text-orange-500 transition-colors mt-2 cursor-pointer"
              >
                <div className="w-5 h-5 flex items-center justify-center">
                  <i className="ri-mail-line text-orange-500"></i>
                </div>
                hello@pawtenant.com
              </a>
            </div>
          </div>

          {/* Site Map */}
          <div>
            <h4 id="site-map" className="text-gray-900 font-bold text-sm mb-5 uppercase tracking-wide">
              <a href="#site-map" className="hover:text-orange-500 transition-colors">Site Map</a>
            </h4>
            <ul className="space-y-2.5">
              {siteMap.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-gray-600 hover:text-orange-500 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <i className="ri-arrow-right-s-line text-orange-400 text-xs"></i>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>

            {/* Top State Guides */}
            <div className="mt-6 pt-5 border-t border-gray-200">
              <p className="text-gray-700 font-bold text-xs uppercase tracking-wide mb-3">Top State Guides</p>
              <ul className="space-y-2">
                {topStateGuides.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-gray-600 hover:text-orange-500 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <i className="ri-map-pin-line text-orange-400 text-xs"></i>
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Newsletter */}
          <div>
            <h4 id="newsletter" className="text-gray-900 font-bold text-sm mb-5 uppercase tracking-wide">
              <a href="#newsletter" className="hover:text-orange-500 transition-colors">Newsletter Subscription</a>
            </h4>
            <p className="text-gray-600 text-sm mb-4 leading-relaxed">
              Subscribe for ESA news, housing rights updates, and pet welfare tips.
            </p>
            {submitted ? (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-sm text-orange-700 flex items-center gap-2">
                <i className="ri-checkbox-circle-fill text-orange-500"></i>
                Thanks for subscribing!
              </div>
            ) : (
              <form
                data-readdy-form
                onSubmit={handleSubmit}
                className="space-y-3"
              >
                <div>
                  <input
                    type="email"
                    name="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:border-orange-400 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="whitespace-nowrap w-full py-2.5 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {submitting ? "Subscribing..." : "Subscribe Now"}
                </button>
                <p className="text-xs text-gray-400 leading-relaxed">
                  By subscribing, you agree to receive marketing emails from PawTenant. You can unsubscribe at any time by clicking the link in any email.
                </p>
              </form>
            )}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-300 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-xs text-center">
            &copy; {new Date().getFullYear()} PawTenant. All rights reserved. ESA letters provided by licensed mental health professionals.
          </p>
          <div className="flex items-center gap-4">
            <Link to="/privacy-policy" rel="nofollow" className="text-gray-400 text-xs hover:text-orange-500 transition-colors cursor-pointer">Privacy Policy</Link>
            <Link to="/terms-of-use" rel="nofollow" className="text-gray-400 text-xs hover:text-orange-500 transition-colors cursor-pointer">Terms of Service</Link>
            <a href="#" rel="nofollow" className="text-gray-400 text-xs hover:text-orange-500 transition-colors cursor-pointer">HIPAA Notice</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
