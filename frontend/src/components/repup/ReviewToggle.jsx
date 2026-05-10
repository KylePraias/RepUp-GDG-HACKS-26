// Compact toggle switch shown in the header between the streak pill and
// the avatar. Toggles whether the GitHub Code Review sidebar is injected
// on github.com pages. Persisted in chrome.storage.local (shared with the
// content script) via the useReviewEnabled hook.
//
// Visual style: dark, RepUp-branded (lime green when on, white-faded when
// off). Tooltip explains what it does.
import { ScanLine } from "lucide-react";
import useReviewEnabled from "../../hooks/useReviewEnabled";

export default function ReviewToggle() {
  const { enabled, toggle } = useReviewEnabled();
  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Disable Code Review sidebar" : "Enable Code Review sidebar"}
      title={
        enabled
          ? "Code Review sidebar: ON — turn off to stop injecting on github.com"
          : "Code Review sidebar: OFF — turn on to inject on github.com"
      }
      data-testid="header-review-toggle"
      className={`group flex h-8 items-center gap-1.5 rounded-full border px-2.5 transition ${
        enabled
          ? "border-[#CCFF00]/50 bg-[#CCFF00]/10 text-[#CCFF00]"
          : "border-white/10 bg-white/5 text-white/45 hover:text-white/70"
      }`}
    >
      <ScanLine className="h-3.5 w-3.5" strokeWidth={2.5} />
      <span className="text-[10px] font-mono font-bold uppercase tracking-widest">
        Review
      </span>
      {/* The pill-shaped track */}
      <span
        className={`relative ml-0.5 inline-block h-3.5 w-6 rounded-full transition ${
          enabled ? "bg-[#CCFF00]" : "bg-white/15"
        }`}
        aria-hidden="true"
      >
        {/* The knob */}
        <span
          className={`absolute top-0.5 h-2.5 w-2.5 rounded-full transition-all ${
            enabled ? "left-3 bg-black" : "left-0.5 bg-white/70"
          }`}
        />
      </span>
    </button>
  );
}
