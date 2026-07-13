// EsaIntakeView — shared, read-only, BRANDED ESA intake form. The single source of
// truth for the on-screen ESA intake presentation, consumed by BOTH the Admin
// standalone modal (AssessmentIntakeModal) and the customer portal (AssessmentCard),
// so the two never diverge (ORDER-PAYMENT-GATING-RA-DOCUMENT-TAXONOMY-INTAKE-PORTAL-001).
//
// Purely presentational + read-only: renders only the customer-authored
// `assessment_answers` plus top-level order identity. It contains NO internal data
// (no provider/admin notes, scoring, fraud/risk flags, payout, assignment internals),
// so it is safe to show the owning customer verbatim.

import {
  LOGO_URL,
  STATE_NAMES,
  QUESTIONNAIRE_ITEMS,
  PetInfo,
  AssessmentOrderBase,
  resolveLabel,
  formatDob,
  formatSubmitDate,
} from "./assessmentUtils";

export default function EsaIntakeView({
  order,
  variant = "admin",
}: {
  order: AssessmentOrderBase;
  variant?: "admin" | "customer";
}) {
  const a = (order.assessment_answers ?? {}) as Record<string, unknown>;
  const pets = (a.pets as PetInfo[]) ?? [];
  const dob = a.dob as string | undefined;
  const stateName = STATE_NAMES[order.state ?? ""] ?? order.state ?? "—";
  const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || "—";

  const hasAnyAnswers = QUESTIONNAIRE_ITEMS.some(({ key }) => {
    const v = a[key];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && (v as unknown[]).length === 0);
  });

  return (
    <div>
      {/* Branded form header */}
      <div className="px-6 sm:px-8 py-8 text-center bg-gray-50 border-b border-gray-100">
        <img src={LOGO_URL} alt="PawTenant" className="h-12 mx-auto mb-3 object-contain" />
        <h1 className="text-2xl font-extrabold text-orange-500 mb-2">PawTenant ESA Intake Form</h1>
        <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
          {variant === "customer"
            ? "This is the information you submitted for your Emotional Support Animal request — the same intake your licensed provider reviews."
            : "Kindly provide as much accurate information as possible to enable the provider to approve your request."}
        </p>
      </div>

      <div className="px-6 sm:px-8 py-8 space-y-10">
        {/* Section 1: Owner Information */}
        <div>
          <h3 className="text-base font-extrabold text-orange-500 pb-2.5 border-b-2 border-orange-500 mb-5">
            Pet and Owner Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {[
              { label: "Full Name", value: fullName },
              { label: "State", value: stateName },
              { label: "Email", value: order.email || "—" },
              { label: "Phone", value: order.phone || "—" },
              ...(dob ? [{ label: "Date of Birth", value: formatDob(dob) }] : []),
              { label: "Order ID", value: order.confirmation_id },
              { label: "Submitted", value: formatSubmitDate(order.created_at) },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-2">
                <span className="text-sm text-gray-500 w-32 flex-shrink-0">{label}:</span>
                <span className="text-sm font-semibold text-gray-900 break-all">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: Pet Information */}
        <div>
          <h3 className="text-base font-extrabold text-orange-500 pb-2.5 border-b-2 border-orange-500 mb-5">
            Pet Information
          </h3>
          <p className="text-sm font-bold text-gray-700 mb-4">
            How many emotional support animals are you certifying today?
          </p>
          {pets.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="bg-orange-50">
                    {["Pet Name", "Type", "Age", "Breed", "Weight"].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-3 text-xs font-bold text-orange-600 uppercase tracking-wider border-b border-orange-100"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pets.map((pet, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 text-gray-900 font-semibold border-b border-gray-100">{pet.name || "—"}</td>
                      <td className="px-4 py-3 text-gray-700 border-b border-gray-100">{pet.type || "—"}</td>
                      <td className="px-4 py-3 text-gray-700 border-b border-gray-100">
                        {pet.age ? `${pet.age} yr${pet.age !== "1" ? "s" : ""}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700 border-b border-gray-100">{pet.breed || "—"}</td>
                      <td className="px-4 py-3 text-gray-700 border-b border-gray-100">
                        {pet.weight ? `${pet.weight} lbs` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-8 text-center">
              <p className="text-sm text-gray-400">No pet information recorded for this order.</p>
            </div>
          )}
        </div>

        {/* Section 3: Questionnaire */}
        <div>
          <h3 className="text-base font-extrabold text-orange-500 pb-2.5 border-b-2 border-orange-500 mb-5">
            Mental Health Questionnaire
          </h3>
          {hasAnyAnswers ? (
            <div className="space-y-6">
              {QUESTIONNAIRE_ITEMS.map(({ label, key, isText }, idx) => {
                const val = a[key];
                const isEmpty =
                  val === undefined ||
                  val === null ||
                  val === "" ||
                  (Array.isArray(val) && (val as unknown[]).length === 0);
                if (isEmpty) return null;
                return (
                  <div key={key} className="flex gap-4">
                    <div className="w-7 h-7 flex items-center justify-center bg-orange-500 text-white text-xs font-bold rounded-full flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 mb-1.5">{label}</p>
                      {isText ? (
                        <div className="bg-orange-50 border-l-4 border-orange-400 rounded-r-lg px-4 py-3">
                          <p className="text-sm text-gray-700 leading-relaxed italic">
                            {resolveLabel(key, val)}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-orange-600 font-semibold leading-relaxed">
                          {resolveLabel(key, val)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-8 text-center">
              <p className="text-sm text-gray-400">No questionnaire answers recorded for this order.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 pt-6 text-center">
          <p className="text-xs text-gray-400 leading-relaxed">
            PawTenant &bull; Secure ESA Consultation Support &bull; pawtenant.com
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {variant === "customer"
              ? "This is a copy of the intake information you submitted for your case."
              : "This document is confidential and intended solely for licensed professionals reviewing this case."}
          </p>
        </div>
      </div>
    </div>
  );
}
