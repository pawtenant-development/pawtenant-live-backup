import { useState, FormEvent, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { supabase } from "../../lib/supabaseClient";
import { US_STATES, US_STATE_CODE_TO_NAME } from "../../lib/usStates";

const licenseTypes = [
  "Licensed Clinical Social Worker (LCSW)",
  "Licensed Professional Counselor (LPC)",
  "Licensed Marriage and Family Therapist (LMFT)",
  "Licensed Mental Health Counselor (LMHC)",
  "Psychologist (PhD / PsyD)",
  "Psychiatrist (MD / DO)",
  "Licensed Counselor (LPC-Associate / Intern)",
  "Other Licensed Mental Health Professional",
];

const specializations = [
  "Anxiety Disorders",
  "Depression",
  "PTSD / Trauma",
  "ADHD",
  "Bipolar Disorder",
  "OCD",
  "Autism Spectrum Disorder",
  "Social Anxiety",
  "Panic Disorder",
  "Grief & Bereavement",
  "Chronic Pain / Physical Illness",
  "Substance Use Disorders",
];

const practiceTypes = [
  "Solo Private Practice",
  "Group Practice",
  "Community Mental Health Center",
  "Hospital / Inpatient",
  "Telehealth Platform",
  "University / College Counseling",
];

const availabilityOptions = [
  "Less than 5 ESA evaluations/month",
  "5–10 ESA evaluations/month",
  "10–20 ESA evaluations/month",
  "20+ ESA evaluations/month",
];

const usStates = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
  "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming",
];

const benefits = [
  {
    icon: "ri-calendar-check-line",
    title: "Flexible Scheduling",
    desc: "You control your availability. Accept cases on your schedule — no minimum commitment required.",
  },
  {
    icon: "ri-money-dollar-circle-line",
    title: "Competitive Compensation",
    desc: "Earn competitive fees per ESA evaluation, paid directly to you on a weekly basis.",
  },
  {
    icon: "ri-shield-check-line",
    title: "Malpractice Coverage",
    desc: "PawTenant provides supplemental liability coverage for all ESA evaluations completed through our platform.",
  },
  {
    icon: "ri-user-heart-line",
    title: "Meaningful Impact",
    desc: "Help clients protect their housing rights and mental health through the bond with their emotional support animal.",
  },
  {
    icon: "ri-time-line",
    title: "Short Evaluations",
    desc: "ESA evaluations are typically 15–30 minute consultations — easy to fit around your existing client schedule.",
  },
  {
    icon: "ri-team-line",
    title: "Clinical Support",
    desc: "Our clinical team is available for guidance on complex cases, documentation standards, and state-specific compliance.",
  },
];

const steps = [
  { step: "01", icon: "ri-file-list-3-line", title: "Submit Your Application", desc: "Fill out the form below with your credentials, license info, and availability." },
  { step: "02", icon: "ri-search-eye-line", title: "Credential Verification", desc: "Our clinical team verifies your license and reviews your application. Usually within 48 hours." },
  { step: "03", icon: "ri-video-chat-line", title: "Onboarding Call", desc: "A short orientation call covering platform use, ESA documentation standards, and state compliance." },
  { step: "04", icon: "ri-checkbox-circle-line", title: "Start Accepting Cases", desc: "You're live! Begin receiving ESA evaluation requests matched to your state and specializations." },
];

const faqs = [
  {
    q: "What licenses qualify to write ESA letters on PawTenant?",
    a: "Any licensed mental health professional (LMHP) who is actively licensed in the state where the client resides. This includes LCSWs, LPCs, LMFTs, LMHCs, psychologists, and psychiatrists. Interns or associate-level licenses may qualify depending on the state.",
  },
  {
    q: "Do I need telehealth certification to join?",
    a: "Not necessarily — requirements vary by state. Some states require a specific telehealth consent process; others simply require that you hold an active in-state license. Our onboarding team will clarify what applies to your state.",
  },
  {
    q: "How are ESA evaluation cases assigned to me?",
    a: "Cases are matched to you based on the state(s) you are licensed in and your listed availability. You'll receive a notification when a new case is assigned and can complete the evaluation at your convenience within the response window.",
  },
  {
    q: "How quickly do I need to complete an evaluation after it's assigned?",
    a: "We ask that all evaluations be completed within 24 hours of case assignment. This helps us meet our promise of same-day/next-day letter delivery to clients. Most evaluations take 15–30 minutes including documentation.",
  },
  {
    q: "How does compensation work?",
    a: "You are compensated per completed ESA evaluation. Earnings are consolidated weekly and deposited directly to your bank account via ACH. The specific fee per evaluation is discussed during your onboarding call.",
  },
];

// OPS-PROVIDER-APPLICATION-LICENSE-ROWS-V2: structured license row shape used
// by the form. State is stored internally as a 2-letter code so the persisted
// `licenses` jsonb is canonical from the start.
interface LicenseRow {
  id: string;          // local-only React key
  state_code: string;  // "" until selected, then 2-letter UPPER
  credential: string;  // free choice from CREDENTIAL_OPTIONS
  license_number: string;
}

const CREDENTIAL_OPTIONS = [
  "LCSW", "LPC", "LMFT", "LMHC", "Psychologist", "Psychiatrist", "Other",
];

