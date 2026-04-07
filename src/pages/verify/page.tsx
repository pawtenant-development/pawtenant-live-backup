import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function VerifyEntryPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
    if (!cleaned) {
      setError("Please enter a Verification ID.");
      return;
    }
    setError("");
    navigate(`/verify/${encodeURIComponent(cleaned)}`);
  };

  return (
    <>
      {/* noindex meta */}
      <meta name="robots" content="noindex, nofollow" />

      <div className="min-h-screen bg-[#FFF7ED] flex flex-col">
        {/* Minimal header */}
        <header className="bg-white border-b border-gray-100 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center bg-orange-500 rounded-lg">
              <i className="ri-shield-check-line text-white text-sm"></i>
            </div>
            <span className="text-sm font-extrabold text-gray-900 tracking-tight">Pawtenant Verification</span>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="w-full max-w-lg">

            {/* Icon + heading */}
            <div className="text-center mb-10">
              <div className="w-16 h-16 flex items-center justify-center bg-orange-100 rounded-2xl mx-auto mb-5">
                <i className="ri-shield-check-line text-orange-500 text-3xl"></i>
              </div>
              <h1 className="text-2xl font-extrabold text-gray-900 mb-2 tracking-tight">
                Letter Verification
              </h1>
              <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
                This page verifies the authenticity and status of a Pawtenant-issued verification ID.
                Enter the ID exactly as it appears on the letter.
              </p>
            </div>

            {/* Input card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-8">
              <form onSubmit={handleSubmit} data-readdy-form className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">
                    Verification ID
                  </label>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => { setInput(e.target.value); setError(""); }}
                    placeholder="e.g. ESA-CA-8F3K92"
                    className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm font-mono font-bold text-gray-900 placeholder-gray-300 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 transition-all tracking-wider uppercase"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {error && (
                    <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                      <i className="ri-error-warning-line"></i>{error}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                    <i className="ri-information-line"></i>
                    Format: ESA-XX-XXXXXXX or PSD-XX-XXXXXXX
                  </p>
                </div>

                <button
                  type="submit"
                  className="whitespace-nowrap w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 cursor-pointer transition-colors"
                >
                  <i className="ri-search-line"></i>
                  Verify Letter ID
                </button>
              </form>
            </div>

            {/* Privacy note */}
            <div className="mt-6 flex items-start gap-2.5 bg-white border border-gray-200 rounded-xl px-4 py-3.5">
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                <i className="ri-lock-line text-gray-400 text-sm"></i>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                This verification confirms the authenticity of the letter ID only. No patient health information, diagnosis, or personal details are displayed on this page.
              </p>
            </div>

          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-100 bg-white px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-gray-400">
              &copy; {new Date().getFullYear()} Pawtenant &bull; ESA &amp; PSD Letter Services
            </p>
            <a
              href="/"
              className="text-xs text-orange-500 font-semibold hover:underline cursor-pointer"
            >
              pawtenant.com
            </a>
          </div>
        </footer>
      </div>
    </>
  );
}
