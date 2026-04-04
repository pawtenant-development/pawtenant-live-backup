// UTM Campaign Link Generator — pre-tagged URLs for Facebook ads and email campaigns
import { useState, useMemo } from "react";

interface UTMParams {
  source: string;
  medium: string;
  campaign: string;
  term: string;
  content: string;
}

const PRESET_CAMPAIGNS = [
  { id: "facebook_ads", label: "Facebook Ads", source: "facebook", medium: "paid_social" },
  { id: "facebook_retargeting", label: "Facebook Retargeting", source: "facebook", medium: "retargeting" },
  { id: "instagram_ads", label: "Instagram Ads", source: "instagram", medium: "paid_social" },
  { id: "google_search", label: "Google Search Ads", source: "google", medium: "cpc" },
  { id: "google_display", label: "Google Display", source: "google", medium: "display" },
  { id: "youtube_ads", label: "YouTube Ads", source: "youtube", medium: "video" },
  { id: "email_newsletter", label: "Email Newsletter", source: "newsletter", medium: "email" },
  { id: "email_promo", label: "Email Promo", source: "email", medium: "email" },
  { id: "email_automated", label: "Email Automated", source: "email", medium: "email" },
  { id: "organic_social", label: "Organic Social", source: "social", medium: "organic" },
  { id: "blog_content", label: "Blog Content", source: "blog", medium: "content" },
  { id: "partner_referral", label: "Partner Referral", source: "partner", medium: "referral" },
];

const LANDING_PAGES = [
  { label: "Homepage", path: "/" },
  { label: "ESA Assessment", path: "/assessment" },
  { label: "PSD Assessment", path: "/psd-assessment" },
  { label: "How to Get ESA", path: "/how-to-get-esa" },
  { label: "How to Get PSD", path: "/how-to-get-psd-letter" },
  { label: "ESA Letter Cost", path: "/esa-letter-cost" },
  { label: "Renew ESA Letter", path: "/renew-esa-letter" },
  { label: "Service Dogs", path: "/service-dogs" },
  { label: "Housing Rights", path: "/housing-rights" },
  { label: "State ESA Info", path: "/state-esa" },
  { label: "State PSD Info", path: "/state-psd" },
  { label: "Blog", path: "/blog" },
  { label: "FAQs", path: "/faqs" },
  { label: "Contact Us", path: "/contact-us" },
];

const BASE_URL = "https://pawtenant.com";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      onClick={handle}
      className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer bg-[#1a5c4f] text-white hover:bg-[#17504a]"
    >
      <i className={copied ? "ri-checkbox-circle-fill" : "ri-file-copy-line"}></i>
      {copied ? "Copied!" : label}
    </button>
  );
}