function newLicenseRow(): LicenseRow {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `lic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    state_code: "",
    credential: "",
    license_number: "",
  };
}

export default function JoinOurNetworkPage() {
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>([]);
  const [selectedLicenses, setSelectedLicenses] = useState<string[]>([]);
  // OPS-PROVIDER-APPLICATION-LICENSE-ROWS-V2: repeatable license rows. Always
  // contains at least one row; the user cannot remove the last row.
  const [licenseRows, setLicenseRows] = useState<LicenseRow[]>(() => [newLicenseRow()]);
  const [licenseRowsError, setLicenseRowsError] = useState<string>("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [bioError, setBioError] = useState("");
  const [headshotFile, setHeadshotFile] = useState<File | null>(null);
  const [headshotPreview, setHeadshotPreview] = useState<string | null>(null);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const applicationSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (submitted && applicationSectionRef.current) {
      applicationSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [submitted]);

  const toggleSpec = (spec: string) => {
    setSelectedSpecs((prev) => prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec]);
  };

  const toggleLicense = (license: string) => {
    setSelectedLicenses((prev) => prev.includes(license) ? prev.filter((l) => l !== license) : [...prev, license]);
  };

  const clearFieldError = (name: string) => {
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleHeadshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setHeadshotFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setHeadshotPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setHeadshotPreview(null);
    }
  };

  const handleDocumentsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setDocumentFiles((prev) => [...prev, ...files].slice(0, 5));
  };

  const removeDocument = (idx: number) => {
    setDocumentFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${folder}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("provider-uploads").upload(filePath, file, { upsert: false });
    if (error) return null;
    const { data } = supabase.storage.from("provider-uploads").getPublicUrl(filePath);
    return data.publicUrl;
  };

  // OPS-PROVIDER-APPLICATION-LICENSE-ROWS-V2: license-row mutators. Rows are
  // identified by a stable local id so React can re-render correctly while
  // the user adds/removes entries.
  const addLicenseRow = () => {
    setLicenseRowsError("");
    // Don't let the user pile up empty duplicates: only add a new row when the
    // last existing one has at least started to be filled.
    setLicenseRows((rows) => {
      const last = rows[rows.length - 1];
      if (last && !last.state_code && !last.credential && !last.license_number) {
        return rows;
      }
      return [...rows, newLicenseRow()];
    });
  };
  const removeLicenseRow = (id: string) => {
    setLicenseRowsError("");
    setLicenseRows((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)));
  };
  const updateLicenseRow = (id: string, patch: Partial<LicenseRow>) => {
    setLicenseRowsError("");
    setLicenseRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const validateRequiredFields = (form: HTMLFormElement): Record<string, string> => {
    const errors: Record<string, string> = {};
    const fd = new FormData(form);
    const firstName = ((fd.get("firstName") as string) ?? "").trim();
    const lastName = ((fd.get("lastName") as string) ?? "").trim();
    const email = ((fd.get("email") as string) ?? "").trim();
    const phoneRaw = ((fd.get("phone") as string) ?? "").trim();
    const npi = ((fd.get("npi") as string) ?? "").trim();

    if (firstName.length < 1) errors.firstName = "First name is required.";
    if (lastName.length < 1) errors.lastName = "Last name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
    const phoneDigits = phoneRaw.replace(/\D/g, "");
    if (phoneDigits.length < 10) errors.phone = "Enter a valid phone number (at least 10 digits).";
    if (!/^\d{10}$/.test(npi)) errors.npi = "NPI must be exactly 10 digits.";

    // OPS-PROVIDER-APPLICATION-LICENSE-ROWS-V2: replace single license_state /
    // license_number validation with structured license rows. At least one
    // complete row required. Every populated row must have state, credential,
    // and license number. Duplicate (state, credential) pairs are rejected so
    // applicants don't double-enter the same credential for the same state.
    const completedRows = licenseRows.filter(
      (r) => r.state_code && r.credential && r.license_number.trim(),
    );
    if (completedRows.length === 0) {
      errors.licenseRows = "Please add at least one license (state, credential, and license number).";
    } else {
      const incomplete = licenseRows.find(
        (r) => (r.state_code || r.credential || r.license_number) &&
               (!r.state_code || !r.credential || !r.license_number.trim()),
      );
      if (incomplete) {
        errors.licenseRows = "Every license row needs state, credential, and license number.";
      } else {
        const seen = new Set<string>();
        for (const r of completedRows) {
          const key = `${r.state_code}|${r.credential}`;
          if (seen.has(key)) {
            errors.licenseRows = "Each (state, credential) combination can only appear once.";
            break;
          }
          seen.add(key);
        }
      }
    }

    // OPS-PROVIDER-APPLICATION-PHASE1-SAFE-FIXES: enforce all three agreement
    // checkboxes via custom validation (the form has noValidate, so the
    // `required` attribute alone does not block submit). FormData reports a
    // checkbox value as "on" only when checked.
    const agreeCredentials = fd.get("agreeCredentials") === "on";
    const agreeHipaa       = fd.get("agreeHipaa") === "on";
    const agreeTerms       = fd.get("agreeTerms") === "on";
    if (!agreeCredentials) errors.agreeCredentials = "Please confirm your active, unrestricted license.";
    if (!agreeHipaa)       errors.agreeHipaa       = "Please agree to maintain HIPAA compliance.";
    if (!agreeTerms)       errors.agreeTerms       = "Please accept the Terms of Use and Privacy Policy.";

    return errors;
  };

  // OPS-PROVIDER-APPLICATION-PHASE1-SAFE-FIXES: lightweight client-side
  // attribution capture. Read once on mount so a later URL change (e.g. from
  // routing/state) doesn't lose the original landing context. document.referrer
  // is also captured here because some browsers clear it after navigation.
  type ProviderAttribution = {
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    utm_term: string | null;
    utm_content: string | null;
    gclid: string | null;
    fbclid: string | null;
    referrer: string | null;
    landing_url: string | null;
  };
  const attributionRef = useRef<ProviderAttribution>({
    utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null,
    utm_content: null, gclid: null, fbclid: null, referrer: null, landing_url: null,
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const get = (k: string) => {
        const v = params.get(k);
        return v && v.trim() !== "" ? v.trim() : null;
      };
      attributionRef.current = {
        utm_source:   get("utm_source"),
        utm_medium:   get("utm_medium"),
        utm_campaign: get("utm_campaign"),
        utm_term:     get("utm_term"),
        utm_content:  get("utm_content"),
        gclid:        get("gclid"),
        fbclid:       get("fbclid"),
        referrer:     (document.referrer && document.referrer !== "" ? document.referrer : null),
        landing_url:  window.location.href,
      };
    } catch { /* attribution is best-effort, never block submit */ }
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;

    const errors = validateRequiredFields(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // OPS-PROVIDER-APPLICATION-LICENSE-ROWS-V2: surface licenseRows error
      // separately because the rows are React-controlled (no name= input
      // present in the form for `firstName`-style scrolling).
      if (errors.licenseRows) setLicenseRowsError(errors.licenseRows);
      const firstKey = Object.keys(errors)[0];
      const el = form.querySelector(`[name='${firstKey}']`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        if (typeof (el as HTMLInputElement).focus === "function") {
          (el as HTMLInputElement).focus({ preventScroll: true });
        }
      } else if (errors.licenseRows) {
        // Fallback scroll when the offender is the license-rows section.
        const sec = form.querySelector("[data-section='license-rows']") as HTMLElement | null;
        if (sec) sec.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    setFieldErrors({});
    setLicenseRowsError("");

    const textarea = form.querySelector("textarea[name='bio']") as HTMLTextAreaElement;
    if (textarea && textarea.value.length > 500) {
      setBioError("Bio must be 500 characters or less. Please shorten your message.");
      textarea.focus();
      return;
    }
    setBioError("");
    setSubmitting(true);
    const formData = new FormData(form);

    // Upload headshot
    let headshotUrl: string | null = null;
    if (headshotFile) {
      setUploadProgress("Uploading headshot...");
      headshotUrl = await uploadFile(headshotFile, "headshots");
    }

    // Upload documents
    const docUrls: string[] = [];
    if (documentFiles.length > 0) {
      setUploadProgress("Uploading documents...");
      for (const doc of documentFiles) {
        const url = await uploadFile(doc, "documents");
        if (url) docUrls.push(url);
      }
    }
    setUploadProgress("");

    const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
    const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

    // OPS-PROVIDER-APPLICATION-PHASE1-SAFE-FIXES: at this point all three
    // agreements have been validated as checked, so we can record the audit
    // timestamp and the boolean fields. agreements_ip is intentionally left
    // null for now — capturing IP requires a backend hop and is deferred to a
    // later phase.
    const agreeCredentials = formData.get("agreeCredentials") === "on";
    const agreeHipaa       = formData.get("agreeHipaa") === "on";
    const agreeTerms       = formData.get("agreeTerms") === "on";
    const allAgreed = agreeCredentials && agreeHipaa && agreeTerms;
    const attribution = attributionRef.current;

    // OPS-PROVIDER-APPLICATION-LICENSE-ROWS-V2: build the structured licenses
    // array (canonical state codes only) AND derive legacy fields from the
    // first / unique values so existing admin review surfaces and approvals
    // for old applications keep working until everything moves over.
    const completedLicenses = licenseRows
      .filter((r) => r.state_code && r.credential && r.license_number.trim())
      .map((r) => ({
        state_code: r.state_code.toUpperCase(),
        credential: r.credential,
        license_number: r.license_number.trim(),
      }));
    const primaryLicense = completedLicenses[0] ?? null;
    const legacyPrimaryStateName = primaryLicense ? (US_STATE_CODE_TO_NAME[primaryLicense.state_code] ?? primaryLicense.state_code) : null;
    const legacyAdditionalStates = completedLicenses
      .slice(1)
      .map((r) => US_STATE_CODE_TO_NAME[r.state_code] ?? r.state_code)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(", ");
    const legacyLicenseTypes = Array.from(new Set(completedLicenses.map((r) => r.credential))).join(", ");

    const appPayload = {
      first_name: (formData.get("firstName") as string) ?? "",
      last_name: (formData.get("lastName") as string) ?? "",
      email: (formData.get("email") as string) ?? "",
      phone: (formData.get("phone") as string) || null,
      npi: (formData.get("npi") as string) || null,
      // Legacy compatibility fields (kept populated from licenseRows so
      // legacy approval / admin review paths keep working).
      license_types:     legacyLicenseTypes || (selectedLicenses.join(", ") || null),
      license_number:    primaryLicense?.license_number ?? null,
      license_state:     legacyPrimaryStateName,
      additional_states: legacyAdditionalStates || null,
      // Structured V2
      licenses:          completedLicenses.length > 0 ? completedLicenses : null,
      years_experience: (formData.get("yearsExperience") as string) || null,
      practice_name: (formData.get("practiceName") as string) || null,
      practice_type: (formData.get("practiceType") as string) || null,
      specializations: selectedSpecs.join(", ") || null,
      monthly_capacity: (formData.get("monthlyCapacity") as string) || null,
      esa_experience: (formData.get("esaExperience") as string) || null,
      telehealth_ready: (formData.get("telehealthReady") as string) || null,
      profile_url: (formData.get("profileUrl") as string) || null,
      bio: (formData.get("bio") as string) || null,
      headshot_url: headshotUrl,
      documents_urls: docUrls.length > 0 ? docUrls : null,
      status: "pending",
      // Agreement audit (Phase 1)
      agree_credentials: agreeCredentials,
      agree_hipaa:       agreeHipaa,
      agree_terms:       agreeTerms,
      agreements_at:     allAgreed ? new Date().toISOString() : null,
      // Attribution (Phase 1)
      utm_source:   attribution.utm_source,
      utm_medium:   attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      utm_term:     attribution.utm_term,
      utm_content:  attribution.utm_content,
      gclid:        attribution.gclid,
      fbclid:       attribution.fbclid,
      referrer:     attribution.referrer,
      landing_url:  attribution.landing_url,
    };

    const ghlPayload = {
      webhookType: "network",
      firstName: appPayload.first_name,
      lastName: appPayload.last_name,
      email: appPayload.email,
      phone: appPayload.phone ?? "",
      npi: appPayload.npi ?? "",
      licenseTypes: appPayload.license_types ?? "",
      licenseNumber: appPayload.license_number ?? "",
      licenseState: appPayload.license_state ?? "",
      additionalStates: appPayload.additional_states ?? "",
      // OPS-PROVIDER-APPLICATION-LICENSE-ROWS-V2: forward structured rows so
      // GHL workflows can segment by state/credential. provider_applications
      // remains the source of truth.
      licenses: appPayload.licenses ?? [],
      yearsExperience: appPayload.years_experience ?? "",
      practiceName: appPayload.practice_name ?? "",
      practiceType: appPayload.practice_type ?? "",
      specializations: appPayload.specializations ?? "",
      monthlyCapacity: appPayload.monthly_capacity ?? "",
      esaExperience: appPayload.esa_experience ?? "",
      telehealthReady: appPayload.telehealth_ready ?? "",
      profileUrl: appPayload.profile_url ?? "",
      leadSource: "Therapist Network Application",
      submittedAt: new Date().toISOString(),
      tags: ["Therapist Application", "Doctor Lead", "Pending Review"],
      // OPS-PROVIDER-APPLICATION-PHASE1-SAFE-FIXES: forward attribution to the
      // network webhook target so GHL can segment provider leads by source.
      // provider_applications remains the source of truth.
      utmSource:   attribution.utm_source ?? "",
      utmMedium:   attribution.utm_medium ?? "",
      utmCampaign: attribution.utm_campaign ?? "",
      utmTerm:     attribution.utm_term ?? "",
      utmContent:  attribution.utm_content ?? "",
      gclid:       attribution.gclid ?? "",
      fbclid:      attribution.fbclid ?? "",
      referrer:    attribution.referrer ?? "",
      landingUrl:  attribution.landing_url ?? "",
    };

    const emailPayload = {
      firstName: appPayload.first_name,
      lastName: appPayload.last_name,
      email: appPayload.email,
      phone: appPayload.phone ?? undefined,
      npi: appPayload.npi ?? undefined,
      licenseTypes: appPayload.license_types ?? undefined,
      licenseNumber: appPayload.license_number ?? undefined,
      licenseState: appPayload.license_state ?? undefined,
      additionalStates: appPayload.additional_states ?? undefined,
      yearsExperience: appPayload.years_experience ?? undefined,
      practiceName: appPayload.practice_name ?? undefined,
      practiceType: appPayload.practice_type ?? undefined,
      specializations: appPayload.specializations ?? undefined,
      monthlyCapacity: appPayload.monthly_capacity ?? undefined,
      esaExperience: appPayload.esa_experience ?? undefined,
      telehealthReady: appPayload.telehealth_ready ?? undefined,
      bio: appPayload.bio ?? undefined,
      profileUrl: appPayload.profile_url ?? undefined,
      headshotUrl: headshotUrl ?? undefined,
      documentsCount: docUrls.length || undefined,
    };

    const legacyData = new URLSearchParams();
    formData.forEach((value, key) => { legacyData.append(key, value as string); });
    legacyData.append("specializations", selectedSpecs.join(", "));
    legacyData.append("licenseTypes", selectedLicenses.join(", "));

    await Promise.allSettled([
      supabase.from("provider_applications").insert(appPayload),
      fetch(`${SUPABASE_URL}/functions/v1/notify-provider-application`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify(emailPayload),
      }),
      fetch("https://readdy.ai/api/form/d6tkt024of3kuoicn7c0", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: legacyData.toString(),
      }),
      fetch(`${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify(ghlPayload),
      }),
    ]);

    setSubmitted(true);
    setSubmitting(false);
  };

  const schemaOrg = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((f) => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a },
    })),
  });

  const inputBase = "w-full border rounded-md px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition-colors";
  const inputOk = "border-gray-200 focus:border-orange-400";
  const inputBad = "border-red-400 focus:border-red-500";
  const selectBase = "w-full border rounded-md px-3 py-2.5 text-sm text-gray-900 focus:outline-none transition-colors cursor-pointer";

  const FieldError = ({ name }: { name: string }) =>
    fieldErrors[name] ? (
      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
        <i className="ri-error-warning-line"></i> {fieldErrors[name]}
      </p>
    ) : null;

  return (
    <main>
      <title>Join Our Licensed Therapist Network — Write ESA Letters & Earn | PawTenant</title>
      <meta name="description" content="Licensed mental health professionals: join PawTenant's LMHP network and help clients get their ESA letters. Flexible hours, competitive weekly pay, telehealth-ready. Apply in 5 minutes." />
      <meta name="keywords" content="join ESA therapist network, LMHP ESA evaluations, write ESA letters earn money, licensed therapist ESA partner, mental health professional ESA platform" />
      <link rel="canonical" href="https://www.pawtenant.com/join-our-network" />
      <meta property="og:title" content="Join PawTenant's Licensed Therapist Network | Apply Now" />
      <meta property="og:description" content="Are you a licensed mental health professional? Partner with PawTenant to evaluate ESA clients. Flexible schedule, competitive compensation, meaningful work." />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://www.pawtenant.com/join-our-network" />
      <meta property="og:image" content="https://readdy.ai/api/search-image?query=professional%20licensed%20therapist%20psychologist%20working%20telehealth%20session%20warm%20office%20natural%20lighting%20confident%20mental%20health%20provider&width=1200&height=630&seq=joinog01&orientation=landscape" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaOrg }} />

      <SharedNavbar />

      {/* ===== HERO ===== */}
      <section className="relative pt-28 pb-20 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://readdy.ai/api/search-image?query=professional%20licensed%20therapist%20psychologist%20working%20at%20desk%20reviewing%20documents%20telehealth%20session%20laptop%20video%20call%20warm%20office%20bookshelf%20calm%20confident%20mental%20health%20professional%20natural%20lighting%20neutral%20warm%20tones&width=1440&height=680&seq=dochero01&orientation=landscape"
            alt="Licensed therapist joining PawTenant network"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/65 to-black/20"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-6 w-full">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-5">
              <Link to="/" className="text-white/60 hover:text-white text-xs transition-colors cursor-pointer">Home</Link>
              <i className="ri-arrow-right-s-line text-white/40 text-xs"></i>
              <span className="text-white/80 text-xs">Join Our Network</span>
            </div>
            <div className="inline-flex items-center gap-2 bg-orange-500/20 border border-orange-400/40 rounded-full px-4 py-1.5 mb-5">
              <i className="ri-stethoscope-line text-orange-400 text-xs"></i>
              <span className="text-orange-300 text-xs font-semibold tracking-wide uppercase">For Licensed Mental Health Professionals</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
              Partner With PawTenant —<br />
              <span className="text-orange-400">Help Clients & Earn More</span>
            </h1>
            <p className="text-white/80 text-sm leading-relaxed mb-8 max-w-lg">
              Join our growing network of licensed therapists, counselors, and psychologists providing ESA evaluations to clients across the country. Flexible scheduling, competitive compensation, and meaningful work — all on your terms.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="#application-form"
                className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
              >
                <i className="ri-file-list-3-line"></i>
                Apply to Join Our Network
              </a>
              <a
                href="#how-it-works"
                className="whitespace-nowrap inline-flex items-center gap-2 text-white/80 text-sm hover:text-white transition-colors cursor-pointer"
              >
                See how it works
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-arrow-down-line text-sm"></i>
                </div>
              </a>
            </div>
            <div className="flex flex-wrap gap-6 mt-8">
              {[
                { icon: "ri-time-line", text: "Set your own hours" },
                { icon: "ri-map-pin-2-line", text: "All 50 states" },
                { icon: "ri-money-dollar-circle-line", text: "Weekly payments" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-2 text-white/70 text-xs">
                  <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                    <i className={`${item.icon} text-orange-400`}></i>
                  </div>
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== BENEFITS ===== */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Why Join Us</span>
            <h2 className="text-3xl font-bold text-gray-900">What You Get as a PawTenant Partner</h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto leading-relaxed">
              We built PawTenant with therapists in mind — not just clients. Here's what you can expect as part of our network.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {benefits.map((b) => (
              <div key={b.title} className="bg-[#fdf8f3] rounded-xl p-6 border border-orange-50">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-100 rounded-xl mb-4">
                  <i className={`${b.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="text-sm font-bold text-gray-900 mb-2">{b.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works" className="py-16 bg-[#fdf8f3]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">The Process</span>
            <h2 className="text-3xl font-bold text-gray-900">How to Join — 4 Simple Steps</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {steps.map((step, i) => (
              <div key={step.step} className="relative">
                {i < steps.length - 1 && (
                  <div className="absolute top-8 left-[calc(50%+28px)] w-[calc(100%-28px)] h-0.5 bg-orange-200"></div>
                )}
                <div className="flex flex-col items-center text-center relative">
                  <div className="w-16 h-16 flex items-center justify-center bg-white rounded-2xl border-2 border-orange-200 mb-4 relative z-10">
                    <i className={`${step.icon} text-orange-500 text-2xl`}></i>
                  </div>
                  <span className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-1">Step {step.step}</span>
                  <h3 className="text-sm font-bold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SOCIAL PROOF ===== */}
      <section className="py-14 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "200+", label: "Licensed Therapists", icon: "ri-user-star-line" },
              { value: "50", label: "States Covered", icon: "ri-map-pin-2-line" },
              { value: "48hr", label: "Avg. Onboarding Time", icon: "ri-time-line" },
              { value: "4.9★", label: "Therapist Satisfaction", icon: "ri-heart-line" },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-full mb-3">
                  <i className={`${stat.icon} text-orange-500 text-lg`}></i>
                </div>
                <p className="text-2xl font-extrabold text-gray-900 mb-1">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== APPLICATION FORM ===== */}
      <section id="application-form" ref={applicationSectionRef} className="py-16 bg-[#fdf8f3]">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Apply Now</span>
            <h2 className="text-3xl font-bold text-gray-900">Licensed Therapist Application</h2>
            <p className="text-gray-500 text-sm mt-3 max-w-md mx-auto leading-relaxed">
              Takes about 5 minutes. Our team reviews all applications within 48 hours and will contact you to schedule your onboarding call.
            </p>
          </div>

          {submitted ? (
            <div className="bg-orange-50 rounded-2xl border border-orange-200 p-12 text-center">
              <div className="w-16 h-16 flex items-center justify-center bg-orange-100 rounded-full mx-auto mb-5">
                <i className="ri-checkbox-circle-fill text-orange-500 text-3xl"></i>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Application Received!</h3>
              <p className="text-gray-500 text-sm leading-relaxed max-w-md mx-auto mb-6">
                Thank you for applying to join the PawTenant therapist network. Our clinical team will review your credentials and reach out within 48 hours to schedule your onboarding call.
                <strong className="block mt-3 text-gray-700">Check your email — we&apos;ve sent you a confirmation.</strong>
              </p>
              <div className="flex flex-col items-center gap-3">
                <p className="text-xs text-gray-400">Questions? Email us at <a href="mailto:hello@pawtenant.com" className="text-orange-500 hover:underline cursor-pointer">hello@pawtenant.com</a></p>
                <Link to="/" className="whitespace-nowrap text-sm text-orange-500 hover:text-orange-600 font-semibold cursor-pointer transition-colors">← Back to Home</Link>
              </div>
            </div>
          ) : (
            <form data-readdy-form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl border border-orange-100 p-8 space-y-8">
              {/* Section 1 — Personal Info */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-5 pb-3 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-6 h-6 flex items-center justify-center bg-orange-100 rounded-full">
                    <i className="ri-user-line text-orange-500 text-xs"></i>
                  </div>
                  Personal Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">First Name <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      name="firstName"
                      required
                      placeholder="Jane"
                      onChange={() => clearFieldError("firstName")}
                      className={`${inputBase} ${fieldErrors.firstName ? inputBad : inputOk}`}
                    />
                    <FieldError name="firstName" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Last Name <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      name="lastName"
                      required
                      placeholder="Smith"
                      onChange={() => clearFieldError("lastName")}
                      className={`${inputBase} ${fieldErrors.lastName ? inputBad : inputOk}`}
                    />
                    <FieldError name="lastName" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address <span className="text-red-400">*</span></label>
                    <input
                      type="email"
                      name="email"
                      required
                      placeholder="jane@example.com"
                      onChange={() => clearFieldError("email")}
                      className={`${inputBase} ${fieldErrors.email ? inputBad : inputOk}`}
                    />
                    <FieldError name="email" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Phone Number <span className="text-red-400">*</span></label>
                    <input
                      type="tel"
                      name="phone"
                      required
                      placeholder="(555) 000-0000"
                      onChange={() => clearFieldError("phone")}
                      className={`${inputBase} ${fieldErrors.phone ? inputBad : inputOk}`}
                    />
                    <FieldError name="phone" />
                  </div>
                </div>
              </div>

              {/* Section 2 — Credentials */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-5 pb-3 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-6 h-6 flex items-center justify-center bg-orange-100 rounded-full">
                    <i className="ri-award-line text-orange-500 text-xs"></i>
                  </div>
                  Professional Credentials
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* OPS-PROVIDER-APPLICATION-LICENSE-ROWS-V2: structured
                      repeatable license rows replace the legacy License Type
                      chips + single License Number + Primary State + Additional
                      States inputs. Each row captures (state, credential,
                      license number) so we can persist and approve
                      multi-state providers correctly. */}
                  <div className="col-span-2" data-section="license-rows">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-gray-700">
                        Licenses <span className="text-red-400">*</span>
                        <span className="font-normal text-gray-400 ml-1">(state, credential, license number per row)</span>
                      </label>
                      <button
                        type="button"
                        onClick={addLicenseRow}
                        className="whitespace-nowrap inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 text-xs font-bold hover:bg-orange-100 cursor-pointer transition-colors"
                      >
                        <i className="ri-add-line"></i>Add License
                      </button>
                    </div>
                    <div className="space-y-2">
                      {licenseRows.map((row, idx) => (
                        <div
                          key={row.id}
                          className={`grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start p-3 rounded-xl border ${licenseRowsError ? "border-red-300 bg-red-50/40" : "border-gray-200 bg-white"}`}
                        >
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">State</label>
                            <select
                              value={row.state_code}
                              onChange={(e) => updateLicenseRow(row.id, { state_code: e.target.value.toUpperCase() })}
                              className={`${selectBase} ${inputOk}`}
                            >
                              <option value="" disabled>Select state...</option>
                              {US_STATES.map((s) => (
                                <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Credential</label>
                            <select
                              value={row.credential}
                              onChange={(e) => updateLicenseRow(row.id, { credential: e.target.value })}
                              className={`${selectBase} ${inputOk}`}
                            >
                              <option value="" disabled>Select...</option>
                              {CREDENTIAL_OPTIONS.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">License Number</label>
                            <input
                              type="text"
                              value={row.license_number}
                              onChange={(e) => updateLicenseRow(row.id, { license_number: e.target.value })}
                              placeholder="e.g. 0701016127"
                              className={`${inputBase} ${inputOk}`}
                            />
                          </div>
                          <div className="flex sm:items-end sm:justify-end pt-1 sm:pt-5">
                            <button
                              type="button"
                              onClick={() => removeLicenseRow(row.id)}
                              disabled={licenseRows.length <= 1}
                              title={licenseRows.length <= 1 ? "At least one license is required" : "Remove this license"}
                              className="whitespace-nowrap inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                              aria-label={`Remove license row ${idx + 1}`}
                            >
                              <i className="ri-delete-bin-line"></i>
                              <span className="sm:hidden">Remove</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {licenseRowsError && (
                      <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                        <i className="ri-error-warning-line"></i>{licenseRowsError}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Years of Experience <span className="text-red-400">*</span></label>
                    <select
                      name="yearsExperience"
                      required
                      defaultValue=""
                      className={`${selectBase} ${inputOk}`}
                    >
                      <option value="" disabled>Select...</option>
                      <option value="Less than 1 year">Less than 1 year</option>
                      <option value="1–2 years">1–2 years</option>
                      <option value="3–5 years">3–5 years</option>
                      <option value="6–10 years">6–10 years</option>
                      <option value="10+ years">10+ years</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      NPI Number <span className="text-red-400">*</span>
                      <span className="font-normal text-gray-400 ml-1">(10-digit National Provider Identifier)</span>
                    </label>
                    <input
                      type="text"
                      name="npi"
                      required
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="e.g. 1234567890"
                      onChange={() => clearFieldError("npi")}
                      className={`${inputBase} ${fieldErrors.npi ? inputBad : inputOk}`}
                    />
                    <FieldError name="npi" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Practice / Employer Name</label>
                    <input
                      type="text"
                      name="practiceName"
                      placeholder="e.g. Serenity Counseling Group"
                      className={`${inputBase} ${inputOk}`}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Practice Type <span className="text-red-400">*</span></label>
                    <select
                      name="practiceType"
                      required
                      defaultValue=""
                      className={`${selectBase} ${inputOk}`}
                    >
                      <option value="" disabled>Select practice type...</option>
                      {practiceTypes.map((pt) => <option key={pt} value={pt}>{pt}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 3 — Specializations */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-5 pb-3 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-6 h-6 flex items-center justify-center bg-orange-100 rounded-full">
                    <i className="ri-heart-pulse-line text-orange-500 text-xs"></i>
                  </div>
                  Clinical Specializations
                </h3>
                <p className="text-xs text-gray-500 mb-3">Select all areas you commonly treat (helps us match relevant ESA cases to you):</p>
                <div className="flex flex-wrap gap-2">
                  {specializations.map((spec) => {
                    const selected = selectedSpecs.includes(spec);
                    return (
                      <button
                        key={spec}
                        type="button"
                        onClick={() => toggleSpec(spec)}
                        className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                          selected
                            ? "bg-orange-500 text-white border-orange-500"
                            : "bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-600"
                        }`}
                      >
                        {selected && <i className="ri-check-line mr-1 text-xs"></i>}
                        {spec}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 4 — Availability & Experience */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-5 pb-3 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-6 h-6 flex items-center justify-center bg-orange-100 rounded-full">
                    <i className="ri-calendar-line text-orange-500 text-xs"></i>
                  </div>
                  Availability &amp; ESA Experience
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-2">How many ESA evaluations can you take per month? <span className="text-red-400">*</span></label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {availabilityOptions.map((opt) => (
                        <label key={opt} className="flex items-center gap-2.5 cursor-pointer group">
                          <input
                            type="radio"
                            name="monthlyCapacity"
                            value={opt}
                            required
                            className="accent-orange-500 cursor-pointer"
                          />
                          <span className="text-xs text-gray-600 group-hover:text-gray-900 transition-colors">{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-2">Have you written ESA letters before? <span className="text-red-400">*</span></label>
                    <div className="flex flex-wrap gap-4">
                      {["Yes — regularly", "Yes — occasionally", "No — but I am familiar with the process", "No — this would be new for me"].map((opt) => (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="radio"
                            name="esaExperience"
                            value={opt}
                            required
                            className="accent-orange-500 cursor-pointer"
                          />
                          <span className="text-xs text-gray-600 group-hover:text-gray-900 transition-colors">{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Are you set up for telehealth? <span className="text-red-400">*</span></label>
                    <div className="flex flex-wrap gap-4">
                      {["Yes — fully set up", "Yes — partially set up", "No — but I can set up quickly"].map((opt) => (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="radio"
                            name="telehealthReady"
                            value={opt}
                            required
                            className="accent-orange-500 cursor-pointer"
                          />
                          <span className="text-xs text-gray-600 group-hover:text-gray-900 transition-colors">{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 5 — Bio */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-5 pb-3 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-6 h-6 flex items-center justify-center bg-orange-100 rounded-full">
                    <i className="ri-edit-line text-orange-500 text-xs"></i>
                  </div>
                  A Bit About You
                </h3>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Brief professional bio / why you want to join PawTenant
                    <span className="font-normal text-gray-400 ml-1">(max 500 characters)</span>
                  </label>
                  <textarea
                    name="bio"
                    rows={4}
                    maxLength={500}
                    placeholder="Tell us a bit about your clinical background, your passion for mental health support, and why you&#39;re interested in working with ESA clients..."
                    onChange={(e) => {
                      setCharCount(e.target.value.length);
                      if (bioError) setBioError("");
                    }}
                    className={`w-full border rounded-md px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition-colors resize-none ${bioError ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-orange-400"}`}
                  ></textarea>
                  <div className="flex items-center justify-between mt-1">
                    {bioError ? (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <i className="ri-error-warning-line"></i> {bioError}
                      </p>
                    ) : (
                      <span />
                    )}
                    <span className={`text-xs ml-auto ${charCount > 450 ? "text-orange-500" : "text-gray-400"}`}>{charCount}/500</span>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">LinkedIn Profile or Website URL</label>
                  <input
                    type="url"
                    name="profileUrl"
                    placeholder="https://linkedin.com/in/yourname"
                    className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-400 transition-colors"
                  />
                </div>
              </div>

              {/* Section 6 — Supporting Documents (NEW) */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-5 pb-3 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-6 h-6 flex items-center justify-center bg-orange-100 rounded-full">
                    <i className="ri-upload-cloud-line text-orange-500 text-xs"></i>
                  </div>
                  Supporting Documents
                  <span className="text-xs font-normal text-gray-400 ml-1">(optional)</span>
                </h3>
                <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                  Upload your headshot and any relevant documents (license certificate, NPI verification, CV, etc.). These will be reviewed by our clinical team and help speed up the credential verification process.
                </p>

                {/* Headshot upload */}
                <div className="mb-5">
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Headshot / Profile Photo <span className="font-normal text-gray-400">(JPG, PNG — max 10MB)</span>
                  </label>
                  <div className="flex items-start gap-4">
                    {headshotPreview ? (
                      <div className="relative flex-shrink-0">
                        <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-orange-100">
                          <img src={headshotPreview} alt="Headshot preview" className="w-full h-full object-cover object-top" />
                        </div>
                        <button type="button" onClick={() => { setHeadshotFile(null); setHeadshotPreview(null); }}
                          className="whitespace-nowrap absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center bg-red-500 text-white rounded-full text-xs cursor-pointer hover:bg-red-600">
                          <i className="ri-close-line"></i>
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center flex-shrink-0 bg-gray-50">
                        <i className="ri-user-3-line text-2xl text-gray-300"></i>
                      </div>
                    )}
                    <label className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-4 cursor-pointer hover:border-orange-300 hover:bg-orange-50/50 transition-colors group">
                      <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handleHeadshotChange} />
                      <div className="text-center">
                        <i className="ri-image-add-line text-2xl text-gray-300 group-hover:text-orange-400 transition-colors mb-1"></i>
                        <p className="text-xs font-semibold text-gray-500 group-hover:text-orange-500 transition-colors">
                          {headshotFile ? headshotFile.name : "Click to upload headshot"}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">This photo will appear on your public profile</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Document uploads */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    License / Certification Documents <span className="font-normal text-gray-400">(PDF, JPG, PNG — up to 5 files)</span>
                  </label>
                  <label className="flex items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-5 cursor-pointer hover:border-orange-300 hover:bg-orange-50/50 transition-colors group">
                    <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleDocumentsChange} />
                    <div className="text-center">
                      <i className="ri-file-add-line text-2xl text-gray-300 group-hover:text-orange-400 transition-colors mb-1"></i>
                      <p className="text-xs font-semibold text-gray-500 group-hover:text-orange-500 transition-colors">Click to upload documents</p>
                      <p className="text-xs text-gray-400 mt-0.5">License certificate, NPI letter, CV, etc.</p>
                    </div>
                  </label>
                  {documentFiles.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {documentFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2 bg-[#f0faf7] border border-[#b8ddd5] rounded-lg">
                          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                            <i className="ri-file-line text-[#1a5c4f] text-sm"></i>
                          </div>
                          <span className="text-xs text-gray-700 flex-1 truncate">{f.name}</span>
                          <span className="text-xs text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
                          <button type="button" onClick={() => removeDocument(i)}
                            className="whitespace-nowrap w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer transition-colors flex-shrink-0">
                            <i className="ri-close-line text-xs"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Section 7 — Agreement */}
              {/* OPS-PROVIDER-APPLICATION-PHASE1-SAFE-FIXES: form has noValidate,
                  so the `required` attribute alone does not block submit.
                  Custom JS validation in validateRequiredFields() now also
                  enforces all three checkboxes and surfaces inline errors. */}
              <div className="bg-orange-50/60 border border-orange-100 rounded-xl p-5">
                <h3 className="text-xs font-bold text-gray-900 mb-3">Agreement</h3>
                <div className="space-y-3">
                  <div>
                    <label className="flex items-start gap-2.5 cursor-pointer group">
                      <input type="checkbox" name="agreeCredentials" required onChange={() => clearFieldError("agreeCredentials")} className="accent-orange-500 mt-0.5 cursor-pointer flex-shrink-0" />
                      <span className="text-xs text-gray-600 leading-relaxed">
                        I confirm that I hold an active, unrestricted license to practice mental health services in the state(s) listed above, and that all information provided is accurate and truthful.
                      </span>
                    </label>
                    <FieldError name="agreeCredentials" />
                  </div>
                  <div>
                    <label className="flex items-start gap-2.5 cursor-pointer group">
                      <input type="checkbox" name="agreeHipaa" required onChange={() => clearFieldError("agreeHipaa")} className="accent-orange-500 mt-0.5 cursor-pointer flex-shrink-0" />
                      <span className="text-xs text-gray-600 leading-relaxed">
                        I agree to maintain HIPAA compliance in all client interactions and understand that PawTenant requires all partner therapists to adhere to applicable federal and state privacy laws.
                      </span>
                    </label>
                    <FieldError name="agreeHipaa" />
                  </div>
                  <div>
                    <label className="flex items-start gap-2.5 cursor-pointer group">
                      <input type="checkbox" name="agreeTerms" required onChange={() => clearFieldError("agreeTerms")} className="accent-orange-500 mt-0.5 cursor-pointer flex-shrink-0" />
                      <span className="text-xs text-gray-600 leading-relaxed">
                        I have read and agree to PawTenant&apos;s{" "}
                        <Link to="/terms-of-use" className="text-orange-500 hover:underline cursor-pointer" target="_blank">Terms of Use</Link>{" "}
                        and{" "}
                        <Link to="/privacy-policy" className="text-orange-500 hover:underline cursor-pointer" target="_blank">Privacy Policy</Link>.
                      </span>
                    </label>
                    <FieldError name="agreeTerms" />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="whitespace-nowrap w-full py-4 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <i className="ri-loader-4-line animate-spin"></i>
                    {uploadProgress || "Submitting Application..."}
                  </>
                ) : (
                  <>
                    <i className="ri-file-list-3-line"></i>
                    Submit My Application
                  </>
                )}
              </button>
              <p className="text-xs text-gray-400 text-center -mt-2">
                Our clinical team reviews all applications within 48 hours. You&apos;ll receive a confirmation email shortly after submitting.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">FAQ</span>
            <h2 className="text-3xl font-bold text-gray-900">Questions from Therapists</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-gray-100 rounded-xl overflow-hidden bg-white">
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className={`text-sm font-semibold pr-4 ${openFaq === i ? "text-orange-500" : "text-gray-900"}`}>{faq.q}</span>
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    <i className={`${openFaq === i ? "ri-subtract-line" : "ri-add-line"} text-orange-500`}></i>
                  </div>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 border-t border-gray-50">
                    <p className="text-sm text-gray-500 leading-relaxed pt-3">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="py-20 bg-gray-900 relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://readdy.ai/api/search-image?query=abstract%20warm%20professional%20background%20soft%20gradient%20texture%20neutral%20dark%20minimal%20elegant%20warm%20tones%20for%20overlay&width=1440&height=500&seq=joinctabg01&orientation=landscape"
            alt=""
            className="w-full h-full object-cover object-top opacity-20"
          />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-orange-400 mb-4">Join Today</span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight">
            Ready to Start Helping Clients<br />
            <span className="text-orange-400">— and Grow Your Income?</span>
          </h2>
          <p className="text-white/70 text-sm mb-8 max-w-xl mx-auto leading-relaxed">
            Join 200+ licensed therapists across all 50 states who supplement their practice with flexible ESA evaluations. Apply in 5 minutes. Onboard in 48 hours. Start accepting cases immediately.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#application-form"
              className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm w-full sm:w-auto justify-center"
            >
              <i className="ri-file-list-3-line"></i>
              Apply to Join the Network
            </a>
            <a
              href="mailto:hello@pawtenant.com"
              className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-4 border-2 border-white/30 text-white font-semibold rounded-md hover:border-white/60 hover:bg-white/5 transition-colors cursor-pointer text-sm w-full sm:w-auto justify-center"
            >
              <i className="ri-mail-line"></i>
              Email Our Partnership Team
            </a>
          </div>
          <p className="text-white/40 text-xs mt-6">No commitment required. All applications reviewed within 48 hours.</p>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
