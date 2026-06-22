import type { ReactNode } from "react";
import { GlowCard } from "./GlowCard";

interface ModeCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  useCase: string;
  glow?: "amber" | "rose" | "violet" | "teal";
}

/** A measurement-mode card with icon, description, and an example use case. */
export function ModeCard({
  icon,
  title,
  description,
  useCase,
  glow = "violet",
}: ModeCardProps) {
  return (
    <GlowCard glow={glow} className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-panel2 text-rose">
          {icon}
        </div>
        <h3 className="font-semibold text-text">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-haze">{description}</p>
      <p className="mt-auto rounded-lg border border-line/70 bg-panel2/60 px-3 py-2 font-mono text-xs text-amber-soft">
        {useCase}
      </p>
    </GlowCard>
  );
}
