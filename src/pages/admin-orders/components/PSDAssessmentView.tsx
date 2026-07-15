// PSDAssessmentView — read-only, neutral rendering of a customer's PSD intake.
//
// PSD-PROVIDER-RAW-ASSESSMENT-001.
//
// The licensed provider — not this component — makes the eligibility decision.
// So this view shows the customer's ACTUAL answers as a simple numbered
// question-and-answer list (the same style as the ESA intake), with NO
// automated pass/fail checklist and NO green/red colouring that could pre-empt
// the provider's clinical judgment. Concerning answers (e.g. "still learning,
// performs inconsistently") are shown neutrally, exactly as the customer chose.
//
// Shared, unchanged, by the provider portal, the admin Order Detail modal, and
// the customer portal. It is purely presentational and never mutates data.

import { useRef } from "react";
import {
  PSD_QUESTIONNAIRE_ITEMS,
  normalizePsdAnswers,
  isAnswered,
  resolvePsdOptionLabel,
  getPsdMultiValues,
  getPsdText,
  getPsdPets,
  getPsdEvidence,
} from "./psdAssessmentSchema";

const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "Washington D.C.",
};

interface OrderInfo {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  state?: string | null;
  confirmationId?: string | null;
  createdAt?: string | null;
}

interface Props {
  answers: Record<string, unknown> | null;
  orderInfo?: OrderInfo;
  /** Cosmetic only — tunes the intro/footer wording. Never changes what is shown. */
  audience?: "provider" | "admin" | "customer";
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-sm text-gray-400 w-32 flex-shrink-0">{label}:</span>
      <span className="text-sm font-semibold text-gray-900 break-all">{value}</span>
    </div>
  );
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch { return iso; }
}

