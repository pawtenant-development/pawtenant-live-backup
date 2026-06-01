import { Link } from "react-router-dom";
import type { TeamMember } from "../../../lib/teamMembers";
import { Widget } from "./TeamWidget";
import SalarySnapshotWidget from "./SalarySnapshotWidget";
import BenefitsWidget from "./BenefitsWidget";
import PoliciesWidget from "./PoliciesWidget";
import MyFormsWidget from "./MyFormsWidget";
import EmployeeResources from "./EmployeeResources";
import WorkTimeBreakdown from "./WorkTimeBreakdown";
import TodayAttendanceCard from "./TodayAttendanceCard";
import TodayShiftCard from "./TodayShiftCard";

interface CompanySectionContentProps {
  section: string;
  member: TeamMember;
  reloadToken?: number;
}

/**
 * Renders a single employee-portal section so Home stays uncluttered.
 *
 * Performance is the detailed hub: today's time breakdown (computer hours /
 * break / sessions), the full attendance + shift cards, and the detailed
 * Salary and Benefits panels. Home keeps only a basic salary snapshot widget.
 * All backends here are placeholders/fast-follow as labelled.
 */
export default function CompanySectionContent({ section, member, reloadToken }: CompanySectionContentProps) {
  if (section === "performance") {
    return (
      <div className="space-y-6">
        <SectionShell title="Performance" subtitle="Your time, salary and benefits">
          <SubHeading icon="ri-time-line" title="Today's Time" />
          <WorkTimeBreakdown teamMemberId={member.id} reloadToken={reloadToken} />
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
            <TodayAttendanceCard teamMemberId={member.id} reloadToken={reloadToken} />
            <TodayShiftCard teamMemberId={member.id} reloadToken={reloadToken} />
          </div>
        </SectionShell>

        <div>
          <SubHeading icon="ri-money-dollar-circle-line" title="Salary" />
          <div className="max-w-md">
            <SalarySnapshotWidget />
          </div>
          <p className="mt-2 max-w-xl text-xs text-stone-500">
            Estimated snapshot — final payroll figures are confirmed by Finance each cycle. Close
            any pending payroll queries with your reporting authority before the 23rd of the month.
          </p>
        </div>

        <div>
          <SubHeading icon="ri-heart-pulse-line" title="Benefits" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <BenefitsWidget />
            <Widget icon="ri-information-line" title="How to claim">
              <p className="text-xs leading-relaxed text-stone-600">
                Eligibility is for permanent employees and is subject to company approval. To request
                support, raise a <span className="font-semibold">Benefit Claim</span> from HR / Forms
                (coming soon) or contact HR directly.
              </p>
            </Widget>
          </div>
        </div>

        <div>
          <SubHeading icon="ri-focus-3-line" title="Performance Summary" />
          <div className="max-w-md">
            <Widget icon="ri-bar-chart-2-line" title="Summary">
              <p className="text-xs text-stone-500">
                Attendance and performance targets will appear here once the reporting module is
                connected.
              </p>
            </Widget>
          </div>
        </div>
      </div>
    );
  }

  if (section === "policies") {
    return (
      <SectionShell title="Policies & Documents" subtitle="Company policies — review and acknowledge">
        <div className="max-w-md">
          <PoliciesWidget />
        </div>
      </SectionShell>
    );
  }

  if (section === "forms") {
    return (
      <SectionShell title="HR / Forms" subtitle="Self-service requests & employee resources">
        <div className="space-y-4 max-w-3xl">
          <div className="max-w-md">
            <MyFormsWidget />
          </div>
          <EmployeeResources member={member} />
        </div>
      </SectionShell>
    );
  }

  if (section === "help") {
    return (
      <SectionShell title="Help & Support" subtitle="Guides and contacts">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <Widget icon="ri-book-open-line" title="Help / Runbook">
            <Link
              to="/admin-guide"
              className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 px-3 py-2 text-xs font-semibold text-stone-700"
            >
              <i className="ri-book-open-line" /> Open Runbook
            </Link>
          </Widget>
          <Widget icon="ri-customer-service-2-line" title="Contacts">
            <ul className="space-y-2 text-xs text-stone-600">
              <li className="flex items-center gap-2">
                <i className="ri-user-line text-stone-400" /> HR Support — <span className="text-stone-400">coming soon</span>
              </li>
              <li className="flex items-center gap-2">
                <i className="ri-computer-line text-stone-400" /> IT / System Support — <span className="text-stone-400">coming soon</span>
              </li>
            </ul>
          </Widget>
        </div>
      </SectionShell>
    );
  }

  return null;
}

function SectionShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-stone-900">{title}</h1>
        {subtitle ? <p className="text-xs text-stone-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SubHeading({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <i className={`${icon} text-stone-400`} />
      <h2 className="text-sm font-semibold text-stone-700">{title}</h2>
    </div>
  );
}
