import { Crown } from "lucide-react";

/**
 * Small premium status marker shown next to a player's name in the lobby,
 * incoming-challenge card, and leaderboard. Cosmetic — a social signal that
 * also advertises Premium to free users.
 */
export default function PremiumBadge({
  size = "sm",
  className = "",
}: {
  size?: "sm" | "xs";
  className?: string;
}) {
  const dims = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <span
      title="Duelr Premium"
      className={`inline-flex items-center gap-1 rounded bg-gold-400/10 text-gold-400 font-semibold uppercase tracking-wide ${
        size === "xs" ? "text-[9px] px-1 py-0.5" : "text-[10px] px-1.5 py-0.5"
      } ${className}`}
    >
      <Crown className={dims} />
      Premium
    </span>
  );
}
