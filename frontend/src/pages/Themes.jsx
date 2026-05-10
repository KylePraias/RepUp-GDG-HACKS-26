import { useCallback, useMemo, useState } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Lock, Check, Palette, Flag, Award, Loader2, Sparkles } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  EXTENSION_THEMES,
  BANNER_THEMES,
  BADGES,
  resolveEquipped,
  isUnlocked,
} from "../lib/themes";

const SECTION_TABS = [
  { id: "extension", label: "Extension", icon: Palette },
  { id: "banner", label: "Banner", icon: Flag },
  { id: "badge", label: "Badge", icon: Award },
];

export default function Themes() {
  const { user, profile, setProfile } = useAuth();
  const [section, setSection] = useState("extension");
  const [saving, setSaving] = useState(null); // { slot, id }
  const [error, setError] = useState(null);

  const equipped = useMemo(() => resolveEquipped(profile?.equipped), [profile?.equipped]);
  const userLevel = profile?.level || 1;

  const select = useCallback(
    async (slot, id) => {
      if (!user || !profile) return;
      // Disallow selecting locked items.
      const list =
        slot === "extensionTheme"
          ? EXTENSION_THEMES
          : slot === "banner"
            ? BANNER_THEMES
            : BADGES;
      const item = list.find((t) => t.id === id);
      if (!item || !isUnlocked(item, userLevel)) return;
      if (equipped[slot] === id) return; // already equipped
      setSaving({ slot, id });
      setError(null);
      // Optimistic local update so the user sees instant feedback.
      const nextEquipped = { ...equipped, [slot]: id };
      setProfile({ ...profile, equipped: nextEquipped });
      try {
        const ref = doc(db, "users", user.uid);
        await updateDoc(ref, {
          equipped: nextEquipped,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        // Revert if the write failed.
        setProfile({ ...profile, equipped });
        setError(e?.message || "Failed to save selection");
      } finally {
        setSaving(null);
      }
    },
    [user, profile, equipped, userLevel, setProfile],
  );

  return (
    <div className="flex flex-col gap-4" data-testid="themes-screen">
      {/* Header card */}
      <div className="bento p-4">
        <div className="flex items-center gap-2 text-[#CCFF00]">
          <Sparkles className="h-5 w-5" strokeWidth={2.6} />
          <span className="font-mono text-[10px] uppercase tracking-widest">
            Themes
          </span>
        </div>
        <div className="mt-1 font-display text-xl font-black">Make it yours</div>
        <div className="text-xs text-white/60">
          Pick a vibe for your extension, leaderboard banner, and name badge.
          Monochromatic looks are free for everyone — fun ones unlock as you
          level up. Tap to apply.
        </div>
        <div className="mt-3 flex items-center gap-3 text-[11px] font-mono uppercase tracking-widest">
          <span className="rounded-full border border-[#CCFF00]/40 bg-[#CCFF00]/10 px-2 py-0.5 text-[#CCFF00]">
            Lvl {userLevel}
          </span>
          <span className="text-white/40">XP: {profile?.xp || 0}</span>
        </div>
      </div>

      {/* Section tabs */}
      <div
        className="flex items-stretch gap-1 rounded-2xl border-2 border-white/10 bg-[#0f0f10] p-1"
        data-testid="themes-section-tabs"
      >
        {SECTION_TABS.map((t) => (
          <SectionTab
            key={t.id}
            active={section === t.id}
            onClick={() => setSection(t.id)}
            icon={t.icon}
            label={t.label}
            testid={`themes-tab-${t.id}`}
          />
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-[#FF3B30]/40 bg-[#FF3B30]/10 px-3 py-2 text-xs text-[#FF8A82]">
          {error}
        </div>
      )}

      {section === "extension" && (
        <div className="grid grid-cols-2 gap-3" data-testid="themes-extension-grid">
          {EXTENSION_THEMES.map((t) => (
            <ExtensionCard
              key={t.id}
              theme={t}
              equipped={equipped.extensionTheme === t.id}
              unlocked={isUnlocked(t, userLevel)}
              saving={saving?.slot === "extensionTheme" && saving?.id === t.id}
              onSelect={() => select("extensionTheme", t.id)}
            />
          ))}
        </div>
      )}

      {section === "banner" && (
        <div className="flex flex-col gap-2" data-testid="themes-banner-list">
          {BANNER_THEMES.map((b) => (
            <BannerCard
              key={b.id}
              banner={b}
              equipped={equipped.banner === b.id}
              unlocked={isUnlocked(b, userLevel)}
              saving={saving?.slot === "banner" && saving?.id === b.id}
              onSelect={() => select("banner", b.id)}
              user={user}
              profile={profile}
            />
          ))}
        </div>
      )}

      {section === "badge" && (
        <div className="grid grid-cols-2 gap-3" data-testid="themes-badge-grid">
          {BADGES.map((b) => (
            <BadgeCard
              key={b.id}
              badge={b}
              equipped={equipped.badge === b.id}
              unlocked={isUnlocked(b, userLevel)}
              saving={saving?.slot === "badge" && saving?.id === b.id}
              onSelect={() => select("badge", b.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionTab({ active, onClick, icon: Icon, label, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
        active
          ? "bg-[#CCFF00] text-black shadow-[0_2px_0_rgba(0,0,0,0.4)]"
          : "text-white/60 hover:text-white"
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={2.6} />
      {label}
    </button>
  );
}

// Renders an extension theme as a stylized card with mini preview swatches.
function ExtensionCard({ theme, equipped, unlocked, saving, onSelect }) {
  const [bg, accent1, accent2] = theme.swatch;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!unlocked || saving}
      data-testid={`theme-extension-${theme.id}`}
      className={`relative flex flex-col gap-2 rounded-2xl border-2 p-3 text-left transition ${
        equipped
          ? "border-[#CCFF00] bg-[#CCFF00]/5"
          : unlocked
            ? "border-white/10 bg-[#141414] hover:border-white/30"
            : "border-white/5 bg-[#0a0a0a] opacity-60"
      }`}
    >
      {/* Preview tile */}
      <div
        className="relative h-16 w-full overflow-hidden rounded-lg"
        style={{ background: bg }}
      >
        <div
          className="absolute left-2 top-2 h-3 w-3 rounded-full"
          style={{ background: accent1 }}
        />
        <div
          className="absolute left-7 top-2 h-3 w-6 rounded-full"
          style={{ background: accent2 }}
        />
        <div
          className="absolute bottom-2 left-2 h-1.5 w-12 rounded-full"
          style={{ background: accent1, opacity: 0.5 }}
        />
        <div
          className="absolute bottom-2 left-16 h-1.5 w-8 rounded-full"
          style={{ background: accent2, opacity: 0.5 }}
        />
      </div>
      <div className="flex items-center justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-sm font-bold text-white">
            {theme.name}
          </div>
          <div className="truncate font-mono text-[10px] text-white/50">
            {theme.desc}
          </div>
        </div>
        <SlotBadge equipped={equipped} unlocked={unlocked} saving={saving} level={theme.level} />
      </div>
    </button>
  );
}

function BannerCard({ banner, equipped, unlocked, saving, onSelect, user, profile }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!unlocked || saving}
      data-testid={`theme-banner-${banner.id}`}
      className={`group relative flex items-center gap-3 overflow-hidden rounded-2xl border-2 p-3 text-left transition ${
        equipped
          ? "border-[#CCFF00]"
          : unlocked
            ? "border-white/10 hover:border-white/30"
            : "border-white/5 opacity-60"
      }`}
      style={{
        background: banner.gradient
          ? `${banner.gradient}, #141414`
          : "#141414",
      }}
    >
      {/* Mini avatar to mimic the leaderboard row look */}
      {user?.photoURL ? (
        <img
          src={user.photoURL}
          alt=""
          className="h-9 w-9 shrink-0 rounded-full border border-white/20"
        />
      ) : (
        <div className="h-9 w-9 shrink-0 rounded-full bg-white/10" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div className="truncate font-heading text-sm font-bold text-white">
            {profile?.displayName || "You"}
          </div>
        </div>
        <div className="font-mono text-[10px] text-white/70">{banner.name}</div>
      </div>
      <SlotBadge equipped={equipped} unlocked={unlocked} saving={saving} level={banner.level} />
    </button>
  );
}

function BadgeCard({ badge, equipped, unlocked, saving, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!unlocked || saving}
      data-testid={`theme-badge-${badge.id}`}
      className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 text-center transition ${
        equipped
          ? "border-[#CCFF00] bg-[#CCFF00]/5"
          : unlocked
            ? "border-white/10 bg-[#141414] hover:border-white/30"
            : "border-white/5 bg-[#0a0a0a] opacity-60"
      }`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-3xl">
        {badge.emoji || (
          <span className="font-mono text-xs text-white/40">none</span>
        )}
      </div>
      <div className="font-heading text-sm font-bold text-white">{badge.name}</div>
      <SlotBadge equipped={equipped} unlocked={unlocked} saving={saving} level={badge.level} />
    </button>
  );
}

// Pill on each card showing equipped / unlocked / locked state.
function SlotBadge({ equipped, unlocked, saving, level }) {
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-white/70">
        <Loader2 className="h-3 w-3 animate-spin" />
        saving
      </span>
    );
  }
  if (equipped) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-[#CCFF00] px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-widest text-black"
        data-testid="slot-equipped-pill"
      >
        <Check className="h-3 w-3" strokeWidth={3.5} />
        equipped
      </span>
    );
  }
  if (!unlocked) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-white/60"
        data-testid="slot-locked-pill"
      >
        <Lock className="h-3 w-3" />
        Lvl {level}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-white/70">
      tap
    </span>
  );
}
