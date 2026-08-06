/**
 * Continue PSD Assessment — /continue/<slug>
 *
 * PSD-ASSESSMENT-ANSWERS-PERSISTENCE-AND-RECOVERY-001
 *
 * The recovery entry point for an INCOMPLETE PSD assessment.
 *
 * WHY IT IS NOT /checkout/<slug>
 * -----------------------------
 * The stable checkout link exists to take a completed order to payment. Sending
 * an incomplete assessment down it produced the defect this task exists to fix:
 * the customer landed on checkout, could never reach the questions, and a step-2
 * resubmit wrote blanks over their clinical intake.
 *
 * WHAT THIS PAGE DOES
 * -------------------
 * Resolves the slug server-side, takes the SERVER's routing decision, scrubs the
 * slug from the URL before anything else can read it, hands the write credential
 * to the autosave layer, and forwards to the PSD form — which then lands on the
 * first unanswered required question.
 *
 * The slug never reaches an analytics tag, a referrer header or a history entry.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { storeAssessmentToken } from "../psd-assessment/usePsdAutosave";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

export default function ContinueAssessmentPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const ran = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      // Scrub FIRST. Doing this after the await leaves the credential in the
      // URL for the whole round trip, which is long enough for a tag to read it.
      try {
        window.history.replaceState({}, "", "/psd-assessment");
      } catch { /* non-fatal */ }

      if (!slug) { setFailed(true); return; }

      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/resolve-continue-assessment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({ slug }),
        });
        const data = await res.json().catch(() => null) as {
          ok?: boolean; route?: string; assessmentToken?: string;
          order?: Record<string, unknown>; status?: Record<string, unknown>;
        } | null;

        if (!res.ok || !data?.ok) { setFailed(true); return; }

        // The write credential arrives in the BODY, never the URL.
        storeAssessmentToken(data.assessmentToken);

        // Memory only — never storage. The PSD page consumes it on mount and
        // deletes it, exactly as the stable-checkout handoff already does.
        (window as unknown as { __ptContinueAssessment?: unknown }).__ptContinueAssessment = {
          ...(data.order ?? {}),
          route: data.route,
          status: data.status,
        };

        // The SERVER decided which journey this is. A completed-but-unpaid order
        // still belongs on checkout; an incomplete one must reach the questions.
        navigate("/psd-assessment", { replace: true });
      } catch {
        setFailed(true);
      }
    })();
  }, [slug, navigate]);

  if (failed) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center rounded-full bg-amber-50">
            <i className="ri-time-line text-amber-500 text-xl"></i>
          </div>
          <h1 className="text-lg font-extrabold text-gray-900 mb-2">This link is no longer active</h1>
          {/* Deliberately vague: never confirms whether an order exists, is paid,
              or was revoked. One message for every failure mode. */}
          <p className="text-sm text-gray-500 mb-6">
            Your assessment link may have expired or already been completed. You can start
            again below, or contact our support team and we’ll help you pick up where you left off.
          </p>
          <a
            href="/psd-assessment"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700"
          >
            <i className="ri-arrow-right-line"></i>Continue to Assessment
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center">
        <i className="ri-loader-4-line animate-spin text-2xl text-amber-500"></i>
        <p className="mt-3 text-sm font-semibold text-gray-600">Restoring your assessment…</p>
      </div>
    </div>
  );
}
