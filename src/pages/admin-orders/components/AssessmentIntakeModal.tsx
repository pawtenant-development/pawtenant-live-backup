import { useCallback } from "react";
import {
  LOGO_URL,
  STATE_NAMES,
  QUESTIONNAIRE_ITEMS,
  PetInfo,
  AssessmentOrderBase,
  resolveLabel,
  formatDob,
  formatSubmitDate,
  buildPrintHTML,
} from "./assessmentUtils";

interface AssessmentIntakeModalProps {
  order: AssessmentOrderBase;
  onClose: () => void;
}

export default function AssessmentIntakeModal({ order, onClose }: AssessmentIntakeModalProps) {
  const a = (order.assessment_answers ?? {}) as Record<string, unknown>;
  const pets = (a.pets as PetInfo[]) ?? [];
  const dob = a.dob as string | undefined;
  const stateName = STATE_NAMES[order.state ?? ""] ?? order.state ?? "—";
  const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || "—";

  const hasAnyAnswers = QUESTIONNAIRE_ITEMS.some(({ key }) => {
    const v = a[key];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && (v as unknown[]).length === 0);
  });

  const handleDownloadPDF = useCallback(() => {
    const html = buildPrintHTML(order);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    // Revoke blob URL after enough time for the window to load it
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    if (!w) {
      alert("Please allow pop-ups for this site to download the PDF.");
    }
  }, [order]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl w-full max-w-3xl max-h-[94vh] flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="PawTenant" className="h-8 w-auto" />
            <div>
              <h2 className="text-base font-extrabold text-gray-900">ESA Intake Form</h2>
              <p className="text-xs text-gray-400 font-mono">{order.confirmation_id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-bold rounded-lg hover:bg-orange-600 cursor-pointer transition-colors"
            >
              <i className="ri-download-line"></i>
              Download PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="whitespace-nowrap w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
        </div>

        {/* Form content */}
        <div className="flex-1 overflow-y-auto">

          {/* Branded form header */}
          <div className="px-8 py-8 text-center bg-gray-50 border-b border-gray-100">
            <img src={LOGO_URL} alt="PawTenant" className="h-12 mx-auto mb-3 object-contain" />
            <h1 className="text-2xl font-extrabold text-orange-500 mb-2">PawTenant ESA Intake Form</h1>
            <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
              Kindly provide as much accurate information as possible to enable the provider to approve your request.
            </p>
          </div>

          <div className="px-8 py-8 space-y-10">

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
                This document is confidential and intended solely for licensed professionals reviewing this case.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
