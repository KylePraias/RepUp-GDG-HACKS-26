import { progressInLevel } from "../../lib/xp";

export default function XPBar({ xp = 0 }) {
  const p = progressInLevel(xp);
  const pct = Math.round(p.pct * 100);
  return (
    <div className="flex flex-col gap-2" data-testid="xp-bar">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xs uppercase tracking-widest text-white/50">
            Level
          </span>
          <span
            className="font-display text-3xl font-black text-[#CCFF00]"
            data-testid="xp-bar-level"
          >
            {p.level}
          </span>
        </div>
        <div className="font-mono text-xs text-white/60" data-testid="xp-bar-progress">
          {p.within} / {p.span} XP
        </div>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#CCFF00] to-[#7ee600] transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "repeating-linear-gradient(135deg, transparent 0 8px, rgba(0,0,0,0.12) 8px 12px)",
          }}
        />
      </div>
    </div>
  );
}
