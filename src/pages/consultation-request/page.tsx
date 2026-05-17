/**
 * /consultation-request — lightweight customer-facing page that captures
 * a preferred consultation / callback window into public.consultation_requests.
 *
 * Goals:
 *   - mobile-first, premium SaaS quality, trustworthy
 *   - low friction: URL params prefill email / order_id / confirmation_number,
 *     AND a best-effort server lookup hydrates name + phone + email from
 *     the linked order via the existing get-resume-order edge function
 *     (anon-safe, RLS-friendly)
 *   - compliance-safe copy (no "doctor", no "guaranteed", no "free
 *     evaluation", no real provider calendar)
 *
 * URL params supported:
 *   ?email=<email>
 *   ?order_id=<uuid>
 *   ?confirmation_number=<text>
 *   ?source=<email_recovery|manual_recovery|checkout_prompt|assessment_prompt|manual|direct_link>
 *
 * Submits via direct supabase.from("consultation_requests").insert(...).
 * RLS policy `consultation_requests_insert_anon` allows the public write
 * but locks down admin-only columns. No edge function is required for the
 * submit path. The lookup uses the EXISTING get-resume-order edge function;
 * no new infra was added.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { supabase } from "../../lib/supabaseClient";
import { getSessionId } from "../../lib/visitorSession";

const NOTE_MAX = 800;

const TIME_WINDOW_OPTIONS = [
  { value: "morning",   label: "Morning (8am – 12pm)" },
  { value: "midday",    label: "Midday (12pm – 2pm)" },
  { value: "afternoon", label: "Afternoon (2pm – 5pm)" },
  { value: "evening",   label: "Evening (5pm – 8pm)" },
  { value: "any",       label: "Anytime — I'm flexible" },
];

const CONTACT_METHODS = [
  { value: "phone", label: "Phone call",  icon: "ri-phone-line" },
  { value: "sms",   label: "Text / SMS",  icon: "ri-chat-3-line" },
  { value: "email", label: "Email reply", icon: "ri-mail-line" },
];

const ALLOWED_SOURCES = new Set([
  "email_recovery",
  "manual_recovery",
  "checkout_prompt",
  "assessment_prompt",
  "manual",
  "direct_link",
]);

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

function detectBrowserTimezone(): string {
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) return tz;
    }
  } catch {
    /* ignore */
  }
  return "";
}

// Light US phone formatter — strips non-digits, keeps at most 10 digits, and
// progressively masks the input as (XXX) XXX-XXXX. Pure / no library.
function formatUsPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Normalize a server-side phone (E.164 or any cleaned form) into the same
// display mask. Drops the leading US "1" if present. Returns "" when the
// value isn't a recognizable 10-digit US number.
function normalizeIncomingPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return "";
  return formatUsPhone(digits);
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  preferred_day: string;
  preferred_time_window: string;
  preferred_contact_method: string;
  notes: string;
}

interface PrefilledFlags {
  name: boolean;
  email: boolean;
  phone: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  phone: "",
  preferred_day: "",
  preferred_time_window: "",
  preferred_contact_method: "phone",
  notes: "",
};

const EMPTY_PREFILLED: PrefilledFlags = { name: false, email: false, phone: false };

