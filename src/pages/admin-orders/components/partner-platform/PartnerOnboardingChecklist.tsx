// PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 — the sandbox onboarding
// checklist, moved out of the Overview tab into Settings (technical section).
//
// EVIDENCE DISCIPLINE (unchanged from the Overview version): each step turns
// Complete only on real evidence — an accepted API request, a minted document
// release, a delivered signed webhook — never just a saved form. The
// derivation reads partner_admin_onboarding_state, the same server function
// the Overview used.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { type PartnerOrg, Badge } from "./shared";

export interface OnboardingState {
  org_status: string;
  production_enabled: boolean;
  active_sandbox_keys: number;
  total_keys: number;
  active_sandbox_endpoints: number;
  accepted_api_requests: number;
  last_accepted_api_request_at: string | null;
  orders_total: number;
  orders_completed: number;
  document_releases: number;
  webhook_deliveries_succeeded: number;
  last_webhook_delivered_at: string | null;
  webhook_deliveries_failed: number;
}

type ChecklistState = "complete" | "incomplete" | "blocked" | "na";

const CHECK_TONE: Record<ChecklistState, { label: string; tone: string; icon: string }> = {
  complete: { label: "Complete", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: "ri-checkbox-circle-fill" },
  incomplete: { label: "Incomplete", tone: "bg-amber-50 text-amber-800 ring-amber-200", icon: "ri-time-line" },
  blocked: { label: "Blocked", tone: "bg-gray-100 text-gray-600 ring-gray-300", icon: "ri-lock-line" },
  na: { label: "Not applicable", tone: "bg-gray-50 text-gray-400 ring-gray-200", icon: "ri-subtract-line" },
};

export function deriveOnboardingChecklist(
  partner: PartnerOrg | null,
  state: OnboardingState | null,
): { step: string; state: ChecklistState; why: string }[] {
  if (!partner || !state) return [];
  const sandboxOn = state.org_status === "sandbox" || state.org_status === "active";
  const hasKey = state.active_sandbox_keys > 0;
  const hasEndpoint = state.active_sandbox_endpoints > 0;
  const submitted = state.accepted_api_requests > 0 || state.orders_total > 0;
  const completed = state.orders_completed > 0;
  const retrieved = state.document_releases > 0;
  const verified = state.webhook_deliveries_succeeded > 0;
  const coreDone = sandboxOn && hasKey && hasEndpoint && submitted && completed && retrieved && verified;
  return [
    { step: "1. Create / select partner", state: "complete", why: partner.display_name },
    { step: "2. Enable Sandbox", state: sandboxOn ? "complete" : "incomplete",
      why: sandboxOn ? "Sandbox access is on" : "Enable it under Partner organizations" },
    { step: "3. Generate sandbox API key",
      state: hasKey ? "complete" : sandboxOn ? "incomplete" : "blocked",
      why: hasKey ? `${state.active_sandbox_keys} active key${state.active_sandbox_keys === 1 ? "" : "s"}`
        : sandboxOn ? "Create one under API keys" : "Requires Sandbox to be enabled" },
    { step: "4. Register webhook",
      state: hasEndpoint ? "complete" : sandboxOn ? "incomplete" : "blocked",
      why: hasEndpoint ? `${state.active_sandbox_endpoints} active endpoint${state.active_sandbox_endpoints === 1 ? "" : "s"}`
        : sandboxOn ? "Add one under Webhooks" : "Requires Sandbox to be enabled" },
    { step: "5. Submit test order",
      state: submitted ? "complete" : hasKey ? "incomplete" : "blocked",
      why: submitted ? `${state.accepted_api_requests} accepted API request${state.accepted_api_requests === 1 ? "" : "s"}`
        : hasKey ? "The partner submits through the sandbox API" : "Requires an API key" },
    { step: "6. Complete test order",
      state: completed ? "complete" : submitted ? "incomplete" : "blocked",
      why: completed ? `${state.orders_completed} completed` : submitted ? "Assign a provider and complete the clinical work" : "Requires a submitted order" },
    { step: "7. Retrieve test document",
      state: retrieved ? "complete" : completed ? "incomplete" : "blocked",
      why: retrieved ? `${state.document_releases} release${state.document_releases === 1 ? "" : "s"} minted`
        : completed ? "The partner fetches the approved document via the API" : "Requires a completed order" },
    { step: "8. Verify signed webhook",
      state: verified ? "complete" : hasEndpoint ? "incomplete" : "blocked",
      why: verified ? `${state.webhook_deliveries_succeeded} delivered — last ${state.last_webhook_delivered_at ? new Date(state.last_webhook_delivered_at).toLocaleString() : ""}`
        : hasEndpoint ? "Send a test event and confirm the signature verifies" : "Requires a registered webhook" },
    { step: "9. Pass sandbox acceptance",
      state: coreDone ? "complete" : "incomplete",
      why: coreDone ? "All sandbox steps have real evidence" : "Complete steps 2–8 first (owner signs off)" },
    { step: "10. Request production activation",
      state: "blocked",
      why: "Production activation requires owner approval and a separate LIVE rollout." },
  ];
}

export default function PartnerOnboardingChecklist({ partner }: { partner: PartnerOrg | null }) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (partnerId: string) => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase.rpc("partner_admin_onboarding_state", { p_partner_id: partnerId });
    if (err) setError("Could not load the onboarding state (admin access required).");
    setState((data as OnboardingState | null) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (partner) void load(partner.id);
    else setState(null);
  }, [partner, load]);

  const checklist = useMemo(() => deriveOnboardingChecklist(partner, state), [partner, state]);

  if (!partner) return <p className="text-sm text-gray-500">Select a partner first.</p>;

  return (
    <div>
      {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <p className="mb-2 text-xs text-gray-500">
        Each step turns Complete only on real evidence — an accepted API request, a minted document
        release, a delivered signed webhook — never just a saved form. Manual (structured-intake)
        partners do not need the API steps.
      </p>
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
        {loading && checklist.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">Loading…</li>
        )}
        {checklist.map((c) => {
          const cfg = CHECK_TONE[c.state];
          return (
            <li key={c.step} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <i className={`${cfg.icon} text-base ${c.state === "complete" ? "text-emerald-600" : "text-gray-400"}`}></i>
                <span className="text-sm font-medium text-gray-800">{c.step}</span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <span className="hidden truncate text-xs text-gray-500 sm:inline">{c.why}</span>
                <Badge label={cfg.label} tone={cfg.tone} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