export default function UTMLinkGenerator() {
  const [selectedPage, setSelectedPage] = useState("/assessment");
  const [customUrl, setCustomUrl] = useState("");
  const [useCustomUrl, setUseCustomUrl] = useState(false);
  const [utm, setUtm] = useState<UTMParams>({
    source: "",
    medium: "",
    campaign: "",
    term: "",
    content: "",
  });
  const [savedLinks, setSavedLinks] = useState<{ url: string; name: string; date: string }[]>(() => {
    try {
      const saved = localStorage.getItem("utm_saved_links");
      return saved ? (JSON.parse(saved) as { url: string; name: string; date: string }[]) : [];
    } catch {
      return [];
    }
  });
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");

  const baseUrl = useMemo(() => {
    if (useCustomUrl && customUrl.trim()) {
      return customUrl.trim().replace(/\/$/, "");
    }
    return `${BASE_URL}${selectedPage}`;
  }, [useCustomUrl, customUrl, selectedPage]);

  const generatedUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (utm.source) params.set("utm_source", utm.source);
    if (utm.medium) params.set("utm_medium", utm.medium);
    if (utm.campaign) params.set("utm_campaign", utm.campaign);
    if (utm.term) params.set("utm_term", utm.term);
    if (utm.content) params.set("utm_content", utm.content);

    const query = params.toString();
    return query ? `${baseUrl}?${query}` : baseUrl;
  }, [baseUrl, utm]);

  const applyPreset = (presetId: string) => {
    const preset = PRESET_CAMPAIGNS.find((p) => p.id === presetId);
    if (preset) {
      setUtm((prev) => ({
        ...prev,
        source: preset.source,
        medium: preset.medium,
      }));
    }
  };

  const updateUtm = (key: keyof UTMParams, value: string) => {
    setUtm((prev) => ({ ...prev, [key]: value }));
  };

  const isValid = utm.source && utm.medium && utm.campaign;

  const handleSave = () => {
    if (!saveName.trim() || !isValid) return;
    const newLink = { url: generatedUrl, name: saveName.trim(), date: new Date().toISOString() };
    const next = [newLink, ...savedLinks].slice(0, 20);
    setSavedLinks(next);
    localStorage.setItem("utm_saved_links", JSON.stringify(next));
    setShowSaveModal(false);
    setSaveName("");
  };

  const deleteSaved = (index: number) => {
    const next = savedLinks.filter((_, i) => i !== index);
    setSavedLinks(next);
    localStorage.setItem("utm_saved_links", JSON.stringify(next));
  };

  const clearAll = () => {
    setUtm({ source: "", medium: "", campaign: "", term: "", content: "" });
    setCustomUrl("");
    setUseCustomUrl(false);
    setSelectedPage("/assessment");
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-[#f0faf7] rounded-xl flex-shrink-0">
            <i className="ri-links-line text-[#1a5c4f] text-lg"></i>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">UTM Campaign Link Generator</h3>
            <p className="text-xs text-gray-400">Create pre-tagged URLs for Facebook ads, email campaigns, and more</p>
          </div>
        </div>
        <button
          type="button"
          onClick={clearAll}
          className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-100 cursor-pointer transition-colors"
        >
          <i className="ri-refresh-line"></i>
          Reset
        </button>
      </div>

      <div className="flex flex-col lg:flex-row" style={{ minHeight: "480px" }}>
        {/* Left: Configuration */}
        <div className="w-full lg:w-[420px] flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-100 bg-gray-50/50 p-5 space-y-5">
          {/* Quick Presets */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Quick Presets
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_CAMPAIGNS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className="whitespace-nowrap px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-white border border-gray-200 text-gray-600 hover:border-[#1a5c4f] hover:text-[#1a5c4f] cursor-pointer transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Landing Page Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Landing Page
              </label>
              <button
                type="button"
                onClick={() => setUseCustomUrl(!useCustomUrl)}
                className="text-[10px] font-bold text-[#1a5c4f] hover:underline cursor-pointer"
              >
                {useCustomUrl ? "Use Preset Page" : "Custom URL"}
              </button>
            </div>

            {useCustomUrl ? (
              <input
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://pawtenant.com/custom-page"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f] bg-white"
              />
            ) : (
              <select
                value={selectedPage}
                onChange={(e) => setSelectedPage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f] bg-white cursor-pointer"
              >
                {LANDING_PAGES.map((page) => (
                  <option key={page.path} value={page.path}>
                    {page.label} ({page.path})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* UTM Parameters */}
          <div className="space-y-3">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              UTM Parameters
            </label>

            {/* Source */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-700">
                  utm_source <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] text-gray-400">e.g., facebook, google, newsletter</span>
              </div>
              <input
                type="text"
                value={utm.source}
                onChange={(e) => updateUtm("source", e.target.value)}
                placeholder="facebook"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f] bg-white"
              />
            </div>

            {/* Medium */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-700">
                  utm_medium <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] text-gray-400">e.g., cpc, email, social, display</span>
              </div>
              <input
                type="text"
                value={utm.medium}
                onChange={(e) => updateUtm("medium", e.target.value)}
                placeholder="paid_social"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f] bg-white"
              />
            </div>

            {/* Campaign */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-700">
                  utm_campaign <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] text-gray-400">e.g., spring_2025, product_launch</span>
              </div>
              <input
                type="text"
                value={utm.campaign}
                onChange={(e) => updateUtm("campaign", e.target.value)}
                placeholder="spring_2025"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f] bg-white"
              />
            </div>

            {/* Term (optional) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-700">utm_term</label>
                <span className="text-[10px] text-gray-400">Optional — for paid search keywords</span>
              </div>
              <input
                type="text"
                value={utm.term}
                onChange={(e) => updateUtm("term", e.target.value)}
                placeholder="emotional support animal letter"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f] bg-white"
              />
            </div>

            {/* Content (optional) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-700">utm_content</label>
                <span className="text-[10px] text-gray-400">Optional — for A/B testing or ad variations</span>
              </div>
              <input
                type="text"
                value={utm.content}
                onChange={(e) => updateUtm("content", e.target.value)}
                placeholder="variant_a, blue_button, hero_image_1"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f] bg-white"
              />
            </div>
          </div>

          {/* Validation */}
          {!isValid && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <i className="ri-information-line text-amber-500 text-xs mt-0.5 flex-shrink-0"></i>
              <p className="text-[11px] text-amber-700">
                Fill in source, medium, and campaign to generate a valid UTM link
              </p>
            </div>
          )}
        </div>

        {/* Right: Preview & Actions */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Generated URL */}
          <div className="flex-1 p-5 space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Generated URL
              </label>
              <div className="bg-gray-900 rounded-xl p-4">
                <p className="font-mono text-xs text-green-400 break-all leading-relaxed">
                  {generatedUrl}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <CopyButton text={generatedUrl} label="Copy URL" />
              <button
                type="button"
                onClick={() => setShowSaveModal(true)}
                disabled={!isValid}
                className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:border-[#1a5c4f] hover:text-[#1a5c4f] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <i className="ri-bookmark-line"></i>
                Save Link
              </button>
              <a
                href={generatedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:border-[#1a5c4f] hover:text-[#1a5c4f] cursor-pointer transition-colors"
              >
                <i className="ri-external-link-line"></i>
                Test Link
              </a>
            </div>

            {/* Parameter breakdown */}
            {isValid && (
              <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-4">
                <p className="text-[10px] font-bold text-[#1a5c4f] uppercase tracking-widest mb-3">
                  Parameter Breakdown
                </p>
                <div className="space-y-2">
                  {[
                    { key: "Source", value: utm.source, desc: "Where traffic originates" },
                    { key: "Medium", value: utm.medium, desc: "Marketing medium" },
                    { key: "Campaign", value: utm.campaign, desc: "Campaign name" },
                    ...(utm.term ? [{ key: "Term", value: utm.term, desc: "Paid keywords" }] : []),
                    ...(utm.content ? [{ key: "Content", value: utm.content, desc: "Ad/content variation" }] : []),
                  ].map((item) => (
                    <div key={item.key} className="flex items-center gap-3">
                      <span className="w-20 text-[10px] font-bold text-gray-400 uppercase">{item.key}</span>
                      <code className="px-2 py-0.5 bg-white rounded text-xs font-mono text-[#1a5c4f]">
                        {item.value}
                      </code>
                      <span className="text-[10px] text-gray-400">{item.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tips */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <i className="ri-lightbulb-line text-blue-600 text-sm mt-0.5 flex-shrink-0"></i>
                <div>
                  <p className="text-xs font-bold text-blue-800 mb-1">UTM Best Practices</p>
                  <ul className="text-[11px] text-blue-700 space-y-1 leading-relaxed">
                    <li>• Use lowercase and underscores for consistency (e.g., spring_2025 not Spring 2025)</li>
                    <li>• Keep campaign names descriptive but concise</li>
                    <li>• Use utm_content to differentiate between A/B test variants</li>
                    <li>• Always test your links before launching campaigns</li>
                    <li>• UTM data is automatically captured in your Analytics dashboard</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Saved Links */}
          {savedLinks.length > 0 && (
            <div className="border-t border-gray-100 p-5 bg-gray-50/30">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Saved Links ({savedLinks.length})
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setSavedLinks([]);
                    localStorage.removeItem("utm_saved_links");
                  }}
                  className="text-[10px] font-bold text-red-500 hover:text-red-600 cursor-pointer"
                >
                  Clear All
                </button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {savedLinks.map((link, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2.5 group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{link.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{link.url}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                      {new Date(link.date).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(link.url)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-[#1a5c4f] cursor-pointer transition-colors flex-shrink-0"
                      title="Copy"
                    >
                      <i className="ri-file-copy-line text-xs"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSaved(index)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 cursor-pointer transition-colors flex-shrink-0"
                      title="Delete"
                    >
                      <i className="ri-delete-bin-line text-xs"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-sm">
            <h4 className="text-sm font-extrabold text-gray-900 mb-1">Save Link</h4>
            <p className="text-xs text-gray-500 mb-4">Give this link a name so you can find it later</p>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="e.g., Facebook Spring Campaign"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f] mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="flex-1 px-4 py-2 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!saveName.trim()}
                className="flex-1 px-4 py-2 rounded-lg text-xs font-bold bg-[#1a5c4f] text-white hover:bg-[#17504a] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}