export default function ConsultationRequestPage() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [prefilled, setPrefilled] = useState<PrefilledFlags>(EMPTY_PREFILLED);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tracks whether the user has typed in a given field, so the async order
  // lookup never overwrites typed input.
  const userTouchedRef = useRef<Record<keyof FormState, boolean>>({
    name: false,
    email: false,
    phone: false,
    preferred_day: false,
    preferred_time_window: false,
    preferred_contact_method: false,
    notes: false,
  });

  const prefill = useMemo(() => {
    const email = (searchParams.get("email") ?? "").trim();
    const order_id = (searchParams.get("order_id") ?? "").trim();
    const confirmation_number = (searchParams.get("confirmation_number") ?? "").trim();
    const rawSource = (searchParams.get("source") ?? "").trim();
    const source_context = ALLOWED_SOURCES.has(rawSource) ? rawSource : "direct_link";
    return { email, order_id, confirmation_number, source_context };
  }, [searchParams]);

  // Apply URL prefill once on mount — never overwrite typed input.
  useEffect(() => {
    if (prefill.email) {
      setForm((prev) => (prev.email ? prev : { ...prev, email: prefill.email }));
      setPrefilled((p) => ({ ...p, email: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Best-effort server prefill from the linked order, using the EXISTING
  // get-resume-order edge function. Triggers only when a confirmation_number
  // is present. Fills name + phone + email when blank. Skips if the order
  // is already paid (those leads aren't the target of this funnel) and
  // never overwrites fields the user has typed into.
  useEffect(() => {
    if (!prefill.confirmation_number) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/get-resume-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ confirmationId: prefill.confirmation_number }),
        });
        if (!res.ok) return;
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          order?: {
            first_name?: string | null;
            last_name?: string | null;
            email?: string | null;
            phone?: string | null;
            already_paid?: boolean | null;
          };
        };
        if (cancelled) return;
        if (!json.ok || !json.order) return;
        if (json.order.already_paid) return;

        const fullName = [json.order.first_name, json.order.last_name]
          .filter((s): s is string => !!s && s.trim().length > 0)
          .join(" ")
          .trim();
        const fetchedEmail = (json.order.email ?? "").trim();
        const fetchedPhone = normalizeIncomingPhone(json.order.phone ?? "");

        const nextFlags: PrefilledFlags = { ...EMPTY_PREFILLED };
        setForm((prev) => {
          const next = { ...prev };
          if (!userTouchedRef.current.name && !next.name && fullName) {
            next.name = fullName;
            nextFlags.name = true;
          }
          if (!userTouchedRef.current.email && !next.email && fetchedEmail) {
            next.email = fetchedEmail;
            nextFlags.email = true;
          } else if (next.email) {
            nextFlags.email = prefilled.email;
          }
          if (!userTouchedRef.current.phone && !next.phone && fetchedPhone) {
            next.phone = fetchedPhone;
            nextFlags.phone = true;
          }
          return next;
        });
        setPrefilled((p) => ({
          name: nextFlags.name || p.name,
          email: nextFlags.email || p.email,
          phone: nextFlags.phone || p.phone,
        }));
      } catch {
        /* fail silent — page works fine without the prefill */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill.confirmation_number]);

  // Minimum date for the "preferred day" picker — today, local time.
  const minDay = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    userTouchedRef.current[key] = true;
    setForm((prev) => ({ ...prev, [key]: value }));
    // Once the user has typed into a prefilled field, drop the badge so
    // the value is treated as user-owned.
    if (prefilled[key as keyof PrefilledFlags]) {
      setPrefilled((p) => ({ ...p, [key as keyof PrefilledFlags]: false }));
    }
  }

  function handlePhoneChange(raw: string) {
    update("phone", formatUsPhone(raw));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    if (!form.email.trim()) {
      setError("Please enter an email address so our team can reach you.");
      return;
    }
    if (form.notes.length > NOTE_MAX) {
      setError(`Notes must be under ${NOTE_MAX} characters.`);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const payload = {
        order_id: prefill.order_id || null,
        confirmation_number: prefill.confirmation_number || null,
        customer_email: form.email.trim(),
        customer_phone: form.phone.trim() || null,
        customer_name: form.name.trim() || null,
        preferred_day: form.preferred_day || null,
        preferred_time_window: form.preferred_time_window || null,
        timezone: detectBrowserTimezone() || null,
        preferred_contact_method: form.preferred_contact_method || null,
        notes: form.notes.trim() || null,
        source_context: prefill.source_context,
        linked_visitor_session_id: getSessionId() ?? null,
        // status / assigned_to / converted_order_paid_at / internal_notes
        // are intentionally omitted — RLS policy requires them blank on
        // anon insert and the table defaults to status='new'.
      };

      const { error: insertErr } = await supabase
        .from("consultation_requests")
        .insert(payload);

      if (insertErr) {
        throw new Error(insertErr.message || "Could not submit your request.");
      }

      setSubmitted(true);
      setForm(EMPTY_FORM);
      setPrefilled(EMPTY_PREFILLED);
    } catch (err) {
      setError(
        (err as Error)?.message ||
          "Something went wrong. Please try again or call us at (409) 965-5885.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <title>Request a Consultation Window | PawTenant</title>
      <meta
        name="description"
        content="Request a preferred consultation or callback window with PawTenant. Our care team will reach out to discuss your ESA documentation process and next steps."
      />
      <meta name="robots" content="noindex,nofollow" />
      <link rel="canonical" href="https://www.pawtenant.com/consultation-request" />

      <SharedNavbar />

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="pt-28 pb-10 bg-gradient-to-b from-[#fdf8f3] to-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <span className="inline-block px-4 py-1.5 bg-orange-100 text-orange-600 text-xs font-bold rounded-full uppercase tracking-widest mb-4">
            Care Team Consultation
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4 leading-tight">
            Request a Consultation Window
          </h1>
          <p className="text-gray-500 text-base leading-relaxed max-w-xl mx-auto">
            Prefer to speak with our care team first? Pick a time that works for you
            and we&apos;ll reach out to discuss your ESA documentation process and
            next steps.
          </p>
        </div>
      </section>

      {/* ── Trust strip ─────────────────────────────────────────────────── */}
      <section className="pb-2 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                icon: "ri-shield-check-line",
                title: "No-pressure call",
                sub: "Talk through your situation, no obligation to continue.",
              },
              {
                icon: "ri-time-line",
                title: "You pick the window",
                sub: "Tell us when works — our team will try to match it.",
              },
              {
                icon: "ri-customer-service-2-line",
                title: "Real care team",
                sub: "U.S.-based support staff, not an automated bot.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="flex items-start gap-3 bg-[#fdf8f3] rounded-xl p-4 border border-orange-50"
              >
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-white text-orange-500 flex-shrink-0">
                  <i className={`${card.icon} text-lg`}></i>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{card.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{card.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Form ────────────────────────────────────────────────────────── */}
      <section className="py-12 bg-white">
        <div className="max-w-2xl mx-auto px-6">
          <div className="bg-white rounded-2xl border border-orange-100/70 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-6 sm:p-8">
            {submitted ? (
              <div className="text-center py-10">
                <div className="w-16 h-16 flex items-center justify-center bg-orange-50 rounded-full mx-auto mb-5">
                  <i className="ri-checkbox-circle-fill text-orange-500 text-3xl"></i>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  Request received
                </h2>
                <p className="text-sm text-gray-500 leading-relaxed max-w-md mx-auto">
                  Thanks — our care team will reach out within one business day to
                  confirm a consultation window. Keep an eye on your inbox and phone.
                </p>

                {/* Soft educational trust CTAs — keep the lead warm without
                    restarting checkout psychology. No "Continue Assessment"
                    button (they already finished it; the consultation is the
                    next step). */}
                <div className="mt-8 pt-6 border-t border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">
                    While you wait
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                    <Link
                      to="/housing-rights-esa"
                      className="group flex items-start gap-3 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/30 p-4 transition-colors cursor-pointer"
                    >
                      <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-orange-50 text-orange-500 flex-shrink-0">
                        <i className="ri-home-heart-line text-lg"></i>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 group-hover:text-orange-600">
                          ESA &amp; Housing Rights
                        </p>
                        <p className="text-xs text-gray-500 leading-relaxed mt-0.5">
                          What landlords can and can&apos;t ask under the Fair Housing Act.
                        </p>
                      </div>
                    </Link>
                    <Link
                      to="/how-to-get-esa-letter"
                      className="group flex items-start gap-3 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/30 p-4 transition-colors cursor-pointer"
                    >
                      <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-orange-50 text-orange-500 flex-shrink-0">
                        <i className="ri-file-text-line text-lg"></i>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 group-hover:text-orange-600">
                          How ESA Documentation Works
                        </p>
                        <p className="text-xs text-gray-500 leading-relaxed mt-0.5">
                          A plain-English walkthrough of the process and what to expect.
                        </p>
                      </div>
                    </Link>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-4">
                    Need to reach us sooner?{" "}
                    <a href="tel:+14099655885" className="font-semibold text-orange-600 hover:underline">
                      (409) 965-5885
                    </a>
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="mb-2">
                  <h2 className="text-lg font-bold text-gray-900">
                    Speak With Our Care Team
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    We&apos;ll use this to coordinate a quick consultation window. No
                    payment is collected here.
                  </p>
                </div>

                {prefill.confirmation_number && (
                  <div className="rounded-lg border border-orange-100 bg-orange-50/60 px-3 py-2 text-xs text-orange-700 flex items-center gap-2">
                    <i className="ri-file-list-3-line"></i>
                    <span>
                      We&apos;ve linked this request to your order
                      <span className="font-semibold ml-1">
                        {prefill.confirmation_number}
                      </span>
                      .
                    </span>
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Your Name
                    {prefilled.name && <PrefilledBadge />}
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="Jane Smith"
                    autoComplete="name"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-400 transition-colors"
                  />
                </div>

                {/* Email + Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      Email <span className="text-orange-500">*</span>
                      {prefilled.email && <PrefilledBadge />}
                    </label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                      placeholder="jane@example.com"
                      autoComplete="email"
                      inputMode="email"
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      Phone
                      {prefilled.phone && <PrefilledBadge />}
                    </label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      placeholder="(555) 000-0000"
                      autoComplete="tel"
                      inputMode="tel"
                      maxLength={14}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-400 transition-colors"
                    />
                  </div>
                </div>

                {/* Preferred day + window */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      Preferred Day
                    </label>
                    <input
                      type="date"
                      value={form.preferred_day}
                      min={minDay}
                      onChange={(e) => update("preferred_day", e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      Preferred Time Window
                    </label>
                    <select
                      value={form.preferred_time_window}
                      onChange={(e) => update("preferred_time_window", e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-400 transition-colors cursor-pointer"
                    >
                      <option value="">Select a time window…</option>
                      {TIME_WINDOW_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Preferred contact method */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Preferred Contact Method
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {CONTACT_METHODS.map((m) => {
                      const active = form.preferred_contact_method === m.value;
                      return (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => update("preferred_contact_method", m.value)}
                          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                            active
                              ? "bg-orange-500 border-orange-500 text-white"
                              : "bg-white border-gray-200 text-gray-600 hover:border-orange-200"
                          }`}
                        >
                          <i className={m.icon}></i>
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Notes or Questions
                    <span
                      className={`ml-2 font-normal ${
                        form.notes.length > NOTE_MAX * 0.9
                          ? "text-red-400"
                          : "text-gray-400"
                      }`}
                    >
                      {form.notes.length}/{NOTE_MAX}
                    </span>
                  </label>
                  <textarea
                    rows={4}
                    value={form.notes}
                    onChange={(e) => {
                      if (e.target.value.length > NOTE_MAX) return;
                      update("notes", e.target.value);
                    }}
                    placeholder="Anything we should know before reaching out? (Optional)"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-400 transition-colors resize-none"
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-500 flex items-center gap-1.5">
                    <i className="ri-error-warning-line"></i> {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="whitespace-nowrap w-full py-3.5 bg-orange-500 text-white font-semibold text-sm rounded-lg hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <i className="ri-loader-4-line animate-spin"></i> Sending request…
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <i className="ri-calendar-check-line"></i> Request Consultation Window
                    </span>
                  )}
                </button>

                <p className="text-[11px] text-gray-400 leading-relaxed text-center">
                  ESA documentation is only issued after provider review, based on
                  clinical appropriateness, and following completed payment. This
                  consultation is a no-pressure conversation, not an evaluation.
                </p>
              </form>
            )}
          </div>

          {/* Direct contact fallback */}
          <div className="mt-6 text-center text-xs text-gray-400">
            Prefer to talk right now? Call us at{" "}
            <a
              href="tel:+14099655885"
              className="font-semibold text-orange-600 hover:underline cursor-pointer"
            >
              (409) 965-5885
            </a>{" "}
            or email{" "}
            <a
              href="mailto:hello@pawtenant.com"
              className="font-semibold text-orange-600 hover:underline cursor-pointer"
            >
              hello@pawtenant.com
            </a>
            .
          </div>
        </div>
      </section>

      <SharedFooter />
    </>
  );
}

// Small inline badge used to signal a field was pre-filled from the linked
// order so the user knows where the value came from. Disappears as soon as
// the user types into the field (handled by update()).
function PrefilledBadge() {
  return (
    <span
      className="ml-2 inline-flex items-center gap-1 align-middle text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-1.5 py-0.5"
      title="Pre-filled from your order"
    >
      <i className="ri-checkbox-circle-fill text-[10px]"></i>
      Pre-filled
    </span>
  );
}
