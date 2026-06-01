import { Widget } from "./TeamWidget";

/**
 * Salary snapshot widget — ESTIMATED placeholder only. There is no payroll
 * backend yet; figures are illustrative until the payroll module ships
 * (fast-follow). Nothing here reads or writes salary data.
 */
const ROWS: { label: string; value: string; tone?: "add" | "deduct" }[] = [
  { label: "Gross Salary", value: "—" },
  { label: "Addition", value: "0.00", tone: "add" },
  { label: "Deduction", value: "0.00", tone: "deduct" },
];

export default function SalarySnapshotWidget() {
  return (
    <div id="salary">
      <Widget
        icon="ri-money-dollar-circle-line"
        title="Salary Snapshot"
        action={<span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">ESTIMATED</span>}
      >
        <dl className="divide-y divide-stone-100">
          {ROWS.map((r) => (
            <div key={r.label} className="flex items-center justify-between py-2">
              <dt className="text-xs text-stone-600">{r.label}</dt>
              <dd
                className={`text-sm font-semibold ${
                  r.tone === "add" ? "text-emerald-600" : r.tone === "deduct" ? "text-rose-600" : "text-stone-800"
                }`}
              >
                {r.value}
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2.5">
            <dt className="text-xs font-semibold text-stone-700">Net Payable</dt>
            <dd className="text-sm font-bold text-stone-900">—</dd>
          </div>
        </dl>
        <p className="mt-2 text-[11px] leading-snug text-stone-400">
          Placeholder until the payroll module is connected. Final figures are confirmed by Finance.
        </p>
      </Widget>
    </div>
  );
}
