import { Outlet, NavLink, useLocation } from "react-router-dom";
import { Home, Code2, Trophy, LogOut, Palette, StickyNote } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import ReviewToggle from "./ReviewToggle";

const navItems = [
  { to: "/", icon: Home, label: "Home", end: true, testid: "nav-home" },
  { to: "/challenge", icon: Code2, label: "Challenge", testid: "nav-challenge" },
  { to: "/leaderboard", icon: Trophy, label: "Leaders", testid: "nav-leaderboard" },
  { to: "/themes", icon: Palette, label: "Themes", testid: "nav-themes" },
  { to: "/notes", icon: StickyNote, label: "Notes", testid: "nav-notes" },
];

export default function Layout() {
  const { user, profile, logout } = useAuth();
  const loc = useLocation();
  return (
    <div
      className="flex h-screen w-full flex-col text-white max-w-[420px] mx-auto"
      style={{ background: "var(--bg)" }}
      data-testid="repup-layout"
    >
      <header className="glass-header sticky top-0 z-40 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="font-display text-2xl font-black leading-none">
            <span className="text-[#CCFF00]">Rep</span>
            <span className="text-[#FF5C00]">Up</span>
          </div>
          {profile?.streak > 0 && (
            <span
              className="ml-2 inline-flex items-center gap-1 rounded-full border border-[#FF5C00]/40 bg-[#FF5C00]/10 px-2 py-0.5 text-xs font-bold text-[#FF5C00]"
              data-testid="header-streak"
            >
              {profile.streak}d
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Code Review sidebar on/off toggle. Lives between the streak pill
              (in the left header group) and the avatar so it's always one tap
              away. Persisted in chrome.storage.local — read by the github.com
              content script in real time. */}
          <ReviewToggle />
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || "user"}
              className="h-8 w-8 rounded-full border-2 border-white/20"
              data-testid="header-avatar"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-white/10" />
          )}
          <button
            onClick={logout}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:text-white"
            title="Sign out"
            data-testid="header-signout-btn"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main key={loc.pathname} className="scroll-area flex-1 px-4 pb-24 pt-3">
        <Outlet />
      </main>

      <nav
        className="glass-header fixed bottom-0 left-1/2 z-40 flex w-full max-w-[420px] -translate-x-1/2 items-stretch justify-around border-t border-white/10 px-2 py-2"
        style={{ background: "color-mix(in srgb, var(--bg) 85%, transparent)" }}
        data-testid="bottom-nav"
      >
        {navItems.map((it) => {
          const Icon = it.icon;
          return (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              data-testid={it.testid}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1.5 py-2 text-[11px] font-bold transition ${
                  isActive
                    ? "bg-white/10 text-[#CCFF00]"
                    : "text-white/60 hover:text-white"
                }`
              }
            >
              <Icon className="h-5 w-5" strokeWidth={2.5} />
              {it.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
