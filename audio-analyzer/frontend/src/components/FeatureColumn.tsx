import type { ReactNode } from "react";
import { GlowCard } from "./GlowCard";

interface FeatureColumnProps {
  icon: ReactNode;
  title: string;
  body: string;
  glow?: "amber" | "rose" | "violet" | "teal";
}

/** One of the three audience feature columns on the landing page. */
export function FeatureColumn({
  icon,
  title,
  body,
  glow = "amber",
}: FeatureColumnProps) {
  return (
    <GlowCard glow={glow} className="flex flex-col gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-panel2 text-amber-soft">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-text">{title}</h3>
      <p className="text-sm leading-relaxed text-haze">{body}</p>
    </GlowCard>
  );
}
