import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";

export default function LevelUpOverlay({ level, onClose }) {
  return (
    <AnimatePresence>
      {level !== null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md"
          data-testid="levelup-overlay"
        >
          <motion.div
            initial={{ scale: 0.6, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 16 }}
            className="flex flex-col items-center gap-6 px-8 text-center"
          >
            <Sparkles className="h-12 w-12 text-[#CCFF00]" />
            <div className="font-display text-xs uppercase tracking-[0.4em] text-white/60">
              Level Up
            </div>
            <div
              className="font-display text-8xl font-black leading-none text-[#CCFF00] drop-shadow-[0_0_30px_rgba(204,255,0,0.45)]"
              data-testid="levelup-number"
            >
              {level}
            </div>
            <div className="max-w-[260px] font-heading text-base text-white/80">
              You're cooking. Streak is hot, XP is up. Ship more.
            </div>
            <button
              onClick={onClose}
              className="btn-push btn-level px-8 py-3 text-sm"
              data-testid="levelup-continue-btn"
            >
              CONTINUE
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