function handlePrintAssessment(
  contentRef: React.RefObject<HTMLDivElement | null>,
  confirmationId?: string | null,
) {
  const el = contentRef.current;
  if (!el) return;
  const printWin = window.open("", "_blank", "width=960,height=800");
  if (!printWin) return;
  const html = el.innerHTML;
  printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>PSD Intake — ${confirmationId ?? "PawTenant"}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    @media print {
      .no-print { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    body { font-family: system-ui, -apple-system, sans-serif; background: white; padding: 24px; }
  </style>
</head>
<body>
  ${html}
  <script>
    window.addEventListener("load", function() {
      setTimeout(function() { window.print(); }, 800);
    });
  <\/script>
</body>
</html>`);
  printWin.document.close();
}

// ── Neutral answer badge ──────────────────────────────────────────────────────
// Identifies state only (selected / uploaded / answered / not answered). It never
// signals a clinical judgment, so it is intentionally colour-neutral.
function Badge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-slate-100 text-slate-600 text-xs font-semibold flex-shrink-0">
      {text}
    </span>
  );
}

function QuestionBlock({
  n,
  label,
  badge,
  children,
}: {
  n?: number;
  label: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="w-7 h-7 flex items-center justify-center bg-amber-500 text-white text-xs font-bold rounded-full flex-shrink-0 mt-0.5">
        {n ?? "•"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <p className="text-sm font-bold text-gray-800">{label}</p>
          {badge}
        </div>
        {children}
      </div>
    </div>
  );
}

export default function PSDAssessmentView({ answers, orderInfo, audience = "provider" }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);

  if (!answers) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-10 text-center">
        <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
          <i className="ri-questionnaire-line text-gray-400 text-xl"></i>
        </div>
        <p className="text-sm font-bold text-gray-600 mb-1">No PSD assessment data</p>
        <p className="text-xs text-gray-400">PSD assessment answers haven&apos;t been recorded for this order yet.</p>
      </div>
    );
  }

  const a = normalizePsdAnswers(answers);
  const pets = getPsdPets(a);
  const dob = getPsdText(a, "dob");
  const evidence = getPsdEvidence(a);

  const fullName = [orderInfo?.firstName, orderInfo?.lastName].filter(Boolean).join(" ") || "—";
  const stateName = STATE_NAMES[orderInfo?.state ?? ""] ?? orderInfo?.state ?? "—";

  const hasAnyQuestionnaire = PSD_QUESTIONNAIRE_ITEMS.some((q) =>
    q.kind === "evidence" ? evidence.present : isAnswered(a[q.key]),
  );

  const introText =
    audience === "customer"
      ? "This is the information you submitted for your Psychiatric Service Dog request — the same intake your licensed provider reviews."
      : "The customer's own answers, exactly as submitted. The licensed provider reviews these responses and makes the eligibility determination.";

  const footerText =
    audience === "customer"
      ? "This is a copy of the intake information you submitted for your case."
      : "This document is confidential and intended solely for licensed professionals reviewing this case.";

  return (
    <div className="space-y-6" ref={contentRef}>

      {/* ── Print / Save PDF button ── */}
      <div className="flex justify-end no-print">
        <button
          type="button"
          onClick={() => handlePrintAssessment(contentRef, orderInfo?.confirmationId)}
          className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 cursor-pointer transition-colors"
        >
          <i className="ri-printer-line"></i>Print / Save as PDF
        </button>
      </div>

      {/* ── BRANDED HEADER ─────────────────────────────────────────────────── */}
      <div className="bg-[#f8f7f4] border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-white px-6 py-5 text-center border-b border-gray-100">
          <img src={LOGO_URL} alt="PawTenant" className="h-10 mx-auto mb-3 object-contain" />
          <h2 className="text-lg font-extrabold text-amber-700 mb-1">PawTenant — PSD Intake Form</h2>
          <p className="text-xs text-gray-500">Psychiatric Service Dog Assessment &bull; Confidential</p>
          <div className="flex items-center justify-center gap-5 mt-3 flex-wrap">
            {[
              { icon: "ri-mail-line", text: "hello@pawtenant.com" },
              { icon: "ri-phone-line", text: "(409) 965-5885" },
              { icon: "ri-global-line", text: "pawtenant.com" },
            ].map((c) => (
              <span key={c.text} className="flex items-center gap-1 text-xs text-gray-400 font-medium">
                <i className={`${c.icon} text-amber-500`}></i>{c.text}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500 max-w-lg mx-auto leading-relaxed mt-3">{introText}</p>
        </div>

        {/* Patient info grid */}
        {orderInfo && (
          <div className="px-6 py-4">
            <p className="text-xs font-extrabold text-amber-700 uppercase tracking-widest mb-3">Patient Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
              <InfoRow label="Full Name" value={fullName} />
              <InfoRow label="State" value={stateName} />
              <InfoRow label="Email" value={orderInfo.email ?? "—"} />
              <InfoRow label="Phone" value={orderInfo.phone ?? "—"} />
              {dob && <InfoRow label="Date of Birth" value={dob} />}
              <InfoRow label="Order ID" value={orderInfo.confirmationId ?? "—"} />
              <InfoRow label="Submitted" value={formatDate(orderInfo.createdAt)} />
            </div>
          </div>
        )}

        {/* Service dog info (from pets array) */}
        {pets.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100">
            <p className="text-xs font-extrabold text-amber-700 uppercase tracking-widest mb-3">Service Dog Information</p>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="bg-amber-50">
                    {["Dog Name", "Type", "Age", "Breed", "Weight"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-bold text-amber-700 uppercase tracking-wider border-b border-amber-100">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pets.map((pet, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-2.5 text-gray-900 font-semibold border-b border-gray-100">{pet.name || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">{pet.type || "Dog"}</td>
                      <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">{pet.age ? `${pet.age} yr${pet.age !== "1" ? "s" : ""}` : "—"}</td>
                      <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">{pet.breed || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">{pet.weight ? `${pet.weight} lbs` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Questionnaire — neutral numbered question & answer ─────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <div className="w-7 h-7 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0">
            <i className="ri-questionnaire-line text-amber-600 text-sm"></i>
          </div>
          <p className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Assessment Responses</p>
        </div>

        <div className="p-5">
          {!hasAnyQuestionnaire ? (
            <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-8 text-center">
              <p className="text-sm text-gray-400">No questionnaire answers recorded for this order.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {PSD_QUESTIONNAIRE_ITEMS.map((q) => {
                // ── Evidence upload ──
                if (q.kind === "evidence") {
                  if (!evidence.present) return null;
                  const iconClass =
                    evidence.type === "video" ? "ri-video-line" :
                    evidence.type === "photo" ? "ri-image-line" :
                    evidence.type === "link" ? "ri-links-line" : "ri-attachment-2";
                  return (
                    <QuestionBlock
                      key={q.key}
                      n={q.n}
                      label={q.label}
                      badge={<Badge text={evidence.type ? `Uploaded · ${evidence.type}` : "Uploaded"} />}
                    >
                      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <div className="w-9 h-9 flex items-center justify-center bg-slate-100 rounded-lg flex-shrink-0">
                          <i className={`${iconClass} text-slate-500 text-base`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700 capitalize">
                            {evidence.type ? `${evidence.type} attached by customer` : "Evidence attached by customer"}
                          </p>
                          {evidence.openable ? (
                            <p className="text-xs text-slate-500 truncate mt-0.5">{evidence.url}</p>
                          ) : evidence.url ? (
                            <p className="text-xs text-slate-400 mt-0.5">
                              Uploaded during intake — not stored as an openable link.
                            </p>
                          ) : null}
                        </div>
                        {evidence.openable && (
                          <a
                            href={evidence.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 text-white text-xs font-bold rounded-lg hover:bg-slate-700 cursor-pointer transition-colors flex-shrink-0"
                          >
                            <i className="ri-external-link-line"></i>
                            {evidence.type === "video" ? "Watch" : evidence.type === "photo" ? "View" : "Open"}
                          </a>
                        )}
                      </div>
                    </QuestionBlock>
                  );
                }

                // ── Multi-select — list only the customer's selected answers ──
                if (q.kind === "multi") {
                  const selected = getPsdMultiValues(a, q.key);
                  if (selected.length === 0) return null;
                  return (
                    <QuestionBlock
                      key={q.key}
                      n={q.n}
                      label={q.label}
                      badge={<Badge text={`${selected.length} selected`} />}
                    >
                      <div className="flex flex-wrap gap-1.5">
                        {selected.map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                          >
                            <i className="ri-check-line text-slate-400" style={{ fontSize: "11px" }}></i>{s}
                          </span>
                        ))}
                      </div>
                    </QuestionBlock>
                  );
                }

                // ── Free-text — verbatim, line breaks preserved ──
                if (q.kind === "text") {
                  const text = getPsdText(a, q.key);
                  if (!isAnswered(text)) return null;
                  return (
                    <QuestionBlock key={q.key} n={q.n} label={q.label}>
                      <div className="bg-slate-50 border-l-4 border-slate-300 rounded-r-lg px-4 py-3">
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{text}</p>
                      </div>
                    </QuestionBlock>
                  );
                }

                // ── Single-select — resolved label, verbatim fallback ──
                const value = a[q.key];
                if (!isAnswered(value)) return null;
                const label = resolvePsdOptionLabel(q.options, value);
                const followUpText = q.followUp ? getPsdText(a, q.followUp.key) : "";
                return (
                  <QuestionBlock key={q.key} n={q.n} label={q.label}>
                    <p className="text-sm font-semibold text-gray-800 leading-relaxed">{label}</p>
                    {q.followUp && isAnswered(followUpText) && (
                      <div className="mt-2 flex items-start gap-2">
                        <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{q.followUp.label}:</span>
                        <span className="text-sm text-gray-700 whitespace-pre-wrap">{followUpText}</span>
                      </div>
                    )}
                  </QuestionBlock>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4 pb-2 text-center">
        <p className="text-xs text-gray-400">PawTenant &bull; Secure PSD Consultation Support &bull; pawtenant.com</p>
        <p className="text-xs text-gray-400 mt-1">{footerText}</p>
      </div>

    </div>
  );
}
