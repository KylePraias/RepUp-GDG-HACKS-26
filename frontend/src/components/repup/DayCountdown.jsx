import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";

function msUntilUtcMidnight() {
  const now = new Date();
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
  return next.getTime() - now.getTime();
}

function fmt(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { h, m, s };
}

/**
 * Compact countdown to the next UTC midnight — i.e. when "today" rolls over
 * for streaks and the daily challenge. Updates every second.
 *
 *   variant="pill"  → small pill (used in the streak card)
 *   variant="bar"   → wider bar (used at the top of the challenge page)
 */
export default function DayCountdown({ variant = "pill" }) {
  const [ms, setMs] = useState(() => msUntilUtcMidnight());

  useEffect(() => {
    const id = setInterval(() => setMs(msUntilUtcMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  const { h, m, s } = fmt(ms);
  const pad = (n) => String(n).padStart(2, "0");

  if (variant === "bar") {
    return (
      <div
        className="flex items-center justify-between rounded-2xl border-2 border-white/10 bg-[#141414] px-3 py-2"
        data-testid="day-countdown-bar"
      >
        <div className="flex items-center gap-2">
          <Hourglass className="h-4 w-4 text-[#FF5C00]" strokeWidth={2.5} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/55">
            Day rolls over in
          </span>
        </div>
        <div
          className="font-mono text-sm font-bold tabular-nums text-white"
          data-testid="day-countdown-value"
        >
          {pad(h)}<span className="text-white/40">h</span>
          {" "}
          {pad(m)}<span className="text-white/40">m</span>
          {" "}
          {pad(s)}<span className="text-white/40">s</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#FF5C00]/30 bg-black/30 px-2 py-0.5 text-[10px] font-bold text-[#FFB48A]"
      title="Time remaining until the day rolls over (UTC)"
      data-testid="day-countdown-pill"
    >
      <Hourglass className="h-3 w-3" strokeWidth={2.5} />
      <span className="font-mono tabular-nums">
        {pad(h)}:{pad(m)}:{pad(s)}
      </span>
      <span className="text-[9px] font-normal opacity-60">left</span>
    </div>
  );
}
