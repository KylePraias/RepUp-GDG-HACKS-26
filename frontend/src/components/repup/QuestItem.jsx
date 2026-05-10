import { Check, Zap } from "lucide-react";

export default function QuestItem({ quest, progress = 0, completed = false, onClaim }) {
  const pct = Math.min(1, progress / quest.target);
  const reachable = progress >= quest.target;
  return (
    <div
      data-testid={`quest-${quest.id}`}
      className={`relative flex items-center gap-3 rounded-2xl border-2 p-3 transition ${
        completed
          ? "border-white/10 bg-white/[0.03] opacity-60"
          : reachable
            ? "border-[#CCFF00]/60 bg-[#CCFF00]/5"
            : "border-white/10 bg-[#141414]"
      }`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 ${
          completed
            ? "border-white/20 bg-white/10"
            : "border-[#FF5C00]/50 bg-[#FF5C00]/10"
        }`}
      >
        {completed ? (
          <Check className="h-6 w-6 text-white" strokeWidth={3} />
        ) : (
          <Zap className="h-6 w-6 text-[#FF5C00]" strokeWidth={2.5} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`font-heading text-sm font-bold ${completed ? "text-white/50 line-through" : "text-white"}`}
        >
          {quest.title}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full rounded-full ${completed ? "bg-white/30" : "bg-[#FF5C00]"}`}
              style={{ width: `${pct * 100}%` }}
            />
          </div>
          <div className="font-mono text-[10px] text-white/50">
            {Math.min(progress, quest.target)}/{quest.target}
          </div>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-display text-sm font-black text-[#CCFF00]">+{quest.xp}</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-white/40">XP</div>
      </div>
      {reachable && !completed && (
        <button
          onClick={onClaim}
          data-testid={`quest-claim-${quest.id}`}
          className="absolute right-2 top-2 btn-push btn-level px-2 py-0.5 text-[10px]"
        >
          CLAIM
        </button>
      )}
    </div>
  );
}
