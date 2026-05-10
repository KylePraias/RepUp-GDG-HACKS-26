import { Github, Flame, Zap, Trophy } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { login, authError } = useAuth();

  return (
    <div
      className="relative flex min-h-screen w-full max-w-[420px] mx-auto flex-col items-stretch px-6 py-10 overflow-hidden"
      data-testid="login-screen"
    >
      <div className="absolute -top-24 -right-20 h-64 w-64 rounded-full bg-[#FF5C00]/15 blur-3xl" />
      <div className="absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-[#CCFF00]/15 blur-3xl" />

      <div className="relative z-10 mt-8 flex flex-col items-start gap-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white/70">
          <span className="h-2 w-2 rounded-full bg-[#39FF14] flicker" />
          v1.0 · beta
        </div>

        <div className="font-display text-6xl font-black leading-[0.9]">
          <span className="text-[#CCFF00]">Rep</span>
          <span className="text-[#FF5C00]">Up</span>
          <span className="text-white">.</span>
        </div>

        <p className="font-heading text-lg leading-snug text-white/85">
          Duolingo for developers.
          <br />
          <span className="text-white/55">
            Streak your commits. Level up daily. Beat the leaderboard.
          </span>
        </p>

        <div className="mt-2 flex flex-col gap-3 self-stretch">
          <Feature icon={Flame} title="Daily streaks" desc="Don't break the chain — your GitHub activity counts." />
          <Feature icon={Zap} title="Quests = XP" desc="Commit, ship a PR, polish a README. Earn it all." />
          <Feature icon={Trophy} title="One challenge a day" desc="Same buggy codebase for everyone. Fastest fix wins." />
        </div>
      </div>

      <div className="relative z-10 mt-auto flex flex-col gap-3 pt-10">
        <button
          onClick={login}
          data-testid="login-github-btn"
          className="btn-push btn-action flex w-full items-center justify-center gap-3 px-6 py-4 text-base"
        >
          <Github className="h-5 w-5" strokeWidth={2.5} />
          Connect with GitHub
        </button>
        {authError && (
          <div
            className="rounded-xl border border-[#FF3B30]/40 bg-[#FF3B30]/10 px-3 py-2 text-xs text-[#FF8A82]"
            data-testid="login-error"
          >
            {authError}
          </div>
        )}
        <p className="text-center text-[11px] text-white/40">
          We only request public repo + profile scope.
        </p>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border-2 border-white/10 bg-[#141414] p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
        <Icon className="h-5 w-5 text-[#FF5C00]" strokeWidth={2.5} />
      </div>
      <div>
        <div className="font-heading text-sm font-bold text-white">{title}</div>
        <div className="text-xs text-white/55">{desc}</div>
      </div>
    </div>
  );
}
