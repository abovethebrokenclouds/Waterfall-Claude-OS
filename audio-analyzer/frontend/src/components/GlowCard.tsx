import type { ReactNode } from "react";

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  /** Accent colour for the soft glow ring. */
  glow?: "amber" | "rose" | "violet" | "teal" | "none";
}

const glowMap: Record<NonNullable<GlowCardProps["glow"]>, string> = {
  amber: "hover:shadow-glow",
  rose: "hover:shadow-glow-rose",
  violet: "hover:shadow-glow",
  teal: "hover:shadow-glow-teal",
  none: "",
};

/** A warm panel card with a soft glow on hover. */
export function GlowCard({ children, className, glow = "amber" }: GlowCardProps) {
  return (
    <div
      className={`rounded-2xl border border-line bg-panel/80 p-6 backdrop-blur transition-shadow duration-300 ${glowMap[glow]} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
