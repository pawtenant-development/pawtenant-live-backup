import { useEffect, useState, useRef } from "react";
import { supabase } from "../../../lib/supabaseClient";

// Stable daily base — same number for the whole day, different each day.
// Adds a realistic floor so new accounts don't show "0 letters today".
function getDailyBase(): number {
  const today = new Date();
  // Seed = day-of-year × year, mapped to a range [9, 23]
  const seed = (today.getFullYear() * 1000 + today.getMonth() * 31 + today.getDate()) % 15;
  return 9 + seed; // Range: 9 – 23
}

function AnimatedCount({ target }: { target: number }) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);

  useEffect(() => {
    const from = prevRef.current;
    if (from === target) return;
    const diff = target - from;
    const steps = Math.abs(diff);
    if (steps === 0) return;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setDisplay(Math.round(from + (diff * step) / steps));
      if (step >= steps) {
        clearInterval(interval);
        prevRef.current = target;
      }
    }, 40);
    return () => clearInterval(interval);
  }, [target]);

  return <>{display}</>;
}

export default function LiveStatusBanner() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { count: realCount } = await supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .gte("created_at", todayStart.toISOString());

        const base = getDailyBase();
        setCount(base + (realCount ?? 0));
      } catch {
        setCount(getDailyBase());
      }
    };

    fetchCount();

    // Refresh every 3 minutes so the counter climbs naturally during busy hours
    const interval = setInterval(fetchCount, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (count === null) return null;

  return (
    <div className="flex items-center justify-center gap-2 py-2 px-4 bg-green-50 border border-green-200 rounded-xl mb-4 animate-fade-in">
      {/* Pulsing live dot */}
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
      </span>

      <p className="text-sm text-green-800 font-medium">
        <strong className="font-extrabold text-green-700 tabular-nums">
          <AnimatedCount target={count} />
        </strong>
        {" "}people received their ESA letter today
      </p>

      {/* Mini trust badges */}
      <span className="hidden sm:flex items-center gap-2 ml-2 pl-2 border-l border-green-200">
        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
          <i className="ri-star-fill text-amber-400 text-xs"></i>
          4.9/5 rating
        </span>
        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
          <i className="ri-shield-check-line text-green-500 text-xs"></i>
          HIPAA secure
        </span>
      </span>
    </div>
  );
}
