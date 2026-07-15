// AssessmentCard — lets the customer view / download the SAME assessment they
// submitted to the provider. CUSTOMER-PORTAL-ORDER-GUIDANCE-RA-PROVIDER-SLOTS-001.
//
// Reuse-first (no new backend, no new RLS): the customer reads their OWN order's
// assessment_answers (already fetched). ESA reuses the provider/admin export
// `buildPrintHTML` for a print-ready PDF; PSD reuses the read-only
// `PSDAssessmentView` (PSD has no provider PDF export either — we don't invent one).

import { useState } from "react";
import {
  formatSubmitDate,
  buildPrintHTML,
} from "../../admin-orders/components/assessmentUtils";
import PSDAssessmentView from "../../admin-orders/components/PSDAssessmentView";
import EsaIntakeView from "../../admin-orders/components/EsaIntakeView";
import CustomerPortalSection from "./CustomerPortalSection";

export interface AssessmentCardOrder {
  confirmation_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone?: string | null;
  state: string | null;
  letter_type?: string | null;
  assessment_answers?: Record<string, unknown> | null;
  created_at: string;
}

function isPSD(order: AssessmentCardOrder): boolean {
  return order.letter_type === "psd" || (order.confirmation_id?.includes("-PSD") ?? false);
}

export default function AssessmentCard({ order }: { order: AssessmentCardOrder }) {
  const [open, setOpen] = useState(false);
  const answers = (order.assessment_answers ?? {}) as Record<string, unknown>;
  const hasAnswers = answers && Object.keys(answers).length > 0;
  if (!hasAnswers) return null;

  const psd = isPSD(order);

  const downloadEsaPdf = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(buildPrintHTML({
      confirmation_id: order.confirmation_id,
      first_name: order.first_name,
      last_name: order.last_name,
      email: order.email,
      phone: order.phone ?? null,
      state: order.state,
      assessment_answers: order.assessment_answers ?? null,
      created_at: order.created_at,
    }));
    w.document.close();
  };

  return (
    <CustomerPortalSection
      title="Your Submitted Assessment"
      icon="ri-questionnaire-line"
      tone="blue"
      headerRight={<span className="text-[11px] text-gray-400">Submitted {formatSubmitDate(order.created_at)}</span>}
    >
      <p className="text-[12px] text-gray-600 leading-relaxed mb-3">
        This is the same {psd ? "evaluation" : "intake"} you completed — the information your licensed provider
        reviews for your case.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-200 cursor-pointer transition-colors"
        >
          <i className={open ? "ri-eye-off-line" : "ri-eye-line"}></i>{open ? "Hide responses" : "View submitted assessment"}
        </button>
        {!psd && (
          <button
            type="button"
            onClick={downloadEsaPdf}
            className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#1e3a5f] cursor-pointer transition-colors"
          >
            <i className="ri-download-line"></i>Download PDF
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          {psd ? (
            <PSDAssessmentView
              audience="customer"
              answers={order.assessment_answers}
              orderInfo={{
                firstName: order.first_name,
                lastName: order.last_name,
                email: order.email,
                phone: order.phone ?? null,
                state: order.state,
                confirmationId: order.confirmation_id,
                createdAt: order.created_at,
              }}
            />
          ) : (
            <EsaIntakeView
              variant="customer"
              order={{
                confirmation_id: order.confirmation_id,
                first_name: order.first_name,
                last_name: order.last_name,
                email: order.email,
                phone: order.phone ?? null,
                state: order.state,
                assessment_answers: order.assessment_answers ?? null,
                created_at: order.created_at,
              }}
            />
          )}
        </div>
      )}
    </CustomerPortalSection>
  );
}
