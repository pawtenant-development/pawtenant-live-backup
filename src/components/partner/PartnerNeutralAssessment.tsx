// THE on-screen internal assessment (admin Assessment tab, admin Provider
// View, admin standalone intake modal, provider portal).
//
// PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 introduced this neutral
// renderer for partner orders. PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-
// REPAIR-002 makes it THE renderer for every order — direct ESA, direct PSD
// and partner alike — and moves all content derivation into
// `buildAssessmentDocumentModel` (assessmentUtils), the same model the
// downloadable PDF is built from. Screen and PDF therefore show the same
// sections, the same questions and the same answers in the same order.
//
// Black-and-white, no logo, no colour accent, no company name, no partner
// brand, no partner reference, no economics. Everything is rendered through
// React text children — pasted markup stays inert text. Long answers wrap.
//
// Consent / attestation evidence renders ONLY for `audience="admin"` (an
// audit record). A provider never sees it and it is never in the PDF.
//
// The customer-facing branded intake form (customer portal) is untouched.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  buildAssessmentDocumentModel,
  buildPrintHTML,
  type AssessmentOrderBase,
} from "../../pages/admin-orders/components/assessmentUtils";

export type NeutralAssessmentOrder = Omit<AssessmentOrderBase, "created_at" | "email"> & {
  id?: string;
  email?: string | null;
  created_at?: string | null;
};

export type NeutralAssessmentAudience = "provider" | "admin";

export async function resolveInternalAssessmentOrder<T extends NeutralAssessmentOrder>(order: T): Promise<T> {
  if (!order.id) return order;
  const { data, error } = await supabase.rpc("get_internal_assessment_answers", { p_order_id: order.id });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The complete assessment data was unavailable.");
  }
  return { ...order, assessment_answers: data as Record<string, unknown> };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 py-1">
      <dt className="w-40 shrink-0 text-xs text-gray-600">{label}</dt>
      <dd className="text-sm font-semibold text-gray-900 break-words min-w-0">{value}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 border-b border-gray-900 pb-1.5 mb-3">
      {children}
    </h3>
  );
}

const cell = "border border-gray-500 px-2 py-1.5";

