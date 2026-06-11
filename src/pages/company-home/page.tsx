import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { resolveStaffRole } from "../../lib/staffAuth";
import {
  fetchCurrentTeamMember,
  fetchMyAdminContext,
  type TeamMember,
} from "../../lib/teamMembers";
import CompanyTopBar from "./components/CompanyTopBar";
import CompanyLeftRail from "./components/CompanyLeftRail";
import CompanyCoverProfile from "./components/CompanyCoverProfile";
import CompanyFeed from "./components/CompanyFeed";
import CompanySectionContent from "./components/CompanySectionContent";
import TeamWidget from "./components/TeamWidget";
import TodaySummaryWidget from "./components/TodaySummaryWidget";
import MyRequestsWidget from "./components/MyRequestsWidget";
import SalarySnapshotWidget from "./components/SalarySnapshotWidget";
import MyCompensationWidget from "./components/MyCompensationWidget";
import TeamBonusRequestWidget from "./components/TeamBonusRequestWidget";
import QuickLinks from "./components/QuickLinks";
import EnterWorkstationButton from "./components/EnterWorkstationButton";

type LoadState = "loading" | "no-auth" | "no-profile" | "ready";

const SECTIONS = ["home", "myprofile", "team", "performance", "forms", "policies", "help"];

/**
 * Company Home — employee self-service portal (/company).
 *
 * Clean Facebook-style home: top utility bar (primary clock-in/out + status,
 * same backend RPCs as the admin profile dropdown), left icon rail that
 * switches portal sections via ?section=, a minimal cover/profile hero, a
 * center Company Notices feed, and a compact right sidebar. Salary, Benefits,
 * Policies, HR/Forms, Performance and Help live in their own sections — not on
 * Home. Employees see ONLY their own data.
 */
export default function CompanyHomePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>("loading");
  const [member, setMember] = useState<TeamMember | null>(null);
  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isManager, setIsManager] = useState(false);

  const rawSection = searchParams.get("section") || "home";
  const section = SECTIONS.includes(rawSection) ? rawSection : "home";

  async function refreshMember() {
    const row = await fetchCurrentTeamMember();
    if (row) setMember(row);
    setReloadToken((t) => t + 1);
  }

  function goSection(next: string) {
    if (next === "home") setSearchParams({});
    else setSearchParams({ section: next });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session?.user) {
        if (!cancelled) setState("no-auth");
        return;
      }
      if (!cancelled) setAuthedEmail(session.user.email ?? null);
      fetchMyAdminContext().then((ctx) => { if (!cancelled) setIsManager(ctx.isManager); });
      const row = await fetchCurrentTeamMember();
      if (cancelled) return;
      if (row) {
        setMember(row);
        setState("ready");
      } else {
        // No employee (team_members) profile. If this is a PROVIDER account,
        // send them to their own portal instead of the staff-only dead-end.
        const role = await resolveStaffRole(session.user.id);
        if (cancelled) return;
        if (role === "provider") {
          navigate("/provider-portal", { replace: true });
          return;
        }
        setState("no-profile");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100">
        <div className="flex flex-col items-center gap-2">
          <i className="ri-loader-4-line animate-spin text-2xl text-stone-400"></i>
          <span className="text-xs text-stone-500">Loading Company Home…</span>
        </div>
      </div>
    );
  }

  if (state === "no-auth") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100 px-4">
        <div className="max-w-md w-full rounded-2xl border border-stone-200 bg-white shadow-sm p-6 text-center">
          <div className="mx-auto h-11 w-11 rounded-full bg-[#0f1e1a]/5 flex items-center justify-center">
            <i className="ri-lock-2-line text-xl text-[#0f1e1a]"></i>
          </div>
          <h1 className="mt-3 text-lg font-semibold text-stone-900">Sign in required</h1>
          <p className="mt-1.5 text-sm text-stone-600">Please sign in to access your Company Home.</p>
          <button
            onClick={() => navigate("/admin-login?next=/company")}
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-[#0f1e1a] hover:bg-[#1a2e29] px-4 py-2 text-sm font-semibold text-white"
          >
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  if (state === "no-profile" || !member) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100 px-4">
        <div className="max-w-md w-full rounded-2xl border border-stone-200 bg-white shadow-sm p-6 text-center">
          <i className="ri-user-line text-3xl text-stone-300"></i>
          <h2 className="mt-3 text-base font-semibold text-stone-900">
            Your employee profile is not set up yet.
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            {authedEmail ? `Signed in as ${authedEmail}. ` : ""}
            You can still continue to the Workstation while an admin sets up your profile.
          </p>
          <div className="mt-4 flex justify-center">
            <EnterWorkstationButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100">
      <CompanyTopBar member={member} onChange={() => setReloadToken((t) => t + 1)} onNavigate={goSection} />

      <div className="flex">
        <CompanyLeftRail active={section} onSelect={goSection} />

        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-6xl px-3 sm:px-5 py-5">
            {section === "home" ? (
              <div className="space-y-5">
                <CompanyCoverProfile member={member} onMediaUpdated={refreshMember} />

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
                  <div className="min-w-0">
                    <CompanyFeed />
                  </div>
                  <div className="space-y-5">
                    <TeamWidget reloadToken={reloadToken} />
                    <TodaySummaryWidget teamMemberId={member.id} reloadToken={reloadToken} />
                    <MyRequestsWidget teamMemberId={member.id} reloadToken={reloadToken} onNavigate={goSection} />
                    <SalarySnapshotWidget />
                    <MyCompensationWidget />
                    <TeamBonusRequestWidget selfTeamMemberId={member.id} />
                    <QuickLinks onNavigate={goSection} />
                  </div>
                </div>
              </div>
            ) : (
              <CompanySectionContent section={section} member={member} reloadToken={reloadToken} isManager={isManager} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