export default function PartnerNeutralAssessment({
  order,
  showDownload = false,
  audience = "provider",
}: {
  order: NeutralAssessmentOrder;
  /** Renders a neutral PDF from the same resolved assessment shown on screen. */
  showDownload?: boolean;
  /** "admin" additionally shows the authorization/consent audit record. */
  audience?: NeutralAssessmentAudience;
}) {
  const [resolvedOrder, setResolvedOrder] = useState<NeutralAssessmentOrder | null>(order.id ? null : order);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    setResolvedOrder(order.id ? null : order);
    resolveInternalAssessmentOrder(order)
      .then((next) => { if (active) setResolvedOrder(next); })
      .catch(() => {
        if (active) setLoadError("Unable to load the complete assessment. Refresh and try again before reviewing this case.");
      });
    return () => { active = false; };
  }, [order]);

  const m = useMemo(
    () => resolvedOrder
      ? buildAssessmentDocumentModel({ ...resolvedOrder, email: resolvedOrder.email ?? "", created_at: resolvedOrder.created_at ?? "" })
      : null,
    [resolvedOrder],
  );
  if (loadError) {
    return <div className="bg-red-50 border border-red-300 rounded-xl p-5 text-sm font-semibold text-red-800" role="alert">{loadError}</div>;
  }
  if (!m || !resolvedOrder) {
    return <div className="bg-white border border-gray-300 rounded-xl p-7 text-sm text-gray-600" aria-busy="true">Loading complete assessment…</div>;
  }
  const qa = m.questionnaire;
  const ev = m.petEvidence;
  const showEvidence = ev.pets.length > 0 || ev.differentiation || ev.differentiationNote;

  return (
    <div className="bg-white border border-gray-300 rounded-xl p-5 sm:p-7 text-gray-900" data-partner-neutral-assessment>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold">{m.title}</h2>
          <p className="text-xs text-gray-600 mt-0.5">Confidential clinical assessment prepared for licensed provider review.</p>
        </div>
        {showDownload && (
          <button
            type="button"
            onClick={() => {
              const html = buildPrintHTML({
                ...resolvedOrder,
                email: resolvedOrder.email ?? "",
                created_at: resolvedOrder.created_at ?? "",
              });
              const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
              const w = window.open(blobUrl, "_blank");
              if (w) setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
              else URL.revokeObjectURL(blobUrl);
            }}
            className="whitespace-nowrap inline-flex items-center gap-2 px-3.5 py-2 border border-gray-900 text-gray-900 text-xs font-bold rounded-lg hover:bg-gray-100 cursor-pointer"
          >
            <i className="ri-download-line"></i>Download PDF
          </button>
        )}
      </div>

      <section className="mb-6">
        <SectionTitle>Customer Information</SectionTitle>
        <dl>
          <Row label="Case Reference" value={m.caseReference} />
          {m.customer.map((r) => <Row key={r.label} label={r.label} value={r.value} />)}
        </dl>
      </section>

      <section className="mb-6">
        <SectionTitle>Pet Information</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider">
                {["Name", "Type", "Breed", "Age", "Weight"].map((h) => (
                  <th key={h} className="border border-gray-900 px-2 py-1.5 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.pets.length === 0 ? (
                <tr><td colSpan={5} className={`${cell} text-center text-gray-600`}>No animal information recorded</td></tr>
              ) : m.pets.map((p, i) => (
                <tr key={i}>
                  <td className={cell}>{p.name || "—"}</td>
                  <td className={cell}>{p.type || "—"}</td>
                  <td className={cell}>{p.breed || "—"}</td>
                  <td className={cell}>{p.age ? `${p.age} yr` : "—"}</td>
                  <td className={cell}>{p.weight ? `${p.weight} lbs` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {showEvidence && (
          <div className="mt-4">
            <p className="text-sm font-bold text-gray-900">Support reported for each animal</p>
            <p className="text-xs text-gray-600 mb-2">Reported by the customer. Descriptive intake information for clinical review — not a finding and not a score.</p>
            <div className="space-y-2">
              {ev.pets.map((p) => (
                <div key={p.label} className="border border-gray-500 rounded-md px-3 py-2">
                  <p className="text-sm font-bold text-gray-900">
                    {p.label}{p.vaccinated && <span className="ml-2 text-[11px] font-normal">(vaccinations confirmed)</span>}
                  </p>
                  {p.functions.length > 0
                    ? <p className="text-sm text-gray-900">{p.functions.join(" · ")}</p>
                    : <p className="text-xs text-gray-600">No support options selected.</p>}
                  {p.narrative && (
                    <>
                      <p className="text-[11px] font-bold text-gray-700 mt-1">In the customer&apos;s words</p>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">{p.narrative}</p>
                    </>
                  )}
                </div>
              ))}
              {(ev.differentiation || ev.differentiationNote) && (
                <div className="border border-gray-500 rounded-md px-3 py-2">
                  <p className="text-sm font-bold text-gray-900">Do the animals support the customer in different ways?</p>
                  {ev.differentiation && <p className="text-sm text-gray-900">{ev.differentiation}</p>}
                  {ev.differentiationNote && (
                    <>
                      <p className="text-[11px] font-bold text-gray-700 mt-1">What would be lost with only one</p>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">{ev.differentiationNote}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className={audience === "admin" && m.consents.length > 0 ? "mb-6" : ""}>
        <SectionTitle>Mental Health Questionnaire</SectionTitle>
        {qa.source === "none" ? (
          <p className="text-sm text-gray-600">No questionnaire answers recorded.</p>
        ) : (
          <div className="space-y-4">
            {qa.note && <p className="text-xs text-gray-600">{qa.note}</p>}
            {qa.blocks.map((b, i) => (
              <div key={`${b.number}-${i}`} className="flex gap-3">
                <div className="w-7 h-7 flex items-center justify-center border border-gray-900 text-gray-900 text-xs font-bold rounded-full flex-shrink-0 mt-0.5">
                  {b.number}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 mb-1 break-words">{b.question}</p>
                  {b.answer.trim() ? (
                    <p className={`text-sm text-gray-900 break-words ${b.multiline ? "whitespace-pre-wrap bg-gray-50 border border-gray-300 rounded-md px-3 py-2" : ""}`}>{b.answer}</p>
                  ) : (
                    <p className="text-sm italic text-gray-600">No answer recorded for this question.</p>
                  )}
                </div>
              </div>
            ))}
            {qa.additional.length > 0 && (
              <div>
                <p className="text-sm font-bold text-gray-900 mb-1">Additional Questionnaire Information</p>
                {qa.additionalNote && <p className="text-xs text-gray-600 mb-2">{qa.additionalNote}</p>}
                <p className="text-sm text-gray-900 whitespace-pre-wrap break-words bg-gray-50 border border-gray-300 rounded-md px-3 py-2">
                  {qa.additional.join("\n")}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {audience === "admin" && m.consents.length > 0 && (
        <section data-assessment-audit-only>
          <SectionTitle>Authorization Record (admin only)</SectionTitle>
          <p className="text-xs text-gray-600 mb-2">Retained for audit. Not shown to providers and not part of the downloadable assessment.</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider">
                {["Item", "Status", "Recorded At"].map((h) => (
                  <th key={h} className="border border-gray-900 px-2 py-1.5 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.consents.map((c) => (
                <tr key={c.item}>
                  <td className={cell}>{c.item}</td>
                  <td className={cell}>{c.status}</td>
                  <td className={cell}>{c.recordedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
